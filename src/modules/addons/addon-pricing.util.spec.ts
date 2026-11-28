import { applyAddonToPricing, OrderPricing } from './addon-pricing.util';

const base: OrderPricing = {
  productSubtotal: 200,
  vatPercent: null,
  vatAmount: null,
  discountType: null,
  discountValue: null,
  discountAmount: null,
  totalAmount: 200,
};

describe('applyAddonToPricing', () => {
  it('adds the add-on price when the order has no VAT or discount', () => {
    expect(applyAddonToPricing(base, 200, 30)).toEqual({
      productSubtotal: 230,
      vatAmount: null,
      discountAmount: null,
      totalAmount: 230,
    });
  });

  it('adds VAT at the order\'s own rate', () => {
    const r = applyAddonToPricing(
      { ...base, vatPercent: 10, vatAmount: 20, totalAmount: 220 },
      200,
      50,
    );
    expect(r).toEqual({ productSubtotal: 250, vatAmount: 25, discountAmount: null, totalAmount: 275 });
  });

  it('moves a percentage discount in step with the add-on', () => {
    const r = applyAddonToPricing(
      { ...base, discountType: 'percentage', discountValue: 10, discountAmount: 20, totalAmount: 180 },
      200,
      100,
    );
    expect(r).toEqual({ productSubtotal: 300, vatAmount: null, discountAmount: 30, totalAmount: 270 });
  });

  it('leaves a fixed discount unchanged', () => {
    const r = applyAddonToPricing(
      { ...base, discountType: 'fixed', discountValue: 20, discountAmount: 20, totalAmount: 180 },
      200,
      40,
    );
    expect(r).toEqual({ productSubtotal: 240, vatAmount: null, discountAmount: 20, totalAmount: 220 });
  });

  it('starts from the item lines when productSubtotal was never stored', () => {
    const r = applyAddonToPricing({ ...base, productSubtotal: null, totalAmount: 250 }, 220, 30);
    expect(r.productSubtotal).toBe(250);
    expect(r.totalAmount).toBe(280);
  });

  it('copes with money columns that arrive as strings from MySQL', () => {
    const r = applyAddonToPricing(
      { ...base, productSubtotal: '200.00' as unknown as number, totalAmount: '200.00' as unknown as number },
      200,
      15.5,
    );
    expect(r.productSubtotal).toBe(215.5);
    expect(r.totalAmount).toBe(215.5);
  });
});
