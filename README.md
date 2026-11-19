# tiffinbd-backend

Core application backend for the TiffinBD order management platform. Built with NestJS + TypeORM, runs on **port 3001**.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5 |
| ORM | TypeORM 0.3 |
| Database | MySQL 8.0 |
| Auth | Passport JWT + bcrypt |
| Validation | class-validator / class-transformer |

---

## Project Structure

```
src/
├── modules/
│   ├── auth/                  # Login, refresh, logout, change-password
│   │   ├── entities/          # User, RefreshToken, LoginAudit
│   │   ├── strategies/        # JWT + Local passport strategies
│   │   ├── guards/            # JwtAuthGuard (global)
│   │   └── dto/
│   └── users/                 # User CRUD + admin password reset
│       └── dto/
├── common/
│   ├── decorators/            # @Public() — skips JwtAuthGuard
│   └── filters/               # GlobalExceptionFilter
├── config/
│   └── app.config.ts          # app + db config namespaces
└── database/
    └── seeds/                 # Admin seed (runs on startup)
```

---

## Running Locally

### Option A — Docker (recommended)

All services (MySQL, RabbitMQ, phpMyAdmin, backend, frontend, notification) are managed from `tiffinbd-infra/`.

```bash
cd ../tiffinbd-infra

# Copy and fill in env values
cp .env.example .env.local

# Start everything (foreground)
make local

# Start in background
make local-d
```

The backend is available at **http://localhost:3001**.

### Option B — Bare metal

```bash
# Install dependencies
npm install

# Copy and fill in env values
cp .env.example .env

# Watch mode
npm run start:dev

# Production build
npm run build && npm run start:prod
```

Requires a running MySQL 8 instance. Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env`.

---

## Environment Variables

Copy `.env.example` to `.env` when running bare metal. When using Docker, these are injected via `tiffinbd-infra/.env.local`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `NODE_ENV` | `development` | Environment |
| `JWT_SECRET` | — | **Required.** Signing key for access tokens |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `REFRESH_EXPIRES_IN_DAYS` | `7` | Refresh token TTL (days) |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL username |
| `DB_PASSWORD` | — | MySQL password |
| `DB_NAME` | `tiffinbd` | MySQL database name |
| `INTERNAL_SERVICE_TOKEN` | — | Bearer token for service-to-service calls (tiffinbd-order → backend) |

---

## Database Seed

A Super Admin account is seeded automatically on startup. To run manually:

```bash
# Bare metal
npm run seed

# Docker (via infra Makefile)
make seed
```

---

## API Endpoints

### Auth — `/api/v1/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Public | Credentials → JWT pair in cookies |
| POST | `/api/v1/auth/refresh` | Public | Rotate refresh token → new access token |
| POST | `/api/v1/auth/logout` | JWT | Revoke current refresh token |
| PATCH | `/api/v1/auth/change-password` | JWT | Change own password; issues fresh token pair |

### Users — `/api/v1/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/users` | JWT | List all users (safe columns only) |
| GET | `/api/v1/users/:id` | JWT | Get single user |
| POST | `/api/v1/users` | JWT | Create user; sets `must_change_password = true` |
| PATCH | `/api/v1/users/:id` | JWT | Update role, branchId, isActive |
| PATCH | `/api/v1/users/:id/reset-password` | JWT | Admin sets new password; sets `must_change_password = true` |

> `password_hash` is never returned in any response.

---

## Scripts

```bash
npm run start:dev       # watch mode
npm run start:debug     # watch + Node debugger on port 9229
npm run build           # compile to dist/
npm run start:prod      # run compiled build
npm run lint            # ESLint + Prettier fix
npm run test            # unit tests
npm run test:e2e        # e2e tests
npm run test:cov        # coverage report
npm run seed            # run admin seed script
```

### Docker shortcuts (run from `tiffinbd-infra/`)

```bash
make logs-backend                        # tail backend logs
make shell-backend                       # shell into backend container
make rebuild-backend                     # rebuild image after package.json changes
make npm-backend cmd="install <pkg>"     # install a package inside the container
make npm-backend cmd="install -D <pkg>"  # install a dev dependency
```

---

## Adding a Package

When running via Docker, install inside the container and then rebuild the image:

```bash
# From tiffinbd-infra/
make npm-backend cmd="install <package-name>"
make rebuild-backend
```

---

## Roles

| Role | Level |
|---|---|
| `SUPER_ADMIN` | Highest |
| `ADMIN` | — |
| `BUSINESS_HEAD` | — |
| `MANAGER` | — |
| `BRANCH_MANAGER` | — |
| `STAFF` | Lowest |

New users are created with `must_change_password = true` and must set a new password on first login.
