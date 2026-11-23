import { Readable } from 'stream';
import ExcelJS from 'exceljs';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

// One sheet row, read and checked. `errors` is empty for a usable row.
export interface ParsedRow {
  row: number; // the row number in the sheet (header is row 1)
  name: string;
  price?: number;
  category: string;
  description: string;
  serial?: number;
  images: string[];
  popular?: boolean;
  available?: boolean;
  errors: string[];
}

type Field = 'name' | 'price' | 'category' | 'description' | 'serial' | 'image' | 'popular' | 'available';

// Header names accepted for each column, lower-cased. Extra spaces and case
// do not matter.
const HEADERS: Record<Field, string[]> = {
  name: ['name', 'item', 'item name', 'dish', 'dish name'],
  price: ['price', 'price (tk)', 'price tk', 'tk', 'rate'],
  category: ['category'],
  description: ['description', 'desc'],
  serial: ['serial', 'serial (sort order)', 'sort', 'sort order', 'order'],
  image: ['image', 'image url', 'image urls', 'images', 'photo'],
  popular: ['popular', 'is popular'],
  available: ['available', 'active', 'is active', 'availability'],
};

// ExcelJS cell values can be plain, rich text, a formula result or a link.
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  const v = value as unknown as Record<string, unknown>;
  if (Array.isArray(v.richText)) {
    return (v.richText as { text: string }[]).map((t) => t.text).join('').trim();
  }
  if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
  if (typeof v.text === 'string') return v.text.trim();
  if (typeof v.hyperlink === 'string') return v.hyperlink.trim();
  return '';
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[,৳\s]|tk/gi, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

// yes/no style cell. Blank means "not given" (leave unchanged).
function parseBool(text: string): boolean | undefined | 'invalid' {
  const t = text.trim().toLowerCase();
  if (t === '') return undefined;
  if (['yes', 'y', 'true', '1', 'available', 'active'].includes(t)) return true;
  if (['no', 'n', 'false', '0', 'unavailable', 'inactive'].includes(t)) return false;
  return 'invalid';
}

export async function readWorkbook(buffer: Buffer, filename: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  }
  const sheet = workbook.worksheets.find((s) => s.rowCount > 0);
  if (!sheet) throw new Error('The file has no data');
  return sheet;
}

export function parseSheet(sheet: ExcelJS.Worksheet): { rows: ParsedRow[]; problem?: string } {
  // Which column holds which field, from the header row.
  const columns = new Map<Field, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = cellText(cell.value).toLowerCase().replace(/\s+/g, ' ');
    for (const field of Object.keys(HEADERS) as Field[]) {
      if (!columns.has(field) && HEADERS[field].includes(header)) columns.set(field, col);
    }
  });
  if (!columns.has('name') || !columns.has('price')) {
    return {
      rows: [],
      problem: 'The first row must have the headings "Name" and "Price". Download the template to see the layout.',
    };
  }

  const get = (row: ExcelJS.Row, field: Field): string => {
    const col = columns.get(field);
    return col ? cellText(row.getCell(col).value) : '';
  };

  const rows: ParsedRow[] = [];
  const firstSeen = new Map<string, number>();
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = get(row, 'name');
    const priceText = get(row, 'price');
    const category = get(row, 'category');
    const description = get(row, 'description');
    const serialText = get(row, 'serial');
    const imageText = get(row, 'image');
    const popularText = get(row, 'popular');
    const availableText = get(row, 'available');
    // Skip rows that are completely empty.
    if (![name, priceText, category, description, serialText, imageText, popularText, availableText].some(Boolean)) {
      continue;
    }
    if (rows.length >= MAX_IMPORT_ROWS) {
      return { rows, problem: `Too many rows. Import at most ${MAX_IMPORT_ROWS} items at a time.` };
    }

    const errors: string[] = [];
    if (!name) errors.push('Name is missing');
    else if (name.length > 255) errors.push('Name is longer than 255 characters');

    let price: number | undefined;
    if (priceText === '') errors.push('Price is missing');
    else {
      const n = parseNumber(priceText);
      if (n === null || n < 0 || n > 1_000_000) errors.push(`Price "${priceText}" is not a valid amount`);
      else price = Math.round(n * 100) / 100;
    }

    if (category.length > 100) errors.push('Category is longer than 100 characters');

    let serial: number | undefined;
    if (serialText !== '') {
      const n = parseNumber(serialText);
      if (n === null || !Number.isInteger(n)) errors.push(`Serial "${serialText}" must be a whole number`);
      else serial = n;
    }

    const popular = parseBool(popularText);
    if (popular === 'invalid') errors.push(`Popular "${popularText}" should be Yes or No`);
    const available = parseBool(availableText);
    if (available === 'invalid') errors.push(`Available "${availableText}" should be Yes or No`);

    const images = imageText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (images.some((u) => !/^https?:\/\//i.test(u))) errors.push('Image links must start with http:// or https://');

    if (name) {
      const key = name.toLowerCase();
      const first = firstSeen.get(key);
      if (first !== undefined) errors.push(`Same name as row ${first}; each name can appear once`);
      else firstSeen.set(key, r);
    }

    rows.push({
      row: r,
      name,
      price,
      category,
      description,
      serial,
      images,
      popular: popular === 'invalid' ? undefined : popular,
      available: available === 'invalid' ? undefined : available,
      errors,
    });
  }
  return { rows };
}

// The template people download: headings, a few example rows, and a short guide.
export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Menu');
  sheet.columns = [
    { header: 'Name', key: 'name', width: 32 },
    { header: 'Price', key: 'price', width: 10 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Serial', key: 'serial', width: 8 },
    { header: 'Image URL', key: 'image', width: 40 },
    { header: 'Popular', key: 'popular', width: 10 },
    { header: 'Available', key: 'available', width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({ name: 'Chicken Burger', price: 189, category: 'Burgers', description: '1 pc (150 gm)', serial: 10, popular: 'Yes', available: 'Yes' });
  sheet.addRow({ name: 'French Fries', price: 99, category: 'Sides', serial: 20, available: 'Yes' });
  sheet.addRow({ name: 'Cold Coffee', price: 120, category: 'Drinks' });

  const help = wb.addWorksheet('How to use');
  [
    'Fill the "Menu" sheet, one item per row. Keep the headings in row 1.',
    'Required: Name and Price. Everything else is optional.',
    'If an item name already exists in the menu you choose, its price and the other filled-in columns are updated. Blank cells leave that detail unchanged.',
    'Category: for the website menu a new category name is created if it does not exist yet. For platform menus it is just a label.',
    'Description and Image URL apply to the website menu only. Popular is Yes or No (website menu). Available is Yes or No (platform menus).',
    'You see a preview of every change before anything is saved.',
  ].forEach((line) => help.addRow([line]));
  help.getColumn(1).width = 110;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
