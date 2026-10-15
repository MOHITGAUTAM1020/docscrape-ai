import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { TrainingLab } from '../src/training-lab.js';
import { config } from '../src/config.js';
const root = path.join(config.dataDir, 'training'),
  user = randomUUID(),
  lab = new TrainingLab(root, config.ocrModelDir);
await lab.setup();
const readiness = await lab.readiness();
console.log(JSON.stringify(readiness));
if (!readiness.trainerReady) throw new Error('Native/Docker training tools are not ready.');
const reports = [];
for (const language of ['eng', 'hin'] as const) {
  for (let i = 0; i < 30; i++) {
    const split = i < 20 ? 'train' : i < 25 ? 'validation' : 'test';
    const text = language === 'eng' ? `Invoice total ${1000 + i}` : `चालान संख्या ${1000 + i}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="130"><rect width="100%" height="100%" fill="white"/><text x="20" y="85" font-family="Nirmala UI,Arial,sans-serif" font-size="54" fill="black">${text}</text></svg>`;
    await lab.add(
      user,
      {
        language,
        sourceGroup: `native-fixture-${language}-${split}-${i}`,
        split,
        text,
        approved: true,
      },
      await sharp(Buffer.from(svg)).png().toBuffer(),
    );
  }
  const run = await lab.start(user, language, 'training', 100);
  let finished;
  let stage = '';
  for (let i = 0; i < 1200; i++) {
    const state = await lab.overview(user);
    finished = state.runs.find((r) => r.id === run.id);
    if (finished?.stage !== stage) {
      stage = finished?.stage || '';
      console.log(`${language}: ${stage}`);
    }
    if (finished?.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (finished?.status !== 'completed' || !finished.candidate) {
    console.log(finished?.logs.slice(-35).join('\n'));
    throw new Error(finished?.error || 'Native training smoke failed.');
  }
  reports.push(finished);
  console.log(
    `${language}: actual 100-iteration candidate trained and tested; CER ${(finished.candidate.cer * 100).toFixed(2)}%; gate ${finished.gate?.passed ? 'passed' : 'rejected'}. No model activated.`,
  );
}
await fs.writeFile(
  path.join(config.dataDir, 'native-training-smoke.json'),
  JSON.stringify({ fixtureWorkspace: user, runs: reports }, null, 2),
);
console.log(
  'Native English/Hindi training smoke completed. Synthetic fixtures validate the pipeline only; production model remains unchanged.',
);
