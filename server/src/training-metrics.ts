export type Accuracy = {
  cer: number;
  wer: number;
  graphemeErrorRate: number;
  exactLineRate: number;
  lines: number;
  characters: number;
  words: number;
  milliseconds: number;
};
export function normalizedText(text: string) {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ');
}
export function editDistance<T>(a: T[], b: T[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++)
      current.push(
        Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1)),
      );
    previous = current;
  }
  return previous[b.length];
}
export function accuracy(
  pairs: { expected: string; actual: string; milliseconds: number }[],
): Accuracy {
  let chars = 0,
    words = 0,
    graphemes = 0,
    charErrors = 0,
    wordErrors = 0,
    graphemeErrors = 0,
    exact = 0;
  const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' });
  for (const pair of pairs) {
    const expected = normalizedText(pair.expected),
      actual = normalizedText(pair.actual);
    const a = Array.from(expected),
      b = Array.from(actual);
    const aw = expected.split(' '),
      bw = actual ? actual.split(' ') : [];
    const ag = Array.from(segmenter.segment(expected), (s) => s.segment),
      bg = Array.from(segmenter.segment(actual), (s) => s.segment);
    chars += a.length;
    words += aw.length;
    graphemes += ag.length;
    charErrors += editDistance(a, b);
    wordErrors += editDistance(aw, bw);
    graphemeErrors += editDistance(ag, bg);
    if (expected === actual) exact++;
  }
  return {
    cer: chars ? charErrors / chars : 0,
    wer: words ? wordErrors / words : 0,
    graphemeErrorRate: graphemes ? graphemeErrors / graphemes : 0,
    exactLineRate: pairs.length ? exact / pairs.length : 0,
    lines: pairs.length,
    characters: chars,
    words,
    milliseconds: pairs.reduce((n, p) => n + p.milliseconds, 0),
  };
}
export function releaseGate(baseline: Accuracy, candidate: Accuracy, sameTestSet: boolean) {
  const reasons: string[] = [];
  if (!sameTestSet) reasons.push('Baseline and candidate must use the identical frozen test set.');
  if (candidate.lines < 5 || baseline.lines < 5)
    reasons.push(
      'At least five held-out lines are required for a smoke comparison; a larger test set is needed before real deployment.',
    );
  if (candidate.cer >= baseline.cer) reasons.push('Candidate character error rate must improve.');
  if (candidate.wer > baseline.wer) reasons.push('Candidate word error rate regressed.');
  if (candidate.graphemeErrorRate > baseline.graphemeErrorRate)
    reasons.push('Candidate grapheme error rate regressed.');
  if (candidate.exactLineRate < baseline.exactLineRate)
    reasons.push('Exact-line match rate regressed.');
  if (candidate.milliseconds > Math.max(baseline.milliseconds, 1) * 1.5)
    reasons.push('Recognition time regressed by more than 50%.');
  return { passed: reasons.length === 0, reasons };
}
