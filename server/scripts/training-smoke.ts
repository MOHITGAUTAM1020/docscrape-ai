import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { TrainingLab } from '../src/training-lab.js';
import { config } from '../src/config.js';
const root = path.join(config.dataDir, 'training'),
  user = randomUUID();
const lab = new TrainingLab(root, config.ocrModelDir);
console.log(
  'Preparing pinned fine-tuning models and the app baseline locally (one-time downloads).',
);
await lab.setup();
const examples = {
  eng: [
    'Invoice total: 100',
    'Order number 1042',
    'Payment received',
    'Date 13 October 2026',
    'Thank you for your purchase',
  ],
  hin: [
    'नमस्ते भारत',
    'चालान संख्या १०४२',
    'कुल राशि १०० रुपये',
    'भुगतान प्राप्त हुआ',
    'आपका धन्यवाद',
  ],
};
try {
  const reports = [];
  for (const language of ['eng', 'hin'] as const) {
    for (const [i, text] of examples[language].entries()) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="130"><rect width="100%" height="100%" fill="white"/><text x="20" y="85" font-family="Nirmala UI,Arial,sans-serif" font-size="54" fill="black">${text}</text></svg>`;
      const image = await sharp(Buffer.from(svg)).png().toBuffer();
      await lab.add(
        user,
        {
          language,
          sourceGroup: `synthetic-${language}-${i}`,
          split: 'test',
          text,
          approved: true,
        },
        image,
      );
    }
    const run = await lab.start(user, language, 'baseline', 1000);
    let finished;
    for (let i = 0; i < 180; i++) {
      const state = await lab.overview(user);
      finished = state.runs.find((r) => r.id === run.id);
      if (finished?.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (finished?.status !== 'completed' || finished.baseline?.lines !== 5)
      throw new Error(finished?.error || 'Baseline evaluation did not finish.');
    reports.push(finished);
    console.log(
      `${language}: measured 5 synthetic lines; CER ${(finished.baseline.cer * 100).toFixed(2)}%, WER ${(finished.baseline.wer * 100).toFixed(2)}%. These are fixture scores, not general accuracy.`,
    );
  }
  await fs.writeFile(
    path.join(config.dataDir, 'training-smoke.json'),
    JSON.stringify(reports, null, 2),
  );
  console.log(
    'Local baseline workflow passed for English and Hindi. No model fine-tuning or deployment was performed.',
  );
} finally {
  const folder = path.resolve(root, user);
  if (path.dirname(folder) !== path.resolve(root))
    throw new Error('Unsafe temporary fixture path.');
  await fs.rm(folder, { recursive: true, force: true });
}
