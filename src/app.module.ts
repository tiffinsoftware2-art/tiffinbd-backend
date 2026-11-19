import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { appConfig, dbConfig, ingestConfig } from './config/app.config';
import { RolesGuard } from './common/guards/roles.guard';
import { DatabaseSeederService } from './database/seeds/database-seeder.service';
import { LoginAudit } from './modules/auth/entities/login-audit.entity';
import { RefreshToken } from './modules/auth/entities/refresh-token.entity';
import { User } from './modules/auth/entities/user.entity';
import { Branch } from './modules/branches/entities/branch.entity';
import { MenuCategory } from './modules/menu/entities/menu-category.entity';
import { MenuItem } from './modules/menu/entities/menu-item.entity';
import { IngestionRecord } from './modules/ingest/entities/ingestion-record.entity';
import { Order } from './modules/orders/entities/order.entity';
import { OrderHistory } from './modules/orders/entities/order-history.entity';
import { OrderEditHistory } from './modules/orders/entities/order-edit-history.entity';
import { OrderDeleteRequest } from './modules/orders/entities/order-delete-request.entity';
import { OrderCompletion } from './modules/orders/entities/order-completion.entity';
import { Device } from './modules/devices/entities/device.entity';
import { EscalationConfig } from './modules/settings/entities/escalation-config.entity';
import { ManualOrderConfig } from './modules/settings/entities/manual-order-config.entity';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './modules/audit/audit.interceptor';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { BranchesModule } from './modules/branches/branches.module';
import { SettingsModule } from './modules/settings/settings.module';
import { EventsModule } from './modules/events/events.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';
import { UsersModule } from './modules/users/users.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, dbConfig, ingestConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.getOrThrow<string>('db.host'),
        port: config.getOrThrow<number>('db.port'),
        username: config.getOrThrow<string>('db.username'),
        password: config.getOrThrow<string>('db.password'),
        database: config.getOrThrow<string>('db.database'),
        entities: [
          User,
          RefreshToken,
          LoginAudit,
          Branch,
          MenuCategory,
          MenuItem,
          IngestionRecord,
          Order,
          OrderHistory,
          OrderEditHistory,
          OrderDeleteRequest,
          OrderCompletion,
          Device,
          EscalationConfig,
          ManualOrderConfig,
          AuditLog,
        ],
        // Always off — including local/test. Schema changes must go through
        // committed migrations (see ADR-008) so drift shows up in dev, not
        // for the first time in production.
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
      }),
    }),
    TypeOrmModule.forFeature([User]),
    EventsModule,
    AuthModule,
    BranchesModule,
    IngestModule,
    MenuModule,
    OrdersModule,
    UsersModule,
    DevicesModule,
    SettingsModule,
    AnalyticsModule,
    ReportsModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Records every mutating request to audit_log (ADR-019). Registered
    // globally for the same reason the guards above are: a route that is
    // added later is covered on the day it ships, not when someone
    // remembers to instrument it.
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    DatabaseSeederService,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly seeder: DatabaseSeederService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seeder.run();
  }
}
