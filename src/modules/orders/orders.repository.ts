import { Injectable } from '@nestjs/common';
import { normalisePlatformOrderId } from './platform-order-id.util';
import { resolveManualCustomer } from './manual-customer.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Branch } from '../branches/entities/branch.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import {
  DeleteReason,
  DiscountType,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './entities/order.entity';
import { OrderHistory } from './entities/order-history.entity';
import {
  OrderEditHistory,
  OrderEditSnapshot,
} from './entities/order-edit-history.entity';
import {
  DeleteRequestStatus,
  OrderDeleteRequest,
} from './entities/order-delete-request.entity';
import { OrderCompletion } from './entities/order-completion.entity';
import { dhakaShiftExpr } from '../../common/utils/dhaka-time';
import type { UnifiedOrderDto } from '../normalization/dto/unified-order.dto';
import type {
  OrderExportFilterDto,
  OrderFilterDto,
} from './dto/order-filter.dto';
import type { UpdateManualOrderDto } from './dto/update-manual-order.dto';
import type { UserRole } from '../../common/enums/user-role.enum';

// Manual Order Entry only — see ADR-005. Passed through to `create()` to
// populate the pricing columns; omitted entirely for every other order source.
export interface ManualOrderPricing {
  productSubtotal: number;
  vatPercent: number;
  vatAmount: number;
  deliveryCharge: number;
  platformFee: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  discountAmount: number | null;
  totalAmount: number;
}

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderHistory)
    private readonly historyRepo: Repository<OrderHistory>,
    @InjectRepository(OrderEditHistory)
    private readonly editHistoryRepo: Repository<OrderEditHistory>,
    @InjectRepository(OrderDeleteRequest)
    private readonly deleteRequestRepo: Repository<OrderDeleteRequest>,
    @InjectRepository(OrderCompletion)
    private readonly completionRepo: Repository<OrderCompletion>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // Resolves [item:id] placeholders to real names/prices using a single batch query.
  private async enrichItems(orders: Order[]): Promise<void> {
    const ids = new Set<string>();
    for (const o of orders) {
      for (const item of o.items) {
        if (item.externalItemId) ids.add(item.externalItemId);
      }
    }
    if (ids.size === 0) return;

    const menuItems = await this.menuItemRepo.find({
      where: { external_id: In([...ids]) },
      select: ['external_id', 'name', 'price'],
    });
    const menuMap = new Map(menuItems.map((m) => [m.external_id, m]));

    for (const o of orders) {
      o.items = o.items.map((item) => {
        const found = item.externalItemId
          ? menuMap.get(item.externalItemId)
          : undefined;
        if (!found) return item;
        return { ...item, name: found.name, price: Number(found.price) };
      });
    }
  }

  async create(
    unified: UnifiedOrderDto,
    branchId: string | null,
    pricing?: ManualOrderPricing,
    createdBy: string | null = null,
    paymentStatus: PaymentStatus = PaymentStatus.PAID,
    paymentMethod: PaymentMethod | null = null,
    platformOrderId: string | null = null,
  ): Promise<Order> {
    const totalAmount =
      pricing?.totalAmount ??
      unified.totalAmount ??
      unified.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    // Product subtotal defaults to the sum of line items for every source,
    // not just manual orders, so it's never null for reports — pricing.productSubtotal
    // and unified.productSubtotal (adapter-supplied) win when present.
    const productSubtotal =
      pricing?.productSubtotal ??
      unified.productSubtotal ??
      unified.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const order = this.orderRepo.create({
      externalId: unified.externalId,
      source: unified.source,
      orderType: unified.orderType,
      status: OrderStatus.PENDING,
      branchId,
      customer: unified.customerInfo,
      items: unified.items,
      totalAmount,
      productSubtotal,
      rawPayload: unified.rawPayload,
      createdBy,
      paymentStatus,
      paymentMethod: paymentStatus === PaymentStatus.DUE ? null : paymentMethod,
      platformOrderId,
      acceptedBy: null,
      acceptedAt: null,
      escalatedAt: null,
      // deliveryCharge/platformFee/discountValue/discountAmount default to 0
      // (never left unset) for EVERY order source once missing, not just
      // manual orders — see ADR-005 Addendum 2 (deliveryCharge/platformFee)
      // and Addendum 4 (discountValue/discountAmount, extended for website
      // ingestion). discountType defaults to null (no fabricated enum value).
      //
      // vatPercent/vatAmount deliberately do NOT get a 0-default here — they
      // stay null unless `pricing` or an adapter (`unified.*`) supplies a
      // real value. updateManualOrder() (see order-update.md / ADR-005
      // addendum 2) relies on `vatPercent === null` to mean "never
      // snapshotted, seed from the current global rate on first edit" vs. a
      // real (possibly deliberately-zero) rate to preserve; defaulting to 0
      // here would make every never-edited website order look like it was
      // already explicitly VAT-excluded. See ADR-005 Addendum 4.
      //
      // discountType/discountValue/discountAmount branch on `pricing`
      // presence rather than chaining `??` through pricing's own fields,
      // because `pricing.discountType`/`discountValue`/`discountAmount` are
      // legitimately `null` for a manual order created with no discount —
      // `pricing?.discountValue ?? unified.discountValue ?? 0` would
      // incorrectly treat that explicit `null` as "not provided" and fall
      // through to a stray `unified` value or 0.
      deliveryCharge: pricing?.deliveryCharge ?? unified.deliveryCharge ?? 0,
      platformFee: pricing?.platformFee ?? unified.platformFee ?? 0,
      vatPercent: pricing?.vatPercent ?? unified.vatPercent ?? null,
      vatAmount: pricing?.vatAmount ?? unified.vatAmount ?? null,
      discountType: pricing ? pricing.discountType : (unified.discountType ?? null),
      discountValue: pricing ? pricing.discountValue : (unified.discountValue ?? 0),
      discountAmount: pricing ? pricing.discountAmount : (unified.discountAmount ?? 0),
    });
    const saved = await this.orderRepo.save(order);
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: saved.id,
        status: OrderStatus.PENDING,
        changedBy: createdBy,
        note: createdBy ? 'Order created' : 'Order received',
      }),
    );
    await this.enrichBranches([saved]);
    return saved;
  }

  // An active (not archived) order from this platform that already carries
  // this platform order number. Used to stop the same order being entered twice.
  async findByPlatformOrderId(
    source: string,
    platformOrderId: string,
    excludeId?: string,
  ): Promise<Order | null> {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.source = :source', { source })
      .andWhere('o.platformOrderId = :platformOrderId', { platformOrderId })
      .andWhere('o.archivedAt IS NULL');
    if (excludeId) qb.andWhere('o.id <> :excludeId', { excludeId });
    return qb.getOne();
  }

  async setPaymentStatus(
    order: Order,
    status: PaymentStatus,
    method?: PaymentMethod,
  ): Promise<Order> {
    order.paymentStatus = status;
    order.paymentMethod =
      status === PaymentStatus.DUE ? null : (method ?? order.paymentMethod ?? null);
    return this.orderRepo.save(order);
  }

  async accept(order: Order, userId: string): Promise<Order> {
    order.status = OrderStatus.ACCEPTED;
    order.acceptedBy = userId;
    order.acceptedAt = new Date();
    const saved = await this.orderRepo.save(order);
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: saved.id,
        status: OrderStatus.ACCEPTED,
        changedBy: userId,
        note: 'Order accepted',
      }),
    );
    return saved;
  }

  private async enrichBranches(orders: Order[]): Promise<void> {
    // Collect stored branchIds, then also scan rawPayload for the original website branchId
    // (external branch ID) as a fallback when the resolution at ingestion time stored null.
    const explicitIds = new Set(
      orders.map((o) => o.branchId).filter((id): id is string => id !== null),
    );
    const rawIds = new Set(
      orders
        .map(
          (o) => (o.rawPayload as Record<string, unknown> | null)?.['branchId'],
        )
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
    const allIds = [...new Set([...explicitIds, ...rawIds])];

    if (allIds.length === 0) {
      orders.forEach((o) => {
        o.branchName = null;
      });
      return;
    }

    // Match on either the internal UUID (id) or the external ID (external_id).
    const branches = await this.branchRepo
      .createQueryBuilder('b')
      .select(['b.id', 'b.name', 'b.external_id'])
      .where('b.id IN (:...ids)', { ids: allIds })
      .orWhere('b.external_id IN (:...ids)', { ids: allIds })
      .getMany();

    const byId = new Map(branches.map((b) => [b.id, b.name]));
    const byExternalId = new Map(
      branches
        .filter((b) => b.external_id)
        .map((b) => [b.external_id!, b.name]),
    );

    for (const o of orders) {
      const rawBranchId = (o.rawPayload as Record<string, unknown> | null)?.[
        'branchId'
      ];
      o.branchName =
        (o.branchId
          ? (byId.get(o.branchId) ?? byExternalId.get(o.branchId))
          : undefined) ??
        (typeof rawBranchId === 'string'
          ? byExternalId.get(rawBranchId)
          : undefined) ??
        null;
    }
  }

  // Order Completion — batch-attaches isCompleted/completedAt/completedBy
  // virtual fields from the separate order_completions table (never a column
  // on `orders` — see ADR-011 / order-completion.md). Same batch-query shape
  // as enrichBranches().
  private async enrichCompletion(orders: Order[]): Promise<void> {
    if (orders.length === 0) return;
    const completions = await this.completionRepo.find({
      where: { orderId: In(orders.map((o) => o.id)) },
    });
    const byOrderId = new Map(completions.map((c) => [c.orderId, c]));
    for (const o of orders) {
      const completion = byOrderId.get(o.id);
      o.isCompleted = !!completion;
      o.completedAt = completion?.completedAt ?? null;
      o.completedBy = completion?.completedBy ?? null;
    }
  }

  // Order Delete addendum (2026-07-10) — batch-attaches hasPendingDeleteRequest
  // from the existing order_delete_requests table (no new table/column — see
  // ADR-007 addendum). Same batch-query shape as enrichCompletion().
  private async enrichPendingDeleteRequests(orders: Order[]): Promise<void> {
    if (orders.length === 0) return;
    const pending = await this.deleteRequestRepo.find({
      where: {
        orderId: In(orders.map((o) => o.id)),
        status: DeleteRequestStatus.PENDING,
      },
    });
    const orderIdsWithPending = new Set(pending.map((r) => r.orderId));
    for (const o of orders) {
      o.hasPendingDeleteRequest = orderIdsWithPending.has(o.id);
    }
  }

  // Batch-resolves a list of (possibly null/duplicate) user ids to display
  // names in one query. See order-history.md.
  private async resolveNames(
    ids: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids.filter((id): id is string => !!id))];
    if (uniqueIds.length === 0) return new Map();
    const users = await this.userRepo.find({ where: { id: In(uniqueIds) } });
    return new Map(users.map((u) => [u.id, u.name || u.username]));
  }

  // Order Detail panel — resolves every actor id referenced by an order and
  // its history/edit-history/delete-requests to a display name, for the
  // timeline and banners. See order-history.md.
  async enrichActorNames(
    order: Order,
    history: OrderHistory[],
    editHistory: OrderEditHistory[],
    deleteRequests: OrderDeleteRequest[],
  ): Promise<void> {
    const nameById = await this.resolveNames([
      order.createdBy,
      order.acceptedBy,
      order.archivedBy,
      order.settledBy,
      order.completedBy,
      ...history.map((h) => h.changedBy),
      ...editHistory.map((e) => e.editedBy),
      ...deleteRequests.map((r) => r.requestedBy),
      ...deleteRequests.map((r) => r.reviewedBy),
    ]);

    order.createdByName = order.createdBy
      ? (nameById.get(order.createdBy) ?? null)
      : null;
    order.acceptedByName = order.acceptedBy
      ? (nameById.get(order.acceptedBy) ?? null)
      : null;
    order.archivedByName = order.archivedBy
      ? (nameById.get(order.archivedBy) ?? null)
      : null;
    order.settledByName = order.settledBy
      ? (nameById.get(order.settledBy) ?? null)
      : null;
    order.completedByName = order.completedBy
      ? (nameById.get(order.completedBy) ?? null)
      : null;
    for (const h of history) {
      h.changedByName = h.changedBy
        ? (nameById.get(h.changedBy) ?? null)
        : null;
    }
    for (const e of editHistory) {
      e.editedByName = e.editedBy ? (nameById.get(e.editedBy) ?? null) : null;
    }
    for (const r of deleteRequests) {
      r.requestedByName = nameById.get(r.requestedBy) ?? null;
      r.reviewedByName = r.reviewedBy
        ? (nameById.get(r.reviewedBy) ?? null)
        : null;
    }
  }

  // CSV export only — resolves createdBy/acceptedBy/archivedBy plus the most
  // recent delete request's requestedBy/reviewedBy to display names. See
  // order-history.md.
  private async enrichExportActorNames(orders: Order[]): Promise<void> {
    const orderIds = orders.map((o) => o.id);
    const deleteRequests =
      orderIds.length > 0
        ? await this.deleteRequestRepo.find({
            where: { orderId: In(orderIds) },
            order: { createdAt: 'DESC' },
          })
        : [];
    const latestRequestByOrderId = new Map<string, OrderDeleteRequest>();
    for (const r of deleteRequests) {
      if (!latestRequestByOrderId.has(r.orderId)) {
        latestRequestByOrderId.set(r.orderId, r);
      }
    }

    // "Updated By" export column — most recent editor per order, same
    // first-seen-wins-on-DESC-order pattern as latestRequestByOrderId above.
    const edits =
      orderIds.length > 0
        ? await this.editHistoryRepo.find({
            where: { orderId: In(orderIds) },
            order: { editedAt: 'DESC' },
          })
        : [];
    const latestEditByOrderId = new Map<string, OrderEditHistory>();
    for (const e of edits) {
      if (!latestEditByOrderId.has(e.orderId)) {
        latestEditByOrderId.set(e.orderId, e);
      }
    }

    const nameById = await this.resolveNames([
      ...orders.map((o) => o.createdBy),
      ...orders.map((o) => o.acceptedBy),
      ...orders.map((o) => o.archivedBy),
      ...orders.map((o) => o.completedBy),
      ...[...latestRequestByOrderId.values()].map((r) => r.requestedBy),
      ...[...latestRequestByOrderId.values()].map((r) => r.reviewedBy),
      ...[...latestEditByOrderId.values()].map((e) => e.editedBy),
    ]);

    for (const o of orders) {
      o.createdByName = o.createdBy
        ? (nameById.get(o.createdBy) ?? null)
        : null;
      o.acceptedByName = o.acceptedBy
        ? (nameById.get(o.acceptedBy) ?? null)
        : null;
      o.archivedByName = o.archivedBy
        ? (nameById.get(o.archivedBy) ?? null)
        : null;
      // completedBy/completedAt themselves come from enrichCompletion() —
      // this only resolves the id to a display name, same as the others.
      o.completedByName = o.completedBy
        ? (nameById.get(o.completedBy) ?? null)
        : null;
      const request = latestRequestByOrderId.get(o.id);
      o.requestedByName = request
        ? (nameById.get(request.requestedBy) ?? null)
        : null;
      const latestEdit = latestEditByOrderId.get(o.id);
      o.updatedByName =
        latestEdit?.editedBy != null
          ? (nameById.get(latestEdit.editedBy) ?? null)
          : null;
      o.reviewedByName =
        request?.reviewedBy != null
          ? (nameById.get(request.reviewedBy) ?? null)
          : null;
    }
  }

  async findById(id: string): Promise<Order | null> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (order) {
      await this.enrichItems([order]);
      await this.enrichBranches([order]);
      await this.enrichCompletion([order]);
      await this.enrichPendingDeleteRequests([order]);
    }
    return order;
  }

  async findAll(
    filters: OrderFilterDto,
    branchId?: string | null,
    branchIds?: string[] | null,
  ): Promise<{ data: Order[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.orderRepo.createQueryBuilder('o');
    if (filters.status)
      qb.andWhere('o.status = :status', { status: filters.status });
    if (filters.source)
      qb.andWhere('o.source = :source', { source: filters.source });
    if (branchIds && branchIds.length > 0) {
      qb.andWhere('o.branchId IN (:...branchIds)', { branchIds });
    } else if (branchId) {
      qb.andWhere('o.branchId = :branchId', { branchId });
    }
    if (filters.settled === false) qb.andWhere('o.settledAt IS NULL');
    if (filters.settled === true) qb.andWhere('o.settledAt IS NOT NULL');
    // Order Delete — archived orders are excluded from the default list view.
    if (filters.archived === true) qb.andWhere('o.archivedAt IS NOT NULL');
    else qb.andWhere('o.archivedAt IS NULL');
    // Order Completion — optional filter only; omitted applies no filter at
    // all (mirrors `settled`'s shape, not `archived`'s default-exclude
    // shape) — see ADR-011.
    if (filters.completed === true) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM order_completions oc WHERE oc.orderId = o.id)',
      );
    } else if (filters.completed === false) {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM order_completions oc WHERE oc.orderId = o.id)',
      );
    }
    // Order History "special conditions" filter — see order-filter.dto.ts.
    if (filters.hasPendingDeleteRequest === true) {
      qb.andWhere(
        "EXISTS (SELECT 1 FROM order_delete_requests dr WHERE dr.orderId = o.id AND dr.status = 'PENDING')",
      );
    }
    if (filters.isUpdated === true) qb.andWhere('o.isUpdated = true');
    // Bangladesh-time — see common/utils/dhaka-time.ts. o.createdAt stores
    // UTC-wall-clock digits; dateFrom/dateTo are Dhaka-calendar-day strings
    // from the frontend, so the column must be shifted +6h before DATE()
    // extracts a calendar day, or an order placed just after midnight BD
    // time (still the previous UTC day) would fall on the wrong side.
    if (filters.dateFrom)
      qb.andWhere(`DATE(${dhakaShiftExpr('o.createdAt')}) >= :dateFrom`, {
        dateFrom: filters.dateFrom,
      });
    if (filters.dateTo)
      qb.andWhere(`DATE(${dhakaShiftExpr('o.createdAt')}) <= :dateTo`, {
        dateTo: filters.dateTo,
      });
    if (filters.search?.trim()) {
      const q = `%${filters.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('o.externalId LIKE :q')
            .orWhere('o.platformOrderId LIKE :q')
            .orWhere("JSON_UNQUOTE(JSON_EXTRACT(o.customer, '$.name')) LIKE :q")
            .orWhere(
              "JSON_UNQUOTE(JSON_EXTRACT(o.customer, '$.phone')) LIKE :q",
            );
        }),
        { q },
      );
    }

    qb.orderBy("CASE WHEN o.status = 'PENDING' THEN 0 ELSE 1 END", 'ASC')
      .addOrderBy('o.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    await this.enrichItems(data);
    await this.enrichBranches(data);
    await this.enrichCompletion(data);
    await this.enrichPendingDeleteRequests(data);
    await this.enrichCreators(data);
    return { data, total };
  }

  // Order History list — who created each order (the logged-in user who
  // entered it). Website orders have no creator, so their name stays null.
  async enrichCreators(orders: Order[]): Promise<void> {
    const nameById = await this.resolveNames(orders.map((o) => o.createdBy));
    for (const o of orders) {
      o.createdByName = o.createdBy ? (nameById.get(o.createdBy) ?? null) : null;
    }
  }

  // CSV export — same filters as findAll but unpaginated (every matching row
  // in one shot); the DTO forces a bounded date range so this can't run away.
  // See order-history.md.
  async findAllForExport(
    filters: OrderExportFilterDto,
    branchId?: string | null,
    branchIds?: string[] | null,
  ): Promise<Order[]> {
    const qb = this.orderRepo.createQueryBuilder('o');
    if (filters.status)
      qb.andWhere('o.status = :status', { status: filters.status });
    if (filters.source)
      qb.andWhere('o.source = :source', { source: filters.source });
    if (branchIds && branchIds.length > 0) {
      qb.andWhere('o.branchId IN (:...branchIds)', { branchIds });
    } else if (branchId) {
      qb.andWhere('o.branchId = :branchId', { branchId });
    }
    if (filters.archived === true) qb.andWhere('o.archivedAt IS NOT NULL');
    else qb.andWhere('o.archivedAt IS NULL');
    // Order History "special conditions" — same filters/shape as findAll()
    // above; see order-filter.dto.ts and order-history.md.
    if (filters.completed === true) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM order_completions oc WHERE oc.orderId = o.id)',
      );
    } else if (filters.completed === false) {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM order_completions oc WHERE oc.orderId = o.id)',
      );
    }
    if (filters.hasPendingDeleteRequest === true) {
      qb.andWhere(
        "EXISTS (SELECT 1 FROM order_delete_requests dr WHERE dr.orderId = o.id AND dr.status = 'PENDING')",
      );
    }
    if (filters.isUpdated === true) qb.andWhere('o.isUpdated = true');
    // Bangladesh-time — see the identical comment on findAll() above.
    qb.andWhere(`DATE(${dhakaShiftExpr('o.createdAt')}) >= :dateFrom`, {
      dateFrom: filters.dateFrom,
    });
    qb.andWhere(`DATE(${dhakaShiftExpr('o.createdAt')}) <= :dateTo`, {
      dateTo: filters.dateTo,
    });
    if (filters.search?.trim()) {
      const q = `%${filters.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('o.externalId LIKE :q')
            .orWhere('o.platformOrderId LIKE :q')
            .orWhere("JSON_UNQUOTE(JSON_EXTRACT(o.customer, '$.name')) LIKE :q")
            .orWhere(
              "JSON_UNQUOTE(JSON_EXTRACT(o.customer, '$.phone')) LIKE :q",
            );
        }),
        { q },
      );
    }

    qb.orderBy('o.createdAt', 'DESC');

    const orders = await qb.getMany();
    await this.enrichBranches(orders);
    // Wasn't called here before — export rows never had isCompleted/
    // completedAt/completedBy populated at all (completion lives in a
    // separate order_completions table, not a column on `orders`, so
    // qb.getMany() alone can't return it). Needed for the new "Completed By"
    // export column, and must run before enrichExportActorNames() below,
    // which resolves completedBy to a name.
    await this.enrichCompletion(orders);
    await this.enrichExportActorNames(orders);
    return orders;
  }

  async escalate(order: Order): Promise<Order> {
    order.status = OrderStatus.ESCALATED;
    order.escalatedAt = new Date();
    const saved = await this.orderRepo.save(order);
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: saved.id,
        status: OrderStatus.ESCALATED,
        changedBy: null,
        note: 'Order auto-escalated',
      }),
    );
    return saved;
  }

  async settle(
    order: Order,
    userId: string,
    actionTaken: string,
  ): Promise<Order> {
    order.settledAt = new Date();
    order.settledBy = userId;
    order.settlementNote = actionTaken;
    const saved = await this.orderRepo.save(order);
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: saved.id,
        status: saved.status,
        changedBy: userId,
        note: 'Order settled',
      }),
    );
    return saved;
  }

  // Order Completion — inserts the order_completions row. Deliberately does
  // NOT call orderRepo.save(order) — `orders` (including `status`) is never
  // touched by this feature, see ADR-011 / order-completion.md.
  async completeOrder(
    order: Order,
    completedBy: string,
    completedByRole: UserRole,
  ): Promise<OrderCompletion> {
    const completion = await this.completionRepo.save(
      this.completionRepo.create({ orderId: order.id, completedBy, completedByRole }),
    );
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: order.id,
        status: order.status,
        changedBy: completedBy,
        note: 'Order marked completed',
      }),
    );
    return completion;
  }

  // Generic history write for actions that don't otherwise touch the Order
  // row itself (delete-request created/rejected) — see order-history.md.
  async logHistory(
    orderId: string,
    status: OrderStatus,
    changedBy: string | null,
    note: string,
  ): Promise<void> {
    await this.historyRepo.save(
      this.historyRepo.create({ orderId, status, changedBy, note }),
    );
  }

  async findHistory(orderId: string): Promise<OrderHistory[]> {
    return this.historyRepo.find({
      where: { orderId },
      order: { changedAt: 'ASC' },
    });
  }

  // Order Update (Branch Manager+, manual orders only, PENDING only) — see
  // order-update.md and ADR-006. Snapshots the pre-edit state before applying
  // the new fields, so the full edit history can be reconstructed later.
  async updateManual(
    order: Order,
    dto: UpdateManualOrderDto,
    pricing: ManualOrderPricing,
    actorId: string,
  ): Promise<Order> {
    const previousSnapshot: OrderEditSnapshot = {
      source: order.source,
      orderType: order.orderType,
      customer: order.customer,
      items: order.items,
      productSubtotal: order.productSubtotal,
      vatPercent: order.vatPercent,
      vatAmount: order.vatAmount,
      deliveryCharge: order.deliveryCharge,
      platformFee: order.platformFee,
      discountType: order.discountType,
      discountValue: order.discountValue,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
    };

    order.source = dto.source;
    order.orderType = dto.orderType;
    order.customer = resolveManualCustomer(dto);
    order.items = dto.items;
    order.platformOrderId = normalisePlatformOrderId(dto.source, dto.platformOrderId);
    if (dto.paymentStatus) {
      order.paymentStatus = dto.paymentStatus;
      order.paymentMethod =
        dto.paymentStatus === PaymentStatus.DUE ? null : (dto.paymentMethod ?? order.paymentMethod ?? null);
    }
    order.productSubtotal = pricing.productSubtotal;
    order.vatPercent = pricing.vatPercent;
    order.vatAmount = pricing.vatAmount;
    order.deliveryCharge = pricing.deliveryCharge;
    order.platformFee = pricing.platformFee;
    order.discountType = pricing.discountType;
    order.discountValue = pricing.discountValue;
    order.discountAmount = pricing.discountAmount;
    order.totalAmount = pricing.totalAmount;
    order.isUpdated = true;

    const saved = await this.orderRepo.save(order);

    await this.editHistoryRepo.save(
      this.editHistoryRepo.create({
        orderId: saved.id,
        editedBy: actorId,
        previousSnapshot,
      }),
    );
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: saved.id,
        status: saved.status,
        changedBy: actorId,
        note: 'Order updated',
      }),
    );
    await this.enrichBranches([saved]);
    return saved;
  }

  async findEditHistory(orderId: string): Promise<OrderEditHistory[]> {
    return this.editHistoryRepo.find({
      where: { orderId },
      order: { editedAt: 'ASC' },
    });
  }

  // Order Delete — direct archive (ADMIN/SUPER_ADMIN) or approval of a
  // pending request. Either way the order ends up archived the same way —
  // see order-delete.md / ADR-007.
  async archive(
    order: Order,
    archivedBy: string,
    reason: DeleteReason,
    customReason: string | null,
  ): Promise<Order> {
    order.archivedAt = new Date();
    order.archivedBy = archivedBy;
    order.archiveReason = reason;
    order.archiveReasonNote = customReason;
    const saved = await this.orderRepo.save(order);
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: saved.id,
        status: saved.status,
        changedBy: archivedBy,
        note: 'Order archived',
      }),
    );
    await this.enrichBranches([saved]);
    return saved;
  }

  // Order Delete — undo an archive (ADMIN/SUPER_ADMIN). Restores the order
  // to active by clearing the archive fields — see order-delete.md / ADR-007.
  async unarchive(order: Order, actorId: string): Promise<Order> {
    order.archivedAt = null;
    order.archivedBy = null;
    order.archiveReason = null;
    order.archiveReasonNote = null;
    const saved = await this.orderRepo.save(order);
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: saved.id,
        status: saved.status,
        changedBy: actorId,
        note: 'Order unarchived',
      }),
    );
    await this.enrichBranches([saved]);
    return saved;
  }

  async createDeleteRequest(
    orderId: string,
    requestedBy: string,
    requestedByRole: UserRole,
    reason: DeleteReason,
    customReason: string | null,
  ): Promise<OrderDeleteRequest> {
    return this.deleteRequestRepo.save(
      this.deleteRequestRepo.create({
        orderId,
        requestedBy,
        requestedByRole,
        reason,
        customReason,
      }),
    );
  }

  async findPendingDeleteRequestForOrder(
    orderId: string,
  ): Promise<OrderDeleteRequest | null> {
    return this.deleteRequestRepo.findOne({
      where: { orderId, status: DeleteRequestStatus.PENDING },
    });
  }

  async findDeleteRequestById(id: string): Promise<OrderDeleteRequest | null> {
    return this.deleteRequestRepo.findOne({ where: { id } });
  }

  async findDeleteRequests(
    status?: DeleteRequestStatus,
  ): Promise<OrderDeleteRequest[]> {
    const requests = await this.deleteRequestRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
    if (requests.length === 0) return requests;

    const orders = await this.orderRepo.find({
      where: { id: In(requests.map((r) => r.orderId)) },
    });
    await this.enrichBranches(orders);
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    // requestedByName/reviewedByName — this list endpoint previously never
    // resolved these (unlike findOne()'s enrichActorNames()), so the review
    // queue's "Reviewed By" column always showed "—" once a request was
    // approved/rejected (requester name was masked by the frontend's
    // requestedByRole fallback, so only the reviewer gap was visible).
    const nameById = await this.resolveNames([
      ...requests.map((r) => r.requestedBy),
      ...requests.map((r) => r.reviewedBy),
    ]);

    for (const r of requests) {
      const order = orderMap.get(r.orderId);
      r.orderExternalId = order?.externalId;
      r.orderBranchName = order?.branchName ?? null;
      r.orderCustomerName = order?.customer?.name;
      r.orderTotalAmount = order ? Number(order.totalAmount) : undefined;
      r.requestedByName = nameById.get(r.requestedBy) ?? null;
      r.reviewedByName = r.reviewedBy
        ? (nameById.get(r.reviewedBy) ?? null)
        : null;
    }
    return requests;
  }

  async saveDeleteRequest(
    request: OrderDeleteRequest,
  ): Promise<OrderDeleteRequest> {
    return this.deleteRequestRepo.save(request);
  }

  async findDeleteRequestsForOrder(
    orderId: string,
  ): Promise<OrderDeleteRequest[]> {
    return this.deleteRequestRepo.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }
}
