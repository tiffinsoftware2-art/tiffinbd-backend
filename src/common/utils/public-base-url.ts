import type { Request } from 'express';

// Public address of this API as the visitor reached it (behind the reverse
// proxy), used to build links to uploaded images. PUBLIC_BASE_URL, when set
// on the server, wins.
export function publicBaseUrl(req: Request): string {
  const fixed = process.env.PUBLIC_BASE_URL?.trim();
  if (fixed) return fixed.replace(/\/+$/, '');
  const first = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
  const proto = first(req.headers['x-forwarded-proto']) ?? req.protocol;
  const host = first(req.headers['x-forwarded-host']) ?? req.headers.host ?? '';
  return `${proto}://${host}`;
}
