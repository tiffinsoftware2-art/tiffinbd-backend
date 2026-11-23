import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { LoginAudit } from '../modules/auth/entities/login-audit.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { User } from '../modules/auth/entities/user.entity';
import { Branch } from '../modules/branches/entities/branch.entity';
import { MenuCategory } from '../modules/menu/entities/menu-category.entity';
import { MenuItem } from '../modules/menu/entities/menu-item.entity';
import { IngestionRecord } from '../modules/ingest/entities/ingestion-record.entity';
import { Order } from '../modules/orders/entities/order.entity';
import { OrderHistory } from '../modules/orders/entities/order-history.entity';
import { OrderEditHistory } from '../modules/orders/entities/order-edit-history.entity';
import { OrderDeleteRequest } from '../modules/orders/entities/order-delete-request.entity';
import { OrderCompletion } from '../modules/orders/entities/order-completion.entity';
import { Device } from '../modules/devices/entities/device.entity';
import { EscalationConfig } from '../modules/settings/entities/escalation-config.entity';
import { ManualOrderConfig } from '../modules/settings/entities/manual-order-config.entity';
import { AuditLog } from '../modules/audit/entities/audit-log.entity';
import { PlatformMenuItem } from '../modules/platform-menu/entities/platform-menu-item.entity';
import { MenuItemImage } from '../modules/menu/entities/menu-item-image.entity';

// Standalone DataSource for the TypeORM CLI (migration:generate/run/revert —
// see ADR-008). NOT used by the running app — app.module.ts's
// TypeOrmModule.forRootAsync opens its own connection with synchronize
// enabled outside production. This file exists purely so the CLI (`-d` flag)
// has something to point at for schema introspection and migration history.
//
// Keep `entities` in sync with app.module.ts's list by hand — there is no
// shared constant today, so a new entity must be added in both places.
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USER ?? process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'tiffinbd',
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
    PlatformMenuItem,
    MenuItemImage,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  // Always false, even in development — this DataSource is only ever used
  // by the CLI, and the CLI must never auto-sync. The app's own dev/test
  // connection (app.module.ts) is where synchronize:true still applies.
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
