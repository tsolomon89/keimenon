import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Storage, StorageMetadata, StoragePutResult } from '@keimenon/agent-core';

function resolveArtifactsRoot(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const localDocsPath =
    process.env.LOCAL_DOCS_PATH?.replace('~', homeDir) || path.join(homeDir, '.keimenon');

  return path.join(localDocsPath, 'agent-artifacts');
}

export class LocalArtifactStorage implements Storage {
  private readonly rootPath: string;

  constructor(rootPath?: string) {
    this.rootPath = rootPath || resolveArtifactsRoot();
  }

  async ensureReady(): Promise<void> {
    await fs.mkdir(this.rootPath, { recursive: true });
  }

  async put(
    content: string | Buffer,
    options?: { content_type?: string; filename?: string }
  ): Promise<StoragePutResult> {
    await this.ensureReady();

    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    const hash = this.calculateHash(data);
    const storagePath = this.getStoragePath(hash);
    const dir = path.dirname(storagePath);

    await fs.mkdir(dir, { recursive: true });

    let isNew = false;
    try {
      await fs.access(storagePath);
    } catch {
      isNew = true;
      await fs.writeFile(storagePath, data);
    }

    const metadataPath = this.getMetadataPath(hash);
    const metadata: StorageMetadata = {
      hash,
      size: data.byteLength,
      created_at: Date.now(),
      content_type: options?.content_type,
      filename: options?.filename,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata));

    return {
      hash,
      path: this.getRelativePath(hash),
      isNew,
      size: data.byteLength,
    };
  }

  async putJson(data: unknown, filename?: string): Promise<StoragePutResult> {
    return this.put(JSON.stringify(data, null, 2), {
      content_type: 'application/json',
      filename,
    });
  }

  async get(hash: string): Promise<string | Buffer | null> {
    const storagePath = this.getStoragePath(hash);
    try {
      return await fs.readFile(storagePath);
    } catch {
      return null;
    }
  }

  async getJson<T = unknown>(hash: string): Promise<T | null> {
    const data = await this.get(hash);
    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data.toString('utf8')) as T;
    } catch {
      return null;
    }
  }

  async exists(hash: string): Promise<boolean> {
    const storagePath = this.getStoragePath(hash);
    try {
      await fs.access(storagePath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(hash: string): Promise<StorageMetadata | null> {
    const metadataPath = this.getMetadataPath(hash);
    try {
      const raw = await fs.readFile(metadataPath, 'utf8');
      return JSON.parse(raw) as StorageMetadata;
    } catch {
      return null;
    }
  }

  async delete(hash: string): Promise<boolean> {
    const storagePath = this.getStoragePath(hash);
    const metadataPath = this.getMetadataPath(hash);
    const existed = await this.exists(hash);

    await Promise.all([fs.rm(storagePath, { force: true }), fs.rm(metadataPath, { force: true })]);

    return existed;
  }

  async getPath(hash: string): Promise<string | null> {
    const storagePath = this.getStoragePath(hash);
    if (!(await this.exists(hash))) {
      return null;
    }
    return storagePath;
  }

  calculateHash(content: string | Buffer): string {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    return createHash('sha256').update(data).digest('hex');
  }

  async list(options?: { limit?: number; offset?: number }): Promise<string[]> {
    await this.ensureReady();

    const hashes: string[] = [];
    const firstLevel = await fs.readdir(this.rootPath, { withFileTypes: true });

    for (const entry of firstLevel) {
      if (!entry.isDirectory() || entry.name.length !== 2) {
        continue;
      }

      const bucketPath = path.join(this.rootPath, entry.name);
      const files = await fs.readdir(bucketPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || file.name.endsWith('.meta.json')) {
          continue;
        }
        hashes.push(file.name);
      }
    }

    hashes.sort();
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? hashes.length;
    return hashes.slice(offset, offset + limit);
  }

  async getUsage(): Promise<number> {
    const hashes = await this.list();
    let total = 0;
    for (const hash of hashes) {
      const storagePath = this.getStoragePath(hash);
      const stat = await fs.stat(storagePath);
      total += stat.size;
    }
    return total;
  }

  private getRelativePath(hash: string): string {
    return path.join(hash.slice(0, 2), hash);
  }

  private getStoragePath(hash: string): string {
    return path.join(this.rootPath, this.getRelativePath(hash));
  }

  private getMetadataPath(hash: string): string {
    return `${this.getStoragePath(hash)}.meta.json`;
  }
}
