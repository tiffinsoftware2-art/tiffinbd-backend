import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import type { JwtPayload } from '../auth/auth.service';
import { AnalyticsService } from './analytics.service';
import { toDhakaDateStr } from '../../common/utils/dhaka-time';

@Controller('api/v1/analytics')
@Roles(UserRole.BRANCH_MANAGER)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  get(
    @CurrentUser() user: JwtPayload,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
  ) {
    const from = dateFrom ?? toDhakaDateStr();
    const to = dateTo ?? toDhakaDateStr();
    const isBranchManager = user.role === UserRole.BRANCH_MANAGER;
    // Branch managers always see only their own branch — ignore any supplied branchId(s)
    const effectiveBranchId = isBranchManager
      ? user.branchId
      : (branchId ?? null);
    const effectiveBranchIds = isBranchManager
      ? null
      : branchIds
        ? branchIds
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : null;
    return this.analytics.getAnalytics(
      from,
      to,
      effectiveBranchId,
      effectiveBranchIds,
    );
  }
}
