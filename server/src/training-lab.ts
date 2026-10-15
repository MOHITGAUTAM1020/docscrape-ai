import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { z } from 'zod';
import { accuracy, normalizedText, releaseGate, type Accuracy } from './training-metrics.js';
import { nativeReady, nativeCommand } from './native-training.js';
const exec = promisify(execFile);
const baseCommit = 'e12c65a915945e4c28e237a9b52bc4a8f39a0cec';
export const sampleInput = z.object({
  language: z.enum(['eng', 'hin']),
  sourceGroup: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[\p{L}\p{N}_. -]+$/u),
  split: z.enum(['train', 'validation', 'test']),
  text: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((s) => !/[\r\n]/.test(s), 'Use one cropped text line per sample.'),
  approved: z.boolean(),
  disposition: z.enum(['usable', 'crossed_out', 'illegible']).default('usable'),
});
export type TrainingSample = z.infer<typeof sampleInput> & {
  id: string;
  imageHash: string;
  createdAt: string;
};
export type TrainingRun = {
  id: string;
  language: 'eng' | 'hin';
  kind: 'baseline' | 'training';
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  stage: string;
  createdAt: string;
  finishedAt?: string;
  iterations: number;
  datasetHash: string;
  testHash: string;
  baselineModelHash: string;
  counts: { train: number; validation: number; test: number };
  baseline?: Accuracy;
  candidate?: Accuracy;
  gate?: ReturnType<typeof releaseGate>;
  predictions?: { sampleId: string; expected: string; baseline: string; candidate?: string }[];
  logs: string[];
  error?: string;
  release?: string;
};
type State = { samples: TrainingSample[]; runs: TrainingRun[] };
const digest = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const sampleFingerprint = (items: TrainingSample[]) =>
  digest(
    JSON.stringify(
      items
        .map((s) => ({
          id: s.id,
          hash: s.imageHash,
          text: s.text,
          split: s.split,
          group: s.sourceGroup,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ),
  );
export class TrainingLab {
  private locks = new Map<string, Promise<unknown>>();
  private active = false;
  private setupPromise?: Promise<void>;
  private current?: {
    userId: string;
    runId: string;
    cancelled: boolean;
    container?: string;
    nativeJob?: string;
  };
  constructor(
    private root: string,
    private configuredBaseline = '',
  ) {}
  private baselineFolder() {
    return this.configuredBaseline || path.dirname(this.root);
  }
  private folder(userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid workspace.');
    return path.join(this.root, userId);
  }
  private async read(userId: string): Promise<State> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.folder(userId), 'index.json'), 'utf8'));
    } catch (e: any) {
      if (e.code === 'ENOENT') return { samples: [], runs: [] };
      throw e;
    }
  }
  private async mutate<T>(userId: string, fn: (state: State) => T | Promise<T>) {
    const previous = this.locks.get(userId) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const state = await this.read(userId);
        const result = await fn(state);
        await fs.mkdir(this.folder(userId), { recursive: true });
        const file = path.join(this.folder(userId), 'index.json');
        await fs.writeFile(file + '.tmp', JSON.stringify(state));
        await fs.rename(file + '.tmp', file);
        return result;
      });
    this.locks.set(userId, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(userId) === next) this.locks.delete(userId);
    }
  }
  async readiness() {
    const models = await Promise.all(
      ['eng', 'hin'].map(async (lang) => {
        try {
          return (
            (await fs.stat(path.join(this.root, 'bases', `${lang}.traineddata`))).size > 100000 &&
            (await fs.stat(path.join(this.baselineFolder(), `${lang}.traineddata`))).size > 100000
          );
        } catch {
          return false;
        }
      }),
    );
    const native = await nativeReady();
    let docker = false,
      trainer = false;
    try {
      await exec('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 4000 });
      docker = true;
      await exec('docker', ['image', 'inspect', 'docscrape-trainer:local', '--format', '{{.Id}}'], {
        timeout: 4000,
      });
      trainer = true;
    } catch {}
    return {
      modelsReady: models.every(Boolean),
      dockerReady: docker,
      trainerReady: trainer || native,
      nativeReady: native,
      backend: native ? 'native' : trainer ? 'docker' : 'unavailable',
      active: this.active,
      baseCommit,
      training: 'Fully local CPU training; no cloud jobs or paid APIs.',
    };
  }
  async setup() {
    if (this.setupPromise) return this.setupPromise;
    this.setupPromise = (async () => {
      await fs.mkdir(path.join(this.root, 'bases'), { recursive: true });
      for (const lang of ['eng', 'hin']) {
        const file = path.join(this.root, 'bases', `${lang}.traineddata`);
        try {
          if ((await fs.stat(file)).size > 100000) continue;
        } catch {}
        const res = await fetch(
          `https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/${baseCommit}/${lang}.traineddata`,
          { signal: AbortSignal.timeout(120000) },
        );
        if (!res.ok) throw new Error(`Base-model download failed (${res.status}).`);
        const data = Buffer.from(await res.arrayBuffer());
        if (data.length < 100000 || data.length > 50000000)
          throw new Error('Invalid base-model download.');
        await fs.writeFile(file + '.tmp', data);
        await fs.rename(file + '.tmp', file);
      }
      if (!this.configuredBaseline)
        for (const lang of ['eng', 'hin']) {
          const file = path.join(this.baselineFolder(), `${lang}.traineddata`);
          try {
            if ((await fs.stat(file)).size > 100000) continue;
          } catch {}
          const res = await fetch(
            `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
            { signal: AbortSignal.timeout(120000) },
          );
          if (!res.ok) throw new Error('App baseline language download failed.');
          const data = gunzipSync(Buffer.from(await res.arrayBuffer()), {
            maxOutputLength: 50000000,
          });
          if (data.length < 100000) throw new Error('Invalid app baseline language model.');
          await fs.writeFile(file + '.tmp', data);
          await fs.rename(file + '.tmp', file);
        }
    })();
    try {
      await this.setupPromise;
    } finally {
      this.setupPromise = undefined;
    }
  }
  async overview(userId: string) {
    let state = await this.read(userId);
    if (!this.active && state.runs.some((r) => r.status === 'running')) {
      await this.mutate(userId, (s) => {
        for (const run of s.runs)
          if (run.status === 'running') {
            run.status = 'interrupted';
            run.stage = 'Interrupted by server restart';
            run.error =
              'This run was not completed. Start a fresh run; do not release its checkpoints.';
          }
      });
      state = await this.read(userId);
    }
    return { ...state, readiness: await this.readiness() };
  }
  async add(userId: string, input: z.input<typeof sampleInput>, image: Buffer) {
    const value = sampleInput.parse(input);
    value.text = normalizedText(value.text);
    if (value.disposition !== 'usable') value.approved = false;
    if (value.language === 'eng' && /[\u0900-\u097f]/u.test(value.text))
      throw new Error('Choose Hindi for a line containing Devanagari text.');
    if (value.language === 'hin' && !/[\u0900-\u097f]/u.test(value.text))
      throw new Error('Hindi samples must contain Devanagari text.');
    const png = await sharp(image, { limitInputPixels: 10000000 })
      .rotate()
      .flatten({ background: '#fff' })
      .png()
      .toBuffer();
    const imageHash = digest(png);
    return this.mutate(userId, async (state) => {
      if (state.samples.length >= 5000) throw new Error('Local lab limit: 5,000 samples.');
      if (state.samples.some((s) => s.imageHash === imageHash))
        throw new Error('This image already exists in the dataset.');
      if (state.samples.some((s) => s.sourceGroup === value.sourceGroup && s.split !== value.split))
        throw new Error('All crops from the same source document must use the same split.');
      const sample = { ...value, id: randomUUID(), imageHash, createdAt: new Date().toISOString() };
      await fs.mkdir(path.join(this.folder(userId), 'images'), { recursive: true });
      await fs.writeFile(path.join(this.folder(userId), 'images', `${sample.id}.png`), png);
      state.samples.push(sample);
      return sample;
    });
  }
  async edit(
    userId: string,
    id: string,
    patch: {
      text: string;
      approved: boolean;
      disposition?: 'usable' | 'crossed_out' | 'illegible';
    },
  ) {
    const parsed = sampleInput.shape.text.parse(patch.text);
    return this.mutate(userId, (state) => {
      const sample = state.samples.find((s) => s.id === id);
      if (!sample) throw Object.assign(new Error('Sample not found.'), { status: 404 });
      if (state.runs.some((r) => r.status === 'running'))
        throw new Error('Wait for this run to finish before changing labels.');
      const next = normalizedText(parsed);
      if (sample.language === 'eng' && /[\u0900-\u097f]/.test(next))
        throw new Error('Devanagari is not valid for an English-only sample.');
      if (sample.language === 'hin' && !/[\u0900-\u097f]/.test(next))
        throw new Error('Hindi samples need Devanagari text.');
      sample.text = next;
      sample.disposition = patch.disposition || sample.disposition || 'usable';
      sample.approved = sample.disposition === 'usable' && patch.approved;
      return sample;
    });
  }
  async image(userId: string, id: string) {
    const state = await this.read(userId);
    if (!state.samples.some((s) => s.id === id))
      throw Object.assign(new Error('Sample not found.'), { status: 404 });
    return path.join(this.folder(userId), 'images', `${id}.png`);
  }
  private async update(userId: string, id: string, patch: Partial<TrainingRun>) {
    return this.mutate(userId, (state) => {
      const run = state.runs.find((r) => r.id === id)!;
      Object.assign(run, patch);
      return run;
    });
  }
  async start(
    userId: string,
    language: 'eng' | 'hin',
    kind: 'baseline' | 'training',
    iterations: number,
  ) {
    if (this.active)
      throw Object.assign(new Error('One local evaluation/training job can run at a time.'), {
        status: 409,
      });
    this.active = true;
    try {
      const readiness = await this.readiness();
      if (!readiness.modelsReady) throw new Error('Download the English/Hindi base models first.');
      if (kind === 'training' && !readiness.trainerReady)
        throw new Error(
          'Prepare native Ubuntu training tools and pinned sources, or build the optional Docker trainer. No training has run.',
        );
      const state = await this.read(userId);
      const samples = state.samples.filter((s) => s.approved && s.language === language);
      const counts = {
        train: samples.filter((s) => s.split === 'train').length,
        validation: samples.filter((s) => s.split === 'validation').length,
        test: samples.filter((s) => s.split === 'test').length,
      };
      if (counts.test < 5)
        throw new Error(
          'Add at least five approved held-out test lines first. They must come from different source documents than training data.',
        );
      if (kind === 'training' && (counts.train < 20 || counts.validation < 5))
        throw new Error(
          'Training needs at least 20 approved training lines and five validation lines. These are smoke-test minimums, not enough to prove general accuracy.',
        );
      const id = randomUUID();
      const run: TrainingRun = {
        id,
        language,
        kind,
        status: 'running',
        stage: 'Freezing dataset',
        createdAt: new Date().toISOString(),
        iterations,
        datasetHash: sampleFingerprint(samples),
        testHash: sampleFingerprint(samples.filter((s) => s.split === 'test')),
        baselineModelHash: digest(
          await fs.readFile(path.join(this.baselineFolder(), `${language}.traineddata`)),
        ),
        counts,
        logs: [],
      };
      await this.mutate(userId, (s) => {
        s.runs.unshift(run);
      });
      this.current = { userId, runId: id, cancelled: false };
      // Detached task remains in this server process; current inference model is never replaced.
      void this.execute(userId, run, samples).finally(() => {
        this.active = false;
        this.current = undefined;
      });
      return run;
    } catch (e) {
      this.active = false;
      throw e;
    }
  }
  private async evaluate(
    samples: TrainingSample[],
    language: 'eng' | 'hin',
    folder: string,
    imageFolder: string,
  ) {
    const worker = await createWorker(language, 1, {
      langPath: folder,
      gzip: false,
      cacheMethod: 'none',
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, user_defined_dpi: '300' });
    const pairs: { sampleId: string; expected: string; actual: string; milliseconds: number }[] =
      [];
    try {
      for (const sample of samples) {
        if (this.current?.cancelled) throw new Error('Run stopped by you.');
        const started = Date.now();
        const actual = (await worker.recognize(path.join(imageFolder, `${sample.id}.png`))).data
          .text;
        pairs.push({
          sampleId: sample.id,
          expected: sample.text,
          actual: normalizedText(actual),
          milliseconds: Date.now() - started,
        });
      }
    } finally {
      await worker.terminate();
    }
    return { metrics: accuracy(pairs), pairs };
  }
  private async execute(userId: string, run: TrainingRun, samples: TrainingSample[]) {
    const runDir = path.join(this.folder(userId), 'runs', run.id),
      jobDir = path.join(runDir, 'job');
    const test = samples.filter((s) => s.split === 'test');
    try {
      await fs.mkdir(path.join(runDir, 'heldout'), { recursive: true });
      for (const s of test)
        await fs.copyFile(
          await this.image(userId, s.id),
          path.join(runDir, 'heldout', `${s.id}.png`),
        );
      await fs.writeFile(path.join(runDir, 'dataset.json'), JSON.stringify(samples, null, 2));
      const baselineDir = path.join(runDir, 'baseline-models');
      await fs.mkdir(baselineDir, { recursive: true });
      for (const lang of ['eng', 'hin'])
        await fs.copyFile(
          path.join(this.baselineFolder(), `${lang}.traineddata`),
          path.join(baselineDir, `${lang}.traineddata`),
        );
      if (
        digest(await fs.readFile(path.join(baselineDir, `${run.language}.traineddata`))) !==
        run.baselineModelHash
      )
        throw new Error('Baseline changed while freezing the run. Start again.');
      await this.update(userId, run.id, { stage: 'Evaluating baseline on frozen test lines' });
      const baseline = await this.evaluate(
        test,
        run.language,
        baselineDir,
        path.join(runDir, 'heldout'),
      );
      await this.update(userId, run.id, {
        baseline: baseline.metrics,
        predictions: baseline.pairs.map((p) => ({
          sampleId: p.sampleId,
          expected: p.expected,
          baseline: p.actual,
        })),
      });
      if (run.kind === 'baseline') {
        await this.update(userId, run.id, {
          status: 'completed',
          stage: 'Baseline measured',
          finishedAt: new Date().toISOString(),
        });
        return;
      }
      if (this.current?.cancelled) throw new Error('Run stopped by you.');
      await fs.mkdir(path.join(jobDir, 'bases'), { recursive: true });
      for (const lang of ['eng', 'hin'])
        await fs.copyFile(
          path.join(
            this.configuredBaseline || path.join(this.root, 'bases'),
            `${lang}.traineddata`,
          ),
          path.join(jobDir, 'bases', `${lang}.traineddata`),
        );
      for (const s of samples.filter((s) => s.split !== 'test')) {
        const dir = path.join(jobDir, s.split);
        await fs.mkdir(dir, { recursive: true });
        await fs.copyFile(await this.image(userId, s.id), path.join(dir, `${s.id}.png`));
        await fs.writeFile(path.join(dir, `${s.id}.gt.txt`), s.text + '\n');
      }
      await fs.writeFile(
        path.join(jobDir, 'config.json'),
        JSON.stringify({ language: run.language, iterations: run.iterations }),
      );
      await this.update(userId, run.id, {
        stage: 'Fine-tuning locally (test images are excluded from trainer input)',
      });
      const logs: string[] = [];
      let progress = Promise.resolve();
      const container = `docscrape-training-${run.id}`;
      const useNative = await nativeReady();
      if (this.current) {
        if (useNative) this.current.nativeJob = jobDir;
        else this.current.container = container;
      }
      const invocation = useNative
        ? await nativeCommand(jobDir)
        : {
            command: 'docker',
            args: [
              'run',
              '--rm',
              '--name',
              container,
              '--network',
              'none',
              '--cpus',
              '2',
              '--memory',
              '4g',
              '--mount',
              `type=bind,source=${jobDir},target=/job`,
              'docscrape-trainer:local',
            ],
          };
      await new Promise<void>((resolve, reject) => {
        const child = spawn(invocation.command, invocation.args, {
          windowsHide: true,
          shell: false,
          env: { ...process.env, OMP_THREAD_LIMIT: '2' },
        });
        const log = (data: Buffer) => {
          logs.push(...data.toString().split('\n').filter(Boolean));
          if (logs.length > 1500) logs.splice(0, logs.length - 1500);
          const tail = [...logs];
          progress = progress
            .then(() => this.update(userId, run.id, { logs: tail }))
            .then(() => {})
            .catch(() => {});
        };
        child.stdout.on('data', log);
        child.stderr.on('data', log);
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  `Local ${useNative ? 'native trainer' : 'training container'} exited with code ${code}. See logs.`,
                ),
              ),
        );
      });
      await progress;
      const model = path.join(jobDir, 'candidate.traineddata');
      if ((await fs.stat(model)).size < 100000)
        throw new Error('Trainer did not produce a valid model.');
      const evalDir = path.join(runDir, 'candidate-models');
      await fs.mkdir(evalDir, { recursive: true });
      for (const lang of ['eng', 'hin'])
        await fs.copyFile(
          lang === run.language ? model : path.join(baselineDir, `${lang}.traineddata`),
          path.join(evalDir, `${lang}.traineddata`),
        );
      await this.update(userId, run.id, {
        stage: 'Comparing candidate against the same frozen test lines',
      });
      const candidate = await this.evaluate(
        test,
        run.language,
        evalDir,
        path.join(runDir, 'heldout'),
      );
      const gate = releaseGate(baseline.metrics, candidate.metrics, true);
      await this.update(userId, run.id, {
        status: 'completed',
        stage: gate.passed
          ? 'Candidate passed smoke gate; review before release'
          : 'Candidate rejected; current model retained',
        finishedAt: new Date().toISOString(),
        candidate: candidate.metrics,
        gate,
        predictions: baseline.pairs.map((p, i) => ({
          sampleId: p.sampleId,
          expected: p.expected,
          baseline: p.actual,
          candidate: candidate.pairs[i].actual,
        })),
      });
    } catch (e: any) {
      await this.update(userId, run.id, {
        status: this.current?.cancelled ? 'interrupted' : 'failed',
        stage: 'Job stopped or failed; current model retained',
        error: String(e.message).slice(0, 1000),
        finishedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }
  async stop(userId: string, id: string) {
    if (!this.current || this.current.userId !== userId || this.current.runId !== id)
      throw Object.assign(new Error('No running job in this workspace.'), { status: 404 });
    this.current.cancelled = true;
    if (this.current.nativeJob)
      await fs.writeFile(path.join(this.current.nativeJob, 'STOP'), 'stop');
    if (this.current.container)
      await exec('docker', ['stop', '--time', '10', this.current.container], {
        timeout: 15000,
      }).catch(() => {});
    return { ok: true };
  }
  async prepareRelease(userId: string, id: string) {
    const state = await this.read(userId);
    const run = state.runs.find((r) => r.id === id);
    if (!run || run.status !== 'completed' || !run.gate?.passed)
      throw new Error('Only a candidate that passed the comparison gate can be packaged.');
    if (
      sampleFingerprint(
        state.samples.filter(
          (s) => s.approved && s.language === run.language && s.split === 'test',
        ),
      ) !== run.testHash
    )
      throw new Error(
        'Test labels changed after this run. Evaluate again against the updated benchmark.',
      );
    if (
      digest(await fs.readFile(path.join(this.baselineFolder(), `${run.language}.traineddata`))) !==
      run.baselineModelHash
    )
      throw new Error(
        'The baseline model changed after this run. Evaluate again before preparing a release.',
      );
    const directory = path.join(this.folder(userId), 'releases', id);
    await fs.mkdir(directory, { recursive: true });
    const hashes: Record<string, string> = {};
    const source = path.join(
      this.folder(userId),
      'runs',
      id,
      'candidate-models',
      `${run.language}.traineddata`,
    );
    const data = await fs.readFile(source);
    hashes[run.language] = digest(data);
    await fs.writeFile(path.join(directory, `${run.language}.traineddata`), data);
    await fs.writeFile(
      path.join(directory, 'manifest.json'),
      JSON.stringify(
        {
          version: id,
          language: run.language,
          baseCommit,
          hashes,
          baselineModelHash: run.baselineModelHash,
          datasetHash: run.datasetHash,
          testHash: run.testHash,
          baseline: run.baseline,
          candidate: run.candidate,
          gate: run.gate,
          createdAt: new Date().toISOString(),
          note: 'Human-approved smoke-tested candidate. Update only this language; keep the other current language model unchanged. Run a representative English/Hindi/mixed-document evaluation before production release. This operation does not redeploy the website or switch its current model.',
        },
        null,
        2,
      ),
    );
    await this.update(userId, id, { release: directory });
    return { directory };
  }
}
