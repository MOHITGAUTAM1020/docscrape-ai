import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import bmp from 'bmp-js';
import { parseDocument, validateUpload } from '../src/parsers.js';
const file = path.resolve('../samples/generated/sample-invoice.png');
await fs.access(file);
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docscrape-ocr-'));
try {
  for (const ext of ['png', 'jpeg', 'webp', 'gif', 'tiff', 'avif', 'bmp'] as const) {
    const output = path.join(dir, `invoice.${ext}`);
    if (ext === 'bmp') {
      const { data, info } = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const abgr = Buffer.alloc(data.length);
      for (let i = 0; i < data.length; i += 4) {
        abgr[i] = 255;
        abgr[i + 1] = data[i + 2];
        abgr[i + 2] = data[i + 1];
        abgr[i + 3] = data[i];
      }
      await fs.writeFile(
        output,
        bmp.encode({ data: abgr, width: info.width, height: info.height }).data,
      );
    } else await sharp(file).toFormat(ext).toFile(output);
    await validateUpload(output, ext);
    const parsed = await parseDocument(output, ext);
    if (!parsed.text.includes('NS-2026-1042') || !parsed.text.includes('49560'))
      throw new Error(`${ext.toUpperCase()} OCR missed key invoice values.`);
    console.log(`${ext.toUpperCase()} OCR passed: invoice number and total recognized.`);
  }
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
