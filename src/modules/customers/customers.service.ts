import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, PaymentStatus } from '../orders/entities/order.entity';
import { CustomerFilterDto } from './dto/customer-filter.dto';

const PHONE_SQL = "TRIM(JSON_UNQUOTE(JSON_EXTRACT(o.customer, '$.phone')))";

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

// Customers are not stored as their own records: they are derived from orders,
// grouped by phone number. Orders with no phone (common for Foodpanda, Pathao,
// Foodi and Physical Store orders) have no identity, so they are not listed.
// Archived (deleted) orders are ignored.
@Injectable()
export class CustomersService {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {}

  async list(filters: CustomerFilterDto): Promise<{ data: CustomerRow[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.orders
      .createQueryBuilder('o')
      .where('o.archivedAt IS NULL')
      .andWhere(`${PHONE_SQL} IS NOT NULL`)
      .andWhere(`${PHONE_SQL} <> ''`);
    if (filters.source) qb.andWhere('o.source = :source', { source: filters.source });
    if (filters.search?.trim()) {
      qb.andWhere(
        `(${PHONE_SQL} LIKE :q OR JSON_UNQUOTE(JSON_EXTRACT(o.customer, '$.name')) LIKE :q)`,
        { q: `%${filters.search.trim()}%` },
      );
    }

    qb.select(PHONE_SQL, 'phone')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('SUM(o.totalAmount)', 'totalAmount')
      .addSelect('SUM(CASE WHEN o.paymentStatus = :due THEN o.totalAmount ELSE 0 END)', 'dueAmount')
      .addSelect('SUM(CASE WHEN o.paymentStatus = :due THEN 1 ELSE 0 END)', 'dueOrders')
      .addSelect('MAX(o.createdAt)', 'lastOrderAt')
      .addSelect('GROUP_CONCAT(DISTINCT o.source)', 'platforms')
      .setParameter('due', PaymentStatus.DUE)
      .groupBy(PHONE_SQL);
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

    // Name and address come from each customer's most recent order.
    const latest = await this.orders
      .createQueryBuilder('o')
      .select(PHONE_SQL, 'phone')
      .addSelect("JSON_UNQUOTE(JSON_EXTRACT(o.customer, '$.name'))", 'name')
      .addSelect("JSON_UNQUOTE(JSON_EXTRACT(o.customer, '$.address'))", 'address')
      .where('o.archivedAt IS NULL')
      .andWhere(`${PHONE_SQL} IN (:...phones)`, { phones: slice.map((r) => r.phone) })
      .orderBy('o.createdAt', 'DESC')
      .getRawMany<{ phone: string; name: string | null; address: string | null }>();
    const latestByPhone = new Map<string, { name: string | null; address: string | null }>();
    for (const r of latest) if (!latestByPhone.has(r.phone)) latestByPhone.set(r.phone, r);

    const data: CustomerRow[] = slice.map((r) => ({
      phone: r.phone,
      name: latestByPhone.get(r.phone)?.name ?? '',
      address: latestByPhone.get(r.phone)?.address ?? '',
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
      .andWhere(`${PHONE_SQL} = :phone`, { phone: phone.trim() })
      .orderBy('o.createdAt', 'DESC')
      .getMany();
    return rows.map((o) => ({
      id: o.id,
      externalId: o.externalId,
      source: o.source,
      createdAt: o.createdAt.toISOString(),
      totalAmount: Number(o.totalAmount),
      paymentStatus: o.paymentStatus,
    }));
  }
}
