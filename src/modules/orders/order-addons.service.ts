import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { applyAddonToPricing } from '../addons/addon-pricing.util';
import { AddonsService } from '../addons/addons.service';
import type { JwtPayload } from '../auth/auth.service';
import { UserRole } from '../../common/enums/user-role.enum';
import type { OrderItemDto } from '../normalization/dto/order-item.dto';
import type { AddOrderAddonDto } from './dto/add-order-addon.dto';
import type { Order } from './entities/order.entity';
import { OrdersRepository } from './orders.repository';

const BRANCH_SCOPED_ROLES = new Set([UserRole.BRANCH_MANAGER, UserRole.STAFF]);

// Adds a dashboard add-on to an existing order as one extra item line:
//   { name, quantity, price, notes: 'Add-on' }
// — the same shape every other item line already has, so the mobile app reads
// and prints it with no change. Deliberately separate from updateManualOrder():
// that rewrites the customer block and recomputes VAT/delivery from settings,
// which an add-on must not do.
@Injectable()
export class OrderAddonsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly addons: AddonsService,
  ) {}

  async addToOrder(orderId: string, dto: AddOrderAddonDto, actor: JwtPayload): Promise<Order> {
    const order = await this.orders.findByIdRaw(orderId);
    if (!order) throw new NotFoundException('Order not found');
    // Same freezes as editing an order (see updateManualOrder / ADR-011).
    if (order.isCompleted) throw new ConflictException('Completed orders cannot be updated');
    if (order.archivedAt) throw new ConflictException('Order is already archived');
    if (BRANCH_SCOPED_ROLES.has(actor.role) && order.branchId && order.branchId !== actor.branchId) {
      throw new ForbiddenException('Order belongs to a different branch');
    }

    const addon = await this.addons.getOrFail(dto.addonId);
    if (!addon.is_active) throw new BadRequestException('This add-on is not active');

    const quantity = dto.quantity ?? 1;
    const price = Number(addon.price);
    const item: OrderItemDto = { name: addon.name, quantity, price, notes: 'Add-on' };

    const itemsSubtotal = order.items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
    const pricing = applyAddonToPricing(
      {
        productSubtotal: order.productSubtotal,
        vatPercent: order.vatPercent,
        vatAmount: order.vatAmount,
        discountType: order.discountType,
        discountValue: order.discountValue,
        discountAmount: order.discountAmount,
        totalAmount: order.totalAmount,
      },
      itemsSubtotal,
      price * quantity,
    );

    return this.orders.appendItem(order, item, pricing, actor.sub, `Add-on added: ${addon.name} x${quantity}`);
  }
}
