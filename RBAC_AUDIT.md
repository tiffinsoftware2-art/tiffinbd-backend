# RBAC Audit — tiffinbd-backend

Snapshot of `src/` as of 2026-07-08.

## 1. Roles

`src/common/enums/user-role.enum.ts`

```ts
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  BUSINESS_HEAD = 'BUSINESS_HEAD',
  MANAGER = 'MANAGER',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  STAFF = 'STAFF',
}
```

Ranked by `ROLE_LEVEL` (lower number = more privileged):

| Level | Role | Purpose (inferred from usage) |
|---|---|---|
| 1 | `SUPER_ADMIN` | Outranks every gate unconditionally. |
| 2 | `ADMIN` | Settings, branch/menu sync & mutation, user management, settlement, archival, delete-request approval. |
| 3 | `BUSINESS_HEAD` | Ranked in the hierarchy but **never referenced by name in any `@Roles(...)` call** anywhere in the codebase. |
| 4 | `MANAGER` | Cross-branch; only gates `GET /users` (list) and `GET /users/:id`. |
| 5 | `BRANCH_MANAGER` | Single-branch manager — Analytics, Reports, manual order create/update. Branch-scoped on top of the role check. |
| 6 | `STAFF` | Baseline authenticated role — lowest rung, passes any `@Roles(STAFF)` gate (i.e. everyone). |

A user has **one role only** (single enum column, not an array).

## 2. How enforcement works

Two global guards run on every request, in order:

```
request → JwtAuthGuard → RolesGuard → handler
```

- `JwtAuthGuard` (`src/modules/auth/guards/jwt-auth.guard.ts`) — skips auth only if `@Public()` is set.
- `RolesGuard` (`src/common/guards/roles.guard.ts`):
  - `@Public()` present → allow.
  - **No `@Roles` decorator at all → allow** (any authenticated user, any role — not blocked, not public).
  - `@Roles(X)` present → **minimum-role threshold**, not membership: `ROLE_LEVEL[user.role] <= ROLE_LEVEL[X]`. So `@Roles(ADMIN)` means "ADMIN or anyone more senior," not "ADMIN only."
  - Fails → `403 ForbiddenException('INSUFFICIENT_ROLE')`.

Separate trust boundary: the notification service and the website ingest webhook use `@Public()` + `InternalServiceTokenGuard` / `IpWhitelistGuard` / `IngestSecretGuard` instead of JWT/roles — marked "Internal" below.

## 3. Endpoint by endpoint

*Chips show the **minimum** role — everyone ranked above it also passes.*

### Auth — `/api/v1/auth`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/login` | Public | Local-strategy guard, not JWT. |
| POST | `/refresh` | Public | — |
| PATCH | `/change-password` | Any authenticated | No `@Roles`, no `@Public`. |
| POST | `/logout` | Any authenticated | — |

### Branches — `/api/v1/branches`
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/` | STAFF (= everyone) | No-op restriction. |
| POST | `/` | ADMIN | — |
| GET | `/:id` | STAFF (= everyone) | No-op restriction. |
| GET | `/:id/activity` | ADMIN | — |
| PATCH | `/:id` | ADMIN | — |

### Devices — `/api/v1/devices`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/register` | Any authenticated | Self-registers own FCM token. |
| DELETE | `/unregister` | Any authenticated | — |
| GET | `/` | Internal | Called by tiffinbd-notification. |
| DELETE | `/token` | Internal | — |

### Ingest — `/api/v1/ingest`
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/website` | Internal | Class is `@Public()`; gated by IP allowlist + shared secret instead. |

### Menu — `/api/v1/menu`
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/categories` | STAFF (= everyone) | No-op restriction. |
| GET | `/items` | STAFF (= everyone) | No-op restriction. |
| POST | `/sync` | ADMIN | — |

### Orders — `/api/v1/orders` (class default: STAFF)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/` | Any authenticated | Branch-scoped for STAFF/BRANCH_MANAGER. |
| GET | `/delete-requests` | ADMIN | Review queue. |
| GET | `/export` | Any authenticated | CSV export, branch-scoped. |
| POST | `/manual` | BRANCH_MANAGER | Branch forced to actor's own for scoped roles. |
| GET | `/:id` | Any authenticated | Branch-scoped. |
| PATCH | `/manual/:id` | BRANCH_MANAGER | — |
| PATCH | `/:id/accept` | Any authenticated | Branch-scoped. |
| PATCH | `/:id/escalate` | Internal | Notification-service callback. |
| PATCH | `/:id/settle` | ADMIN | No branch scoping — cross-branch by design. |
| POST | `/:id/archive` | ADMIN | — |
| PATCH | `/:id/unarchive` | ADMIN | — |
| POST | `/:id/delete-requests` | Any authenticated | Even STAFF can request a delete; branch-scoped. |
| PATCH | `/delete-requests/:id/approve` | ADMIN | — |
| PATCH | `/delete-requests/:id/reject` | ADMIN | — |

### Reports — `/api/v1/reports` (class default: BRANCH_MANAGER)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/sales` | BRANCH_MANAGER | STAFF excluded. Branch-locked for BRANCH_MANAGER only. |

### Settings — `/api/v1/settings` (class default: ADMIN)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/escalation` | ADMIN | — |
| PUT | `/escalation` | ADMIN | — |
| POST | `/escalation/test` | ADMIN | — |
| GET | `/manual-order` | ADMIN | Global VAT% / delivery / platform-fee defaults. |
| PUT | `/manual-order` | ADMIN | — |

### Users — `/api/v1/users`
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/` | MANAGER | Global — not branch-scoped, sees every branch. |
| GET | `/:id` | MANAGER | — |
| POST | `/` | ADMIN | + can't create a role ≥ your own. |
| PATCH | `/:id` | ADMIN | + can't assign a role ≥ your own, can't edit own role. |
| PATCH | `/:id/password` | ADMIN | + can't reset a peer/senior's password. |
| GET | `/:id/login-activity` | ADMIN | — |

### Analytics — `/api/v1/analytics` (class default: BRANCH_MANAGER)
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/` | BRANCH_MANAGER | STAFF excluded. Branch-locked for BRANCH_MANAGER only. |

## 4. Branch scoping (layered on top of roles)

- **Analytics & Reports** — inline check: if `role === BRANCH_MANAGER`, the handler overwrites any `branchId`/`branchIds` query param with the actor's own branch. MANAGER+ can query any branch freely.
- **Orders** — `orders.service.ts` defines `BRANCH_SCOPED_ROLES = {BRANCH_MANAGER, STAFF}`. Create/list/export/view/accept/update/delete-request all force or check `branchId` for those two roles, throwing `403 Order belongs to a different branch` on mismatch. Settle/archive/unarchive/approve/reject skip this — but only ADMIN+ ever reach them.
- **User management** — `canManageRole(actor, target)` requires the actor to strictly outrank the target; blocks creating/editing/resetting-password for anyone at or above your own rung, and blocks editing your own role.
- **User directory** — listing/viewing users has **no** branch restriction; a MANAGER sees every account system-wide.

## 5. User record

`src/modules/auth/entities/user.entity.ts`

- `role` — single enum column, one role per user, no multi-role support.
- `branch_id` — nullable; HQ roles expected to leave it null, branch-scoped roles expected to carry one. **Not enforced at the DB layer**, just a convention.

## 6. Findings

| Category | Finding |
|---|---|
| Unused role | `BUSINESS_HEAD` is ranked (level 3) but never referenced by any `@Roles(...)` call — currently a no-op role. |
| Redundant check | `@Roles(STAFF)` on Branches/Menu read endpoints admits every role — same as omitting `@Roles` entirely. |
| Readability risk | Minimum-role semantics read like membership — `@Roles(ADMIN)` looks like "ADMIN only" but actually means "ADMIN or senior." |
| Scope question | No mid-tier between "any authenticated" and BRANCH_MANAGER+ — STAFF has identical access to most base Orders actions as SUPER_ADMIN, modulo branch scoping. |
| Trust boundary | Internal-service routes (Devices getByBranch/removeToken, Orders escalate, all of Ingest) sit entirely outside RBAC — the token/IP/secret guard is the whole defense there. |
| Scope question | User directory isn't branch-scoped for MANAGER — sees every branch's users. Consistent with how MANAGER is treated elsewhere, but worth confirming intent. |
| Dead code | `hasMinimumRole()` helper in `user-role.enum.ts` has no call sites — `RolesGuard` reimplements the same check inline. |

---
*Sources: `src/common/enums/user-role.enum.ts`, `src/common/guards/roles.guard.ts`, `src/modules/*/*.controller.ts`, `src/modules/orders/orders.service.ts`, `src/modules/users/users.service.ts`, `src/modules/auth/entities/user.entity.ts`*
