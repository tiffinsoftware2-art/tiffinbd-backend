import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CustomerInfoDto } from '../../normalization/dto/customer-info.dto';
import type { OrderItemDto } from '../../normalization/dto/order-item.dto';
import { DiscountType, OrderSource, OrderType } from './order.entity';

// Full snapshot of an order's editable fields, captured immediately before an
// edit is applied — lets the dashboard reconstruct every past version of a
// manually-edited order, not just a change summary. See order-update.md.
export interface OrderEditSnapshot {
  source: OrderSource;
  orderType: OrderType;
  customer: CustomerInfoDto;
  items: OrderItemDto[];
  productSubtotal: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  deliveryCharge: number | null;
  platformFee: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  discountAmount: number | null;
  totalAmount: number;
}

@Entity('order_edit_history')
@Index(['orderId'])
export class OrderEditHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  editedBy: string | null;

  @Column({ type: 'json' })
  previousSnapshot: OrderEditSnapshot;

  @Column({
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  editedAt: Date;

  // Virtual — populated by OrdersRepository.enrichActorNames(), never
  // persisted. editedBy itself stays a raw user id. See order-history.md.
  editedByName?: string | null;
}
