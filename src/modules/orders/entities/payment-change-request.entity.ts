import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentMethod, PaymentStatus } from './order.entity';

export enum PaymentChangeRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// A request from Manager / Branch Manager / Staff to change an order's
// recorded payment (once a payment is recorded only Admin+ can change it).
// Reviewed by ADMIN or SUPER_ADMIN.
@Entity('payment_change_requests')
@Index(['orderId'])
@Index(['status'])
export class PaymentChangeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'varchar', length: 36 })
  requestedBy: string;

  // What the order had when the request was made.
  @Column({ type: 'enum', enum: PaymentStatus })
  fromStatus: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true, default: null })
  fromMethod: PaymentMethod | null;

  // What the requester wants it to be.
  @Column({ type: 'enum', enum: PaymentStatus })
  toStatus: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true, default: null })
  toMethod: PaymentMethod | null;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({
    type: 'enum',
    enum: PaymentChangeRequestStatus,
    default: PaymentChangeRequestStatus.PENDING,
  })
  status: PaymentChangeRequestStatus;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  reviewedBy: string | null;

  @Column({ type: 'datetime', precision: 3, nullable: true, default: null })
  reviewedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  reviewNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  // Virtual, filled in for display only.
  requestedByName?: string | null;
  reviewedByName?: string | null;
  orderExternalId?: string;
  orderBranchName?: string | null;
  orderCustomerName?: string;
  orderTotalAmount?: number;
}
