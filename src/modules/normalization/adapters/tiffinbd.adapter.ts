import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateWebsiteOrderDto, WebsiteOrderType } from '../../ingest/dto/website-order.dto';
import { Branch } from '../../branches/entities/branch.entity';
import { MenuItem } from '../../menu/entities/menu-item.entity';
import { OrderItemDto } from '../dto/order-item.dto';
import { OrderSource, OrderType, UnifiedOrderDto } from '../dto/unified-order.dto';
import {
  sanitizeDiscountType,
  sanitizeNonNegativeNumber,
} from '../utils/pricing-sanitizer';
import { randomUUID } from 'crypto';

@Injectable()
export class TiffinBDAdapter {
  constructor(
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
  ) {}

  async normalize(raw: CreateWebsiteOrderDto): Promise<UnifiedOrderDto> {
    const itemIds = raw.orderItems.map((i) => i.itemId);
    const menuItems = await this.menuItemRepo.find({
      where: { external_id: In(itemIds) },
      select: ['external_id', 'name', 'price'],
    });
    const menuMap = new Map(menuItems.map((m) => [m.external_id, m]));

    const items: OrderItemDto[] = raw.orderItems.map((item) => {
      const found = menuMap.get(item.itemId);
      return {
        externalItemId: item.itemId,
        name: found ? found.name : `[item:${item.itemId}]`,
        quantity: item.quantity,
        price: found ? Number(found.price) : 0,
        notes: item.note || undefined,
      };
    });

    // Resolve the website's external branch ID to the internal branch UUID.
    const branch = raw.branchId
      ? await this.branchRepo.findOne({ where: { external_id: raw.branchId }, select: ['id'] })
      : null;

    return {
      externalId: randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
      source: OrderSource.WEBSITE,
      orderType: this.mapOrderType(raw.orderType),
      items,
      totalAmount: raw.total,
      branchId: branch?.id ?? null,
      customerInfo: {
        name: raw.customerName,
        phone: raw.customerPhone || undefined,
        address: raw.customerAddress || undefined,
        notes: raw.note || undefined,
      },
      rawPayload: raw as unknown as Record<string, unknown>,
      sourceMetadata: {
        platform: raw.source,
        restaurantId: raw.branchId,
      },
      // Pricing breakdown — optional on the website payload, never blocks
      // ingestion if missing/malformed (see ADR-005 Addendum 4).
      // productSubtotal reuses the existing required subTotal field rather
      // than a duplicate.
      productSubtotal: sanitizeNonNegativeNumber(raw.subTotal),
      vatPercent: sanitizeNonNegativeNumber(raw.vatPercent),
      vatAmount: sanitizeNonNegativeNumber(raw.vatAmount),
      deliveryCharge: sanitizeNonNegativeNumber(raw.deliveryCharge),
      platformFee: sanitizeNonNegativeNumber(raw.platformFee),
      discountType: sanitizeDiscountType(raw.discountType),
      discountValue: sanitizeNonNegativeNumber(raw.discountValue),
      discountAmount: sanitizeNonNegativeNumber(raw.discountAmount),
    };
  }

  private mapOrderType(orderType: WebsiteOrderType): OrderType {
    const map: Record<WebsiteOrderType, OrderType> = {
      [WebsiteOrderType.DELIVERY]: OrderType.DELIVERY,
      [WebsiteOrderType.PICKUP]: OrderType.PICKUP,
      [WebsiteOrderType.DINE_IN]: OrderType.DINE_IN,
    };
    return map[orderType];
  }
}
