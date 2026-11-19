import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  refreshExpiresInDays: parseInt(process.env.REFRESH_EXPIRES_IN_DAYS ?? '7', 10),
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
  branchesApiUrl: process.env.BRANCHES_API_URL ?? 'http://localhost:3005',
  rabbitmqUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
}));

export const ingestConfig = registerAs('ingest', () => ({
  websiteSecret: process.env.TIFFIN_WEBSITE_SECRET ?? '',
  whitelistEnabled: process.env.WHITELIST_ENABLED === 'true',
}));

export const dbConfig = registerAs('db', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USER ?? process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'tiffinbd',
}));
