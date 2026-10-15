import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { parse as parseCookie } from 'cookie';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { Server } from 'socket.io';
import { z } from 'zod';
import { config } from './config.js';
import { Store } from './store.js';
import { Processor } from './processor.js';
import { extensions, validateUpload, imagePreview } from './parsers.js';
import {
  extractionProfileSchema,
  extractionSchema,
  publicDocument,
  publicUser,
  type DocumentRecord,
} from './types.js';
import { sampleDocuments } from './samples.js';
import { csvExport, xlsxExport } from './exports.js';
import { trainingRoutes } from './training-routes.js';
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(72),
});
export async function createApp(
  options: { directory?: string; mongoUri?: string; redisUrl?: string; recover?: boolean } = {},
) {
  const directory = options.directory || config.dataDir;
  const uploads = path.join(directory, 'uploads');
  await fs.mkdir(uploads, { recursive: true });
  const store = new Store(directory, options.mongoUri ?? config.mongoUri);
  await store.init();
  const app = express();
  const httpServer = createServer(app);
  if (config.production) app.set('trust proxy', 1);
  const io = new Server(httpServer, {
    cors: { origin: config.origins, credentials: true },
    maxHttpBufferSize: 10000,
  });
  const processor = new Processor(
    store,
    (userId, doc) => io.to(userId).emit('document:updated', doc),
    options.redisUrl ?? config.redisUrl,
  );
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.origins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  const sessionOptions = {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 86400000,
  };
  function session(res: Response, userId: string) {
    res.cookie(
      'docscrape_session',
      jwt.sign({ sub: userId }, config.secret, { expiresIn: '7d', algorithm: 'HS256' }),
      sessionOptions,
    );
  }
  function verify(token: string | undefined) {
    if (!token) throw new Error('Missing session');
    const payload = jwt.verify(token, config.secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string')
      throw new Error('Invalid session');
    return payload.sub;
  }
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Try again shortly.' },
    }),
  );
  app.use('/api', (req, res, next) => {
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      if ((origin && !config.origins.includes(origin)) || site === 'cross-site') {
        res.status(403).json({ error: 'Request origin is not permitted.' });
        return;
      }
      if (!req.is('application/json') && !req.is('multipart/form-data')) {
        res.status(415).json({ error: 'Use JSON or multipart/form-data.' });
        return;
      }
    }
    next();
  });
  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !config.origins.includes(origin)) throw new Error('Origin denied');
      const id = verify(parseCookie(socket.handshake.headers.cookie || '').docscrape_session);
      if (!(await store.userById(id))) throw new Error('Unknown user');
      socket.data.userId = id;
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });
  io.on('connection', (socket) => {
    socket.join(socket.data.userId);
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 25,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', name: 'DocScrape AI' }));
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const body = credentials.extend({ name: z.string().trim().min(2).max(80) }).parse(req.body);
    if (await store.userByEmail(body.email)) {
      res.status(409).json({ error: 'Email already registered.' });
      return;
    }
    const user = {
      id: randomUUID(),
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12),
      demo: false,
      createdAt: new Date().toISOString(),
    };
    await store.addUser(user);
    session(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const body = credentials.parse(req.body);
    const user = await store.userByEmail(body.email);
    if (!user || user.demo || !(await bcrypt.compare(body.password, user.passwordHash))) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }
    session(res, user.id);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/demo', authLimiter, async (_req, res) => {
    const id = randomUUID();
    const user = {
      id,
      name: 'Alex Morgan',
      email: `demo-${id}@docscrape.local`,
      passwordHash: '',
      demo: true,
      createdAt: new Date().toISOString(),
    };
    await store.addUser(user);
    for (const doc of sampleDocuments(id)) await store.add(doc, config.maxDocuments);
    session(res, id);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('docscrape_session', sessionOptions);
    res.json({ ok: true });
  });
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = verify(req.cookies.docscrape_session);
      const user = await store.userById(id);
      if (!user) throw new Error();
      res.locals.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Please sign in.' });
    }
  });
  app.get('/api/auth/me', (_req, res) => res.json({ user: publicUser(res.locals.user) }));
  app.use('/api/training', trainingRoutes(path.join(directory, 'training')));
  app.get('/api/config', (_req, res) =>
    res.json({
      provider: config.provider,
      localTraining: config.localTraining,
      model: config.provider === 'openai' ? config.model : null,
      extensions,
      maxUploadBytes: config.maxBytes,
      maxDocuments: config.maxDocuments,
      storage: config.mongoUri ? 'MongoDB' : 'Local persistent storage',
      queue: config.redisUrl ? 'Redis / BullMQ' : 'Local background queue',
      legacyOffice: 'Requires LibreOffice (included in Docker)',
      scannedPdf: 'Requires Poppler (included in Docker)',
      profiles: extractionProfileSchema.options,
    }),
  );
  app.get('/api/documents', async (_req, res) => {
    const docs = (await store.list(res.locals.user.id)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    res.json({ documents: docs.map(publicDocument) });
  });
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploads,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).slice(1).toLowerCase();
        cb(null, `${randomUUID()}.${ext}`);
      },
    }),
    limits: { fileSize: config.maxBytes, files: 1, fields: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(1).toLowerCase();
      if (!extensions.includes(ext)) cb(new Error('Unsupported file format.'));
      else cb(null, true);
    },
  });
  const locks = new Map<string, Promise<unknown>>();
  async function userLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    locks.set(id, next);
    try {
      return await next;
    } finally {
      if (locks.get(id) === next) locks.delete(id);
    }
  }
  app.post('/api/documents', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Select a document to upload.' });
      return;
    }
    const file = req.file;
    let saved = false;
    try {
      const extension = path.extname(file.originalname).slice(1).toLowerCase();
      const profile = extractionProfileSchema.parse(req.body.profile || 'auto');
      await validateUpload(file.path, extension);
      const now = new Date().toISOString();
      const doc: DocumentRecord = {
        id: randomUUID(),
        userId: res.locals.user.id,
        name: path.basename(file.originalname.replace(/\\/g, '/')).slice(0, 160),
        extension,
        size: file.size,
        path: file.path,
        status: 'queued',
        stage: 'Waiting to process',
        createdAt: now,
        updatedAt: now,
        processingMs: null,
        sourceText: '',
        sheets: [],
        extraction: null,
        provider: config.provider,
        error: null,
        version: 1,
        sample: false,
        profile,
      };
      await userLock(doc.userId, () => store.add(doc, config.maxDocuments));
      saved = true;
      try {
        await processor.enqueue(doc.id);
      } catch {
        await store.update(doc.id, {
          status: 'failed',
          stage: 'Queue unavailable',
          error: 'Processing queue unavailable. Retry when the service returns.',
        });
      }
      res.status(202).json({ document: publicDocument((await store.get(doc.id))!) });
    } catch (e) {
      if (!saved) await fs.unlink(file.path).catch(() => {});
      throw e;
    }
  });
  async function owned(id: string, userId: string) {
    const doc = await store.get(id);
    if (!doc || doc.userId !== userId)
      throw Object.assign(new Error('Document not found.'), { status: 404 });
    return doc;
  }
  app.get('/api/documents/:id', async (req, res) =>
    res.json({ document: publicDocument(await owned(String(req.params.id), res.locals.user.id)) }),
  );
  app.patch('/api/documents/:id', async (req, res) => {
    const doc = await owned(String(req.params.id), res.locals.user.id);
    if (!['ready', 'reviewed'].includes(doc.status))
      throw Object.assign(new Error('Document is not ready for review.'), { status: 409 });
    const body = z
      .object({
        extraction: extractionSchema,
        reviewed: z.boolean(),
        version: z.number().int().min(1),
      })
      .parse(req.body);
    const updated = await store.update(
      doc.id,
      {
        extraction: body.extraction,
        status: body.reviewed ? 'reviewed' : 'ready',
        stage: body.reviewed ? 'Verified by you' : 'Ready for review',
      },
      body.version,
    );
    io.to(doc.userId).emit('document:updated', publicDocument(updated!));
    res.json({ document: publicDocument(updated!) });
  });
  app.post('/api/documents/:id/retry', async (req, res) => {
    const doc = await owned(String(req.params.id), res.locals.user.id);
    if (doc.status !== 'failed' || !doc.path)
      throw Object.assign(new Error('Only failed uploads can be retried.'), { status: 409 });
    await store.update(
      doc.id,
      { status: 'queued', stage: 'Waiting to process', error: null },
      doc.version,
    );
    try {
      await processor.enqueue(doc.id);
    } catch {
      await store.update(doc.id, {
        status: 'failed',
        stage: 'Queue unavailable',
        error: 'Processing queue unavailable. Try again shortly.',
      });
      throw Object.assign(new Error('Processing queue unavailable.'), { status: 503 });
    }
    res.json({ document: publicDocument((await store.get(doc.id))!) });
  });
  app.post('/api/documents/:id/reprocess', async (req, res) => {
    const doc = await owned(String(req.params.id), res.locals.user.id);
    if (!doc.path || !['ready', 'reviewed', 'failed'].includes(doc.status))
      throw Object.assign(new Error('Only completed uploaded documents can be reprocessed.'), {
        status: 409,
      });
    const body = z.object({ version: z.number().int().min(1) }).parse(req.body);
    await store.update(
      doc.id,
      { status: 'queued', stage: 'Waiting to reprocess', error: null, extraction: null },
      body.version,
    );
    try {
      await processor.enqueue(doc.id);
    } catch {
      await store.update(doc.id, {
        status: 'failed',
        stage: 'Queue unavailable',
        error: 'Processing queue unavailable. Retry shortly.',
      });
      throw Object.assign(new Error('Processing queue unavailable.'), { status: 503 });
    }
    const updated = publicDocument((await store.get(doc.id))!);
    io.to(doc.userId).emit('document:updated', updated);
    res.json({ document: updated });
  });
  app.delete('/api/documents/:id', async (req, res) => {
    const doc = await owned(String(req.params.id), res.locals.user.id);
    if (doc.status === 'processing' || doc.status === 'queued' || processor.isBusy(doc.id))
      throw Object.assign(new Error('Wait for processing to finish before deleting.'), {
        status: 409,
      });
    // Only paths generated by this upload route are used, never caller supplied paths.
    if (doc.path)
      await fs.unlink(doc.path).catch((e: any) => {
        if (e.code !== 'ENOENT') throw e;
      });
    await store.remove(doc.id);
    res.json({ ok: true });
  });
  app.get('/api/documents/:id/original', async (req, res) => {
    const doc = await owned(String(req.params.id), res.locals.user.id);
    res.setHeader('Cache-Control', 'private, no-store');
    if (doc.path) res.download(path.resolve(doc.path), doc.name);
    else {
      res.attachment(doc.name);
      res.type('text/plain').send(doc.sourceText);
    }
  });
  app.get('/api/documents/:id/preview', async (req, res) => {
    const doc = await owned(String(req.params.id), res.locals.user.id);
    if (
      !doc.path ||
      !['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif'].includes(doc.extension)
    )
      throw Object.assign(new Error('Image preview unavailable.'), { status: 404 });
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('image/png').send(await imagePreview(doc.path, doc.extension));
  });
  app.get('/api/documents/:id/export', async (req, res) => {
    const doc = await owned(String(req.params.id), res.locals.user.id);
    if (!doc.extraction)
      throw Object.assign(new Error('Document is not ready to export.'), { status: 409 });
    const format = z.enum(['json', 'csv', 'xlsx']).parse(req.query.format || 'json');
    const base = doc.name.replace(/\.[^.]+$/, '');
    res.attachment(`${base}_extracted.${format}`);
    res.setHeader('Cache-Control', 'private, no-store');
    if (format === 'csv') res.type('text/csv').send(csvExport(doc));
    else if (format === 'xlsx')
      res
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .send(Buffer.from(await xlsxExport(doc)));
    else
      res.json({
        name: doc.name,
        provider: doc.provider,
        status: doc.status,
        extraction: extractionSchema.parse(doc.extraction),
        sourceText: doc.sourceText,
        cleanedText: doc.cleanedText || doc.sourceText,
        sheets: doc.sheets,
        profile: doc.profile || 'auto',
      });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  app.use(express.static(clientDist));
  app.get('/{*path}', async (_req, res, next) => {
    try {
      await fs.access(path.join(clientDist, 'index.html'));
      res.sendFile(path.join(clientDist, 'index.html'));
    } catch {
      next();
    }
  });
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    let status = err.status || 400;
    let message = err.message || 'Request failed.';
    if (err instanceof z.ZodError) {
      message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      status = 400;
    } else if (err instanceof multer.MulterError) {
      status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Maximum upload size is ${config.maxBytes / 1048576} MB.`
          : err.message;
    } else if (err.code === 11000) {
      status = 409;
      message = 'Email already registered.';
    } else if (err instanceof SyntaxError) {
      status = 400;
      message = 'Invalid JSON body.';
    }
    if (status >= 500) console.error(err);
    res.status(status).json({ error: message });
  });
  if (options.recover !== false) await processor.recover();
  return {
    app,
    httpServer,
    store,
    processor,
    close: async () => {
      await processor.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await store.close();
    },
  };
}
