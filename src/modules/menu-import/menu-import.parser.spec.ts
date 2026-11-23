import ExcelJS from 'exceljs';
import { buildTemplate, parseSheet, readWorkbook } from './menu-import.parser';

async function sheetFrom(rows: (string | number | null)[][]): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Menu');
  rows.forEach((r) => ws.addRow(r));
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return readWorkbook(buf, 'menu.xlsx');
}

describe('menu import parser', () => {
  it('reads rows by heading, in any order, and ignores case and spacing', async () => {
    const sheet = await sheetFrom([
      ['PRICE (tk)', '  Item Name ', 'category', 'Available'],
      [189, 'Chicken Burger', 'Burgers', 'Yes'],
      ['1,250', 'Platter', '', 'no'],
    ]);
    const { rows, problem } = parseSheet(sheet);
    expect(problem).toBeUndefined();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ row: 2, name: 'Chicken Burger', price: 189, category: 'Burgers', available: true, errors: [] });
    expect(rows[1]).toMatchObject({ name: 'Platter', price: 1250, available: false, errors: [] });
  });

  it('asks for the Name and Price headings when they are missing', async () => {
    const { rows, problem } = parseSheet(await sheetFrom([['Dish', 'Cost'], ['Tea', 10]]));
    expect(rows).toHaveLength(0);
    expect(problem).toMatch(/"Name" and "Price"/);
  });

  it('flags bad rows with a reason and skips empty rows', async () => {
    const sheet = await sheetFrom([
      ['Name', 'Price', 'Serial', 'Popular'],
      ['Good', 50, 3, 'Yes'],
      [null, null, null, null],
      ['No price', null, null, null],
      ['Bad price', 'abc', null, null],
      ['Negative', -5, null, null],
      ['Bad serial', 10, 1.5, null],
      ['Bad flag', 10, null, 'maybe'],
    ]);
    const { rows } = parseSheet(sheet);
    expect(rows.map((r) => [r.name, r.errors.length > 0])).toEqual([
      ['Good', false],
      ['No price', true],
      ['Bad price', true],
      ['Negative', true],
      ['Bad serial', true],
      ['Bad flag', true],
    ]);
    expect(rows[1].errors[0]).toMatch(/Price is missing/);
  });

  it('marks a repeated name as an error on its second row', async () => {
    const { rows } = parseSheet(await sheetFrom([['Name', 'Price'], ['Tea', 10], ['TEA', 12]]));
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors[0]).toMatch(/Same name as row 2/);
  });

  it('splits several image links and rejects non-links', async () => {
    const { rows } = parseSheet(
      await sheetFrom([['Name', 'Price', 'Image URL'], ['A', 1, 'https://x/a.jpg, https://x/b.jpg'], ['B', 1, 'a.jpg']]),
    );
    expect(rows[0].images).toEqual(['https://x/a.jpg', 'https://x/b.jpg']);
    expect(rows[1].errors[0]).toMatch(/http/);
  });

  it('reads its own downloadable template without errors', async () => {
    const sheet = await readWorkbook(await buildTemplate(), 'template.xlsx');
    const { rows, problem } = parseSheet(sheet);
    expect(problem).toBeUndefined();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
  });
});
