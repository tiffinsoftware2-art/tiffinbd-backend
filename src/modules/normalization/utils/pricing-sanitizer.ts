import { DiscountType } from '../../orders/entities/order.entity';

// Ingestion-time pricing fields (deliveryCharge, platformFee, vatAmount, etc.)
// must never block or error an incoming order — see ADR-005 Addendum 4. Any
// value that isn't a valid non-negative finite number is silently treated as
// unset, not rejected.
export function sanitizeNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return num;
}

export function sanitizeDiscountType(value: unknown): DiscountType | undefined {
  if (value === DiscountType.PERCENTAGE || value === DiscountType.FIXED) {
    return value;
  }
  return undefined;
}
