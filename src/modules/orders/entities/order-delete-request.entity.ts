import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DeleteReason } from './order.entity';
import { UserRole } from '../../../common/enums/user-role.enum';

export enum DeleteRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// Order Delete — a non-admin's request to archive an order, reviewed by
// ADMIN/SUPER_ADMIN. See order-delete.md / ADR-007. Can originate from the
// dashboard or the mobile app (same endpoint, same shape).
@Entity('order_delete_requests')
@Index(['orderId'])
@Index(['status'])
export class OrderDeleteRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'varchar', length: 36 })
  requestedBy: string;

  @Column({ type: 'enum', enum: UserRole })
  requestedByRole: UserRole;

  @Column({ type: 'enum', enum: DeleteReason })
  reason: DeleteReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  customReason: string | null;

  @Column({
    type: 'enum',
    enum: DeleteRequestStatus,
    default: DeleteRequestStatus.PENDING,
  })
  status: DeleteRequestStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'datetime', precision: 3, nullable: true, default: null })
  reviewedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reviewNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  // Virtual — populated by OrdersRepository for display convenience, never persisted.
  orderExternalId?: string;
  orderBranchName?: string | null;
  orderCustomerName?: string;
  orderTotalAmount?: number;

  // Virtual — populated by OrdersRepository.enrichActorNames(). requestedBy/
  // reviewedBy stay raw user ids. See order-history.md.
  requestedByName?: string | null;
  reviewedByName?: string | null;
}
