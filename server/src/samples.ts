import { randomUUID } from 'node:crypto';
import { localExtract } from './extraction.js';
import type { DocumentRecord } from './types.js';
export const sampleInvoice = `INVOICE\nVendor: Northstar Design Studio\nInvoice number: NS-2026-1042\nInvoice date: 2026-10-08\nDue date: 2026-10-22\nBill to: Meridian Labs\nCurrency: INR\nSubtotal: 42000\nTax: 7560\nTotal: 49560\n\nDescription | Quantity | Unit price | Amount\nBrand identity design | 1 | 24000 | 24000\nLanding page development | 1 | 18000 | 18000\n\nPayment terms: Net 14 days`;
export function sampleDocuments(userId: string): DocumentRecord[] {
  const sources = [
    { name: 'Northstar_invoice.txt', ext: 'txt', text: sampleInvoice, reviewed: true },
    {
      name: 'October_expenses.csv',
      ext: 'csv',
      text: 'Category | Quantity | Unit price | Amount\nCloud hosting | 1 | 2400 | 2400\nDesign tools | 2 | 900 | 1800\nOffice supplies | 3 | 350 | 1050',
      reviewed: false,
    },
    {
      name: 'Project_brief.txt',
      ext: 'txt',
      text: 'Project: Meridian customer portal\nClient: Meridian Labs\nOwner: Alex Morgan\nDeadline: 2026-11-15\nBudget: INR 120000\nDeliverables: Responsive dashboard, authentication, reporting\nNotes: Weekly progress updates every Friday.',
      reviewed: false,
    },
    {
      name: 'Cafe_receipt.txt',
      ext: 'txt',
      text: 'RECEIPT\nVendor: Paper & Pour Cafe\nReceipt number: PP-0821\nDate: 2026-10-11\nCurrency: INR\nTotal: 620\nCappuccino | 2 | 180 | 360\nSandwich | 1 | 260 | 260',
      reviewed: true,
    },
  ];
  return sources.map((s, i) => {
    const date = new Date(Date.now() - (3 - i) * 86400000).toISOString();
    const sheet = s.ext === 'csv';
    return {
      id: randomUUID(),
      userId,
      name: s.name,
      extension: s.ext,
      size: Buffer.byteLength(s.text),
      path: null,
      status: s.reviewed ? 'reviewed' : 'ready',
      stage: s.reviewed ? 'Verified by you' : 'Ready for review',
      createdAt: date,
      updatedAt: date,
      processingMs: null,
      sourceText: s.text,
      sheets: sheet
        ? [{ name: 'Expenses', rows: s.text.split('\n').map((r) => r.split(' | ')) }]
        : [],
      extraction: localExtract(s.text, sheet),
      provider: 'local',
      error: null,
      version: 1,
      sample: true,
      profile: 'auto',
    };
  });
}
