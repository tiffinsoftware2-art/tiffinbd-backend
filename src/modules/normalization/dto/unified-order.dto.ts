import { CustomerInfoDto } from './customer-info.dto';
import { OrderItemDto } from './order-item.dto';
import type { DiscountType } from '../../orders/entities/order.entity';

export enum OrderSource {
  WEBSITE = 'WEBSITE',
  FOODPANDA = 'FOODPANDA',
  PATHAO = 'PATHAO',
  FOODIE = 'FOODIE',
  WHATSAPP = 'WHATSAPP',
  PHONE = 'PHONE',
  OTHER = 'OTHER',
  PHYSICAL_STORE = 'PHYSICAL_STORE',
  TIFFIN_TAKEAWAY = 'TIFFIN_TAKEAWAY',
  STAFF = 'STAFF',
}

// Sources eligible for Manual Order Entry.
export const MANUAL_ORDER_SOURCES = [
  OrderSource.WHATSAPP,
  OrderSource.PHONE,
  OrderSource.FOODPANDA,
  OrderSource.PATHAO,
  OrderSource.WEBSITE,
  OrderSource.FOODIE,
  OrderSource.OTHER,
  OrderSource.PHYSICAL_STORE,
  OrderSource.TIFFIN_TAKEAWAY,
  OrderSource.STAFF,
] as const;

export enum OrderType {
  DELIVERY = 'DELIVERY',
  PICKUP = 'PICKUP',
  DINE_IN = 'DINE_IN',
}

export interface UnifiedOrderDto {
  externalId: string;
  source: OrderSource;
  orderType: OrderType;
  items: OrderItemDto[];
  totalAmount?: number;
  branchId?: string | null;
  customerInfo: CustomerInfoDto;
  rawPayload: Record<string, unknown>;
  sourceMetadata?: {
    platform?: string;
    restaurantId?: string;
    webhookTimestamp?: string;
  };
  // Ingestion-time pricing breakdown — see ADR-005 Addendum 4. Populated by
  // an adapter when the source payload carries these fields (currently only
  // TiffinBDAdapter); already-sanitized (safe non-negative numbers / valid
  // enum) by the time they land here. Undefined, not present in the source
  // payload — OrdersRepository.create() applies the actual 0/null defaults.
  productSubtotal?: number;
  vatPercent?: number;
  vatAmount?: number;
  deliveryCharge?: number;
  platformFee?: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount?: number;
}
