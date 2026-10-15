import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
export const trainingProject = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const worker = path.join(trainingProject, 'training', 'worker.mjs'),
  trainer = path.join(trainingProject, 'training', 'tools', 'tesstrain'),
  langdata = path.join(trainingProject, 'training', 'tools', 'langdata');
const distro = process.env.TRAINING_WSL_DISTRO || 'Ubuntu';
export async function nativeReady() {
  try {
    await fs.access(path.join(trainer, 'Makefile'));
    await fs.access(path.join(langdata, 'Latin.unicharset'));
    await fs.access(path.join(langdata, 'Devanagari.unicharset'));
    const check =
      'command -v tesseract && command -v lstmtraining && command -v make && command -v node && python3 -m PIL';
    if (process.platform === 'win32') {
      await exec('wsl.exe', ['-d', distro, '--exec', 'bash', '-lc', check], {
        timeout: 8000,
        windowsHide: true,
      });
      await exec('wsl.exe', ['-d', distro, '--exec', 'python3', '-c', 'import bidi.algorithm'], {
        timeout: 8000,
        windowsHide: true,
      });
    } else {
      await exec('bash', ['-lc', check], { timeout: 8000 });
      await exec('python3', ['-c', 'import bidi.algorithm'], { timeout: 8000 });
    }
    return true;
  } catch {
    return false;
  }
}
export async function nativeCommand(jobDir: string) {
  if (process.platform === 'win32') {
    const unix = async (file: string) =>
      (
        await exec('wsl.exe', ['-d', distro, '--exec', 'wslpath', '-u', file], {
          windowsHide: true,
        })
      ).stdout.trim();
    const [job, script, source, data] = await Promise.all([
      unix(jobDir),
      unix(worker),
      unix(trainer),
      unix(langdata),
    ]);
    return {
      command: 'wsl.exe',
      args: [
        '-d',
        distro,
        '--exec',
        'env',
        'OMP_THREAD_LIMIT=2',
        'node',
        script,
        '--job',
        job,
        '--trainer',
        source,
        '--langdata',
        data,
      ],
    };
  }
  return {
    command: 'node',
    args: [worker, '--job', jobDir, '--trainer', trainer, '--langdata', langdata],
  };
}
