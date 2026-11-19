import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import type { JwtPayload } from '../auth/auth.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { ReportsService } from './reports.service';

@Controller('api/v1/reports')
@Roles(UserRole.BRANCH_MANAGER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  async salesReport(
    @Query() filters: ReportFilterDto,
    @CurrentUser() actor: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const isBranchManager = actor.role === UserRole.BRANCH_MANAGER;
    const scopedBranchId = isBranchManager
      ? actor.branchId
      : (filters.branchId ?? null);
    const scopedBranchIds = isBranchManager
      ? null
      : filters.branchIds && filters.branchIds.length > 0
        ? filters.branchIds
        : null;
    const format = filters.format ?? 'xlsx';

    const [{ rows, summary }, branchScope] = await Promise.all([
      this.reports.getSalesReportRows(filters, scopedBranchId, scopedBranchIds),
      this.reports.resolveBranchScopeLabel(
        isBranchManager,
        scopedBranchId,
        scopedBranchIds,
      ),
    ]);

    const filename = `tiffin-sales-report_${filters.dateFrom}_to_${filters.dateTo}.${format}`;

    if (format === 'pdf') {
      // PDF shows aggregate breakdowns (see reports.service.ts::buildPdf /
      // ADR-010), not the per-order rows above — those still feed XLSX only.
      const analytics = await this.reports.getAnalyticsForReport(
        filters.dateFrom,
        filters.dateTo,
        scopedBranchId,
        scopedBranchIds,
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      const doc = this.reports.buildPdf(
        analytics,
        {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          branchScope,
        },
        summary,
      );
      doc.pipe(res);
      doc.end();
      return;
    }

    const buffer = await this.reports.buildXlsx(rows, summary, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      branchScope,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
