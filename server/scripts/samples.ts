import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph } from 'docx';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { sampleInvoice } from '../src/samples.js';
const folder = path.resolve('../samples/generated');
await fs.mkdir(folder, { recursive: true });
await fs.writeFile(path.join(folder, 'sample-invoice.txt'), sampleInvoice);
await fs.writeFile(
  path.join(folder, 'sample-expenses.csv'),
  'Category,Quantity,Unit price,Amount\nCloud hosting,1,2400,2400\nDesign tools,2,900,1800\nOffice supplies,3,350,1050\n',
);
const book = new ExcelJS.Workbook();
const sheet = book.addWorksheet('Expenses');
sheet.addRows([
  ['Category', 'Quantity', 'Unit price', 'Amount'],
  ['Cloud hosting', 1, 2400, 2400],
  ['Design tools', 2, 900, 1800],
]);
book.addWorksheet('Metadata').addRows([
  ['Owner', 'Mohit Gautam'],
  ['Currency', 'INR'],
]);
await book.xlsx.writeFile(path.join(folder, 'sample-expenses.xlsx'));
await fs.writeFile(
  path.join(folder, 'sample-invoice.docx'),
  await Packer.toBuffer(
    new Document({
      sections: [{ children: sampleInvoice.split('\n').map((line) => new Paragraph(line)) }],
    }),
  ),
);
const pdf = new PDFDocument({ size: 'A4', margin: 60 });
const chunks: Buffer[] = [];
pdf.on('data', (c) => chunks.push(c));
const ended = new Promise<void>((resolve) => pdf.on('end', resolve));
pdf.font('Helvetica').fontSize(13).text(sampleInvoice);
pdf.end();
await ended;
await fs.writeFile(path.join(folder, 'sample-invoice.pdf'), Buffer.concat(chunks));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="900"><rect width="100%" height="100%" fill="white"/><g fill="#151515" font-family="Arial" font-size="32">${sampleInvoice
  .split('\n')
  .map(
    (line, i) =>
      `<text x="65" y="${65 + i * 43}">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`,
  )
  .join('')}</g></svg>`;
await sharp(Buffer.from(svg)).png().toFile(path.join(folder, 'sample-invoice.png'));
await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toFile(path.join(folder, 'sample-invoice.jpg'));
await sharp(Buffer.from(svg))
  .webp({ quality: 95 })
  .toFile(path.join(folder, 'sample-invoice.webp'));
console.log(`Generated TXT, CSV, XLSX, DOCX, PDF, PNG, JPG and WebP samples in ${folder}`);
