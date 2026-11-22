// The order number printed by Foodpanda, Pathao or Foodi. Only these three
// platforms issue one, so it is ignored for every other source.
const ORDER_ID_SOURCES = ['FOODPANDA', 'PATHAO', 'FOODIE'];

export function acceptsPlatformOrderId(source: unknown): boolean {
  return ORDER_ID_SOURCES.includes(String(source));
}

// Trimmed; blank, or a source that has no platform order number, becomes null.
export function normalisePlatformOrderId(source: unknown, raw: unknown): string | null {
  if (!acceptsPlatformOrderId(source) || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
