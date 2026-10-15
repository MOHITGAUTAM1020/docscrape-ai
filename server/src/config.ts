import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32))
  throw new Error('Production needs JWT_SECRET with at least 32 characters.');
if (production && !process.env.CLIENT_ORIGIN)
  throw new Error('Production needs CLIENT_ORIGIN set to the public app origin.');
if (process.env.AI_PROVIDER === 'openai' && !process.env.OPENAI_API_KEY)
  throw new Error('AI_PROVIDER=openai requires OPENAI_API_KEY.');
function positive(value: string | undefined, fallback: number, max: number) {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Invalid numeric configuration.');
  return n;
}
export const config = {
  port: Number(process.env.PORT || 4000),
  production,
  secureCookie: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : production,
  origins: (
    process.env.CLIENT_ORIGIN ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4000,http://127.0.0.1:4000'
  )
    .split(',')
    .map((x) => x.trim()),
  secret: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  mongoUri: process.env.MONGODB_URI || '',
  redisUrl: process.env.REDIS_URL || '',
  provider: (process.env.AI_PROVIDER === 'openai' ? 'openai' : 'local') as 'local' | 'openai',
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  maxBytes: positive(process.env.MAX_UPLOAD_MB, 15, 30) * 1024 * 1024,
  maxDocuments: positive(process.env.MAX_DOCUMENTS, 100, 10000),
  libreoffice: process.env.LIBREOFFICE_BIN || 'libreoffice',
  pdftoppm: process.env.PDFTOPPM_BIN || 'pdftoppm',
  ocrLang: process.env.OCR_LANG || 'eng+hin',
  ocrModelDir: process.env.OCR_MODEL_DIR ? path.resolve(process.env.OCR_MODEL_DIR) : '',
  localTraining: !production && process.env.LOCAL_TRAINING !== 'false',
};
