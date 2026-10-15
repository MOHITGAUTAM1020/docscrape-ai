import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from './config.js';
import { TrainingLab, sampleInput } from './training-lab.js';
export function trainingRoutes(directory: string) {
  const router = Router();
  const lab = new TrainingLab(directory, config.ocrModelDir);
  router.use((req, res, next) => {
    const address = req.socket.remoteAddress || '';
    if (!config.localTraining || !/^127\.|^::1$|^::ffff:127\./.test(address)) {
      res.status(403).json({
        error:
          'Training lab runs only on this computer in development mode. It is disabled on the deployed site.',
      });
      return;
    }
    if (res.locals.user.demo) {
      res.status(403).json({
        error:
          'Create a local account to keep your training dataset. Demo sessions cannot train models.',
      });
      return;
    }
    next();
  });
  router.get('/', async (_req, res) => res.json(await lab.overview(res.locals.user.id)));
  router.post('/setup', async (_req, res) => {
    await lab.setup();
    res.json({ ok: true });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1048576, files: 1, fields: 6 },
  });
  router.post('/samples', upload.single('image'), async (req, res) => {
    if (!req.file) throw new Error('Upload a cropped text-line image.');
    const input = sampleInput.parse({ ...req.body, approved: req.body.approved === 'true' });
    res.status(201).json({ sample: await lab.add(res.locals.user.id, input, req.file.buffer) });
  });
  router.patch('/samples/:id', async (req, res) => {
    const patch = z
      .object({
        text: sampleInput.shape.text,
        approved: z.boolean(),
        disposition: sampleInput.shape.disposition.optional(),
      })
      .parse(req.body);
    res.json({ sample: await lab.edit(res.locals.user.id, String(req.params.id), patch) });
  });
  router.get('/samples/:id/image', async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(await lab.image(res.locals.user.id, String(req.params.id)));
  });
  router.post('/runs', async (req, res) => {
    const body = z
      .object({
        language: z.enum(['eng', 'hin']),
        kind: z.enum(['baseline', 'training']),
        iterations: z.number().int().min(100).max(10000).default(1000),
      })
      .parse(req.body);
    res.status(202).json({
      run: await lab.start(res.locals.user.id, body.language, body.kind, body.iterations),
    });
  });
  router.post('/runs/:id/release', async (req, res) => {
    res.json(await lab.prepareRelease(res.locals.user.id, String(req.params.id)));
  });
  router.post('/runs/:id/stop', async (req, res) => {
    res.json(await lab.stop(res.locals.user.id, String(req.params.id)));
  });
  return router;
}
