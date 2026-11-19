// Pure, dependency-free VAT-exclusion rule. Imports nothing — not NestJS, not
// the OrderSource enum (enums are not erasable TS syntax) — so this module can
// be executed directly on the Dev VM under Node's native type stripping, where
// node_modules is empty and jest is unavailable. The caller supplies the
// allowlist. See ADR-005 Addendum 6, decision 8.

export function parseVatExcludedSources(
  raw: string | null | undefined,
  allowed: readonly string[],
): string[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (v): v is string => typeof v === 'string' && allowed.includes(v),
  );
}

export function isVatExcluded(
  raw: string | null | undefined,
  source: string,
  allowed: readonly string[],
): boolean {
  return parseVatExcludedSources(raw, allowed).includes(source);
}
