import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
function argument(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const originalRoot = path.resolve(argument('--job', '/job')),
  trainer = argument('--trainer', '/opt/tesstrain'),
  langdata = argument('--langdata', '/opt/langdata');
// GNU Make's upstream workflow does not support spaces in dataset paths.
let temporary;
if (/\s/.test(originalRoot)) {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'docscrape-native-'));
  await fs.cp(originalRoot, temporary, { recursive: true });
}
const root = temporary || originalRoot;
try {
  const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
  if (
    !['eng', 'hin'].includes(config.language) ||
    !Number.isInteger(config.iterations) ||
    config.iterations < 100 ||
    config.iterations > 10000
  )
    throw new Error('Invalid training configuration.');
  const name = `docscrape_${config.language}`;
  const outputDir = path.join(root, 'data', name);
  await fs.mkdir(outputDir, { recursive: true });
  for (const split of ['train', 'validation']) {
    const output = path.join(root, 'ground-truth', split);
    await fs.mkdir(output, { recursive: true });
    for (const file of await fs.readdir(path.join(root, split))) {
      if (!/^[0-9a-f-]+\.(png|gt\.txt)$/i.test(file))
        throw new Error('Unexpected sample filename.');
      await fs.copyFile(path.join(root, split, file), path.join(output, file));
    }
  }
  const resources = ['radical-stroke.txt', 'Latin.unicharset', 'Devanagari.unicharset'].map((f) =>
    path.join(langdata, f),
  );
  for (const file of resources) await fs.access(file);
  const localData = path.join(root, 'langdata');
  await fs.mkdir(localData, { recursive: true });
  for (const file of resources)
    await fs.writeFile(
      path.join(localData, path.basename(file)),
      (await fs.readFile(file, 'utf8')).replace(/\r\n/g, '\n'),
    );
  const localResources = resources.map((f) => path.join(localData, path.basename(f)));
  const args = [
    `MODEL_NAME=${name}`,
    `DATA_DIR=${root}/data`,
    `OUTPUT_DIR=${outputDir}`,
    `GROUND_TRUTH_DIR=${root}/ground-truth`,
    `TESSDATA=${root}/bases`,
    `LANGDATA_DIR=${localData}`,
    `TESSERACT_LANGDATA=${localResources.join(' ')}`,
    `START_MODEL=${config.language}`,
    `LANG_TYPE=${config.language === 'hin' ? 'Indic' : ''}`,
    `MAX_ITERATIONS=${config.iterations}`,
    'PSM=7',
    'DEBUG_INTERVAL=0',
    'RANDOM_SEED=0',
  ];
  function make(target) {
    return new Promise((resolve, reject) => {
      const child = spawn('make', [target, ...args], {
        stdio: 'inherit',
        shell: false,
        cwd: trainer,
        detached: true,
      });
      const timer = setInterval(() => {
        fs.access(path.join(originalRoot, 'STOP'))
          .then(() => {
            try {
              process.kill(-child.pid, 'SIGTERM');
            } catch {}
          })
          .catch(() => {});
      }, 500);
      child.on('error', (e) => {
        clearInterval(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearInterval(timer);
        code === 0 ? resolve() : reject(new Error(`make ${target} exited ${code}`));
      });
    });
  }
  await make('lists');
  for (const [split, file] of [
    ['train', 'list.train'],
    ['validation', 'list.eval'],
  ]) {
    const files = (await fs.readdir(path.join(root, 'ground-truth', split)))
      .filter((f) => f.endsWith('.lstmf'))
      .sort()
      .map((f) => path.join(root, 'ground-truth', split, f));
    if (!files.length) throw new Error(`${split} has no generated training lines.`);
    await fs.writeFile(path.join(outputDir, file), files.join('\n') + '\n');
  }
  await make('training');
  await fs.copyFile(outputDir + '.traineddata', path.join(originalRoot, 'candidate.traineddata'));
  console.log('Local fine-tuning completed. Candidate saved; no inference model was replaced.');
} finally {
  if (temporary) {
    try {
      await fs.cp(path.join(root, 'data'), path.join(originalRoot, 'data'), { recursive: true });
    } catch {}
    if (
      path.dirname(path.resolve(temporary)) !== path.resolve(os.tmpdir()) ||
      !path.basename(temporary).startsWith('docscrape-native-')
    )
      throw new Error('Unsafe temporary training path.');
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
