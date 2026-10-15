import ExcelJS from 'exceljs';
import type { DocumentRecord } from './types.js';
export function safeCell(value: unknown): string {
  const text = String(value ?? '');
  return /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
}
function csvCell(value: unknown) {
  return `"${safeCell(value).replace(/"/g, '""')}"`;
}
export function csvExport(doc: DocumentRecord): string {
  const rows: unknown[][] = [
    ['Field', 'Value', 'Source evidence'],
    ...(doc.extraction?.fields || []).map((f) => [f.key, f.value, f.evidence]),
  ];
  if (doc.extraction?.lineItems.length)
    rows.push(
      [],
      ['Description', 'Quantity', 'Unit price', 'Amount'],
      ...doc.extraction.lineItems.map((i) => [i.description, i.quantity, i.unitPrice, i.amount]),
    );
  if (doc.extraction?.sections?.length)
    rows.push(
      [],
      ['Section', 'Number', 'Item', 'Source evidence', 'Needs review'],
      ...doc.extraction.sections.flatMap((section) =>
        section.items.map((item) => [
          section.name,
          item.number,
          item.text,
          item.evidence,
          item.needsReview ? 'Yes' : 'No',
        ]),
      ),
    );
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
export async function xlsxExport(doc: DocumentRecord) {
  const book = new ExcelJS.Workbook();
  book.creator = 'DocScrape AI';
  const fields = book.addWorksheet('Extracted fields');
  fields.addRow(['Field', 'Value', 'Source evidence']);
  for (const f of doc.extraction?.fields || [])
    fields.addRow([safeCell(f.key), safeCell(f.value), safeCell(f.evidence)]);
  const items = book.addWorksheet('Line items');
  items.addRow(['Description', 'Quantity', 'Unit price', 'Amount']);
  for (const i of doc.extraction?.lineItems || [])
    items.addRow([safeCell(i.description), i.quantity, i.unitPrice, i.amount]);
  if (doc.extraction?.sections?.length) {
    const sections = book.addWorksheet('Sections and items');
    sections.addRow(['Section', 'Number', 'Item', 'Source evidence', 'Needs review']);
    for (const section of doc.extraction.sections)
      for (const item of section.items)
        sections.addRow([
          safeCell(section.name),
          item.number,
          safeCell(item.text),
          safeCell(item.evidence),
          item.needsReview ? 'Yes' : 'No',
        ]);
  }
  for (const [index, source] of doc.sheets.entries()) {
    const s = book.addWorksheet(
      `Source ${index + 1} ${source.name}`.slice(0, 31).replace(/[\\/*?:\[\]]/g, '_'),
    );
    for (const row of source.rows) s.addRow(row.map(safeCell));
  }
  for (const s of book.worksheets) {
    s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6254E8' } };
    s.columns.forEach((c) => {
      c.width = 28;
    });
    s.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return book.xlsx.writeBuffer();
}
