import { describe, it, expect } from 'vitest';
import { cleanOcrText, layoutSections, textSections } from '../src/structure.js';
import { localExtract } from '../src/extraction.js';
import { extractionSchema, type SourceLayout, type LayoutLine } from '../src/types.js';
import { csvExport, xlsxExport } from '../src/exports.js';
import { sampleDocuments } from '../src/samples.js';
import ExcelJS from 'exceljs';
function line(text: string, x: number, y: number, h = 20, confidence = 95): LayoutLine {
  let cursor = x;
  const words = text.split(' ').map((t) => {
    const w = {
      text: t,
      confidence,
      bbox: { x0: cursor, y0: y, x1: cursor + t.length * 7, y1: y + h },
    };
    cursor = w.bbox.x1 + 7;
    return w;
  });
  return { text, confidence, bbox: { x0: x, y0: y, x1: cursor - 7, y1: y + h }, words };
}
function poster(): SourceLayout {
  return {
    width: 1000,
    height: 700,
    lines: [
      line('Morning Routine', 380, 10, 38),
      line('2. Stretch', 360, 110),
      line('1. Breathe', 20, 115),
      line('3. Walk', 750, 115),
      line('Movement Series', 390, 190, 38),
      line('1. Balance', 20, 300),
      line('2. Reach', 750, 300),
      line('Relaxation', 780, 370, 38),
      line('3. Balance', 20, 460),
      line('1. Rest', 700, 460),
      line('2. Unwind', 870, 460),
      line('Meditation', 400, 540, 38),
      line('1. Sit', 20, 640),
      line('2. Breathe', 700, 640),
    ],
  };
}
describe('layout-aware sections', () => {
  it('separates a right-hand section from an earlier full-width list and sorts numbered labels', () => {
    const sections = layoutSections(poster());
    expect(sections.map((s) => s.items.length)).toEqual([3, 3, 2, 2]);
    expect(sections[0].items.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(sections[1].items[2].text).toBe('Balance');
    expect(sections[2].name).toBe('Relaxation');
    expect(sections[1].items.filter((i) => i.text === 'Balance')).toHaveLength(2);
  });
  it('joins wrapped names, preserves exact spelling and flags low-confidence words', () => {
    const data = poster();
    data.lines.push(line('with support', 360, 134, 20, 60));
    const sections = layoutSections(data);
    const item = sections[0].items.find((i) => i.number === 2)!;
    expect(item.text).toBe('Stretch with support');
    expect(item.evidence).toContain('\nwith support');
    expect(item.needsReview).toBe(true);
  });
  it('does not fabricate a dictionary correction or a duplicate-free list', () => {
    const sections = textSections('Exercises\n1. Mispeled label\n2. Mispeled label\n');
    expect(sections[0].items.map((i) => i.text)).toEqual(['Mispeled label', 'Mispeled label']);
    expect(sections[0].items.every((i) => i.needsReview)).toBe(true);
  });
  it('handles bulleted guides without inventing item numbers', () => {
    const sections = textSections('Preparation\n• Bring water\n- Wear comfortable clothes\n');
    expect(sections[0].items.map((i) => i.number)).toEqual([null, null]);
    expect(sections[0].items[1].text).toBe('Wear comfortable clothes');
  });
  it('cleans symbol fragments without changing dates, short labels or currency values', () => {
    const text = 'Workout guide\ni ,\nJ < /\nE —\nID: 7\nDate: 2026-10-13\n₹ 620\nHala Adanan';
    const clean = cleanOcrText(text);
    expect(clean.removed).toBe(3);
    expect(clean.text).toContain('ID: 7');
    expect(clean.text).toContain('₹ 620');
    expect(clean.text).toContain('Hala Adanan');
    expect(text).toContain('J < /');
  });
  it('produces a readable summary and no meaningless excerpt when sections exist', () => {
    const layout = poster();
    const result = localExtract(layout.lines.map((l) => l.text).join('\n'), false, layout);
    expect(result.documentType).toBe('poster');
    expect(result.summary).toContain('10 listed items across 4 sections');
    expect(result.fields).toHaveLength(0);
  });
  it('keeps invoice extraction unchanged and reads old results with default sections', () => {
    const invoice = localExtract('INVOICE\nVendor: Studio\nTotal: 100');
    expect(invoice.documentType).toBe('invoice');
    expect(invoice.sections).toEqual([]);
    const { sections: _s, title: _t, ...old } = invoice;
    expect(extractionSchema.parse(old).sections).toEqual([]);
  });
  it('groups explicit job-description headings without inventing requirements', () => {
    const result = localExtract(
      [
        'Job Description: Full Stack Support Developer',
        'Overview',
        'Support production applications.',
        'Responsibilities',
        'Production Support: Diagnose live issues.',
        'Minimum Requirements',
        'Minimum of 2 years of professional experience.',
        'Shift Requirements',
        'Ability to work a 10:00 PM to 7:00 AM IST shift.',
      ].join('\n'),
      false,
      undefined,
      'job_description',
    );
    expect(result.documentType).toBe('job_description');
    expect(result.title).toBe('Full Stack Support Developer');
    expect(result.sections.map((section) => section.name)).toEqual([
      'Overview',
      'Responsibilities',
      'Minimum Requirements',
      'Shift Requirements',
    ]);
    expect(
      result.fields.find((field) => field.key === 'Experience requirement')?.evidence,
    ).toContain('2 years');
    expect(result.fields.find((field) => field.key === 'Shift requirement')?.value).toContain(
      '10:00 PM',
    );
  });
  it('prioritizes foreground alerts in screenshot mode', () => {
    const result = localExtract(
      'Episodes (8)\nDownload error\nDevice limit reached for Prime Lite.\nManage your devices in Settings.\nOK\nHome',
      false,
      undefined,
      'screenshot',
    );
    expect(result.documentType).toBe('screenshot');
    expect(result.title).toBe('Download error');
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'Alert message',
          value: expect.stringContaining('Device limit'),
        }),
        expect.objectContaining({ key: 'Primary action', value: 'OK' }),
      ]),
    );
  });
  it('exports section names, source evidence and review flags in CSV and Excel', async () => {
    const doc = sampleDocuments('test')[0];
    doc.extraction = localExtract('Materials\n1. =HYPERLINK("bad") label\n2. Water', false);
    const csv = csvExport(doc);
    expect(csv).toContain('Section');
    expect(csv).toContain('Materials');
    expect(csv).toContain("'=HYPERLINK");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await xlsxExport(doc));
    const sheet = book.getWorksheet('Sections and items')!;
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getCell('A2').value).toBe('Materials');
    expect(sheet.getCell('E2').value).toBe('Yes');
  });
});
