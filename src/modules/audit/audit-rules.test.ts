import {
  deriveAction,
  outcomeFor,
  resolveActor,
  resolveEntityId,
  sanitizePayload,
  shouldAudit,
} from './audit-rules';

describe('shouldAudit', () => {
  it('audits mutating methods', () => {
    expect(shouldAudit('POST', '/api/v1/users')).toBe(true);
    expect(shouldAudit('PATCH', '/api/v1/orders/abc/accept')).toBe(true);
    expect(shouldAudit('PUT', '/api/v1/settings/escalation')).toBe(true);
    expect(shouldAudit('DELETE', '/api/v1/devices/token')).toBe(true);
  });

  it('ignores reads', () => {
    expect(shouldAudit('GET', '/api/v1/orders')).toBe(false);
    expect(shouldAudit('OPTIONS', '/api/v1/orders')).toBe(false);
  });

  it('is case-insensitive on the method', () => {
    expect(shouldAudit('post', '/api/v1/users')).toBe(true);
  });

  it('excludes ingestion — ingestion_records already records those', () => {
    expect(shouldAudit('POST', '/api/v1/ingest/website')).toBe(false);
    expect(shouldAudit('POST', '/api/v1/ingest')).toBe(false);
  });

  it('excludes token refresh — high volume, no information', () => {
    expect(shouldAudit('POST', '/api/v1/auth/refresh')).toBe(false);
  });

  it('does not treat a prefix match as an exclusion', () => {
    expect(shouldAudit('POST', '/api/v1/ingestion-report')).toBe(true);
  });

  it('ignores a query string when matching exclusions', () => {
    expect(shouldAudit('POST', '/api/v1/auth/refresh?x=1')).toBe(false);
  });
});

describe('deriveAction', () => {
  it('names an undecorated route from its path', () => {
    expect(deriveAction('PATCH', '/api/v1/orders/8f3a2b1c/settle')).toBe('ORDERS_SETTLE');
  });

  it('strips uuid segments', () => {
    expect(
      deriveAction('PATCH', '/api/v1/users/3f2504e0-4f89-11d3-9a0c-0305e82c3301/password'),
    ).toBe('USERS_PASSWORD');
  });

  it('strips numeric and hex ids', () => {
    expect(deriveAction('DELETE', '/api/v1/branches/42')).toBe('BRANCHES');
    // 24-char external id
    expect(deriveAction('POST', '/api/v1/menu/507f1f77bcf86cd799439011/sync')).toBe('MENU_SYNC');
    // 8-char externalId, the shape TiffinBDAdapter mints
    expect(deriveAction('PATCH', '/api/v1/orders/8F3A2B1C/settle')).toBe('ORDERS_SETTLE');
  });

  it('keeps route words that happen to be short or hex-ish', () => {
    expect(deriveAction('POST', '/api/v1/orders/abc/accept')).toBe('ORDERS_ABC_ACCEPT');
    expect(deriveAction('PATCH', '/api/v1/orders/x/unarchive')).toBe('ORDERS_X_UNARCHIVE');
  });

  it('falls back to the method when every segment is an id', () => {
    expect(deriveAction('DELETE', '/api/v1/42')).toBe('DELETE');
  });

  it('ignores a query string', () => {
    expect(deriveAction('POST', '/api/v1/branches/sync?force=1')).toBe('BRANCHES_SYNC');
  });
});

describe('sanitizePayload', () => {
  it('redacts secret-bearing keys at the top level', () => {
    expect(sanitizePayload({ username: 'rahim', password: 'hunter2' })).toEqual({
      username: 'rahim',
      password: '[REDACTED]',
    });
  });

  it('redacts nested and array-nested secrets', () => {
    expect(
      sanitizePayload({
        user: { name: 'x', currentPassword: 'a', newPassword: 'b' },
        devices: [{ fcmToken: 'abc' }, { fcmToken: 'def' }],
      }),
    ).toEqual({
      user: { name: 'x', currentPassword: '[REDACTED]', newPassword: '[REDACTED]' },
      devices: [{ fcmToken: '[REDACTED]' }, { fcmToken: '[REDACTED]' }],
    });
  });

  it('matches the secret pattern case-insensitively', () => {
    expect(sanitizePayload({ Authorization: 'Bearer x', OTP: '123' })).toEqual({
      Authorization: '[REDACTED]',
      OTP: '[REDACTED]',
    });
  });

  it('returns null for an empty or non-object body', () => {
    expect(sanitizePayload({})).toBeNull();
    expect(sanitizePayload(null)).toBeNull();
    expect(sanitizePayload(undefined)).toBeNull();
    expect(sanitizePayload('text')).toBeNull();
    expect(sanitizePayload([1, 2])).toBeNull();
  });

  it('truncates a body over 8KB instead of storing it', () => {
    const big = { note: 'x'.repeat(9000) };
    const out = sanitizePayload(big);
    expect(out).not.toBeNull();
    expect(out!._truncated).toBe(true);
    expect(typeof out!._bytes).toBe('number');
    expect((out!._preview as string).length).toBe(8 * 1024);
  });

  it('does not mutate the caller’s object', () => {
    const body = { password: 'hunter2' };
    sanitizePayload(body);
    expect(body.password).toBe('hunter2');
  });
});

describe('resolveEntityId', () => {
  it('prefers the route param', () => {
    expect(resolveEntityId({ id: 'abc' }, { id: 'zzz' })).toBe('abc');
  });

  it('falls back to the created record id', () => {
    expect(resolveEntityId({}, { id: 'zzz' })).toBe('zzz');
    expect(resolveEntityId(undefined, { id: 7 })).toBe('7');
  });

  it('is null when neither is present', () => {
    expect(resolveEntityId({}, { ok: true })).toBeNull();
    expect(resolveEntityId(undefined, undefined)).toBeNull();
    expect(resolveEntityId({}, 'not an object')).toBeNull();
  });
});

describe('resolveActor', () => {
  it('reads a JwtPayload', () => {
    expect(
      resolveActor({ sub: 'u1', username: 'mozahad', role: 'ADMIN', branchId: 'b1' }, null),
    ).toEqual({ userId: 'u1', username: 'mozahad', role: 'ADMIN', branchId: 'b1' });
  });

  it('reads a User entity — the shape LocalAuthGuard leaves on POST /auth/login', () => {
    expect(
      resolveActor({ id: 'u2', username: 'rahim', role: 'STAFF', branch_id: 'b2' }, null),
    ).toEqual({ userId: 'u2', username: 'rahim', role: 'STAFF', branchId: 'b2' });
  });

  it('falls back to the submitted username when there is no authenticated user', () => {
    expect(resolveActor(undefined, { username: 'someone' })).toEqual({
      userId: null,
      username: 'someone',
      role: null,
      branchId: null,
    });
  });

  it('is fully null when nothing identifies the actor', () => {
    expect(resolveActor(undefined, null)).toEqual({
      userId: null,
      username: null,
      role: null,
      branchId: null,
    });
  });
});

describe('outcomeFor', () => {
  it('treats 2xx and 3xx as success', () => {
    expect(outcomeFor(200)).toBe('SUCCESS');
    expect(outcomeFor(202)).toBe('SUCCESS');
    expect(outcomeFor(302)).toBe('SUCCESS');
  });

  it('treats 4xx and 5xx as failure', () => {
    expect(outcomeFor(403)).toBe('FAILURE');
    expect(outcomeFor(500)).toBe('FAILURE');
  });
});
