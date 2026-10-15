import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from '../src/parsers.js';
import { localExtract } from '../src/extraction.js';
const file = process.argv[2];
if (!file) throw new Error('Usage: tsx scripts/poster-smoke.ts <image-path>');
const parsed = await parseDocument(path.resolve(file), path.extname(file).slice(1).toLowerCase());
const extraction = localExtract(parsed.cleanedText, false, parsed.layout);
if (process.argv[3]) {
  const expected = process.argv[3].split(',').map(Number);
  if (JSON.stringify(extraction.sections.map((s) => s.items.length)) !== JSON.stringify(expected))
    throw new Error(`Unexpected section counts. Expected ${expected.join(',')}.`);
  for (const section of extraction.sections) {
    const sequence = section.items.map((i) => i.number);
    if (sequence.some((n, i) => n !== i + 1))
      throw new Error(`List order failed in ${section.name}.`);
  }
}
await fs.mkdir('data', { recursive: true });
await fs.writeFile('data/poster-validation.json', JSON.stringify({ extraction, parsed }, null, 2));
await fs.writeFile(
  'data/poster-extracted.json',
  JSON.stringify(
    {
      name: path.basename(file),
      provider: 'local',
      status: 'ready',
      extraction,
      sourceText: parsed.text,
      cleanedText: parsed.cleanedText,
      sheets: parsed.sheets,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      summary: extraction.summary,
      sections: extraction.sections.map((s) => ({
        name: s.name,
        count: s.items.length,
        items: s.items,
      })),
      layoutLines: parsed.layout?.lines.length,
    },
    null,
    2,
  ),
);
