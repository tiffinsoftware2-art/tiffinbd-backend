import { randomBytes } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MenuCategory } from '../menu/entities/menu-category.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { PlatformMenuItem } from '../platform-menu/entities/platform-menu-item.entity';
import { PLATFORM_MENU_SOURCES, PlatformMenuSource } from '../platform-menu/platform-menu.constants';
import { MAX_IMPORT_BYTES, ParsedRow, parseSheet, readWorkbook } from './menu-import.parser';

export type ImportAction = 'create' | 'update' | 'unchanged' | 'error';

export interface PlanRow {
  row: number;
  name: string;
  price: number | null;
  category: string;
  action: ImportAction;
  changes: string[]; // what an "update" would change
  errors: string[];
}

export interface ImportResult {
  target: string;
  committed: boolean;
  rows: PlanRow[];
  newCategories: string[];
  summary: { create: number; update: number; unchanged: number; errors: number };
}

const newExternalId = () => randomBytes(12).toString('hex');
const key = (s: string) => s.trim().toLowerCase();
const sameList = (a: string[] | null, b: string[]) => JSON.stringify(a ?? []) === JSON.stringify(b);

interface UploadedFile {
  buffer: Buffer;
  size: number;
  originalname: string;
}

// Imports menu items from an Excel (.xlsx) or .csv file into the website menu
// or one platform's menu. Matching is by item name (ignoring case). Run with
// commit=false for a preview that changes nothing, then commit=true to save.
@Injectable()
export class MenuImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MenuItem) private readonly items: Repository<MenuItem>,
    @InjectRepository(MenuCategory) private readonly categories: Repository<MenuCategory>,
    @InjectRepository(PlatformMenuItem) private readonly platformItems: Repository<PlatformMenuItem>,
  ) {}

  async run(target: string, file: UploadedFile | undefined, commit: boolean): Promise<ImportResult> {
    if (target !== 'WEBSITE' && !(PLATFORM_MENU_SOURCES as readonly string[]).includes(target)) {
      throw new BadRequestException(`target must be WEBSITE or one of: ${PLATFORM_MENU_SOURCES.join(', ')}`);
    }
    if (!file || !file.buffer?.length) throw new BadRequestException('No file was sent');
    if (file.size > MAX_IMPORT_BYTES) throw new BadRequestException('File is too large (max 2 MB)');
    if (!/\.(xlsx|csv)$/i.test(file.originalname)) {
      throw new BadRequestException('Upload an .xlsx or .csv file');
    }
    // .xlsx files are zip archives and always start with "PK".
    if (/\.xlsx$/i.test(file.originalname) && file.buffer.toString('latin1', 0, 2) !== 'PK') {
      throw new BadRequestException('This is not a valid .xlsx file');
    }

    let parsed: { rows: ParsedRow[]; problem?: string };
    try {
      parsed = parseSheet(await readWorkbook(file.buffer, file.originalname));
    } catch {
      throw new BadRequestException('Could not read this file. Use the template and save it as .xlsx or .csv.');
    }
    if (parsed.problem) throw new BadRequestException(parsed.problem);
    if (parsed.rows.length === 0) throw new BadRequestException('The file has no item rows');

    return target === 'WEBSITE'
      ? this.runWebsite(parsed.rows, commit)
      : this.runPlatform(target as PlatformMenuSource, parsed.rows, commit);
  }

  // ── Website menu ──────────────────────────────────────────────────────────

  private async runWebsite(rows: ParsedRow[], commit: boolean): Promise<ImportResult> {
    const [existingItems, existingCats] = await Promise.all([
      this.items.find({ relations: { category: true } }),
      this.categories.find(),
    ]);
    const itemByName = new Map<string, MenuItem>();
    for (const i of existingItems) if (!itemByName.has(key(i.name))) itemByName.set(key(i.name), i);
    const catByName = new Map(existingCats.map((c) => [key(c.name), c]));
    const newCategories = new Set<string>();

    const plan: PlanRow[] = [];
    const work: { row: ParsedRow; existing: MenuItem | null }[] = [];
    for (const r of rows) {
      const base = { row: r.row, name: r.name, price: r.price ?? null, category: r.category };
      if (r.errors.length) {
        plan.push({ ...base, action: 'error', changes: [], errors: r.errors });
        continue;
      }
      if (r.category && !catByName.has(key(r.category))) newCategories.add(r.category);
      const existing = itemByName.get(key(r.name)) ?? null;
      if (!existing) {
        plan.push({ ...base, action: 'create', changes: [], errors: [] });
        work.push({ row: r, existing: null });
        continue;
      }
      const changes: string[] = [];
      if (Number(existing.price) !== r.price) changes.push(`price ${Number(existing.price)} → ${r.price}`);
      if (r.category && existing.category?.name.trim().toLowerCase() !== key(r.category)) changes.push('category');
      if (r.description && (existing.description ?? '').trim() !== r.description) changes.push('description');
      if (r.serial !== undefined && existing.serial !== r.serial) changes.push('serial');
      if (r.images.length && !sameList(existing.images, r.images)) changes.push('image links');
      if (r.popular !== undefined && existing.is_popular !== r.popular) changes.push('popular');
      plan.push({ ...base, action: changes.length ? 'update' : 'unchanged', changes, errors: [] });
      if (changes.length) work.push({ row: r, existing });
    }

    if (commit && work.length) {
      await this.dataSource.transaction(async (m) => {
        const catRepo = m.getRepository(MenuCategory);
        const itemRepo = m.getRepository(MenuItem);
        const cats = new Map(catByName);
        for (const name of newCategories) {
          cats.set(key(name), await catRepo.save(catRepo.create({ external_id: newExternalId(), name, score: 0 })));
        }
        for (const { row: r, existing } of work) {
          const category = r.category ? (cats.get(key(r.category)) ?? null) : undefined;
          if (!existing) {
            await itemRepo.save(
              itemRepo.create({
                external_id: newExternalId(),
                name: r.name,
                price: r.price!,
                description: r.description || null,
                images: r.images.length ? r.images : null,
                is_popular: r.popular ?? false,
                vat_inclusive: false,
                sc_inclusive: false,
                is_never_kot: false,
                is_no_discount: false,
                serial: r.serial ?? null,
                category: category ?? null,
              }),
            );
          } else {
            existing.price = r.price!;
            if (category !== undefined) existing.category = category;
            if (r.description) existing.description = r.description;
            if (r.serial !== undefined) existing.serial = r.serial;
            if (r.images.length) existing.images = r.images;
            if (r.popular !== undefined) existing.is_popular = r.popular;
            await itemRepo.save(existing);
          }
        }
      });
    }
    return this.result('WEBSITE', commit, plan, [...newCategories]);
  }

  // ── Platform menus ────────────────────────────────────────────────────────

  private async runPlatform(
    platform: PlatformMenuSource,
    rows: ParsedRow[],
    commit: boolean,
  ): Promise<ImportResult> {
    const existingItems = await this.platformItems.find({ where: { platform } });
    const itemByName = new Map(existingItems.map((i) => [key(i.name), i]));

    const plan: PlanRow[] = [];
    const work: { row: ParsedRow; existing: PlatformMenuItem | null }[] = [];
    for (const r of rows) {
      const base = { row: r.row, name: r.name, price: r.price ?? null, category: r.category };
      if (r.errors.length) {
        plan.push({ ...base, action: 'error', changes: [], errors: r.errors });
        continue;
      }
      const existing = itemByName.get(key(r.name)) ?? null;
      if (!existing) {
        plan.push({ ...base, action: 'create', changes: [], errors: [] });
        work.push({ row: r, existing: null });
        continue;
      }
      const changes: string[] = [];
      if (Number(existing.price) !== r.price) changes.push(`price ${Number(existing.price)} → ${r.price}`);
      if (r.category && (existing.category ?? '').trim().toLowerCase() !== key(r.category)) changes.push('category');
      if (r.serial !== undefined && existing.serial !== r.serial) changes.push('serial');
      if (r.available !== undefined && existing.is_active !== r.available) changes.push('available');
      plan.push({ ...base, action: changes.length ? 'update' : 'unchanged', changes, errors: [] });
      if (changes.length) work.push({ row: r, existing });
    }

    if (commit && work.length) {
      await this.dataSource.transaction(async (m) => {
        const repo = m.getRepository(PlatformMenuItem);
        for (const { row: r, existing } of work) {
          if (!existing) {
            await repo.save(
              repo.create({
                platform,
                name: r.name,
                category: r.category || null,
                price: r.price!,
                is_active: r.available ?? true,
                serial: r.serial ?? null,
              }),
            );
          } else {
            existing.price = r.price!;
            if (r.category) existing.category = r.category;
            if (r.serial !== undefined) existing.serial = r.serial;
            if (r.available !== undefined) existing.is_active = r.available;
            await repo.save(existing);
          }
        }
      });
    }
    return this.result(platform, commit, plan, []);
  }

  private result(target: string, committed: boolean, rows: PlanRow[], newCategories: string[]): ImportResult {
    const count = (a: ImportAction) => rows.filter((r) => r.action === a).length;
    return {
      target,
      committed,
      rows,
      newCategories,
      summary: { create: count('create'), update: count('update'), unchanged: count('unchanged'), errors: count('error') },
    };
  }
}
