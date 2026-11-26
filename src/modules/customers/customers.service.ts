import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { normalizePhone } from '../../common/utils/phone';
import { Order, PaymentStatus } from '../orders/entities/order.entity';
import { CustomerFilterDto } from './dto/customer-filter.dto';
import { Customer } from './entities/customer.entity';

export interface CustomerRow {
  phone: string;
  name: string;
  address: string;
  orderCount: number;
  totalAmount: number;
  dueAmount: number;
  dueOrders: number;
  platforms: string[];
  lastOrderAt: string;
}

// One row per customer, keyed by phone number in the standard form
// (common/utils/phone.ts), so "+8801712…" and "01712…" are the same person.
// Name and address come from the customers table (latest values given);
// order counts and money come from that customer's orders. Orders with no
// phone (common for Foodpanda, Pathao, Foodi) have no customer. Archived
// (deleted) orders are ignored.
@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async list(
    filters: CustomerFilterDto,
  ): Promise<{ data: CustomerRow[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoin(Customer, 'c', 'c.phone = o.customerPhone')
      .where('o.archivedAt IS NULL')
      .andWhere('o.customerPhone IS NOT NULL')
      .andWhere("o.customerPhone <> ''");
    if (filters.source)
      qb.andWhere('o.source = :source', { source: filters.source });
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      const digits = normalizePhone(q);
      qb.andWhere(
        digits
          ? '(o.customerPhone LIKE :p OR c.name LIKE :q)'
          : 'c.name LIKE :q',
        { q: `%${q}%`, p: `%${digits}%` },
      );
    }

    qb.select('o.customerPhone', 'phone')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('SUM(o.totalAmount)', 'totalAmount')
      .addSelect(
        'SUM(CASE WHEN o.paymentStatus = :due THEN o.totalAmount ELSE 0 END)',
        'dueAmount',
      )
      .addSelect(
        'SUM(CASE WHEN o.paymentStatus = :due THEN 1 ELSE 0 END)',
        'dueOrders',
      )
      .addSelect('MAX(o.createdAt)', 'lastOrderAt')
      .addSelect('GROUP_CONCAT(DISTINCT o.source)', 'platforms')
      .setParameter('due', PaymentStatus.DUE)
      .groupBy('o.customerPhone');
    if (filters.dueOnly === 'true') qb.having('dueOrders > 0');

    const all = await qb.orderBy('lastOrderAt', 'DESC').getRawMany<{
      phone: string;
      orderCount: string;
      totalAmount: string;
      dueAmount: string;
      dueOrders: string;
      lastOrderAt: Date;
      platforms: string | null;
    }>();

    const total = all.length;
    const slice = all.slice((page - 1) * limit, page * limit);
    if (slice.length === 0) return { data: [], total };

    const saved = await this.customers.find({
      where: { phone: In(slice.map((r) => r.phone)) },
    });
    const byPhone = new Map(saved.map((c) => [c.phone, c]));

    const data: CustomerRow[] = slice.map((r) => ({
      phone: r.phone,
      name: byPhone.get(r.phone)?.name ?? '',
      address: byPhone.get(r.phone)?.address ?? '',
      orderCount: Number(r.orderCount),
      totalAmount: Number(r.totalAmount),
      dueAmount: Number(r.dueAmount),
      dueOrders: Number(r.dueOrders),
      platforms: r.platforms ? r.platforms.split(',') : [],
      lastOrderAt: new Date(r.lastOrderAt).toISOString(),
    }));
    return { data, total };
  }

  async ordersFor(phone: string) {
    const rows = await this.orders
      .createQueryBuilder('o')
      .where('o.archivedAt IS NULL')
      .andWhere('o.customerPhone = :phone', { phone: normalizePhone(phone) })
      .orderBy('o.createdAt', 'DESC')
      .getMany();
    return rows.map((o) => ({
      id: o.id,
      externalId: o.externalId,
      source: o.source,
      createdAt: o.createdAt.toISOString(),
      totalAmount: Number(o.totalAmount),
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
    }));
  }

  // For the order form: the saved details for this phone number, or null.
  async lookup(phone: string): Promise<{
    phone: string;
    name: string;
    address: string;
    orderCount: number;
  } | null> {
    const key = normalizePhone(phone);
    if (!key) return null;
    const c = await this.customers.findOne({ where: { phone: key } });
    if (!c) return null;
    const orderCount = await this.orders.count({
      where: { customerPhone: key },
    });
    return {
      phone: c.phone,
      name: c.name,
      address: c.address ?? '',
      orderCount,
    };
  }
}
