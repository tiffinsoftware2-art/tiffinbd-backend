import * as dotenv from 'dotenv';
dotenv.config();

import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { LoginAudit } from '../../modules/auth/entities/login-audit.entity';
import { RefreshToken } from '../../modules/auth/entities/refresh-token.entity';
import { User, UserRole } from '../../modules/auth/entities/user.entity';

const SUPER_ADMIN_USERNAME = 'superadmin';
const SUPER_ADMIN_PASSWORD = 'Tiffin@2026';

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USER ?? process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'tiffinbd',
  entities: [User, RefreshToken, LoginAudit],
  synchronize: true,
});

async function seed() {
  await dataSource.initialize();
  console.log('Connected to database.');

  const repo = dataSource.getRepository(User);

  const existing = await repo.findOne({ where: { username: SUPER_ADMIN_USERNAME } });
  if (existing) {
    console.log(`Super admin "${SUPER_ADMIN_USERNAME}" already exists — skipping.`);
    await dataSource.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

  await repo.save({
    username: SUPER_ADMIN_USERNAME,
    password_hash: passwordHash,
    role: UserRole.SUPER_ADMIN,
    branch_id: null,
    must_change_password: false,
    is_active: true,
  });

  console.log('');
  console.log('✓ Super admin created successfully.');
  console.log('  Username :', SUPER_ADMIN_USERNAME);
  console.log('  Password :', SUPER_ADMIN_PASSWORD);
  console.log('  Role     :', UserRole.SUPER_ADMIN);
  console.log('');

  await dataSource.destroy();
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
