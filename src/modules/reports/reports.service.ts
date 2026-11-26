import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import * as path from 'path';
import { User } from '../auth/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderDeleteRequest } from '../orders/entities/order-delete-request.entity';
import { OrderCompletion } from '../orders/entities/order-completion.entity';
import { OrderEditHistory } from '../orders/entities/order-edit-history.entity';
import { Branch } from '../branches/entities/branch.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import type { AnalyticsDto } from '../analytics/analytics.service';
import type { ReportFilterDto } from './dto/report-filter.dto';
import { dhakaShifted, formatDhaka, dhakaShiftExpr } from '../../common/utils/dhaka-time';

const MAX_RANGE_DAYS = 92;
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'tiffinlogo.png');

export interface ReportRow {
  externalId: string;
  createdAt: Date;
  branchName: string;
  source: string;
  orderType: string;
  itemsSummary: string;
  totalAmount: number;
  status: string;
  acceptedBy: string;
  // Actor tracking — XLSX export only (see order-history.md). archivedBy is
  // omitted: this report always excludes archived orders, so it would
  // always be blank.
  createdBy: string;
  requestedBy: string;
  reviewedBy: string;
  // Added 2026-07-14 — same 4 columns as the Order History XLSX export
  // (order-history.md): explicit Yes/blank flags plus separate actor-name
  // columns, not inferred from blankness. Pre-formatted here (not raw
  // boolean/id) to match this row's existing convention — buildXlsx below
  // just forwards row[key] straight to the cell.
  completed: string;
  completedBy: string;
  updated: string;
  updatedBy: string;
}

// Extra actor columns appended after COLUMNS for the XLSX per-order table —
// PDF no longer has a per-order table at all (see ADR-010), so these are
// XLSX-only in the fullest sense now, not just "not part of the PDF table".
const EXTRA_XLSX_COLUMNS: Array<{ key: keyof ReportRow; label: string }> = [
  { key: 'createdBy', label: 'Created By' },
  // "Delete" prefix added 2026-07-14 — same rationale as the Order History
  // export's identical columns.
  { key: 'requestedBy', label: 'Delete Requested By' },
  { key: 'reviewedBy', label: 'Delete Reviewed By' },
  { key: 'completed', label: 'Completed' },
  { key: 'completedBy', label: 'Completed By' },
  { key: 'updated', label: 'Updated' },
  { key: 'updatedBy', label: 'Updated By' },
];

// Used only by buildXlsx now (header labels + XLSX_WIDTHS lookup) — buildPdf
// no longer prints a per-order table (see ADR-010: the PDF was redesigned to
// show the same aggregate breakdowns as the Analytics dashboard instead of a
// raw order list, which XLSX still carries).
const COLUMNS: Array<{ key: keyof ReportRow; label: string }> = [
  { key: 'externalId', label: 'Order ID' },
  { key: 'createdAt', label: 'Date / Time' },
  { key: 'branchName', label: 'Branch' },
  { key: 'source', label: 'Source' },
  { key: 'orderType', label: 'Type' },
  { key: 'itemsSummary', label: 'Items' },
  { key: 'totalAmount', label: 'Total (BDT)' },
  { key: 'status', label: 'Status' },
  { key: 'acceptedBy', label: 'Accepted By' },
];

const MONEY_FORMAT = '#,##0.00';

const XLSX_WIDTHS: Record<keyof ReportRow, number> = {
  externalId: 16,
  createdAt: 20,
  branchName: 18,
  source: 13,
  orderType: 12,
  itemsSummary: 40,
  totalAmount: 14,
  status: 12,
  acceptedBy: 20,
  createdBy: 20,
  requestedBy: 20,
  reviewedBy: 20,
  completed: 10,
  completedBy: 20,
  updated: 10,
  updatedBy: 20,
};

// Bangladesh-time — "Generated at" should show when the report was
// generated in BD wall-clock terms, not the raw UTC instant. en-CA keeps
// the same yyyy-mm-dd-first shape the previous toISOString()-based
// implementation had (plus a comma before the time — cosmetic only).
function formatDateTime(d: Date): string {
  return formatDhaka(d, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }, 'en-CA');
}

// Sales Report PDF visual language (see sales-report.md / ADR-010) — reuses
// the dashboard's own palette (brand orange, and the same neutral grays the
// live tables already use, e.g. OrderDetailPanel/Branch Performance's
// '#f8fafc' header band) so the PDF doesn't invent a separate look.
const PDF_BRAND = '#ED7446';
const PDF_TEXT_PRIMARY = '#0f172a';
const PDF_TEXT_SECONDARY = '#64748b';
const PDF_BORDER = '#e2e8f0';
const PDF_HEADER_BG = '#f8fafc';
const PDF_STRIPE_BG = '#fbfbfc';
const PDF_HEADER_ROW_HEIGHT = 20;
const PDF_BODY_ROW_HEIGHT = 19;

// Generic label/value table renderer, since pdfkit has no table primitive.
// Tables/lists only, no hand-drawn charts: matches how the Sales Summary
// block already reads on paper, and avoids approximating Recharts output.
// Fixed row heights (rather than relying on moveDown after each .text())
// keep header/stripe bands pixel-aligned with the text drawn on top of them.
function ensureSpace(doc: PDFKit.PDFDocument, minHeight: number): void {
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + minHeight > pageBottom) {
    doc.addPage();
  }
}

// Manually measures and truncates to fit — pdfkit's own `ellipsis` option
// only truncates against a bounded *height*, and relying on `lineBreak:
// false` alone was not reliable enough in practice (still wrapped/overflowed
// for long cell values, e.g. a long Top Menu Items name). Measuring with
// `widthOfString` against the doc's currently-set font/size and chopping
// characters off until it fits sidesteps pdfkit's wrapping logic entirely —
// it never sees a string that could need to wrap.
function truncateToWidth(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) return text;
  const ellipsis = '…';
  let end = text.length;
  while (end > 0) {
    const candidate = text.slice(0, end).trimEnd() + ellipsis;
    if (doc.widthOfString(candidate) <= maxWidth) return candidate;
    end--;
  }
  return ellipsis;
}

// Section title with a brand-color accent bar + a subtitle line reusing the
// live Analytics dashboard's own CardHeader copy for that section, so the
// PDF reads as the same product, not a separate report tool.
function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, subtitle: string): void {
  ensureSpace(doc, 100);
  const y = doc.y;
  doc.rect(doc.page.margins.left, y + 1, 3, 13).fill(PDF_BRAND);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(PDF_TEXT_PRIMARY)
    .text(title, doc.page.margins.left + 10, y);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(PDF_TEXT_SECONDARY)
    .text(subtitle, doc.page.margins.left + 10, y + 14);
  doc.y = y + 32;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  columns: Array<{ label: string; width: number; align?: 'left' | 'right' }>,
  rows: string[][],
): void {
  if (rows.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#94a3b8')
      .text('No data for this period.', doc.page.margins.left);
    doc.moveDown(1.4);
    return;
  }

  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const drawHeader = () => {
    const y = doc.y;
    doc
      .rect(doc.page.margins.left, y, tableWidth, PDF_HEADER_ROW_HEIGHT)
      .fill(PDF_HEADER_BG);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_TEXT_SECONDARY);
    let x = doc.page.margins.left;
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), x + 8, y + 6, {
        width: col.width - 12,
        align: col.align ?? 'left',
      });
      x += col.width;
    }
    doc.y = y + PDF_HEADER_ROW_HEIGHT;
  };

  drawHeader();
  rows.forEach((row, i) => {
    if (doc.y + PDF_BODY_ROW_HEIGHT > pageBottom) {
      doc.addPage(); // 'pageAdded' listener redraws the logo and resets doc.y
      drawHeader();
    }
    const y = doc.y;
    if (i % 2 === 1) {
      doc
        .rect(doc.page.margins.left, y, tableWidth, PDF_BODY_ROW_HEIGHT)
        .fill(PDF_STRIPE_BG);
    }
    doc.font('Helvetica').fontSize(9).fillColor(PDF_TEXT_PRIMARY);
    let x = doc.page.margins.left;
    row.forEach((cell, ci) => {
      const cellWidth = columns[ci].width - 12;
      // Pre-truncated to the measured pixel width (see truncateToWidth) —
      // guaranteed single line regardless of pdfkit's own wrap/ellipsis
      // behavior, since it never receives a string that could overflow.
      doc.text(truncateToWidth(doc, cell, cellWidth), x + 8, y + 5, {
        width: cellWidth,
        align: columns[ci].align ?? 'left',
        lineBreak: false,
      });
      x += columns[ci].width;
    });
    doc.y = y + PDF_BODY_ROW_HEIGHT;
  });

  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + tableWidth, doc.y)
    .strokeColor(PDF_BORDER)
    .stroke();
  doc.moveDown(1.4); // generous gap before the next section
}

// Sales Summary Metrics — see order-history.md. Only manual/edited orders
// carry the pricing-breakdown columns (ADR-005), so subTotal/vatTotal/etc.
// undercount vs grossSales when most orders in range came in unedited.
export interface SalesSummary {
  totalOrders: number;
  grossSales: number;
  subTotal: number;
  vatTotal: number;
  platformChargeTotal: number;
  deliveryChargeTotal: number;
  discountsTotal: number;
  // Money received per payment method (Due orders listed separately).
  byPayment: PaymentLine[];
  // The same breakdown for each outlet (branch), sorted by outlet name.
  byOutlet: Array<{ outlet: string; orders: number; amount: number; payments: PaymentLine[] }>;
}

type PaymentLine = { label: string; orders: number; amount: number };

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  ROCKET: 'Rocket',
  CARD: 'Card',
  BANK: 'Bank transfer',
  OTHER: 'Other',
};

const SUMMARY_LABELS: Array<[Exclude<keyof SalesSummary, 'byPayment' | 'byOutlet'>, string]> = [
  ['totalOrders', 'Total Orders'],
  ['grossSales', 'Gross Sales'],
  ['subTotal', 'Sub Total'],
  ['vatTotal', 'VAT Total'],
  ['platformChargeTotal', 'Platform Charge'],
  ['deliveryChargeTotal', 'Delivery Charge'],
  ['discountsTotal', 'Discounts'],
];

function paymentLabel(o: Order): string {
  if (o.paymentStatus === 'DUE') return 'Due (unpaid)';
  if (o.paymentStatus === 'PENDING') return 'Payment pending';
  return (o.paymentMethod && PAYMENT_LABELS[o.paymentMethod]) ?? 'Not recorded';
}

const PAYMENT_ORDER = [...Object.values(PAYMENT_LABELS), 'Not recorded', 'Payment pending', 'Due (unpaid)'];

// Orders and money per payment method, in a fixed order (Due last).
function paymentBreakdown(orders: Order[]): PaymentLine[] {
  const pay = new Map<string, { orders: number; amount: number }>();
  for (const o of orders) {
    const key = paymentLabel(o);
    const e = pay.get(key) ?? { orders: 0, amount: 0 };
    e.orders += 1;
    e.amount += Number(o.totalAmount);
    pay.set(key, e);
  }
  return PAYMENT_ORDER.filter((l) => pay.has(l)).map((l) => ({ label: l, ...pay.get(l)! }));
}

function computeSalesSummary(
  orders: Order[],
  branchNameById: Map<string, string> = new Map(),
): SalesSummary {
  const summary: SalesSummary = {
    totalOrders: 0,
    grossSales: 0,
    subTotal: 0,
    vatTotal: 0,
    platformChargeTotal: 0,
    deliveryChargeTotal: 0,
    discountsTotal: 0,
    byPayment: paymentBreakdown(orders),
    byOutlet: [],
  };
  const byOutlet = new Map<string, Order[]>();
  for (const o of orders) {
    summary.totalOrders += 1;
    summary.grossSales += Number(o.totalAmount);
    summary.subTotal += Number(o.productSubtotal ?? 0);
    summary.vatTotal += Number(o.vatAmount ?? 0);
    summary.platformChargeTotal += Number(o.platformFee ?? 0);
    summary.deliveryChargeTotal += Number(o.deliveryCharge ?? 0);
    summary.discountsTotal += Number(o.discountAmount ?? 0);
    const outlet = (o.branchId && branchNameById.get(o.branchId)) || 'Unassigned';
    byOutlet.set(outlet, [...(byOutlet.get(outlet) ?? []), o]);
  }
  summary.byOutlet = [...byOutlet.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([outlet, list]) => ({
      outlet,
      orders: list.length,
      amount: list.reduce((t, o) => t + Number(o.totalAmount), 0),
      payments: paymentBreakdown(list),
    }));
  return summary;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrderDeleteRequest)
    private readonly deleteRequestRepo: Repository<OrderDeleteRequest>,
    @InjectRepository(OrderCompletion)
    private readonly completionRepo: Repository<OrderCompletion>,
    @InjectRepository(OrderEditHistory)
    private readonly editHistoryRepo: Repository<OrderEditHistory>,
    private readonly analytics: AnalyticsService,
  ) {}

  // Sales Report PDF — the aggregate sections reuse the exact same
  // aggregations the live Analytics dashboard shows (see analytics.service.ts
  // / ADR-010), scoped to this report's date range and branch, instead of
  // duplicating the SQL here.
  async getAnalyticsForReport(
    dateFrom: string,
    dateTo: string,
    scopedBranchId: string | null,
    scopedBranchIds: string[] | null,
  ): Promise<AnalyticsDto> {
    return this.analytics.getAnalytics(
      dateFrom,
      dateTo,
      scopedBranchId,
      scopedBranchIds,
    );
  }

  async getSalesReportRows(
    filters: ReportFilterDto,
    scopedBranchId: string | null,
    scopedBranchIds: string[] | null,
  ): Promise<{ rows: ReportRow[]; summary: SalesSummary }> {
    const days =
      (new Date(filters.dateTo).getTime() -
        new Date(filters.dateFrom).getTime()) /
      86_400_000;
    if (Number.isNaN(days) || days < 0) {
      throw new BadRequestException('dateTo must be on or after dateFrom');
    }
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range cannot exceed ${MAX_RANGE_DAYS} days`,
      );
    }

    const start = `${filters.dateFrom} 00:00:00`;
    const end = `${filters.dateTo} 23:59:59`;

    // Bangladesh-time — see common/utils/dhaka-time.ts. start/end are
    // Dhaka-calendar-day boundaries; o.createdAt stores UTC-wall-clock
    // digits, so it must be shifted +6h before comparing.
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where(`${dhakaShiftExpr('o.createdAt')} BETWEEN :start AND :end`, { start, end })
      .andWhere('o.archivedAt IS NULL');

    if (scopedBranchIds && scopedBranchIds.length > 0) {
      qb.andWhere('o.branchId IN (:...branchIds)', {
        branchIds: scopedBranchIds,
      });
    } else if (scopedBranchId) {
      qb.andWhere('o.branchId = :branchId', { branchId: scopedBranchId });
    }

    qb.orderBy('o.createdAt', 'ASC');

    const orders = await qb.getMany();

    const branchIds = [
      ...new Set(
        orders.map((o) => o.branchId).filter((id): id is string => id !== null),
      ),
    ];
    const branches =
      branchIds.length > 0
        ? await this.branchRepo.find({ where: { id: In(branchIds) } })
        : [];
    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    // Actor tracking — CSV export only (see order-history.md). Requested/
    // reviewed by come from each order's most recent delete request (an
    // order can stay active here after a rejected request).
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

    // Added 2026-07-14 — same 4 columns as the Order History XLSX export
    // (order-history.md): Completed/Completed By/Updated/Updated By.
    // Completion lives in a separate order_completions table, not a column
    // on `orders`, so it needs its own batch fetch (same as delete requests
    // above); isUpdated itself is a real column already selected by
    // qb.getMany() above, but its "who" (updatedBy) needs the same
    // most-recent-edit lookup as the delete-request actors.
    const completions =
      orderIds.length > 0
        ? await this.completionRepo.find({ where: { orderId: In(orderIds) } })
        : [];
    const completionByOrderId = new Map(
      completions.map((c) => [c.orderId, c]),
    );
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

    const userIds = [
      ...new Set(
        [
          ...orders.map((o) => o.createdBy),
          ...orders.map((o) => o.acceptedBy),
          ...[...latestRequestByOrderId.values()].map((r) => r.requestedBy),
          ...[...latestRequestByOrderId.values()].map((r) => r.reviewedBy),
          ...[...completionByOrderId.values()].map((c) => c.completedBy),
          ...[...latestEditByOrderId.values()].map((e) => e.editedBy),
        ].filter((id): id is string => !!id),
      ),
    ];
    const users =
      userIds.length > 0
        ? await this.userRepo.find({ where: { id: In(userIds) } })
        : [];
    const nameById = new Map(users.map((u) => [u.id, u.name || u.username]));

    return {
      rows: orders.map((o) => {
        const request = latestRequestByOrderId.get(o.id);
        const completion = completionByOrderId.get(o.id);
        const latestEdit = latestEditByOrderId.get(o.id);
        return {
          externalId: o.externalId,
          createdAt: o.createdAt,
          branchName:
            (o.branchId && branchNameById.get(o.branchId)) || 'Unassigned',
          source: o.source,
          orderType: o.orderType,
          itemsSummary: o.items
            .map((i) => `${i.quantity}x ${i.name}`)
            .join(', '),
          totalAmount: Number(o.totalAmount),
          status: o.status,
          completed: completion ? 'Yes' : '',
          completedBy:
            (completion?.completedBy && nameById.get(completion.completedBy)) ||
            '—',
          updated: o.isUpdated ? 'Yes' : '',
          updatedBy:
            (latestEdit?.editedBy && nameById.get(latestEdit.editedBy)) || '—',
          acceptedBy: (o.acceptedBy && nameById.get(o.acceptedBy)) || '—',
          createdBy: (o.createdBy && nameById.get(o.createdBy)) || '—',
          requestedBy: request
            ? (nameById.get(request.requestedBy) ?? '—')
            : '—',
          reviewedBy:
            (request?.reviewedBy && nameById.get(request.reviewedBy)) || '—',
        };
      }),
      summary: computeSalesSummary(orders, branchNameById),
    };
  }

  // Resolves the actual branch name(s) for the report header — looked up directly by
  // requested branch id(s), not from the order results, so a selected branch with zero
  // orders in range still shows its name instead of silently dropping out.
  async resolveBranchScopeLabel(
    isBranchManager: boolean,
    scopedBranchId: string | null,
    scopedBranchIds: string[] | null,
  ): Promise<string> {
    if (scopedBranchIds && scopedBranchIds.length > 0) {
      const branches = await this.branchRepo.find({
        where: { id: In(scopedBranchIds) },
      });
      const nameById = new Map(branches.map((b) => [b.id, b.name]));
      return scopedBranchIds
        .map((id) => nameById.get(id) ?? 'Unknown branch')
        .join(', ');
    }
    if (scopedBranchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: scopedBranchId },
      });
      const name = branch?.name ?? 'Unknown branch';
      return isBranchManager ? `Your branch (${name})` : name;
    }
    return 'All branches';
  }

  // Sales Report XLSX export — see sales-report.md / ADR-009. Filters block
  // (title + Branch/Date Range rows) leads the sheet, then a blank row, then
  // the Sales Summary block (title + 7 label/value rows, same layout CSV
  // used), another blank row, then the bold header row and one row per
  // order. Money and date/time cells are real Excel types (see ADR-009),
  // not text — the reason this replaced CSV in the first place.
  async buildXlsx(
    rows: ReportRow[],
    summary: SalesSummary,
    meta: { dateFrom: string; dateTo: string; branchScope: string },
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales Report');
    const xlsxColumns = [...COLUMNS, ...EXTRA_XLSX_COLUMNS];
    sheet.columns = xlsxColumns.map((c) => ({ width: XLSX_WIDTHS[c.key] }));

    sheet.addRow(['Filters']).font = { bold: true };
    sheet.addRow(['Branch', meta.branchScope]);
    sheet.addRow(['Date Range', `${meta.dateFrom} to ${meta.dateTo}`]);
    sheet.addRow([]);

    sheet.addRow(['Sales Summary']).font = { bold: true };
    for (const [key, label] of SUMMARY_LABELS) {
      const row = sheet.addRow([
        label,
        key === 'totalOrders' ? summary[key] : Number(summary[key].toFixed(2)),
      ]);
      if (key !== 'totalOrders') row.getCell(2).numFmt = MONEY_FORMAT;
    }
    sheet.addRow([]);

    sheet.addRow(['Payment Method Totals']).font = { bold: true };
    for (const p of summary.byPayment) {
      const row = sheet.addRow([p.label, Number(p.amount.toFixed(2)), `${p.orders} order${p.orders === 1 ? '' : 's'}`]);
      row.getCell(2).numFmt = MONEY_FORMAT;
    }
    sheet.addRow([]);

    // Outlet-wise payments: one block per outlet, each payment method with
    // its order count and amount, then the outlet total.
    sheet.addRow(['Outlet-wise Payments']).font = { bold: true };
    sheet.addRow(['Outlet', 'Payment Method', 'Orders', 'Amount']).font = { bold: true };
    for (const o of summary.byOutlet) {
      for (const p of o.payments) {
        const row = sheet.addRow([o.outlet, p.label, p.orders, Number(p.amount.toFixed(2))]);
        row.getCell(4).numFmt = MONEY_FORMAT;
      }
      const total = sheet.addRow([o.outlet, 'Outlet total', o.orders, Number(o.amount.toFixed(2))]);
      total.font = { bold: true };
      total.getCell(4).numFmt = MONEY_FORMAT;
    }
    sheet.addRow([]);

    const headerRow = sheet.addRow(xlsxColumns.map((c) => c.label));
    headerRow.font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];

    for (const row of rows) {
      const values = xlsxColumns.map((c) => {
        // Shifted +6h (Bangladesh time) — see common/utils/dhaka-time.ts and
        // the identical comment in orders.service.ts's Order History export.
        if (c.key === 'createdAt') return dhakaShifted(row.createdAt);
        if (c.key === 'totalAmount') return row.totalAmount;
        return row[c.key] ?? '';
      });
      const excelRow = sheet.addRow(values);
      xlsxColumns.forEach((c, i) => {
        if (c.key === 'createdAt') {
          excelRow.getCell(i + 1).numFmt = 'yyyy-mm-dd hh:mm:ss';
        }
        if (c.key === 'totalAmount') {
          excelRow.getCell(i + 1).numFmt = MONEY_FORMAT;
        }
      });
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // Sales Report PDF — see sales-report.md / ADR-010. No longer a per-order
  // table (that stayed on XLSX); this shows the same aggregate breakdowns as
  // the live Analytics dashboard (Orders by Platform, Revenue by Branch,
  // Peak Order Hours, Order Type, Branch Performance, Top Menu Items) as
  // plain tables — pdfkit has no chart primitives, so this doesn't attempt
  // to reproduce the dashboard's Recharts bar/pie visuals.
  buildPdf(
    analytics: AnalyticsDto,
    meta: { dateFrom: string; dateTo: string; branchScope: string },
    summary: SalesSummary,
  ): PDFKit.PDFDocument {
    // Portrait A4 (was landscape — that existed to fit the wide per-order
    // table ADR-010 removed from the PDF; the aggregate tables here are all
    // narrow enough for portrait, and it's the more standard "A4 report"
    // orientation). bufferPages enables the page-number footer below —
    // pages aren't flushed to the piped response until the caller calls
    // .end(), so this doesn't change the existing streaming contract.
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 42,
      bufferPages: true,
    });

    const drawLogo = () => {
      try {
        const logoWidth = 80;
        doc.image(
          LOGO_PATH,
          doc.page.width - doc.page.margins.right - logoWidth,
          doc.page.margins.top,
          {
            width: logoWidth,
          },
        );
      } catch {
        // Logo missing/unreadable — report still generates without it.
      }
    };

    doc.on('pageAdded', () => {
      drawLogo();
      doc.y = doc.page.margins.top + 46;
    });

    // ── First page header ──
    drawLogo();
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#1e293b')
      .text(
        'Tiffin — Sales Report',
        doc.page.margins.left,
        doc.page.margins.top,
      );
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(PDF_TEXT_SECONDARY)
      .text(`Period: ${meta.dateFrom} to ${meta.dateTo}`, doc.page.margins.left)
      // Branch on its own line (was combined with Period on one line,
      // separated by "·") — a multi-branch selection can produce a long
      // comma-separated name list, which needs room of its own; pdfkit's
      // default .text() wraps to a 2nd line automatically once it's wider
      // than the usable page width, no explicit width/height math needed.
      .text(`Branch: ${meta.branchScope}`)
      .text(
        `Generated: ${formatDateTime(new Date())}  ·  ${summary.totalOrders} order${summary.totalOrders === 1 ? '' : 's'}`,
      );
    doc.moveDown(0.7);

    // Brand-color rule under the header block — the report's one strong
    // accent color, echoing the dashboard's brand orange.
    const headerRuleY = doc.y;
    doc
      .moveTo(doc.page.margins.left, headerRuleY)
      .lineTo(doc.page.width - doc.page.margins.right, headerRuleY)
      .lineWidth(1.5)
      .strokeColor(PDF_BRAND)
      .stroke();
    doc.lineWidth(1);
    doc.y = headerRuleY + 22;

    // ── Sales Summary block — see order-history.md. Card tiles (rounded
    // rect + border) instead of bare label/value text, 3 per row so labels
    // like "PLATFORM CHARGE" have room in portrait's narrower width. Gross
    // Sales/Discounts colored green/red, matching the live dashboard's
    // SummaryTile semantics for the same two metrics. ──
    // Period dropped from this subtitle (2026-07-14, client request) — it's
    // already shown once in the report header above; repeating it here was
    // redundant.
    drawSectionTitle(doc, 'Sales Summary', 'Totals');

    const usableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const TILE_COLS = 3;
    const TILE_GAP = 8;
    const TILE_HEIGHT = 42;
    const tileWidth = (usableWidth - TILE_GAP * (TILE_COLS - 1)) / TILE_COLS;
    const summaryItems = SUMMARY_LABELS.map(([key, label]) => ({
      label: label.toUpperCase(),
      value:
        key === 'totalOrders'
          ? String(summary[key])
          : `BDT ${summary[key].toFixed(2)}`,
      color:
        key === 'grossSales'
          ? '#15803d'
          : key === 'discountsTotal'
            ? '#dc2626'
            : PDF_TEXT_PRIMARY,
    }));

    const tilesTop = doc.y;
    summaryItems.forEach((item, i) => {
      const col = i % TILE_COLS;
      const row = Math.floor(i / TILE_COLS);
      const x = doc.page.margins.left + col * (tileWidth + TILE_GAP);
      const y = tilesTop + row * (TILE_HEIGHT + TILE_GAP);
      doc.roundedRect(x, y, tileWidth, TILE_HEIGHT, 4).fillAndStroke(PDF_HEADER_BG, PDF_BORDER);
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(PDF_TEXT_SECONDARY)
        .text(item.label, x + 10, y + 8, { width: tileWidth - 20 });
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(item.color)
        .text(item.value, x + 10, y + 21, { width: tileWidth - 20 });
    });
    const tileRows = Math.ceil(summaryItems.length / TILE_COLS);
    doc.y = tilesTop + tileRows * (TILE_HEIGHT + TILE_GAP) + 10;

    // ── Payment Method Totals ──
    drawSectionTitle(doc, 'Payment Method Totals', 'Amount received per payment method');
    drawTable(
      doc,
      [
        { label: 'Payment Method', width: 220 },
        { label: 'Orders', width: 110, align: 'right' },
        { label: 'Amount (BDT)', width: 160, align: 'right' },
      ],
      summary.byPayment.map((p) => [p.label, String(p.orders), p.amount.toFixed(2)]),
    );

    // ── Outlet-wise Payments ──
    drawSectionTitle(doc, 'Outlet-wise Payments', 'Orders and amount per payment method, for each outlet');
    drawTable(
      doc,
      [
        { label: 'Outlet', width: 150 },
        { label: 'Payment Method', width: 140 },
        { label: 'Orders', width: 80, align: 'right' },
        { label: 'Amount (BDT)', width: 120, align: 'right' },
      ],
      summary.byOutlet.flatMap((o) => [
        ...o.payments.map((p, i) => [i === 0 ? o.outlet : '', p.label, String(p.orders), p.amount.toFixed(2)]),
        ['', 'Outlet total', String(o.orders), o.amount.toFixed(2)],
      ]),
    );

    // ── Orders by Platform ──
    drawSectionTitle(doc, 'Orders by Platform', 'Order source breakdown');
    drawTable(
      doc,
      [
        { label: 'Platform', width: 220 },
        { label: 'Orders', width: 110, align: 'right' },
        { label: 'Revenue (BDT)', width: 160, align: 'right' },
      ],
      analytics.bySource.map((s) => [
        s.source,
        String(s.count),
        s.revenue.toFixed(2),
      ]),
    );

    // ── Revenue by Branch ──
    drawSectionTitle(doc, 'Revenue by Branch', 'Total revenue generated per branch');
    drawTable(
      doc,
      [
        { label: 'Branch', width: 220 },
        { label: 'Orders', width: 110, align: 'right' },
        { label: 'Revenue (BDT)', width: 160, align: 'right' },
      ],
      analytics.byBranch.map((b) => [
        b.branchName,
        String(b.count),
        b.revenue.toFixed(2),
      ]),
    );

    // ── Peak Order Hours (hours with at least one order) ──
    drawSectionTitle(doc, 'Peak Order Hours', 'When orders come in most during the day');
    drawTable(
      doc,
      [
        { label: 'Hour', width: 180 },
        { label: 'Orders', width: 150, align: 'right' },
      ],
      analytics.byHour
        .filter((h) => h.count > 0)
        .map((h) => [`${String(h.hour).padStart(2, '0')}:00`, String(h.count)]),
    );

    // ── Order Type ──
    drawSectionTitle(doc, 'Order Type', 'Delivery vs Pickup vs Dine-in');
    drawTable(
      doc,
      [
        { label: 'Order Type', width: 220 },
        { label: 'Orders', width: 150, align: 'right' },
      ],
      analytics.byOrderType.map((t) => [t.orderType, String(t.count)]),
    );

    // ── Branch Performance (same source data as Revenue by Branch above,
    // fuller breakdown — matches the two distinct sections on the live
    // Analytics dashboard) ──
    drawSectionTitle(doc, 'Branch Performance', 'Orders and escalations per branch');
    drawTable(
      doc,
      [
        { label: 'Branch', width: 130 },
        { label: 'Orders', width: 55, align: 'right' },
        { label: 'Revenue (BDT)', width: 85, align: 'right' },
        { label: 'Avg Order (BDT)', width: 85, align: 'right' },
        { label: 'Escalated', width: 60, align: 'right' },
        { label: 'Escalation Rate', width: 85, align: 'right' },
      ],
      analytics.byBranch.map((b) => {
        const avg = b.count > 0 ? b.revenue / b.count : 0;
        const escRate = b.count > 0 ? (b.escalated / b.count) * 100 : 0;
        return [
          b.branchName,
          String(b.count),
          b.revenue.toFixed(2),
          avg.toFixed(2),
          String(b.escalated),
          `${escRate.toFixed(1)}%`,
        ];
      }),
    );

    // ── Top Menu Items (top 10 — same limit as the live Analytics
    // dashboard's "Top Menu Items" section, see analytics.service.ts) ──
    drawSectionTitle(doc, 'Top Menu Items', 'Best-selling items by quantity ordered');
    drawTable(
      doc,
      [
        { label: '#', width: 30 },
        { label: 'Item', width: 260 },
        { label: 'Qty', width: 90, align: 'right' },
        { label: 'Orders', width: 90, align: 'right' },
      ],
      analytics.topItems.map((item, i) => [
        String(i + 1),
        item.name,
        String(item.totalQty),
        String(item.orderCount),
      ]),
    );

    // ── Page numbers — requires bufferPages (see constructor above); runs
    // once all content is drawn, before the caller pipes/ends the stream.
    // The footer is drawn *inside* the bottom margin on purpose, but pdfkit
    // still checks .text() against page.margins.bottom for auto-pagination
    // — since our y falls past that boundary, pdfkit silently inserted a
    // blank extra page per real page to "fit" it. Zeroing the bottom margin
    // just for this call (then restoring it) is the standard pdfkit fix. ──
    const pageRange = doc.bufferedPageRange();
    const contentBottomMargin = doc.page.margins.bottom;
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(
          `Page ${i + 1 - pageRange.start} of ${pageRange.count}`,
          doc.page.margins.left,
          doc.page.height - contentBottomMargin + 16,
          { width: usableWidth, align: 'center' },
        );
      doc.page.margins.bottom = contentBottomMargin;
    }

    // Caller is responsible for piping this to a destination and then calling .end() —
    // ending here before a reader is attached risks losing buffered stream data.
    return doc;
  }
}
