import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderDeleteRequest } from '../orders/entities/order-delete-request.entity';
import { OrderCompletion } from '../orders/entities/order-completion.entity';
import { OrderEditHistory } from '../orders/entities/order-edit-history.entity';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      Branch,
      User,
      OrderDeleteRequest,
      OrderCompletion,
      OrderEditHistory,
    ]),
    // Sales Report PDF's aggregate sections reuse AnalyticsService — see
    // reports.service.ts::getAnalyticsForReport / ADR-010.
    AnalyticsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
