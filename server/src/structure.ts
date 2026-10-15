import type { Extraction, LayoutLine, LayoutWord, SourceLayout, TextBox } from './types.js';
type Section = Extraction['sections'][number];
type Entry = {
  text: string;
  number: number | null;
  evidence: string;
  needsReview: boolean;
  bbox: TextBox;
};
const letters = /\p{L}/gu;
// Conservative filtering: never rewrite names, digits, dates, currencies or punctuation inside values.
export function cleanOcrText(text: string, layout?: SourceLayout) {
  let removed = 0;
  const uncertainFragments = new Set(
    (layout?.lines || [])
      .filter(
        (line) =>
          line.confidence < 80 &&
          (line.text.match(letters) || []).length <= 2 &&
          !/\d|[:=]/.test(line.text),
      )
      .map((line) => line.text.trim()),
  );
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      const count = (line.match(letters) || []).length;
      const meaningful =
        !uncertainFragments.has(line) &&
        (count >= 3 || /\d/.test(line) || /^[\p{L}]{1,2}$|^[\p{L}]{1,10}\s*[:=]\s*\S/u.test(line));
      if (!meaningful) removed++;
      return meaningful;
    });
  return { text: lines.join('\n'), removed };
}
function height(b: TextBox) {
  return b.y1 - b.y0;
}
function centerX(b: TextBox) {
  return (b.x0 + b.x1) / 2;
}
function union(words: LayoutWord[]): TextBox {
  return {
    x0: Math.min(...words.map((w) => w.bbox.x0)),
    y0: Math.min(...words.map((w) => w.bbox.y0)),
    x1: Math.max(...words.map((w) => w.bbox.x1)),
    y1: Math.max(...words.map((w) => w.bbox.y1)),
  };
}
function textEntries(text: string): Omit<Entry, 'bbox'>[] {
  const bullet = text.match(/^\s*[-*•▪]\s+(.+)$/u);
  if (bullet && (bullet[1].match(letters) || []).length)
    return [{ text: bullet[1].trim(), number: null, evidence: text.trim(), needsReview: false }];
  const matches = [...text.matchAll(/(?:^|\s)(\d{1,3})[.)]\s+/g)];
  return matches
    .map((m, i) => {
      const end = matches[i + 1]?.index ?? text.length;
      const evidence = text.slice(m.index!, end).trim();
      const value = text.slice(m.index! + m[0].length, end).trim();
      return { text: value, number: Number(m[1]), evidence, needsReview: false };
    })
    .filter((item) => (item.text.match(letters) || []).length >= 3);
}
function entries(line: LayoutLine): Entry[] {
  // Each list marker starts a label even when OCR merged a whole row into one line.
  const starts = line.words
    .map((w, i) => (/^\d{1,3}[.)]$|^[•▪*]$/.test(w.text) ? i : -1))
    .filter((i) => i >= 0);
  if (!starts.length)
    return textEntries(line.text).map((item) => ({
      ...item,
      bbox: line.bbox,
      needsReview: line.confidence < 75,
    }));
  return starts
    .map((start, i) => {
      const words = line.words.slice(start, starts[i + 1] ?? line.words.length);
      const text = words
        .slice(1)
        .map((w) => w.text)
        .join(' ')
        .trim();
      return {
        text,
        number: /\d/.test(words[0].text) ? parseInt(words[0].text, 10) : null,
        evidence: words.map((w) => w.text).join(' '),
        needsReview: words.some((w) => w.confidence < 75),
        bbox: union(words),
      };
    })
    .filter((item) => (item.text.match(letters) || []).length >= 3);
}
export function layoutSections(layout: SourceLayout): Section[] {
  const lines = layout.lines
    .filter((l) => cleanOcrText(l.text).text)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const numbered = lines.flatMap(entries);
  if (numbered.length < 3) return [];
  const sizes = numbered.map((e) => height(e.bbox)).sort((a, b) => a - b);
  const typical = sizes[Math.floor(sizes.length / 2)] || 1;
  const headings = lines.filter(
    (l) =>
      !entries(l).length &&
      !/[:=]/.test(l.text) &&
      l.text.length <= 160 &&
      (l.text.match(letters) || []).length >= 4 &&
      height(l.bbox) > typical * 1.35,
  );
  // A title beginning with a count ("7 Surya...") is not a numbered list marker.
  if (!headings.length) return [];
  const groups = headings.map((h) => ({
    heading: h,
    section: { name: h.text.trim(), evidence: h.text.trim(), items: [] } as Section,
  }));
  function owner(box: TextBox) {
    const x = centerX(box);
    const candidates = groups.filter((g) => {
      if (g.heading.bbox.y1 > box.y0 + typical * 0.35) return false;
      const ratio = centerX(g.heading.bbox) / layout.width;
      return ratio > 0.65 ? x >= layout.width * 0.5 : ratio < 0.35 ? x < layout.width * 0.5 : true;
    });
    return candidates.sort((a, b) => b.heading.bbox.y0 - a.heading.bbox.y0)[0];
  }
  const items = numbered.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  for (const entry of items) {
    const group = owner(entry.bbox);
    if (!group) continue;
    // Join a wrapped label only if its text is directly below the same horizontal region.
    const continuation = lines.find(
      (line) =>
        !entries(line).length &&
        !headings.includes(line) &&
        line.bbox.y0 >= entry.bbox.y1 - 2 &&
        line.bbox.y0 - entry.bbox.y1 < typical * 1.4 &&
        Math.abs(centerX(line.bbox) - centerX(entry.bbox)) <
          Math.max(entry.bbox.x1 - entry.bbox.x0, typical * 3) * 0.65 &&
        (line.text.match(letters) || []).length >= 4,
    );
    if (continuation) {
      entry.text += ' ' + continuation.text.trim();
      entry.evidence += '\n' + continuation.text.trim();
      entry.needsReview ||= continuation.confidence < 75;
    }
    if (group.section.items.length < 200)
      group.section.items.push({
        text: entry.text.slice(0, 2000),
        number: entry.number,
        evidence: entry.evidence.slice(0, 3000),
        needsReview: entry.needsReview,
      });
  }
  return groups
    .map((g) => g.section)
    .filter((s) => s.items.length)
    .slice(0, 30)
    .map((section) => {
      const numbers = section.items.map((i) => i.number);
      if (numbers.every((n) => n !== null) && new Set(numbers).size === numbers.length)
        section.items.sort((a, b) => a.number! - b.number!);
      return section;
    });
}
export function textSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;
  const lines = cleanOcrText(text).text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const items = textEntries(line);
    if (items.length) {
      if (!current) {
        current = { name: 'Items', evidence: '', items: [] };
        sections.push(current);
      }
      current.items.push(
        ...items
          .map((item) => ({ ...item, needsReview: true }))
          .slice(0, 200 - current.items.length),
      );
      continue;
    }
    // Headings need actual nearby list content; avoid promoting every prose line into a section.
    if (
      !/[:=]/.test(line) &&
      line.length <= 150 &&
      lines.slice(i + 1, i + 4).some((next) => textEntries(next).length)
    ) {
      current = { name: line, evidence: line, items: [] };
      if (sections.length < 30) sections.push(current);
    }
  }
  return sections.filter((s) => s.items.length);
}
