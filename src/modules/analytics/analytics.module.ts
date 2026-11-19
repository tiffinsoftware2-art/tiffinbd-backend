import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers:   [AnalyticsService],
  // Reused by ReportsService for the Sales Report PDF's aggregate sections
  // (see reports.module.ts / ADR-010).
  exports:     [AnalyticsService],
})
export class AnalyticsModule {}
