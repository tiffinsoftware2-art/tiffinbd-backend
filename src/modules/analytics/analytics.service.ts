import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { dhakaShiftExpr } from '../../common/utils/dhaka-time';

export interface AnalyticsDto {
  period: { from: string; to: string };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    escalationRate: number;
    acceptedCount: number;
    escalatedCount: number;
    pendingCount: number;
    // Sales Summary Metrics — pricing breakdown across the period; see
    // order-history.md. Only manual/edited orders carry these (ADR-005), so
    // they'll undercount vs totalRevenue when most orders came in unedited.
    subTotal: number;
    vatTotal: number;
    platformChargeTotal: number;
    deliveryChargeTotal: number;
    discountsTotal: number;
  };
  bySource: Array<{ source: string; count: number; revenue: number }>;
  byBranch: Array<{
    branchId: string | null;
    branchName: string;
    count: number;
    revenue: number;
    escalated: number;
  }>;
  byDay: Array<{ date: string; count: number; revenue: number }>;
  byHour: Array<{ hour: number; count: number }>;
  byOrderType: Array<{ orderType: string; count: number }>;
  topItems: Array<{ name: string; totalQty: number; orderCount: number }>;
}

function buildBranchFilter(
  column: string,
  branchId?: string | null,
  branchIds?: string[] | null,
): { clause: string; params: string[] } {
  if (branchIds && branchIds.length > 0) {
    return {
      clause: `AND ${column} IN (${branchIds.map(() => '?').join(',')})`,
      params: branchIds,
    };
  }
  if (branchId) {
    return { clause: `AND ${column} = ?`, params: [branchId] };
  }
  return { clause: '', params: [] };
}

@Injectable()
export class AnalyticsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getAnalytics(
    dateFrom: string,
    dateTo: string,
    branchId?: string | null,
    branchIds?: string[] | null,
  ): Promise<AnalyticsDto> {
    // dateFrom/dateTo are YYYY-MM-DD strings
    const start = `${dateFrom} 00:00:00`;
    const end = `${dateTo} 23:59:59`;

    const { clause: branchFilter, params: branchFilterParams } =
      buildBranchFilter('branchId', branchId, branchIds);
    const { clause: oBranchFilter, params: oBranchFilterParams } =
      buildBranchFilter('o.branchId', branchId, branchIds);
    const baseParams = [start, end, ...branchFilterParams];
    const branchParams = [start, end, ...oBranchFilterParams];

    // Bangladesh-time — see common/utils/dhaka-time.ts. createdAt stores
    // UTC-wall-clock digits; start/end above are Dhaka-calendar-day
    // boundaries, so every comparison/extraction against createdAt below
    // shifts the column +6h first — otherwise an order placed just after
    // midnight BD time (still the previous UTC day) would land in the wrong
    // day's bucket, and BETWEEN would miscount at the range edges.
    const created = dhakaShiftExpr('createdAt');
    const oCreated = dhakaShiftExpr('o.createdAt');

    const [summary, bySource, byBranch, byDay, byHour, byOrderType, topItems] =
      await Promise.all([
        this.ds.query(
          `
        SELECT
          COUNT(*) AS totalOrders,
          COALESCE(SUM(totalAmount), 0) AS totalRevenue,
          COALESCE(AVG(totalAmount), 0) AS avgOrderValue,
          SUM(CASE WHEN status = 'ACCEPTED'  THEN 1 ELSE 0 END) AS acceptedCount,
          SUM(CASE WHEN status = 'ESCALATED' THEN 1 ELSE 0 END) AS escalatedCount,
          SUM(CASE WHEN status = 'PENDING'   THEN 1 ELSE 0 END) AS pendingCount,
          COALESCE(SUM(productSubtotal), 0) AS subTotal,
          COALESCE(SUM(vatAmount), 0) AS vatTotal,
          COALESCE(SUM(platformFee), 0) AS platformChargeTotal,
          COALESCE(SUM(deliveryCharge), 0) AS deliveryChargeTotal,
          COALESCE(SUM(discountAmount), 0) AS discountsTotal
        FROM orders
        WHERE ${created} BETWEEN ? AND ? AND archivedAt IS NULL ${branchFilter}
      `,
          baseParams,
        ),

        this.ds.query(
          `
        SELECT source, COUNT(*) AS count, COALESCE(SUM(totalAmount), 0) AS revenue
        FROM orders
        WHERE ${created} BETWEEN ? AND ? AND archivedAt IS NULL ${branchFilter}
        GROUP BY source
        ORDER BY count DESC
      `,
          baseParams,
        ),

        this.ds.query(
          `
        SELECT
          o.branchId AS branchId,
          COALESCE(b.name, 'Unassigned') AS branchName,
          COUNT(*) AS count,
          COALESCE(SUM(o.totalAmount), 0) AS revenue,
          SUM(CASE WHEN o.status = 'ESCALATED' THEN 1 ELSE 0 END) AS escalated
        FROM orders o
        LEFT JOIN branches b ON o.branchId = b.id
        WHERE ${oCreated} BETWEEN ? AND ? AND o.archivedAt IS NULL ${oBranchFilter}
        GROUP BY o.branchId, b.name
        ORDER BY count DESC
      `,
          branchParams,
        ),

        this.ds.query(
          `
        SELECT
          DATE(${created}) AS date,
          COUNT(*) AS count,
          COALESCE(SUM(totalAmount), 0) AS revenue
        FROM orders
        WHERE ${created} BETWEEN ? AND ? AND archivedAt IS NULL ${branchFilter}
        GROUP BY DATE(${created})
        ORDER BY date ASC
      `,
          baseParams,
        ),

        this.ds.query(
          `
        SELECT HOUR(${created}) AS hour, COUNT(*) AS count
        FROM orders
        WHERE ${created} BETWEEN ? AND ? AND archivedAt IS NULL ${branchFilter}
        GROUP BY HOUR(${created})
        ORDER BY hour ASC
      `,
          baseParams,
        ),

        this.ds.query(
          `
        SELECT orderType AS orderType, COUNT(*) AS count
        FROM orders
        WHERE ${created} BETWEEN ? AND ? AND archivedAt IS NULL ${branchFilter}
        GROUP BY orderType
        ORDER BY count DESC
      `,
          baseParams,
        ),

        this.ds.query(
          `
        SELECT
          jt.name,
          SUM(jt.quantity) AS totalQty,
          COUNT(DISTINCT o.id) AS orderCount
        FROM orders o,
        JSON_TABLE(o.items, '$[*]' COLUMNS (
          name VARCHAR(500) PATH '$.name',
          quantity INT PATH '$.quantity'
        )) jt
        WHERE ${oCreated} BETWEEN ? AND ? AND o.archivedAt IS NULL ${oBranchFilter}
        GROUP BY jt.name
        ORDER BY totalQty DESC
        LIMIT 10
      `,
          branchParams,
        ),
      ]);

    const s = summary[0] ?? {};
    const total = Number(s.totalOrders ?? 0);
    const escalated = Number(s.escalatedCount ?? 0);

    return {
      period: { from: dateFrom, to: dateTo },
      summary: {
        totalOrders: total,
        totalRevenue: Number(s.totalRevenue ?? 0),
        avgOrderValue: Number(s.avgOrderValue ?? 0),
        escalationRate: total > 0 ? (escalated / total) * 100 : 0,
        acceptedCount: Number(s.acceptedCount ?? 0),
        escalatedCount: escalated,
        pendingCount: Number(s.pendingCount ?? 0),
        subTotal: Number(s.subTotal ?? 0),
        vatTotal: Number(s.vatTotal ?? 0),
        platformChargeTotal: Number(s.platformChargeTotal ?? 0),
        deliveryChargeTotal: Number(s.deliveryChargeTotal ?? 0),
        discountsTotal: Number(s.discountsTotal ?? 0),
      },
      bySource: bySource.map((r: any) => ({
        source: r.source,
        count: Number(r.count),
        revenue: Number(r.revenue),
      })),
      byBranch: byBranch.map((r: any) => ({
        branchId: r.branchId,
        branchName: r.branchName,
        count: Number(r.count),
        revenue: Number(r.revenue),
        escalated: Number(r.escalated),
      })),
      byDay: byDay.map((r: any) => ({
        date: String(r.date).slice(0, 10),
        count: Number(r.count),
        revenue: Number(r.revenue),
      })),
      byHour: byHour.map((r: any) => ({
        hour: Number(r.hour),
        count: Number(r.count),
      })),
      byOrderType: byOrderType.map((r: any) => ({
        orderType: r.orderType,
        count: Number(r.count),
      })),
      topItems: topItems.map((r: any) => ({
        name: r.name,
        totalQty: Number(r.totalQty),
        orderCount: Number(r.orderCount),
      })),
    };
  }
}
