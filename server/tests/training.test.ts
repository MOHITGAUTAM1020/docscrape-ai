import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import supertest from 'supertest';
import { accuracy, editDistance, releaseGate } from '../src/training-metrics.js';
import { TrainingLab } from '../src/training-lab.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
describe('honest OCR measurements and release decisions', () => {
  it('measures substitutions, insertions and deletions rather than reporting confidence as accuracy', () => {
    expect(editDistance(Array.from('cat'), Array.from('cut'))).toBe(1);
    const score = accuracy([{ expected: 'cat dog', actual: 'cat dig', milliseconds: 100 }]);
    expect(score.cer).toBeCloseTo(1 / 7);
    expect(score.wer).toBe(0.5);
    expect(score.exactLineRate).toBe(0);
    expect(score.milliseconds).toBe(100);
  });
  it('handles Hindi normalization and grapheme scoring separately', () => {
    const equal = accuracy([{ expected: 'क़', actual: 'क़', milliseconds: 1 }]);
    expect(equal.cer).toBe(0);
    expect(equal.graphemeErrorRate).toBe(0);
    const result = accuracy([{ expected: 'भारत', actual: 'भरत', milliseconds: 1 }]);
    expect(result.cer).toBeGreaterThan(0);
    expect(result.graphemeErrorRate).toBeGreaterThan(0);
  });
  it('does not hide excessive insertion errors by clamping to 100 percent', () => {
    expect(accuracy([{ expected: 'A', actual: 'AAAA', milliseconds: 1 }]).cer).toBe(3);
  });
  it('requires a fair held-out comparison and rejects regression or an already-perfect baseline', () => {
    const baseline = accuracy(
      Array.from({ length: 5 }, () => ({
        expected: 'cat dog',
        actual: 'cat dig',
        milliseconds: 10,
      })),
    );
    const good = accuracy(
      Array.from({ length: 5 }, () => ({
        expected: 'cat dog',
        actual: 'cat dog',
        milliseconds: 10,
      })),
    );
    expect(releaseGate(baseline, good, true).passed).toBe(true);
    expect(releaseGate(baseline, good, false).passed).toBe(false);
    expect(releaseGate(good, good, true).passed).toBe(false);
    expect(releaseGate(baseline, { ...good, milliseconds: 1000 }, true).passed).toBe(false);
  });
});
describe('local dataset boundaries', () => {
  let dir: string, lab: TrainingLab;
  const user = randomUUID(),
    other = randomUUID();
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docscrape-lab-'));
    lab = new TrainingLab(dir);
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  async function image(color: string) {
    return sharp({ create: { width: 180, height: 35, channels: 3, background: color } })
      .png()
      .toBuffer();
  }
  it('stores labels per workspace and keeps every crop from one document in the same split', async () => {
    await lab.add(
      user,
      {
        language: 'eng',
        sourceGroup: 'invoice-01',
        split: 'train',
        text: 'Invoice total: 100',
        approved: true,
      },
      await image('#fff'),
    );
    await expect(
      lab.add(
        user,
        {
          language: 'eng',
          sourceGroup: 'invoice-01',
          split: 'test',
          text: 'Invoice date: 2026',
          approved: true,
        },
        await image('#eee'),
      ),
    ).rejects.toThrow('same split');
    expect((await lab.overview(other)).samples).toHaveLength(0);
  });
  it('rejects duplicate image leakage and invalid English/Hindi labels', async () => {
    await expect(
      lab.add(
        user,
        { language: 'eng', sourceGroup: 'different', split: 'test', text: '100', approved: true },
        await image('#fff'),
      ),
    ).rejects.toThrow('already exists');
    await expect(
      lab.add(
        user,
        { language: 'eng', sourceGroup: 'hindi', split: 'train', text: 'भारत', approved: true },
        await image('#ddd'),
      ),
    ).rejects.toThrow('Hindi');
    await expect(
      lab.add(
        user,
        {
          language: 'hin',
          sourceGroup: 'english',
          split: 'train',
          text: 'English',
          approved: true,
        },
        await image('#ddd'),
      ),
    ).rejects.toThrow('Devanagari');
  });
  it('does not package a nonexistent or untested candidate', async () => {
    await expect(lab.prepareRelease(user, randomUUID())).rejects.toThrow('passed');
  });
  it('records crossed-out lines but never approves them for model training', async () => {
    const sample = await lab.add(
      user,
      {
        language: 'eng',
        sourceGroup: 'shopping-note-02',
        split: 'test',
        text: 'Wet wipes',
        approved: true,
        disposition: 'crossed_out',
      },
      await image('#ccc'),
    );
    expect(sample.disposition).toBe('crossed_out');
    expect(sample.approved).toBe(false);
    const edited = await lab.edit(user, sample.id, {
      text: 'Wet wipes',
      approved: true,
      disposition: 'crossed_out',
    });
    expect(edited.approved).toBe(false);
  });
});
describe('training API authorization', () => {
  let runtime: Awaited<ReturnType<typeof createApp>>, dir: string;
  const previous = config.localTraining;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'docscrape-lab-api-'));
    runtime = await createApp({ directory: dir, mongoUri: '', redisUrl: '', recover: false });
  });
  afterAll(async () => {
    config.localTraining = previous;
    await runtime.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  it('requires login, blocks demo training and honors the production-disable switch', async () => {
    expect((await supertest(runtime.app).get('/api/training')).status).toBe(401);
    const demo = supertest.agent(runtime.app);
    await demo.post('/api/auth/demo').send({});
    expect((await demo.get('/api/training')).status).toBe(403);
    const user = supertest.agent(runtime.app);
    await user.post('/api/auth/register').send({
      name: 'Local trainer',
      email: 'trainer@example.com',
      password: 'local-training-password',
    });
    config.localTraining = false;
    expect((await user.get('/api/training')).status).toBe(403);
    config.localTraining = true;
    expect((await user.get('/api/training')).status).toBe(200);
  });
});
