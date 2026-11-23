import type { MenuItem } from './entities/menu-item.entity';
import { detectImageMime } from './menu-image.util';
import { toFoodItem } from './online-menu.mapper';

describe('detectImageMime', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', () => {
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(
      detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe('image/png');
    expect(detectImageMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('rejects anything else, whatever it is called', () => {
    expect(detectImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageMime(Buffer.from('GIF89a......'))).toBeNull();
    expect(detectImageMime(Buffer.from('MZ\x90\x00 an executable'))).toBeNull();
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('toFoodItem image override', () => {
  const base = {
    id: 'item-uuid',
    external_id: 'ext1',
    name: 'Burger',
    price: 100,
    images: ['https://old.example/burger.jpg'],
    category: null,
    description: null,
    sc_inclusive: false,
    vat_inclusive: false,
    is_popular: false,
  } as unknown as MenuItem;

  it('keeps the image links when nothing was uploaded', () => {
    expect(toFoodItem(base, 'https://api.example.com').images).toEqual([
      'https://old.example/burger.jpg',
    ]);
  });

  it('uses the uploaded photo instead of the links, with a version for caching', () => {
    const item = { ...base, uploaded_image_version: 1700000000000 } as MenuItem;
    expect(toFoodItem(item, 'https://api.example.com').images).toEqual([
      'https://api.example.com/api/v1/menu-images/item-uuid?v=1700000000000',
    ]);
  });

  it('falls back to the links when no public address is known', () => {
    const item = { ...base, uploaded_image_version: 1 } as MenuItem;
    expect(toFoodItem(item).images).toEqual(['https://old.example/burger.jpg']);
  });
});
