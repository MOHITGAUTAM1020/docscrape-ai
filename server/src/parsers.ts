import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import bmp from 'bmp-js';
import { createWorker, PSM } from 'tesseract.js';
import { fileTypeFromFile } from 'file-type';
import { parse } from 'csv-parse/sync';
import yauzl from 'yauzl';
import { config } from './config.js';
import type { Sheet, SourceLayout } from './types.js';
import { cleanOcrText } from './structure.js';
const run = promisify(execFile);
export const extensions = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'csv',
  'txt',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'tif',
  'tiff',
  'bmp',
  'avif',
];
const imageExt = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif']);
const textExt = new Set(['csv', 'txt']);
async function inspectZip(file: string, expected: string) {
  await new Promise<void>((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new Error('Invalid Office document.'));
      let total = 0,
        count = 0,
        found = false,
        done = false;
      const fail = (message: string) => {
        if (!done) {
          done = true;
          zip.close();
          reject(new Error(message));
        }
      };
      zip.on('error', () => fail('Invalid Office archive.'));
      zip.on('entry', (entry) => {
        total += entry.uncompressedSize;
        count++;
        if (
          total > 40 * 1024 * 1024 ||
          entry.uncompressedSize > 20 * 1024 * 1024 ||
          count > 2000 ||
          entry.generalPurposeBitFlag & 1
        )
          return fail('Office archive is encrypted or exceeds safe expansion limits.');
        if (entry.fileName === expected) found = true;
        zip.readEntry();
      });
      zip.on('end', () => {
        if (!done) {
          done = true;
          found
            ? resolve()
            : reject(new Error('File content does not match its Office extension.'));
        }
      });
      zip.readEntry();
    });
  });
}
export async function validateUpload(file: string, ext: string) {
  if (!extensions.includes(ext)) throw new Error('Unsupported file format.');
  const stat = await fs.stat(file);
  if (!stat.size) throw new Error('Empty files cannot be processed.');
  if (stat.size > config.maxBytes) throw new Error('File exceeds upload limit.');
  if (textExt.has(ext)) {
    const content = await fs.readFile(file);
    if (content.includes(0) || content.toString('utf8').includes('\uFFFD'))
      throw new Error('Text and CSV uploads must use UTF-8 encoding.');
    return;
  }
  const detected = await fileTypeFromFile(file);
  if (ext === 'docx' || ext === 'xlsx') {
    await inspectZip(file, ext === 'docx' ? 'word/document.xml' : 'xl/workbook.xml');
    return;
  }
  if (ext === 'doc' || ext === 'xls') {
    const buffer = await fs.readFile(file);
    if (
      !buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    )
      throw new Error('Legacy Office file signature is invalid.');
    return;
  }
  const actual = detected?.ext;
  const normalized = (x?: string) => (x === 'jpeg' ? 'jpg' : x === 'tiff' ? 'tif' : x);
  if (normalized(actual) !== normalized(ext))
    throw new Error('File contents do not match its extension.');
}
async function ocr(input: Buffer): Promise<{ text: string; layout: SourceLayout }> {
  const worker = await createWorker(config.ocrLang, 1, {
    cachePath: config.dataDir,
    ...(config.ocrModelDir
      ? { langPath: config.ocrModelDir, gzip: false, cacheMethod: 'none' }
      : {}),
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300' });
    const result = (await worker.recognize(input, {}, { text: true, blocks: true })).data;
    const metadata = await sharp(input).metadata();
    const lines = (result.blocks || [])
      .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
      .slice(0, 3000)
      .map((line) => ({
        text: line.text.trim(),
        confidence: line.confidence,
        bbox: line.bbox,
        words: line.words
          .slice(0, 200)
          .map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })),
      }));
    return {
      text: result.text,
      layout: { width: metadata.width!, height: metadata.height!, lines },
    };
  } finally {
    await worker.terminate();
  }
}
async function imageInput(file: string, ext: string) {
  let input: Buffer = await fs.readFile(file);
  if (ext === 'bmp') {
    // Reject huge BMP dimensions before allocating decoded pixels.
    const w = input.readInt32LE(18),
      h = Math.abs(input.readInt32LE(22));
    if (w < 1 || h < 1 || w * h > 40000000) throw new Error('Image exceeds 40 megapixels.');
    const decoded = bmp.decode(input);
    const rgba = Buffer.alloc(decoded.width * decoded.height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = decoded.data[i + 3];
      rgba[i + 1] = decoded.data[i + 2];
      rgba[i + 2] = decoded.data[i + 1];
      rgba[i + 3] = 255;
    }
    input = await sharp(rgba, {
      raw: { width: decoded.width, height: decoded.height, channels: 4 },
    })
      .png()
      .toBuffer();
  }
  return input;
}
export async function imagePreview(file: string, ext: string) {
  return sharp(await imageInput(file, ext), { limitInputPixels: 40000000 })
    .rotate()
    .resize({ width: 1600, height: 2200, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}
async function imageText(file: string, ext: string) {
  const normalized = await sharp(await imageInput(file, ext), { limitInputPixels: 40000000 })
    .rotate()
    .resize({ width: 2200, height: 3000, fit: 'inside' })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
  return ocr(normalized);
}
async function legacy(file: string, ext: string) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'docscrape-office-'));
  try {
    const target = ext === 'doc' ? 'docx' : 'xlsx';
    const profile = pathToFileURL(path.join(temp, 'profile')).href;
    try {
      await run(
        config.libreoffice,
        [
          `-env:UserInstallation=${profile}`,
          '--headless',
          '--convert-to',
          target,
          '--outdir',
          temp,
          file,
        ],
        { timeout: 45000, maxBuffer: 1024 * 1024 },
      );
    } catch {
      throw new Error(
        'Legacy DOC/XLS needs LibreOffice. Use Docker or convert the file to DOCX/XLSX.',
      );
    }
    const converted = path.join(temp, path.basename(file, path.extname(file)) + '.' + target);
    await validateUpload(converted, target);
    return await parseDocument(converted, target);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
function cellValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value) return cellValue(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
    if ('text' in value) return String(value.text);
    if ('error' in value) return String(value.error);
    return '';
  }
  return String(value);
}
export type Parsed = {
  text: string;
  cleanedText: string;
  layout?: SourceLayout;
  sheets: Sheet[];
  warnings: string[];
};
export async function parseDocument(file: string, ext: string): Promise<Parsed> {
  let text = '';
  let layout: SourceLayout | undefined;
  let imageOcr = false;
  const sheets: Sheet[] = [],
    warnings: string[] = [];
  if (ext === 'doc' || ext === 'xls') return legacy(file, ext);
  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ path: file });
    text = result.value;
    if (result.messages.length)
      warnings.push('Word formatting or embedded content was skipped; extracted text only.');
  } else if (ext === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    for (const sheet of workbook.worksheets.slice(0, 10)) {
      const rows: string[][] = [];
      const maxRow = Math.min(sheet.rowCount, 500);
      for (let r = 1; r <= maxRow; r++) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= Math.min(sheet.columnCount, 50); c++)
          cells.push(cellValue(row.getCell(c).value).slice(0, 2000));
        if (cells.some(Boolean)) rows.push(cells);
      }
      sheets.push({ name: sheet.name, rows });
      if (sheet.rowCount > 500 || sheet.columnCount > 50)
        warnings.push(`Sheet ${sheet.name} limited to 500 rows and 50 columns.`);
    }
    if (workbook.worksheets.length > 10)
      warnings.push('Only the first 10 worksheets are included.');
    text = sheets
      .map((s) => `Sheet: ${s.name}\n${s.rows.map((r) => r.join(' | ')).join('\n')}`)
      .join('\n\n');
  } else if (ext === 'csv') {
    const content = await fs.readFile(file, 'utf8');
    const rows: string[][] = parse(content, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      to: 501,
      max_record_size: 100000,
    });
    if (rows.length > 500) warnings.push('CSV limited to its first 500 rows.');
    sheets.push({
      name: 'CSV',
      rows: rows.slice(0, 500).map((r) => r.slice(0, 50).map((v) => v.slice(0, 2000))),
    });
    text = sheets[0].rows.map((r) => r.join(' | ')).join('\n');
  } else if (ext === 'txt') text = await fs.readFile(file, 'utf8');
  else if (ext === 'pdf') {
    const parser = new PDFParse({
      data: new Uint8Array(await fs.readFile(file)),
      isEvalSupported: false,
    });
    let total = 0;
    try {
      const result = await parser.getText({ first: 10, pageJoiner: '\n\n' });
      text = result.text;
      total = result.total;
    } finally {
      await parser.destroy();
    }
    if (total > 10) warnings.push('Only the first 10 PDF pages are processed.');
    if (text.replace(/\s/g, '').length >= 20)
      warnings.push(
        'PDF extraction uses embedded text. Image-only content inside mixed PDFs may need separate image uploads.',
      );
    if (text.replace(/\s/g, '').length < 20) {
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'docscrape-pdf-'));
      try {
        try {
          await run(
            config.pdftoppm,
            ['-png', '-scale-to', '2200', '-f', '1', '-l', '5', file, path.join(temp, 'page')],
            { timeout: 45000, maxBuffer: 1024 * 1024 },
          );
        } catch {
          throw new Error(
            'Scanned PDF needs Poppler (pdftoppm). Use Docker or upload page images instead.',
          );
        }
        const images = (await fs.readdir(temp)).filter((n) => n.endsWith('.png')).sort();
        text = (await Promise.all(images.map((n) => imageText(path.join(temp, n), 'png'))))
          .map((r) => r.text)
          .join('\n\n');
        warnings.push('Scanned PDF OCR includes up to five pages; verify all recognized text.');
        imageOcr = true;
      } finally {
        await fs.rm(temp, { recursive: true, force: true });
      }
    }
  } else if (imageExt.has(ext)) {
    const recognized = await imageText(file, ext);
    text = recognized.text;
    layout = recognized.layout;
    imageOcr = true;
    warnings.push('OCR may misread small or unclear text. Animated images use their first frame.');
  } else throw new Error('Unsupported file format.');
  if (!text.trim())
    throw new Error('No readable text found. Try a sharper image or a document containing text.');
  if (text.length > 60000) warnings.push('Text truncated to 60,000 characters for extraction.');
  const cleaned = imageOcr ? cleanOcrText(text, layout) : { text, removed: 0 };
  if (cleaned.removed)
    warnings.push(
      `Removed ${cleaned.removed} probable OCR-noise lines from the cleaned view. Original OCR text is preserved.`,
    );
  return {
    text: text.slice(0, 60000),
    cleanedText: cleaned.text.slice(0, 60000),
    layout,
    sheets,
    warnings,
  };
}
