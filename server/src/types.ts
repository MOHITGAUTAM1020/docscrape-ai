import { z } from 'zod';
export const extractionProfileSchema = z.enum([
  'auto',
  'document',
  'poster',
  'screenshot',
  'job_description',
]);
export type ExtractionProfile = z.infer<typeof extractionProfileSchema>;
export const fieldSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(5000),
  evidence: z.string().max(5000),
});
export const itemSchema = z.object({
  description: z.string().max(1000),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
});
export const sectionItemSchema = z.object({
  text: z.string().min(1).max(2000),
  number: z.number().int().min(1).max(10000).nullable(),
  evidence: z.string().max(3000),
  needsReview: z.boolean(),
});
export const sectionSchema = z.object({
  name: z.string().min(1).max(200),
  evidence: z.string().max(3000),
  items: z.array(sectionItemSchema).max(200),
});
export const extractionSchema = z.object({
  documentType: z.enum([
    'invoice',
    'receipt',
    'spreadsheet',
    'poster',
    'screenshot',
    'job_description',
    'general',
  ]),
  title: z.string().max(300).default(''),
  summary: z.string().max(3000),
  fields: z.array(fieldSchema).max(100),
  lineItems: z.array(itemSchema).max(200),
  sections: z.array(sectionSchema).max(30).default([]),
  warnings: z.array(z.string().max(1000)).max(50),
});
export type Extraction = z.infer<typeof extractionSchema>;
export type Sheet = { name: string; rows: string[][] };
export type TextBox = { x0: number; y0: number; x1: number; y1: number };
export type LayoutWord = { text: string; confidence: number; bbox: TextBox };
export type LayoutLine = { text: string; confidence: number; bbox: TextBox; words: LayoutWord[] };
export type SourceLayout = { width: number; height: number; lines: LayoutLine[] };
export type DocumentRecord = {
  id: string;
  userId: string;
  name: string;
  extension: string;
  size: number;
  path: string | null;
  status: 'queued' | 'processing' | 'ready' | 'reviewed' | 'failed';
  stage: string;
  createdAt: string;
  updatedAt: string;
  processingMs: number | null;
  sourceText: string;
  cleanedText?: string;
  sourceLayout?: SourceLayout;
  sheets: Sheet[];
  extraction: Extraction | null;
  provider: 'local' | 'openai';
  error: string | null;
  version: number;
  sample: boolean;
  profile?: ExtractionProfile;
};
export type PublicDocument = Omit<DocumentRecord, 'path' | 'userId'>;
export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  demo: boolean;
  createdAt: string;
};
export function publicDocument({ path: _p, userId: _u, ...doc }: DocumentRecord): PublicDocument {
  return { ...doc, extraction: doc.extraction ? extractionSchema.parse(doc.extraction) : null };
}
export function publicUser({ passwordHash: _p, ...user }: User) {
  return user;
}
