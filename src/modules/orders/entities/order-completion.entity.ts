import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from '../../../common/enums/user-role.enum';

// Order Completion — terminal "done" marker layered on top of an ACCEPTED/
// ESCALATED order, tracked in its own table (never a column on `orders` —
// see ADR-011). One row per order, enforced by the unique index below. No
// note/reason field — just who completed it and when.
@Entity('order_completions')
@Index(['orderId'], { unique: true })
export class OrderCompletion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'varchar', length: 36 })
  completedBy: string;

  @Column({ type: 'enum', enum: UserRole })
  completedByRole: UserRole;

  @CreateDateColumn({ type: 'datetime', precision: 3 })
  completedAt: Date;
}
