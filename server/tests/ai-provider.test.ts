import { afterEach, describe, expect, it, vi } from 'vitest';
import { extract, localExtract } from '../src/extraction.js';
import { config } from '../src/config.js';
const previous = { provider: config.provider, apiKey: config.apiKey };
afterEach(() => {
  config.provider = previous.provider;
  config.apiKey = previous.apiKey;
  vi.unstubAllGlobals();
});
function enable() {
  config.provider = 'openai';
  config.apiKey = 'synthetic-test-key';
}
describe('AI provider contract (mocked HTTP, no paid requests)', () => {
  it('sends the strict schema server-side and validates completed output', async () => {
    enable();
    const result = localExtract('Vendor: Northstar\nTotal: 100');
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', request);
    const extraction = await extract('Vendor: Northstar\nTotal: 100', false);
    expect(extraction.fields[1].value).toBe('100');
    const init = request.mock.calls[0][1];
    const payload = JSON.parse(init.body);
    expect(payload.store).toBe(false);
    expect(payload.text.format.strict).toBe(true);
    expect(payload.instructions).toContain('untrusted DATA');
    expect(init.headers.Authorization).toBe('Bearer synthetic-test-key');
  });
  it('does not silently fabricate a result on provider errors or incomplete output', async () => {
    enable();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(extract('Total: 100', false)).rejects.toThrow('HTTP 401');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: 'incomplete', output: [] }), { status: 200 }),
        ),
    );
    await expect(extract('Total: 100', false)).rejects.toThrow('incomplete');
  });
  it('rejects output that does not match the app schema', async () => {
    enable();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [{ content: [{ type: 'output_text', text: '{"wrong":true}' }] }],
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(extract('Total: 100', false)).rejects.toThrow();
  });
  it('flags evidence that cannot be found in the source', async () => {
    enable();
    const result = localExtract('Total: 100');
    result.fields[0].evidence = 'Total: 999';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
          }),
          { status: 200 },
        ),
      ),
    );
    expect(
      (await extract('Total: 100', false)).warnings.some((w) => w.includes('could not be matched')),
    ).toBe(true);
  });
  it('flags unmatched section item evidence and provides layout grouping in the request', async () => {
    enable();
    const result = localExtract('Meditation\n1. Seated practice\n2. Breathing practice', false);
    result.sections[0].items[0].evidence = 'Missing from source';
    result.sections[0].items[0].needsReview = false;
    result.sections[0].items[1].text = 'Unstated corrected name';
    result.sections[0].items[1].needsReview = false;
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', request);
    const extracted = await extract('Meditation\n1. Seated practice\n2. Breathing practice', false);
    expect(extracted.sections[0].items[0].needsReview).toBe(true);
    expect(extracted.sections[0].items[1].needsReview).toBe(true);
    const payload = JSON.parse(request.mock.calls[0][1].body);
    expect(payload.text.format.schema.required).toContain('sections');
    expect(payload.instructions).toContain('preserve repeated labels');
  });
});
