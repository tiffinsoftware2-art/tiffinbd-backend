import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import ExcelJS from 'exceljs';
import { dhakaShifted } from '../../common/utils/dhaka-time';
import type { UnifiedOrderDto } from '../normalization/dto/unified-order.dto';
import type { JwtPayload } from '../auth/auth.service';
import type {
  OrderExportFilterDto,
  OrderFilterDto,
} from './dto/order-filter.dto';
import type { CreateManualOrderDto } from './dto/create-manual-order.dto';
import type { UpdateManualOrderDto } from './dto/update-manual-order.dto';
import type {
  ArchiveOrderDto,
  CreateDeleteRequestDto,
  RejectDeleteRequestDto,
} from './dto/order-delete.dto';
import {
  DiscountType,
  Order,
  OrderStatus,
  PaymentStatus,
} from './entities/order.entity';
import type { OrderHistory } from './entities/order-history.entity';
import type { OrderEditHistory } from './entities/order-edit-history.entity';
import {
  DeleteRequestStatus,
  OrderDeleteRequest,
} from './entities/order-delete-request.entity';
import { Branch } from '../branches/entities/branch.entity';
import { EventsService } from '../events/events.service';
import { resolveManualCustomer } from './manual-customer.util';
import { OrdersGateway } from './orders.gateway';
import { OrdersRepository } from './orders.repository';
import { MailService } from '../settings/mail.service';
import { SettingsService } from '../settings/settings.service';
import { UserRole } from '../../common/enums/user-role.enum';

const BRANCH_SCOPED_ROLES = new Set([UserRole.BRANCH_MANAGER, UserRole.STAFF]);

// Order History XLSX export — see order-history.md / ADR-009.
const MAX_EXPORT_RANGE_DAYS = 100;

function toNumberOrNull(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

const MONEY_FORMAT = '#,##0.00';

const EXPORT_COLUMNS: Array<{
  header: string;
  width: number;
  numFmt?: string;
  value: (o: Order) => string | number | Date | null;
}> = [
  {
    header: 'Date & Time',
    width: 20,
    numFmt: 'yyyy-mm-dd hh:mm:ss',
    // Shifted +6h (Bangladesh time) — see common/utils/dhaka-time.ts.
    // o.createdAt is a real Date whose own getters currently read as UTC
    // (nothing sets a container timezone, deliberately — see that file's
    // comment); ExcelJS writes a native date-typed cell using this Date's
    // own getters, so the cell would otherwise show UTC time labeled with a
    // "yyyy-mm-dd hh:mm:ss" format that looks like — but isn't — BD time.
    value: (o) => dhakaShifted(o.createdAt),
  },
  { header: 'Order ID', width: 16, value: (o) => o.externalId },
  { header: 'Customer', width: 24, value: (o) => o.customer?.name ?? '' },
  { header: 'Platform', width: 13, value: (o) => o.source },
  { header: 'Branch', width: 18, value: (o) => o.branchName ?? '' },
  { header: 'Status', width: 12, value: (o) => o.status },
  {
    header: 'Sub Total',
    width: 13,
    numFmt: MONEY_FORMAT,
    value: (o) => toNumberOrNull(o.productSubtotal),
  },
  {
    header: 'VAT',
    width: 11,
    numFmt: MONEY_FORMAT,
    value: (o) => toNumberOrNull(o.vatAmount),
  },
  {
    header: 'Delivery Charge',
    width: 16,
    numFmt: MONEY_FORMAT,
    value: (o) => toNumberOrNull(o.deliveryCharge),
  },
  {
    header: 'Platform Charge',
    width: 16,
    numFmt: MONEY_FORMAT,
    value: (o) => toNumberOrNull(o.platformFee),
  },
  {
    header: 'Discount',
    width: 12,
    numFmt: MONEY_FORMAT,
    value: (o) => toNumberOrNull(o.discountAmount),
  },
  {
    header: 'Total',
    width: 14,
    numFmt: MONEY_FORMAT,
    value: (o) => Number(o.totalAmount),
  },
  { header: 'Created By', width: 20, value: (o) => o.createdByName ?? '' },
  { header: 'Accepted By', width: 20, value: (o) => o.acceptedByName ?? '' },
  // "Delete" prefix added 2026-07-14 — plain "Requested By"/"Reviewed By"
  // was ambiguous (could read as order creation/acceptance actors); these
  // are specifically the order's most recent delete request's actors.
  { header: 'Delete Requested By', width: 20, value: (o) => o.requestedByName ?? '' },
  { header: 'Delete Reviewed By', width: 20, value: (o) => o.reviewedByName ?? '' },
  { header: 'Archived By', width: 20, value: (o) => o.archivedByName ?? '' },
  // Added 2026-07-14, split same day into an explicit Yes/blank flag
  // (matching Status's plain-value style) plus a separate actor-name column,
  // rather than inferring completion from whether "Completed By" is blank.
  { header: 'Completed', width: 10, value: (o) => (o.isCompleted ? 'Yes' : '') },
  { header: 'Completed By', width: 20, value: (o) => o.completedByName ?? '' },
  // "Updated By" — most recent editor if the order has multiple edits (see
  // editHistory / updatedByName's comment on the entity); not "the" editor,
  // since there isn't always exactly one.
  { header: 'Updated', width: 10, value: (o) => (o.isUpdated ? 'Yes' : '') },
  { header: 'Updated By', width: 20, value: (o) => o.updatedByName ?? '' },
];

// Order History export — resolves the same "which branch(es)" label the
// Sales Report shows (see reports.service.ts::resolveBranchScopeLabel),
// duplicated here rather than shared since the two services don't share a
// module boundary. See order-history.md.
async function resolveBranchLabel(
  branchRepo: Repository<Branch>,
  branchScoped: boolean,
  scopedBranchId: string | null,
  scopedBranchIds: string[] | null,
): Promise<string> {
  if (scopedBranchIds && scopedBranchIds.length > 0) {
    const branches = await branchRepo.find({
      where: { id: In(scopedBranchIds) },
    });
    const nameById = new Map(branches.map((b) => [b.id, b.name]));
    return scopedBranchIds
      .map((id) => nameById.get(id) ?? 'Unknown branch')
      .join(', ');
  }
  if (scopedBranchId) {
    const branch = await branchRepo.findOne({ where: { id: scopedBranchId } });
    const name = branch?.name ?? 'Unknown branch';
    return branchScoped ? `Your branch (${name})` : name;
  }
  return 'All branches';
}

// Leading "Filters" block (see order-history.md) — always Status/Platform/
// Branch/Date Range; Search/Archived only appear when actually active, so
// an unfiltered export still shows a clean 4-row block.
async function buildOrdersXlsx(
  orders: Order[],
  filterInfo: Array<{ label: string; value: string }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Order History');
  sheet.columns = EXPORT_COLUMNS.map((c) => ({ width: c.width }));

  sheet.addRow(['Filters']).font = { bold: true };
  for (const { label, value } of filterInfo) {
    sheet.addRow([label, value]);
  }
  sheet.addRow([]);

  const headerRow = sheet.addRow(EXPORT_COLUMNS.map((c) => c.header));
  headerRow.font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];

  for (const o of orders) {
    const row = sheet.addRow(EXPORT_COLUMNS.map((c) => c.value(o)));
    EXPORT_COLUMNS.forEach((c, i) => {
      if (c.numFmt) row.getCell(i + 1).numFmt = c.numFmt;
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly events: EventsService,
    private readonly gateway: OrdersGateway,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
  ) {}

  async storeOrder(
    unified: UnifiedOrderDto,
    branchId: string | null = null,
  ): Promise<Order> {
    const order = await this.repo.create(unified, branchId);
    this.emitOrderCreated(order);
    return order;
  }

  async createManualOrder(
    dto: CreateManualOrderDto,
    actor: JwtPayload,
  ): Promise<Order> {
    const branchId = BRANCH_SCOPED_ROLES.has(actor.role)
      ? actor.branchId
      : dto.branchId;
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    const branch = await this.branchRepo.findOneBy({ id: branchId });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found`);

    const productSubtotal = dto.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const config = await this.settings.getManualOrderConfig();
    // The client sends only a boolean; the rate always comes from config, so a
    // form loaded before an admin changed VAT% can never persist a stale rate.
    // Omitted → the per-source rule decides (ADR-005 Addendum 6).
    const excludeVat =
      dto.excludeVat ?? this.settings.vatExcludedFor(config, dto.source);
    const vatPercent = excludeVat ? 0 : Number(config.vatPercent);
    const vatAmount = (productSubtotal * vatPercent) / 100;
    const deliveryCharge = dto.deliveryCharge ?? Number(config.deliveryCharge);
    const platformFee = dto.platformFee ?? Number(config.platformFee);
    const discountType =
      dto.discountType === 'percentage'
        ? DiscountType.PERCENTAGE
        : dto.discountType === 'fixed'
          ? DiscountType.FIXED
          : null;
    const discountValue = discountType ? (dto.discountValue ?? 0) : null;
    const discountAmount =
      discountType === DiscountType.PERCENTAGE
        ? (productSubtotal * (discountValue ?? 0)) / 100
        : discountType === DiscountType.FIXED
          ? (discountValue ?? 0)
          : null;
    const totalAmount =
      productSubtotal +
      vatAmount +
      deliveryCharge +
      platformFee -
      (discountAmount ?? 0);

    const unified: UnifiedOrderDto = {
      // Short code, same convention as the website adapter's synthetic IDs
      // (tiffinbd.adapter.ts) — a full UUID was needlessly long for display.
      externalId: `MANUAL-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      source: dto.source,
      orderType: dto.orderType,
      items: dto.items,
      totalAmount,
      branchId,
      customerInfo: resolveManualCustomer(dto),
      rawPayload: {},
    };

    const order = await this.repo.create(
      unified,
      branchId,
      {
        productSubtotal,
        vatPercent,
        vatAmount,
        deliveryCharge,
        platformFee,
        discountType,
        discountValue,
        discountAmount,
        totalAmount,
      },
      actor.sub,
      dto.paymentStatus ?? PaymentStatus.PAID,
    );
    await this.repo.enrichCreators([order]);
    this.emitOrderCreated(order);
    return order;
  }

  // Order Update — Branch Manager+, any order source, any status
  // (PENDING/ACCEPTED/ESCALATED). See order-update.md and ADR-006. Silent:
  // no re-emitted event, no reprint/re-alert, no effect on settlement fields.
  async updateManualOrder(
    id: string,
    dto: UpdateManualOrderDto,
    actor: JwtPayload,
  ): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    // Order Completion — a completed order is frozen; see ADR-011.
    if (order.isCompleted) {
      throw new ConflictException('Completed orders cannot be updated');
    }
    // Order Delete — an archived order is frozen too, same as completed
    // (see completeOrder()'s equivalent check). Covers both direct archive
    // and an approved delete request, since both set archivedAt via the
    // same repo.archive() call.
    if (order.archivedAt) {
      throw new ConflictException('Order is already archived');
    }
    if (
      BRANCH_SCOPED_ROLES.has(actor.role) &&
      order.branchId &&
      order.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Order belongs to a different branch');
    }

    const productSubtotal = dto.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    // If this order already has a VAT% snapshot (created manually, or edited
    // before), keep it — ADR-005's historical-accuracy rule applies to edits
    // too. Otherwise (an integrated-platform order edited for the first
    // time), snapshot the *current* global rate now, same as a brand-new
    // manual order would. Exclusion overrides both: an explicit dto.excludeVat
    // (staff deliberately marking this order VAT-free, or deliberately
    // un-marking it), or failing that the per-source rule for whatever source
    // this edit is saving (ADR-005 Addendum 6). dto.source is required on this
    // DTO — it always round-trips the current source, even when unchanged — so
    // there is no fallback to order.source to write here.
    const config = await this.settings.getManualOrderConfig();
    const excludeVat =
      dto.excludeVat ?? this.settings.vatExcludedFor(config, dto.source);
    // A *real* (non-zero) snapshot is historical fact and is never rewritten —
    // an order placed at 10% stays at 10% forever, even if Settings later moves
    // to 15%. A snapshot of 0 is not a historical rate, it's the absence of one,
    // so a VAT-excluded order that staff deliberately re-includes picks up the
    // current configured rate. `null` (never snapshotted — an integrated order
    // on its first edit) behaves the same way, which is the existing ADR-005
    // Addendum 2 §2 / Addendum 4 §5 seeding rule, unchanged.
    //
    // In practice a 0-VAT order reopens with "Exclude VAT" already ticked (the
    // form derives it from vatAmount === 0), so merely re-saving one keeps it
    // at 0 — the configured rate is only applied when staff actively untick.
    const hasRealSnapshot =
      order.vatPercent !== null && Number(order.vatPercent) !== 0;
    const vatPercent = excludeVat
      ? 0
      : hasRealSnapshot
        ? Number(order.vatPercent)
        : Number(config.vatPercent);
    const vatAmount = (productSubtotal * vatPercent) / 100;
    const deliveryCharge = dto.deliveryCharge ?? Number(config.deliveryCharge);
    const platformFee = dto.platformFee ?? Number(config.platformFee);
    const discountType =
      dto.discountType === 'percentage'
        ? DiscountType.PERCENTAGE
        : dto.discountType === 'fixed'
          ? DiscountType.FIXED
          : null;
    const discountValue = discountType ? (dto.discountValue ?? 0) : null;
    const discountAmount =
      discountType === DiscountType.PERCENTAGE
        ? (productSubtotal * (discountValue ?? 0)) / 100
        : discountType === DiscountType.FIXED
          ? (discountValue ?? 0)
          : null;
    const totalAmount =
      productSubtotal +
      vatAmount +
      deliveryCharge +
      platformFee -
      (discountAmount ?? 0);

    return this.repo.updateManual(
      order,
      dto,
      {
        productSubtotal,
        vatPercent,
        vatAmount,
        deliveryCharge,
        platformFee,
        discountType,
        discountValue,
        discountAmount,
        totalAmount,
      },
      actor.sub,
    );
  }

  private emitOrderCreated(order: Order): void {
    // Full Order shape — used by dashboard and mobile app via Socket.IO
    const socketPayload = {
      id: order.id,
      externalId: order.externalId,
      source: order.source,
      orderType: order.orderType,
      status: order.status,
      branchId: order.branchId,
      branchName: order.branchName ?? null,
      customer: order.customer,
      items: order.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        notes: i.notes || undefined,
      })),
      totalAmount: Number(order.totalAmount),
      // Price breakdown — must ride along on order.created so the mobile app
      // can print a complete receipt on auto-print (it prints from the queued
      // socket order, not a fresh GET). Without these, manual orders — the only
      // ones carrying delivery/platform/VAT/discount — printed with the
      // breakdown missing and VAT as 0. Website orders default deliveryCharge/
      // platformFee to 0 and the rest to null, matching the dashboard detail
      // panel and the reprint path. See manual-order.md / ADR-005.
      productSubtotal: toNumberOrNull(order.productSubtotal),
      vatPercent: toNumberOrNull(order.vatPercent),
      vatAmount: toNumberOrNull(order.vatAmount),
      deliveryCharge: toNumberOrNull(order.deliveryCharge),
      platformFee: toNumberOrNull(order.platformFee),
      discountType: order.discountType ?? null,
      discountValue: toNumberOrNull(order.discountValue),
      discountAmount: toNumberOrNull(order.discountAmount),
      paymentStatus: order.paymentStatus,
      createdBy: order.createdBy ?? null,
      createdByName: order.createdByName ?? null,
      acceptedBy: null,
      acceptedAt: null,
      escalatedAt: null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };

    this.gateway.emit('order.created', socketPayload, order.branchId);

    // Simplified payload for notification service (escalation timer only needs orderId + branchId)
    void this.events.publish('order.created', {
      orderId: order.id,
      branchId: order.branchId,
      source: order.source,
      items: socketPayload.items,
      customerName: order.customer.name,
      orderType: order.orderType,
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
    });
  }

  // Admin+ — records whether an order is paid or still due.
  async updatePaymentStatus(id: string, status: PaymentStatus): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return this.repo.setPaymentStatus(order, status);
  }

  async acceptOrder(id: string, actor: JwtPayload): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (
      BRANCH_SCOPED_ROLES.has(actor.role) &&
      order.branchId &&
      order.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Order belongs to a different branch');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException(
        'Order has already been accepted or escalated',
      );
    }
    const saved = await this.repo.accept(order, actor.sub);
    const payload = {
      orderId: saved.id,
      branchId: saved.branchId,
      acceptedBy: actor.sub,
      acceptedAt: (saved.acceptedAt ?? new Date()).toISOString(),
    };
    this.gateway.emit('order.accepted', payload, saved.branchId);
    void this.events.publish('order.accepted', payload);
    return saved;
  }

  async escalateOrder(id: string): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING) return order;
    const saved = await this.repo.escalate(order);
    this.gateway.emit(
      'order.escalated',
      {
        orderId: saved.id,
        branchId: saved.branchId,
        escalatedAt: (saved.escalatedAt ?? new Date()).toISOString(),
        reason: 'AUTO_ESCALATION',
      },
      saved.branchId,
    );
    void this.mail.sendEscalationEmail(saved);
    return saved;
  }

  async settleOrder(
    id: string,
    actionTaken: string,
    actor: JwtPayload,
  ): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    // Order Delete — an archived order is frozen, same as completeOrder()'s
    // equivalent check. Covers both direct archive and an approved delete
    // request, since both set archivedAt via the same repo.archive() call.
    if (order.archivedAt) {
      throw new ConflictException('Order is already archived');
    }
    if (order.status !== OrderStatus.ESCALATED) {
      throw new ConflictException('Only escalated orders can be settled');
    }
    if (order.settledAt) {
      throw new ConflictException('Order has already been settled');
    }
    const saved = await this.repo.settle(order, actor.sub, actionTaken);
    this.gateway.emit(
      'order.settled',
      {
        orderId: saved.id,
        branchId: saved.branchId,
        settledBy: actor.sub,
        settledAt: saved.settledAt!.toISOString(),
      },
      saved.branchId,
    );
    return saved;
  }

  // Order Completion — STAFF (mobile) or BRANCH_MANAGER+ (dashboard), same
  // endpoint for both (no @Roles override — reachable by any authenticated,
  // branch-scoped role, same shape as acceptOrder/createDeleteRequest). Only
  // ACCEPTED/ESCALATED orders are completable; `orders.status` is never
  // touched — see ADR-011 / order-completion.md.
  async completeOrder(id: string, actor: JwtPayload): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (
      BRANCH_SCOPED_ROLES.has(actor.role) &&
      order.branchId &&
      order.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Order belongs to a different branch');
    }
    if (order.isCompleted) {
      throw new ConflictException('Order is already marked completed');
    }
    if (order.archivedAt) {
      throw new ConflictException('Order is already archived');
    }
    if (order.hasPendingDeleteRequest) {
      throw new ConflictException(
        'Order has a pending delete request and cannot be marked completed',
      );
    }
    if (
      order.status !== OrderStatus.ACCEPTED &&
      order.status !== OrderStatus.ESCALATED
    ) {
      throw new ConflictException(
        'Only accepted or escalated orders can be marked completed',
      );
    }
    const completion = await this.repo.completeOrder(
      order,
      actor.sub,
      actor.role,
    );
    order.isCompleted = true;
    order.completedAt = completion.completedAt;
    order.completedBy = completion.completedBy;
    this.emitOrderCompleted(order);
    return order;
  }

  async findAll(
    filters: OrderFilterDto,
    actor: JwtPayload,
  ): Promise<{
    data: Order[];
    meta: { page: number; limit: number; total: number };
  }> {
    const branchScoped = BRANCH_SCOPED_ROLES.has(actor.role);
    const scopedBranchId = branchScoped
      ? actor.branchId
      : (filters.branchId ?? null);
    const scopedBranchIds = branchScoped
      ? null
      : filters.branchIds && filters.branchIds.length > 0
        ? filters.branchIds
        : null;
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { data, total } = await this.repo.findAll(
      filters,
      scopedBranchId,
      scopedBranchIds,
    );
    return { data, meta: { page, limit, total } };
  }

  // Order History XLSX export — same access/branch-scoping rules as findAll,
  // but unpaginated and date-bounded (server-load guard). See order-history.md
  // / ADR-009.
  async exportOrdersXlsx(
    filters: OrderExportFilterDto,
    actor: JwtPayload,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const days =
      (new Date(filters.dateTo).getTime() -
        new Date(filters.dateFrom).getTime()) /
      86_400_000;
    if (Number.isNaN(days) || days < 0) {
      throw new BadRequestException('dateTo must be on or after dateFrom');
    }
    if (days > MAX_EXPORT_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range cannot exceed ${MAX_EXPORT_RANGE_DAYS} days`,
      );
    }

    const branchScoped = BRANCH_SCOPED_ROLES.has(actor.role);
    const scopedBranchId = branchScoped
      ? actor.branchId
      : (filters.branchId ?? null);
    const scopedBranchIds = branchScoped
      ? null
      : filters.branchIds && filters.branchIds.length > 0
        ? filters.branchIds
        : null;

    const [orders, branchLabel] = await Promise.all([
      this.repo.findAllForExport(filters, scopedBranchId, scopedBranchIds),
      resolveBranchLabel(
        this.branchRepo,
        branchScoped,
        scopedBranchId,
        scopedBranchIds,
      ),
    ]);

    const filterInfo: Array<{ label: string; value: string }> = [
      { label: 'Status', value: filters.status ?? 'All' },
      { label: 'Platform', value: filters.source ?? 'All' },
      { label: 'Branch', value: branchLabel },
      { label: 'Date Range', value: `${filters.dateFrom} to ${filters.dateTo}` },
    ];
    if (filters.search) {
      filterInfo.push({ label: 'Search', value: filters.search });
    }
    if (filters.archived) {
      filterInfo.push({ label: 'Archived', value: 'Archived orders only' });
    }
    // Order History "special conditions" dropdown — see order-history.md.
    // Mirrors the Archived row above; only appears when actually active.
    if (filters.completed === true) {
      filterInfo.push({ label: 'Completed', value: 'Completed orders only' });
    } else if (filters.completed === false) {
      filterInfo.push({ label: 'Completed', value: 'Not completed orders only' });
    }
    if (filters.hasPendingDeleteRequest) {
      filterInfo.push({
        label: 'Deletion Requested',
        value: 'Orders with a pending deletion request',
      });
    }
    if (filters.isUpdated) {
      filterInfo.push({ label: 'Updated', value: 'Updated orders only' });
    }

    return {
      buffer: await buildOrdersXlsx(orders, filterInfo),
      filename: `tiffin-order-history_${filters.dateFrom}_to_${filters.dateTo}.xlsx`,
    };
  }

  async findOne(
    id: string,
    actor: JwtPayload,
  ): Promise<
    Order & {
      history: OrderHistory[];
      editHistory: OrderEditHistory[];
      deleteRequests: OrderDeleteRequest[];
    }
  > {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (
      BRANCH_SCOPED_ROLES.has(actor.role) &&
      order.branchId &&
      order.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Order belongs to a different branch');
    }
    const history = await this.repo.findHistory(id);
    const editHistory = await this.repo.findEditHistory(id);
    const deleteRequests = await this.repo.findDeleteRequestsForOrder(id);
    await this.repo.enrichActorNames(
      order,
      history,
      editHistory,
      deleteRequests,
    );
    return Object.assign(order, { history, editHistory, deleteRequests });
  }

  // Order Delete — direct archive. ADMIN/SUPER_ADMIN only (enforced by the
  // controller's @Roles guard); any order, any status. See order-delete.md /
  // ADR-007. Emits `order.archived` so the mobile app can drop it immediately.
  async archiveOrder(
    id: string,
    dto: ArchiveOrderDto,
    actor: JwtPayload,
  ): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (order.archivedAt) {
      throw new ConflictException('Order is already archived');
    }
    const saved = await this.repo.archive(
      order,
      actor.sub,
      dto.reason,
      dto.customReason ?? null,
    );
    this.emitOrderArchived(saved);
    return saved;
  }

  // Order Delete — undo. ADMIN/SUPER_ADMIN only; any archived order. See
  // order-delete.md / ADR-007.
  async unarchiveOrder(id: string, actor: JwtPayload): Promise<Order> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (!order.archivedAt) {
      throw new ConflictException('Order is not archived');
    }
    const saved = await this.repo.unarchive(order, actor.sub);
    this.emitOrderUnarchived(saved);
    return saved;
  }

  // Order Delete — request (any role). Branch-scoped roles can only request
  // for their own branch's orders, same rule as every other order action.
  // Rejects a second request while one is already pending for this order.
  async createDeleteRequest(
    id: string,
    dto: CreateDeleteRequestDto,
    actor: JwtPayload,
  ): Promise<OrderDeleteRequest> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (
      BRANCH_SCOPED_ROLES.has(actor.role) &&
      order.branchId &&
      order.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Order belongs to a different branch');
    }
    if (order.archivedAt) {
      throw new ConflictException('Order is already archived');
    }
    // Order Completion — nobody (not just STAFF) can request deletion for a
    // completed order; only ADMIN/SUPER_ADMIN can archive it directly. See
    // ADR-011.
    if (order.isCompleted) {
      throw new ConflictException(
        'Completed orders cannot have delete requests — an Admin must archive it directly',
      );
    }
    const existing = await this.repo.findPendingDeleteRequestForOrder(id);
    if (existing) {
      throw new ConflictException(
        'A delete request is already pending for this order',
      );
    }
    const request = await this.repo.createDeleteRequest(
      id,
      actor.sub,
      actor.role,
      dto.reason,
      dto.customReason ?? null,
    );
    await this.repo.logHistory(id, order.status, actor.sub, 'Delete requested');
    this.emitOrderDeleteRequested(order, request);
    return request;
  }

  // Order Delete — ADMIN/SUPER_ADMIN review queue.
  async listDeleteRequests(
    status: DeleteRequestStatus | undefined,
  ): Promise<OrderDeleteRequest[]> {
    return this.repo.findDeleteRequests(status);
  }

  async approveDeleteRequest(
    requestId: string,
    actor: JwtPayload,
  ): Promise<OrderDeleteRequest> {
    const request = await this.repo.findDeleteRequestById(requestId);
    if (!request) throw new NotFoundException('Delete request not found');
    if (request.status !== DeleteRequestStatus.PENDING) {
      throw new ConflictException('Delete request has already been reviewed');
    }
    const order = await this.repo.findById(request.orderId);
    if (!order) throw new NotFoundException('Order not found');

    const savedOrder = await this.repo.archive(
      order,
      actor.sub,
      request.reason,
      request.customReason,
    );
    this.emitOrderArchived(savedOrder);

    request.status = DeleteRequestStatus.APPROVED;
    request.reviewedBy = actor.sub;
    request.reviewedAt = new Date();
    const saved = await this.repo.saveDeleteRequest(request);
    this.emitDeleteRequestReviewed(savedOrder, saved, DeleteRequestStatus.APPROVED);
    return saved;
  }

  async rejectDeleteRequest(
    requestId: string,
    dto: RejectDeleteRequestDto,
    actor: JwtPayload,
  ): Promise<OrderDeleteRequest> {
    const request = await this.repo.findDeleteRequestById(requestId);
    if (!request) throw new NotFoundException('Delete request not found');
    if (request.status !== DeleteRequestStatus.PENDING) {
      throw new ConflictException('Delete request has already been reviewed');
    }
    request.status = DeleteRequestStatus.REJECTED;
    request.reviewedBy = actor.sub;
    request.reviewedAt = new Date();
    request.reviewNote = dto.reviewNote ?? null;
    const saved = await this.repo.saveDeleteRequest(request);

    const order = await this.repo.findById(request.orderId);
    if (order) {
      await this.repo.logHistory(
        order.id,
        order.status,
        actor.sub,
        'Delete request rejected',
      );
      this.emitDeleteRequestReviewed(order, saved, DeleteRequestStatus.REJECTED);
    }
    return saved;
  }

  // Order Delete — live "Deletion Requested" badge. See order-delete.md /
  // ADR-007 Addendum 4 (2026-07-13).
  private emitOrderDeleteRequested(
    order: Order,
    request: OrderDeleteRequest,
  ): void {
    this.gateway.emit(
      'order.delete_requested',
      {
        orderId: order.id,
        branchId: order.branchId,
        requestedBy: request.requestedBy,
        reason: request.reason,
        requestedAt: request.createdAt.toISOString(),
      },
      order.branchId,
    );
  }

  // Order Delete — clears the "Deletion Requested" badge on either outcome.
  // See order-delete.md / ADR-007 Addendum 4 (2026-07-13).
  private emitDeleteRequestReviewed(
    order: Order,
    request: OrderDeleteRequest,
    outcome: DeleteRequestStatus.APPROVED | DeleteRequestStatus.REJECTED,
  ): void {
    this.gateway.emit(
      'order.delete_request_reviewed',
      {
        orderId: order.id,
        branchId: order.branchId,
        outcome,
        reviewedBy: request.reviewedBy,
        reviewedAt: (request.reviewedAt ?? new Date()).toISOString(),
      },
      order.branchId,
    );
  }

  private emitOrderArchived(order: Order): void {
    this.gateway.emit(
      'order.archived',
      {
        orderId: order.id,
        branchId: order.branchId,
        archivedAt: (order.archivedAt ?? new Date()).toISOString(),
        reason: order.archiveReason,
      },
      order.branchId,
    );
  }

  private emitOrderUnarchived(order: Order): void {
    this.gateway.emit(
      'order.unarchived',
      { orderId: order.id, branchId: order.branchId },
      order.branchId,
    );
  }

  private emitOrderCompleted(order: Order): void {
    this.gateway.emit(
      'order.completed',
      {
        orderId: order.id,
        branchId: order.branchId,
        completedBy: order.completedBy,
        completedAt: (order.completedAt ?? new Date()).toISOString(),
      },
      order.branchId,
    );
  }
}
