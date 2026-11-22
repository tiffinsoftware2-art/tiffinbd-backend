import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CustomerInfoDto } from '../../normalization/dto/customer-info.dto';
import type { OrderItemDto } from '../../normalization/dto/order-item.dto';
import {
  OrderSource,
  OrderType,
} from '../../normalization/dto/unified-order.dto';

export { OrderSource, OrderType };

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  ESCALATED = 'ESCALATED',
}

// Paid in full, or still owed (Due). Existing and website orders are PAID.
export enum PaymentStatus {
  PAID = 'PAID',
  DUE = 'DUE',
}

// How a paid order was paid. Null for Due orders and for orders from before this existed.
export enum PaymentMethod {
  CASH = 'CASH',
  BKASH = 'BKASH',
  NAGAD = 'NAGAD',
  ROCKET = 'ROCKET',
  CARD = 'CARD',
  BANK = 'BANK',
  OTHER = 'OTHER',
}

// Manual orders only — see ADR-005 and manual-order.md.
export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

// Order Delete (archive + delete-request approval flow) — see order-delete.md
// and ADR-007. Shared between Order.archiveReason and OrderDeleteRequest.reason.
export enum DeleteReason {
  FAKE_ORDER = 'FAKE_ORDER',
  ITEM_NOT_AVAILABLE = 'ITEM_NOT_AVAILABLE',
  CUSTOMER_UNREACHABLE = 'CUSTOMER_UNREACHABLE',
  OTHER = 'OTHER',
}

@Entity('orders')
@Index(['status'])
@Index(['branchId'])
@Index(['createdAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  externalId: string;

  @Column({ type: 'enum', enum: OrderSource })
  source: OrderSource;

  @Column({ type: 'enum', enum: OrderType })
  orderType: OrderType;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId: string | null;

  @Column({ type: 'json' })
  customer: CustomerInfoDto;

  @Column({ type: 'json' })
  items: OrderItemDto[];

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ type: 'json' })
  rawPayload: Record<string, unknown>;

  // Manual Order Entry only (ADR-005) — null for every ingested order; there's
  // no "creator" for those, they arrive from the source platform. See
  // order-history.md for the actor-tracking rollup.
  @Column({ type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  acceptedBy: string | null;

  @Column({ type: 'datetime', precision: 3, nullable: true, default: null })
  acceptedAt: Date | null;

  @Column({ type: 'datetime', precision: 3, nullable: true, default: null })
  escalatedAt: Date | null;

  @Column({ type: 'datetime', precision: 3, nullable: true, default: null })
  settledAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  settledBy: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  settlementNote: string | null;

  // Set true the first time a manual order is edited via Order Update — see
  // order-update.md / ADR-006. Always false for orders that have never been edited.
  @Column({ type: 'boolean', default: false })
  isUpdated: boolean;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PAID })
  paymentStatus: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true, default: null })
  paymentMethod: PaymentMethod | null;

  // Order number the delivery platform (Foodpanda / Pathao / Foodi) gave this
  // order, typed in by staff. Null for every other source.
  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  platformOrderId: string | null;

  // ── Order Delete — soft-archive (null = active/not archived) — see order-delete.md / ADR-007 ──
  @Column({ type: 'datetime', precision: 3, nullable: true, default: null })
  archivedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  archivedBy: string | null;

  @Column({ type: 'enum', enum: DeleteReason, nullable: true })
  archiveReason: DeleteReason | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  archiveReasonNote: string | null;

  // ── Manual order pricing (null for every non-manual order) — see ADR-005 ──
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  productSubtotal: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  vatPercent: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  vatAmount: number | null;

  // Unlike the other manual-pricing columns above/below, deliveryCharge and
  // platformFee are populated (defaulting to 0) for every order at ingestion,
  // not just manual ones — see ADR-005's 2026-07-07 addendum. `nullable`
  // stays true only for rows created before that change.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  deliveryCharge: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  platformFee: number | null;

  @Column({ type: 'enum', enum: DiscountType, nullable: true })
  discountType: DiscountType | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  discountValue: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  discountAmount: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual — populated by OrdersRepository.enrichBranches(), never persisted.
  branchName?: string | null;

  // Virtual — actor-name lookups for the Order Detail timeline/banners and
  // CSV export, populated by OrdersRepository.enrichActorNames() /
  // enrichExportActorNames(). Every *By column above stays a raw user id;
  // these are display-only and never persisted. See order-history.md.
  createdByName?: string | null;
  acceptedByName?: string | null;
  archivedByName?: string | null;
  settledByName?: string | null;
  // Most recent delete request tied to this order, CSV export only.
  requestedByName?: string | null;
  reviewedByName?: string | null;
  // Most recent order_edit_history entry's editor, CSV export only (added
  // 2026-07-14) — an order can have multiple edits, so this is "most recent
  // editor", not "the" editor; the Order Detail view shows the full
  // editHistory timeline instead of collapsing it to one name.
  updatedByName?: string | null;

  // Virtual — Order Completion, populated by OrdersRepository.enrichCompletion()
  // / enrichActorNames(). Completion lives in its own order_completions table,
  // never a column here — see ADR-011. isCompleted is derived (true iff a
  // completion row exists for this order).
  isCompleted?: boolean;
  completedAt?: Date | null;
  completedBy?: string | null;
  completedByName?: string | null;

  // Virtual — Order Delete addendum (2026-07-10), populated by
  // OrdersRepository.enrichPendingDeleteRequests(). Derived from the existing
  // order_delete_requests table (never a column here) — true iff a PENDING
  // request exists for this order. See ADR-007 addendum.
  hasPendingDeleteRequest?: boolean;
}
