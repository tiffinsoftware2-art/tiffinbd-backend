import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { User } from '../auth/entities/user.entity';
import type { JwtPayload } from '../auth/auth.service';
import { Branch } from '../branches/entities/branch.entity';
import { Order, PaymentStatus } from './entities/order.entity';
import {
  PaymentChangeRequest,
  PaymentChangeRequestStatus,
} from './entities/payment-change-request.entity';
import type {
  CreatePaymentChangeRequestDto,
  RecordPaymentDto,
} from './dto/payment.dto';
import { OrdersRepository } from './orders.repository';

const BRANCH_SCOPED = new Set<string>([
  UserRole.BRANCH_MANAGER,
  UserRole.STAFF,
]);

const ADMIN_ROLES = new Set<string>([UserRole.ADMIN, UserRole.SUPER_ADMIN]);

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

// Payment rules:
// - A new order's payment is Pending. Anyone who can work the order records it
//   once (when completing/settling, or with "Set payment" afterwards).
// - After that only Admin / Super Admin change it directly. Everyone else asks
//   with a change request, which Admin / Super Admin approve or reject.
@Injectable()
export class PaymentChangeService {
  constructor(
    private readonly orders: OrdersRepository,
    @InjectRepository(PaymentChangeRequest)
    private readonly requests: Repository<PaymentChangeRequest>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
  ) {}

  private assertBranch(order: Order, actor: JwtPayload): void {
    if (
      BRANCH_SCOPED.has(actor.role) &&
      order.branchId &&
      order.branchId !== actor.branchId
    ) {
      throw new ForbiddenException('Order belongs to a different branch');
    }
  }

  // Records the payment on an order. Non-admins may do this only while it is
  // still Pending.
  async recordPayment(
    orderId: string,
    dto: RecordPaymentDto,
    actor: JwtPayload,
  ): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    this.assertBranch(order, actor);
    if (
      !isAdminRole(actor.role) &&
      order.paymentStatus !== PaymentStatus.PENDING
    ) {
      throw new ForbiddenException(
        'The payment is already recorded. Send a payment change request instead.',
      );
    }
    return this.orders.setPaymentStatus(
      order,
      dto.paymentStatus,
      dto.paymentMethod,
    );
  }

  async createRequest(
    orderId: string,
    dto: CreatePaymentChangeRequestDto,
    actor: JwtPayload,
  ): Promise<PaymentChangeRequest> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    this.assertBranch(order, actor);
    if (order.archivedAt) throw new ConflictException('Order is archived');
    if (order.paymentStatus === PaymentStatus.PENDING) {
      throw new BadRequestException(
        'No payment is recorded yet. Set the payment directly.',
      );
    }
    const toMethod =
      dto.paymentStatus === PaymentStatus.PAID
        ? (dto.paymentMethod ?? null)
        : null;
    if (
      order.paymentStatus === dto.paymentStatus &&
      (order.paymentMethod ?? null) === toMethod
    ) {
      throw new BadRequestException('That is already the recorded payment.');
    }
    const open = await this.requests.findOne({
      where: { orderId, status: PaymentChangeRequestStatus.PENDING },
    });
    if (open)
      throw new ConflictException(
        'This order already has a payment change request waiting.',
      );

    const saved = await this.requests.save(
      this.requests.create({
        orderId,
        requestedBy: actor.sub,
        fromStatus: order.paymentStatus,
        fromMethod: order.paymentMethod ?? null,
        toStatus: dto.paymentStatus,
        toMethod,
        reason: dto.reason.trim(),
      }),
    );
    await this.enrich([saved]);
    return saved;
  }

  async listForOrder(
    orderId: string,
    actor: JwtPayload,
  ): Promise<PaymentChangeRequest[]> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    this.assertBranch(order, actor);
    const rows = await this.requests.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    await this.enrich(rows);
    return rows;
  }

  // Admin review queue.
  async list(
    status: PaymentChangeRequestStatus = PaymentChangeRequestStatus.PENDING,
  ) {
    const rows = await this.requests.find({
      where: { status },
      order: {
        createdAt:
          status === PaymentChangeRequestStatus.PENDING ? 'ASC' : 'DESC',
      },
      take: 200,
    });
    await this.enrich(rows, true);
    return rows;
  }

  async approve(
    id: string,
    actor: JwtPayload,
    note?: string,
  ): Promise<PaymentChangeRequest> {
    const req = await this.pending(id);
    const order = await this.orders.findById(req.orderId);
    if (!order) throw new NotFoundException('Order not found');
    await this.orders.setPaymentStatus(
      order,
      req.toStatus,
      req.toMethod ?? undefined,
    );
    return this.close(req, PaymentChangeRequestStatus.APPROVED, actor, note);
  }

  async reject(
    id: string,
    actor: JwtPayload,
    note?: string,
  ): Promise<PaymentChangeRequest> {
    const req = await this.pending(id);
    return this.close(req, PaymentChangeRequestStatus.REJECTED, actor, note);
  }

  private async pending(id: string): Promise<PaymentChangeRequest> {
    const req = await this.requests.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== PaymentChangeRequestStatus.PENDING) {
      throw new ConflictException('This request has already been reviewed.');
    }
    return req;
  }

  private async close(
    req: PaymentChangeRequest,
    status: PaymentChangeRequestStatus,
    actor: JwtPayload,
    note?: string,
  ): Promise<PaymentChangeRequest> {
    req.status = status;
    req.reviewedBy = actor.sub;
    req.reviewedAt = new Date();
    req.reviewNote = note?.trim() || null;
    const saved = await this.requests.save(req);
    await this.enrich([saved]);
    return saved;
  }

  private async enrich(
    rows: PaymentChangeRequest[],
    withOrder = false,
  ): Promise<void> {
    if (rows.length === 0) return;
    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.requestedBy, r.reviewedBy])
          .filter((x): x is string => !!x),
      ),
    ];
    const users = userIds.length
      ? await this.users.find({ where: { id: In(userIds) } })
      : [];
    const name = new Map(users.map((u) => [u.id, u.name || u.username]));
    for (const r of rows) {
      r.requestedByName = name.get(r.requestedBy) ?? null;
      r.reviewedByName = r.reviewedBy ? (name.get(r.reviewedBy) ?? null) : null;
    }
    if (!withOrder) return;
    const orders = await Promise.all(
      [...new Set(rows.map((r) => r.orderId))].map((id) =>
        this.orders.findById(id),
      ),
    );
    const byId = new Map(
      orders.filter((o): o is Order => !!o).map((o) => [o.id, o]),
    );
    const branchIds = [
      ...new Set(
        [...byId.values()]
          .map((o) => o.branchId)
          .filter((x): x is string => !!x),
      ),
    ];
    const branches = branchIds.length
      ? await this.branches.find({ where: { id: In(branchIds) } })
      : [];
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    for (const r of rows) {
      const o = byId.get(r.orderId);
      r.orderExternalId = o?.externalId;
      r.orderBranchName = (o?.branchId && branchName.get(o.branchId)) || null;
      r.orderCustomerName = o?.customer?.name;
      r.orderTotalAmount = o ? Number(o.totalAmount) : undefined;
    }
  }
}
