import { Queue, Worker } from 'bullmq';
import { Store } from './store.js';
import { config } from './config.js';
import { parseDocument } from './parsers.js';
import { extract } from './extraction.js';
import { publicDocument, type DocumentRecord } from './types.js';
export class Processor {
  private queue?: Queue;
  private worker?: Worker;
  private jobs: string[] = [];
  private active = false;
  private closing = false;
  private running = new Set<string>();
  constructor(
    private store: Store,
    private notify: (userId: string, document: ReturnType<typeof publicDocument>) => void,
    redisUrl = config.redisUrl,
  ) {
    if (redisUrl) {
      const u = new URL(redisUrl);
      const connection = {
        host: u.hostname,
        port: Number(u.port || 6379),
        username: u.username || undefined,
        password: u.password || undefined,
        db: Number(u.pathname.slice(1) || 0),
        ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
      };
      this.queue = new Queue('document-processing', { connection });
      this.worker = new Worker(
        'document-processing',
        async (job) => this.process(String(job.data.id)),
        { connection, concurrency: 2 },
      );
      this.worker.on('error', (e) => console.error('Queue worker:', e.message));
    }
  }
  isBusy(id: string) {
    return this.running.has(id);
  }
  async enqueue(id: string) {
    if (this.closing) throw new Error('Processor is shutting down.');
    if (this.queue)
      await this.queue.add('extract', { id }, { removeOnComplete: true, removeOnFail: 100 });
    else {
      if (!this.jobs.includes(id)) this.jobs.push(id);
      void this.drain();
    }
  }
  private async drain() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.jobs.length && !this.closing) await this.process(this.jobs.shift()!);
    } finally {
      this.active = false;
    }
  }
  private async publish(id: string, patch: Partial<DocumentRecord>, version?: number) {
    const doc = await this.store.update(id, patch, version);
    if (doc) this.notify(doc.userId, publicDocument(doc));
    return doc;
  }
  async process(id: string) {
    const doc = await this.store.get(id);
    if (!doc || doc.status !== 'queued' || !doc.path) return;
    const start = Date.now();
    this.running.add(id);
    try {
      await this.publish(
        id,
        { status: 'processing', stage: 'Reading document', error: null },
        doc.version,
      );
      const parsed = await parseDocument(doc.path, doc.extension);
      await this.publish(id, {
        stage: config.provider === 'openai' ? 'Extracting with AI' : 'Extracting fields',
        sourceText: parsed.text,
        cleanedText: parsed.cleanedText,
        sourceLayout: parsed.layout,
        sheets: parsed.sheets,
      });
      const extraction = await extract(
        parsed.cleanedText,
        parsed.sheets.length > 0,
        parsed.layout,
        doc.profile || 'auto',
      );
      extraction.warnings.push(...parsed.warnings);
      await this.publish(id, {
        status: 'ready',
        stage: 'Ready for review',
        extraction,
        provider: config.provider,
        processingMs: Date.now() - start,
      });
    } catch (e: any) {
      // CAS prevents duplicate Redis delivery from overwriting an already-running/completed document.
      if (e.status !== 409) {
        try {
          await this.publish(id, {
            status: 'failed',
            stage: 'Processing failed',
            error: String(e.message || 'Unable to process document.').slice(0, 500),
            processingMs: Date.now() - start,
          });
        } catch (failure) {
          console.error('Unable to persist processing failure', failure);
        }
      }
    } finally {
      this.running.delete(id);
    }
  }
  async recover() {
    for (const doc of await this.store.list()) {
      if (doc.status === 'queued' || doc.status === 'processing') {
        await this.store.update(doc.id, { status: 'queued', stage: 'Queued after restart' });
        await this.enqueue(doc.id);
      }
    }
  }
  async close() {
    this.closing = true;
    await this.worker?.close();
    await this.queue?.close();
    while (this.active) await new Promise((r) => setTimeout(r, 50));
  }
}
