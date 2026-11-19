import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OrderStatus } from './order.entity';

@Entity('order_history')
@Index(['orderId'])
export class OrderHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'enum', enum: OrderStatus })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  changedBy: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  changedAt: Date;

  // Virtual — populated by OrdersRepository.enrichActorNames(), never
  // persisted. changedBy itself stays a raw user id. See order-history.md.
  changedByName?: string | null;
}
