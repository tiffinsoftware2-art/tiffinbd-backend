// Pure decision logic for the audit trail. Deliberately free of @nestjs/*
// imports and decorators so its tests can run on the Dev VM, where
// node_modules is empty and jest cannot start. Keep it that way.

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

export type AuditActor = {
  userId: string | null;
  username: string | null;
  role: string | null;
  branchId: string | null;
};

const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

// ADR-019 §6. ingestion_records already stores every ingested order in full;
// /auth/refresh fires every ~15 min per client and records only that a
// session stayed alive.
const EXCLUDED_PREFIXES = ['/api/v1/ingest'];
const EXCLUDED_EXACT = ['/api/v1/auth/refresh'];

const SECRET_KEY = /password|secret|token|otp|authorization/i;
const REDACTED = '[REDACTED]';
const MAX_PAYLOAD_BYTES = 8 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 8+ hex covers both 24-char external ids and the 8-char uppercase
// externalId minted by TiffinBDAdapter. No route segment in this API is
// spelled entirely from [0-9a-f], so this cannot swallow a real path word.
const HEX = /^[0-9a-f]{8,}$/i;
const DIGITS = /^\d+$/;

function stripQuery(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

export function shouldAudit(method: string, path: string): boolean {
  if (!MUTATING_METHODS.includes(method.toUpperCase())) return false;

  const clean = stripQuery(path);
  if (EXCLUDED_EXACT.includes(clean)) return false;

  return !EXCLUDED_PREFIXES.some(
    (prefix) => clean === prefix || clean.startsWith(prefix + '/'),
  );
}

function isIdSegment(segment: string): boolean {
  return UUID.test(segment) || HEX.test(segment) || DIGITS.test(segment);
}

// Names a route that carries no @Audit decorator. An ugly-but-present action
// name beats a silent gap in the trail (ADR-019 §3).
export function deriveAction(method: string, path: string): string {
  const segments = stripQuery(path)
    .split('/')
    .filter(Boolean)
    .filter((s) => s !== 'api' && s !== 'v1')
    .filter((s) => !isIdSegment(s));

  if (segments.length === 0) return method.toUpperCase();

  return segments.map((s) => s.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()).join('_');
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? REDACTED : redact(inner);
    }
    return out;
  }

  return value;
}

export function sanitizePayload(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  if (Object.keys(body as Record<string, unknown>).length === 0) return null;

  const cleaned = redact(body) as Record<string, unknown>;
  const serialized = JSON.stringify(cleaned);

  if (serialized.length > MAX_PAYLOAD_BYTES) {
    return {
      _truncated: true,
      _bytes: serialized.length,
      _preview: serialized.slice(0, MAX_PAYLOAD_BYTES),
    };
  }

  return cleaned;
}

export function resolveEntityId(
  params: Record<string, string> | undefined,
  responseBody: unknown,
): string | null {
  const fromParam = params?.id;
  if (typeof fromParam === 'string' && fromParam.length > 0) return fromParam;

  if (responseBody !== null && typeof responseBody === 'object') {
    const id = (responseBody as Record<string, unknown>).id;
    if (typeof id === 'string' && id.length > 0) return id;
    if (typeof id === 'number') return String(id);
  }

  return null;
}

// req.user is a JwtPayload on every guarded route, but POST /auth/login is
// @Public + LocalAuthGuard, which leaves the User entity there instead
// (id/branch_id rather than sub/branchId). Both shapes are handled so a login
// is attributable; the body fallback covers a failed login, where no user was
// ever resolved.
export function resolveActor(
  user: unknown,
  sanitizedBody: Record<string, unknown> | null,
): AuditActor {
  const bodyUsername = sanitizedBody?.username;
  const fallbackUsername = typeof bodyUsername === 'string' ? bodyUsername : null;

  if (user === null || typeof user !== 'object') {
    return { userId: null, username: fallbackUsername, role: null, branchId: null };
  }

  const u = user as Record<string, unknown>;
  const userId = typeof u.sub === 'string' ? u.sub : typeof u.id === 'string' ? u.id : null;
  const username = typeof u.username === 'string' ? u.username : fallbackUsername;
  const role = typeof u.role === 'string' ? u.role : null;
  const branchId =
    typeof u.branchId === 'string'
      ? u.branchId
      : typeof u.branch_id === 'string'
        ? u.branch_id
        : null;

  return { userId, username, role, branchId };
}

export function outcomeFor(statusCode: number): AuditOutcome {
  return statusCode < 400 ? 'SUCCESS' : 'FAILURE';
}
