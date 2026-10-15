import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const root = path.resolve('training/tools');
await fs.mkdir(root, { recursive: true });
for (const [name, url, commit] of [
  [
    'tesstrain',
    'https://github.com/tesseract-ocr/tesstrain.git',
    '405346a3a67d8e4e049341d1da6a4b752e0b8351',
  ],
  [
    'langdata',
    'https://github.com/tesseract-ocr/langdata_lstm.git',
    '07930fd9f246622c26eb5de794d9212ceac432d3',
  ],
]) {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(path.join(dir, '.git'));
  } catch {
    await exec('git', ['init', dir], { windowsHide: true });
    await exec('git', ['-C', dir, 'remote', 'add', 'origin', url], { windowsHide: true });
  }
  await exec('git', ['-C', dir, 'config', 'core.autocrlf', 'false'], { windowsHide: true });
  await exec('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', commit], {
    windowsHide: true,
    maxBuffer: 5 * 1048576,
  });
  if (name === 'langdata')
    await exec(
      'git',
      ['-C', dir, 'sparse-checkout', 'set', '--no-cone', '/*.unicharset', '/radical-stroke.txt'],
      { windowsHide: true },
    );
  await exec('git', ['-C', dir, 'checkout', '--detach', commit], {
    windowsHide: true,
    maxBuffer: 5 * 1048576,
  });
  console.log(`Pinned ${name} sources prepared locally.`);
}
console.log(
  'Training sources are ready. The app detects native Ubuntu tools automatically; Docker is optional.',
);
