import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import type { DocumentRecord, User } from './types.js';
type State = { users: User[]; documents: DocumentRecord[] };
export class Store {
  private state: State = { users: [], documents: [] };
  private pending = Promise.resolve();
  private mongo = false;
  private userModel =
    mongoose.models.DocUser ||
    mongoose.model(
      'DocUser',
      new mongoose.Schema(
        {
          id: { type: String, unique: true },
          email: { type: String, unique: true },
          name: String,
          passwordHash: String,
          demo: Boolean,
          createdAt: String,
        },
        { versionKey: false },
      ),
    );
  private docModel =
    mongoose.models.DocDocument ||
    mongoose.model(
      'DocDocument',
      new mongoose.Schema(
        {
          id: { type: String, unique: true },
          userId: { type: String, index: true },
          payload: mongoose.Schema.Types.Mixed,
        },
        { versionKey: false },
      ),
    );
  constructor(
    private directory: string,
    private mongoUri = '',
  ) {}
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    if (this.mongoUri) {
      await mongoose.connect(this.mongoUri, { serverSelectionTimeoutMS: 10000 });
      await Promise.all([this.userModel.init(), this.docModel.init()]);
      this.mongo = true;
    } else {
      try {
        this.state = JSON.parse(await fs.readFile(path.join(this.directory, 'store.json'), 'utf8'));
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
  }
  private async mutate<T>(fn: () => T): Promise<T> {
    let result!: T;
    const task = this.pending.then(async () => {
      result = fn();
      const file = path.join(this.directory, 'store.json');
      await fs.writeFile(file + '.tmp', JSON.stringify(this.state));
      await fs.rename(file + '.tmp', file);
    });
    this.pending = task.catch(() => {});
    await task;
    return structuredClone(result);
  }
  async userByEmail(email: string): Promise<User | undefined> {
    if (this.mongo) {
      const u = await this.userModel.findOne({ email }).lean();
      return u ? this.cleanUser(u) : undefined;
    }
    return structuredClone(this.state.users.find((u) => u.email === email));
  }
  async userById(id: string): Promise<User | undefined> {
    if (this.mongo) {
      const u = await this.userModel.findOne({ id }).lean();
      return u ? this.cleanUser(u) : undefined;
    }
    return structuredClone(this.state.users.find((u) => u.id === id));
  }
  private cleanUser(u: any): User {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      passwordHash: u.passwordHash,
      demo: u.demo,
      createdAt: u.createdAt,
    };
  }
  async addUser(user: User) {
    if (this.mongo) {
      await this.userModel.create(user);
      return;
    }
    await this.mutate(() => {
      if (this.state.users.some((u) => u.email === user.email))
        throw Object.assign(new Error('Email already registered.'), { status: 409 });
      this.state.users.push(user);
    });
  }
  async list(userId?: string): Promise<DocumentRecord[]> {
    if (this.mongo)
      return (await this.docModel.find(userId ? { userId } : {}).lean()).map((r: any) => r.payload);
    return structuredClone(this.state.documents.filter((d) => !userId || d.userId === userId));
  }
  async get(id: string): Promise<DocumentRecord | undefined> {
    if (this.mongo) return ((await this.docModel.findOne({ id }).lean()) as any)?.payload;
    return structuredClone(this.state.documents.find((d) => d.id === id));
  }
  async add(doc: DocumentRecord, max: number) {
    // Route serializes per-user quota reservations. Mongo's atomic unique id prevents duplicate jobs.
    if (this.mongo) {
      if ((await this.docModel.countDocuments({ userId: doc.userId })) >= max)
        throw Object.assign(new Error('Document limit reached.'), { status: 429 });
      await this.docModel.create({ id: doc.id, userId: doc.userId, payload: doc });
      return;
    }
    await this.mutate(() => {
      if (this.state.documents.filter((d) => d.userId === doc.userId).length >= max)
        throw Object.assign(new Error('Document limit reached.'), { status: 429 });
      this.state.documents.push(doc);
    });
  }
  async update(
    id: string,
    patch: Partial<DocumentRecord>,
    expectedVersion?: number,
  ): Promise<DocumentRecord | undefined> {
    if (this.mongo) {
      const old = await this.get(id);
      if (!old) return;
      if (expectedVersion !== undefined && old.version !== expectedVersion)
        throw Object.assign(new Error('Document changed. Refresh before saving.'), { status: 409 });
      const next = {
        ...old,
        ...patch,
        version: old.version + 1,
        updatedAt: new Date().toISOString(),
      };
      const result = await this.docModel.updateOne(
        { id, 'payload.version': old.version },
        { $set: { payload: next } },
      );
      if (!result.modifiedCount)
        throw Object.assign(new Error('Document changed. Refresh before saving.'), { status: 409 });
      return next;
    }
    return this.mutate(() => {
      const index = this.state.documents.findIndex((d) => d.id === id);
      if (index < 0) return undefined;
      const old = this.state.documents[index];
      if (expectedVersion !== undefined && old.version !== expectedVersion)
        throw Object.assign(new Error('Document changed. Refresh before saving.'), { status: 409 });
      return (this.state.documents[index] = {
        ...old,
        ...patch,
        version: old.version + 1,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  async remove(id: string) {
    if (this.mongo) await this.docModel.deleteOne({ id });
    else
      await this.mutate(() => {
        this.state.documents = this.state.documents.filter((d) => d.id !== id);
      });
  }
  async close() {
    await this.pending;
    if (this.mongo) await mongoose.disconnect();
  }
}
