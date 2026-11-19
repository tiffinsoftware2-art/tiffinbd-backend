import { isVatExcluded, parseVatExcludedSources } from './vat-exclusion';

const ALLOWED = [
  'WEBSITE',
  'FOODPANDA',
  'PATHAO',
  'FOODIE',
  'WHATSAPP',
  'PHONE',
  'OTHER',
];

describe('parseVatExcludedSources', () => {
  it('returns [] for null', () => {
    expect(parseVatExcludedSources(null, ALLOWED)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(parseVatExcludedSources(undefined, ALLOWED)).toEqual([]);
  });

  it('returns [] for an empty string', () => {
    expect(parseVatExcludedSources('', ALLOWED)).toEqual([]);
  });

  it('returns [] for an empty JSON array', () => {
    expect(parseVatExcludedSources('[]', ALLOWED)).toEqual([]);
  });

  it('parses a valid array preserving order', () => {
    expect(parseVatExcludedSources('["FOODPANDA","PATHAO"]', ALLOWED)).toEqual([
      'FOODPANDA',
      'PATHAO',
    ]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseVatExcludedSources('{', ALLOWED)).toEqual([]);
    expect(parseVatExcludedSources('not json', ALLOWED)).toEqual([]);
  });

  it('returns [] for valid JSON of the wrong shape', () => {
    expect(parseVatExcludedSources('{"a":1}', ALLOWED)).toEqual([]);
    expect(parseVatExcludedSources('"FOODPANDA"', ALLOWED)).toEqual([]);
    expect(parseVatExcludedSources('null', ALLOWED)).toEqual([]);
    expect(parseVatExcludedSources('42', ALLOWED)).toEqual([]);
  });

  it('drops non-string members', () => {
    expect(parseVatExcludedSources('[1,null,{},"PHONE"]', ALLOWED)).toEqual([
      'PHONE',
    ]);
  });

  it('drops values outside the allowlist', () => {
    expect(
      parseVatExcludedSources('["NOT_A_SOURCE","FOODIE"]', ALLOWED),
    ).toEqual(['FOODIE']);
  });
});

describe('isVatExcluded', () => {
  it('is true when the source is listed', () => {
    expect(isVatExcluded('["FOODPANDA"]', 'FOODPANDA', ALLOWED)).toBe(true);
  });

  it('is false when the source is not listed', () => {
    expect(isVatExcluded('["FOODPANDA"]', 'WHATSAPP', ALLOWED)).toBe(false);
  });

  it('is false when the stored entry was filtered out by the allowlist', () => {
    expect(isVatExcluded('["NOT_A_SOURCE"]', 'NOT_A_SOURCE', ALLOWED)).toBe(
      false,
    );
  });

  it('is false when config is null', () => {
    expect(isVatExcluded(null, 'FOODPANDA', ALLOWED)).toBe(false);
  });
});
