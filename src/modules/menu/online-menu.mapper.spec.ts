import { toCompanyVat } from './online-menu.mapper';

describe('toCompanyVat', () => {
  it('applies the configured rate', () => {
    expect(toCompanyVat(5, false)).toEqual({ percentage: 5, applicable: true });
  });

  it('accepts a decimal string from MySQL', () => {
    expect(toCompanyVat('7.50' as unknown as number, false)).toEqual({
      percentage: 7.5,
      applicable: true,
    });
  });

  it('is off when the rate is 0', () => {
    expect(toCompanyVat(0, false)).toEqual({
      percentage: 0,
      applicable: false,
    });
  });

  it('is off when WEBSITE is a VAT-excluded source', () => {
    expect(toCompanyVat(5, true)).toEqual({ percentage: 5, applicable: false });
  });

  it('treats a bad value as 0', () => {
    expect(toCompanyVat(NaN, false)).toEqual({
      percentage: 0,
      applicable: false,
    });
  });
});
