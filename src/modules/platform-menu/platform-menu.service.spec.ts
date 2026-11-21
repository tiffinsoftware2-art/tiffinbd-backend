import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PlatformMenuService } from './platform-menu.service';

type Row = {
  id: string;
  platform: string;
  name: string;
  price: number;
  category: string | null;
};

function setup(rows: Row[] = [], websiteItems: unknown[] = []) {
  const repo = {
    find: jest
      .fn()
      .mockImplementation(({ where }: { where?: { platform?: string } }) =>
        Promise.resolve(
          rows.filter((r) => !where?.platform || r.platform === where.platform),
        ),
      ),
    findOneBy: jest
      .fn()
      .mockImplementation((q: Partial<Row>) =>
        Promise.resolve(
          rows.find((r) =>
            Object.entries(q).every(([k, v]) => r[k as keyof Row] === v),
          ) ?? null,
        ),
      ),
    create: jest.fn().mockImplementation((x: unknown) => x),
    save: jest.fn().mockImplementation((x: unknown) => Promise.resolve(x)),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const menu = { findAllItems: jest.fn().mockResolvedValue(websiteItems) };
  return {
    service: new PlatformMenuService(repo as never, menu as never),
    repo,
  };
}

describe('PlatformMenuService', () => {
  it('rejects an unknown platform filter', async () => {
    const { service } = setup();
    await expect(service.findAll('WEBSITE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates an item, trimming the name and blank category', async () => {
    const { service, repo } = setup();
    await service.create({
      platform: 'FOODPANDA',
      name: '  Burger ',
      category: '  ',
      price: 250,
    });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'FOODPANDA',
        name: 'Burger',
        category: null,
        price: 250,
        is_active: true,
      }),
    );
  });

  it('refuses a duplicate name on the same platform', async () => {
    const { service } = setup([
      { id: '1', platform: 'PATHAO', name: 'Burger', price: 1, category: null },
    ]);
    await expect(
      service.create({ platform: 'PATHAO', name: 'Burger', price: 99 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows the same name on a different platform', async () => {
    const { service } = setup([
      { id: '1', platform: 'PATHAO', name: 'Burger', price: 1, category: null },
    ]);
    await expect(
      service.create({ platform: 'FOODIE', name: 'Burger', price: 99 }),
    ).resolves.toBeDefined();
  });

  it('404s when updating or deleting a missing item', async () => {
    const { service } = setup();
    await expect(service.update('nope', { price: 5 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses renaming onto a name that already exists', async () => {
    const { service } = setup([
      { id: '1', platform: 'PATHAO', name: 'Burger', price: 1, category: null },
      { id: '2', platform: 'PATHAO', name: 'Fries', price: 1, category: null },
    ]);
    await expect(
      service.update('2', { name: 'Burger' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('copy-from-website skips names already on the platform and never overwrites', async () => {
    const website = [
      {
        name: 'Burger',
        price: '199.00',
        category: { name: 'Mains' },
        serial: 3,
      },
      { name: 'Fries', price: '99.00', category: null, serial: null },
    ];
    const { service, repo } = setup(
      [
        {
          id: '1',
          platform: 'FOODPANDA',
          name: 'Burger',
          price: 250,
          category: null,
        },
      ],
      website,
    );
    const result = await service.copyFromWebsite('FOODPANDA');
    expect(result).toEqual({ created: 1, skipped: 1 });
    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        platform: 'FOODPANDA',
        name: 'Fries',
        price: 99,
        category: null,
      }),
    ]);
  });

  it('copy-from-website keeps one item when the website menu repeats a name', async () => {
    const website = [
      { name: 'Corn Dog', price: '179.00', category: null, serial: 1 },
      { name: ' Corn Dog ', price: '199.00', category: null, serial: 2 },
      { name: 'Corn Dog', price: '209.00', category: null, serial: 3 },
    ];
    const { service, repo } = setup([], website);
    const result = await service.copyFromWebsite('PATHAO');
    expect(result).toEqual({ created: 1, skipped: 2 });
    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Corn Dog', price: 179 }),
    ]);
  });
});
