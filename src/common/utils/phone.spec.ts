import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('gives every way of writing a Bangladeshi mobile number the same key', () => {
    for (const raw of ['01712345678', '+8801712345678', '8801712345678', '+880 1712-345678', '00 880 1712 345678', '1712345678', ' 01712 345 678 ']) {
      expect(normalizePhone(raw)).toBe('01712345678');
    }
  });

  it('returns blank for missing values and keeps other numbers as digits', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('09647606070')).toBe('09647606070');
    expect(normalizePhone('017')).toBe('017');
  });
});
