// Pure pricing math for "add an add-on to an existing order". No database or
// Nest code, so it is unit-tested directly (addon-pricing.util.spec.ts).
//
// Rule: the add-on changes ONLY what it must. Everything already on the order
// stays exactly as it was — the VAT rate snapshot, delivery charge, platform
// fee and a fixed discount are never re-derived or re-read from settings. The
// add-on adds its price to the subtotal, VAT at the order's own existing rate
// (nothing if the order has no VAT), and moves a percentage discount in step.
// Money columns come back from MySQL as strings, hence the Number() coercions.

export interface OrderPricing {
  productSubtotal: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  discountType: 'percentage' | 'fixed' | null;
  discountValue: number | null;
  discountAmount: number | null;
  totalAmount: number;
}

export interface AddonPricingResult {
  productSubtotal: number;
  vatAmount: number | null;
  discountAmount: number | null;
  totalAmount: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param current        the order's stored pricing columns
 * @param itemsSubtotal  sum of the order's existing item lines, used as the
 *                       starting subtotal when `productSubtotal` is null (an
 *                       integrated-platform order that was never edited)
 * @param addonTotal     add-on price × quantity
 */
export function applyAddonToPricing(
  current: OrderPricing,
  itemsSubtotal: number,
  addonTotal: number,
): AddonPricingResult {
  const added = round2(num(addonTotal));
  const vatPercent = num(current.vatPercent);
  const addedVat = round2((added * vatPercent) / 100);
  const addedDiscount =
    current.discountType === 'percentage'
      ? round2((added * num(current.discountValue)) / 100)
      : 0;

  const baseSubtotal = current.productSubtotal === null ? itemsSubtotal : num(current.productSubtotal);

  return {
    productSubtotal: round2(baseSubtotal + added),
    // Stay null when the order never had VAT recorded, so nothing new appears.
    vatAmount: current.vatAmount === null && vatPercent === 0 ? null : round2(num(current.vatAmount) + addedVat),
    discountAmount:
      current.discountAmount === null && addedDiscount === 0
        ? null
        : round2(num(current.discountAmount) + addedDiscount),
    totalAmount: round2(num(current.totalAmount) + added + addedVat - addedDiscount),
  };
}
