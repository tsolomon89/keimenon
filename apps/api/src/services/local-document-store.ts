import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface DocumentMetadata {
  id: string;
  type: 'conversation' | 'message' | 'source' | 'code';
  hash: string;
  storagePath: string;
  size: number;
  createdAt: number;
}

export interface LocalStoreConfig {
  basePath?: string; // Defaults to ~/.keimenon
  enableDeduplication?: boolean;
}

/**
 * Local-first document storage service
 * Stores full content on local filesystem and returns local storage pointers.
 */
export class LocalDocumentStore {
  private basePath: string;
  private enableDedup: boolean;

  constructor(config: LocalStoreConfig = {}) {
    this.basePath = config.basePath || path.join(os.homedir(), '.keimenon');
    this.enableDedup = config.enableDeduplication ?? true;
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    const dirs = [
      'documents/conversations',
      'documents/messages',
      'documents/sources',
      'documents/code',
      'documents/uploads',
      'metadata',
    ];

    for (const dir of dirs) {
      await fs.mkdir(path.join(this.basePath, dir), { recursive: true });
    }

    console.log(`✅ Local document store initialized at: ${this.basePath}`);
  }

  /**
   * Save a full conversation export
   */
  async saveConversation(conversationId: string, conversationData: any): Promise<DocumentMetadata> {
    const content = JSON.stringify(conversationData, null, 2);
    const hash = this.computeHash(content);

    // Check for duplicate if enabled
    if (this.enableDedup) {
      const existing = await this.findByHash(hash, 'conversation');
      if (existing) {
        return existing;
      }
    }

    const dirPath = path.join(this.basePath, 'documents/conversations', conversationId);
    await fs.mkdir(dirPath, { recursive: true });

    const filePath = path.join(dirPath, 'conversation.json');
    await fs.writeFile(filePath, content, 'utf-8');

    const metadata: DocumentMetadata = {
      id: conversationId,
      type: 'conversation',
      hash,
      storagePath: this.getRelativePath(filePath),
      size: Buffer.byteLength(content),
      createdAt: Date.now(),
    };

    await this.saveMetadata(metadata);
    return metadata;
  }

  /**
   * Save individual message content
   */
  async saveMessage(
    conversationId: string,
    messageId: string,
    content: string,
    format: 'md' | 'json' = 'md'
  ): Promise<DocumentMetadata> {
    const hash = this.computeHash(content);

    // Check for duplicate
    if (this.enableDedup) {
      const existing = await this.findByHash(hash, 'message');
      if (existing) {
        return existing;
      }
    }

    const dirPath = path.join(this.basePath, 'documents/messages', conversationId);
    await fs.mkdir(dirPath, { recursive: true });

    const ext = format === 'json' ? 'json' : 'md';
    const filePath = path.join(dirPath, `${messageId}.${ext}`);

    await fs.writeFile(filePath, content, 'utf-8');

    const metadata: DocumentMetadata = {
      id: messageId,
      type: 'message',
      hash,
      storagePath: this.getRelativePath(filePath),
      size: Buffer.byteLength(content),
      createdAt: Date.now(),
    };

    await this.saveMetadata(metadata);
    return metadata;
  }

  /**
   * Save source document
   */
  async saveSource(sourceId: string, content: string): Promise<DocumentMetadata> {
    const hash = this.computeHash(content);

    if (this.enableDedup) {
      const existing = await this.findByHash(hash, 'source');
      if (existing) {
        return existing;
      }
    }

    const filePath = path.join(this.basePath, 'documents/sources', `${sourceId}.md`);
    await fs.writeFile(filePath, content, 'utf-8');

    const metadata: DocumentMetadata = {
      id: sourceId,
      type: 'source',
      hash,
      storagePath: this.getRelativePath(filePath),
      size: Buffer.byteLength(content),
      createdAt: Date.now(),
    };

    await this.saveMetadata(metadata);
    return metadata;
  }

  /**
   * Save code block
   */
  async saveCodeBlock(codeId: string, code: string, language: string): Promise<DocumentMetadata> {
    const hash = this.computeHash(code);

    if (this.enableDedup) {
      const existing = await this.findByHash(hash, 'code');
      if (existing) {
        return existing;
      }
    }

    const ext = this.getExtensionForLanguage(language);
    const filePath = path.join(this.basePath, 'documents/code', `${codeId}.${ext}`);
    await fs.writeFile(filePath, code, 'utf-8');

    const metadata: DocumentMetadata = {
      id: codeId,
      type: 'code',
      hash,
      storagePath: this.getRelativePath(filePath),
      size: Buffer.byteLength(code),
      createdAt: Date.now(),
    };

    await this.saveMetadata(metadata);
    return metadata;
  }

  /**
   * Get content by ID
   */
  async getContent(id: string, type: DocumentMetadata['type']): Promise<string | null> {
    try {
      const metadata = await this.getMetadata(id);
      if (!metadata || metadata.type !== type) {
        return null;
      }

      const fullPath = this.getFullPath(metadata.storagePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      console.error(`Failed to read content for ${id}:`, error);
      return null;
    }
  }

  /**
   * Get content by storage path
   */
  async getContentByPath(storagePath: string): Promise<string | null> {
    try {
      const fullPath = this.getFullPath(storagePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      console.error(`Failed to read content from ${storagePath}:`, error);
      return null;
    }
  }

  /**
   * Delete content
   */
  async deleteContent(id: string): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(id);
      if (!metadata) {
        return false;
      }

      const fullPath = this.getFullPath(metadata.storagePath);
      await fs.unlink(fullPath);
      await this.deleteMetadata(id);
      return true;
    } catch (error) {
      console.error(`Failed to delete content for ${id}:`, error);
      return false;
    }
  }

  /**
   * Get storage location identifier.
   */
  getStorageLocation(metadata: DocumentMetadata): string {
    return `local://${metadata.storagePath}`;
  }

  /**
   * Parse storage location to get path
   */
  parseStorageLocation(location: string): string | null {
    if (!location.startsWith('local://')) {
      return null;
    }
    return location.substring('local://'.length);
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalDocuments: number;
    totalSize: number;
    byType: Record<string, { count: number; size: number }>;
  }> {
    const metadataPath = path.join(this.basePath, 'metadata');
    const stats = {
      totalDocuments: 0,
      totalSize: 0,
      byType: {} as Record<string, { count: number; size: number }>,
    };

    try {
      const files = await fs.readdir(metadataPath);

      for (const file of files) {
        if (!file.endsWith('.meta.json')) continue;

        const content = await fs.readFile(path.join(metadataPath, file), 'utf-8');
        const metadata: DocumentMetadata = JSON.parse(content);

        stats.totalDocuments++;
        stats.totalSize += metadata.size;

        if (!stats.byType[metadata.type]) {
          stats.byType[metadata.type] = { count: 0, size: 0 };
        }
        stats.byType[metadata.type].count++;
        stats.byType[metadata.type].size += metadata.size;
      }
    } catch (error) {
      console.error('Failed to get stats:', error);
    }

    return stats;
  }

  // ===== Private Methods =====

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private getRelativePath(fullPath: string): string {
    return path.relative(this.basePath, fullPath);
  }

  private getFullPath(relativePath: string): string {
    return path.join(this.basePath, relativePath);
  }

  private async saveMetadata(metadata: DocumentMetadata): Promise<void> {
    const metadataPath = path.join(this.basePath, 'metadata', `${metadata.id}.meta.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  private async getMetadata(id: string): Promise<DocumentMetadata | null> {
    try {
      const metadataPath = path.join(this.basePath, 'metadata', `${id}.meta.json`);
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  private async deleteMetadata(id: string): Promise<void> {
    const metadataPath = path.join(this.basePath, 'metadata', `${id}.meta.json`);
    await fs.unlink(metadataPath).catch(() => {});
  }

  private async findByHash(
    hash: string,
    type: DocumentMetadata['type']
  ): Promise<DocumentMetadata | null> {
    try {
      const metadataDir = path.join(this.basePath, 'metadata');
      const files = await fs.readdir(metadataDir);

      for (const file of files) {
        if (!file.endsWith('.meta.json')) continue;

        const content = await fs.readFile(path.join(metadataDir, file), 'utf-8');
        const metadata: DocumentMetadata = JSON.parse(content);

        if (metadata.hash === hash && metadata.type === type) {
          return metadata;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return null;
  }

  private getExtensionForLanguage(language: string): string {
    const extMap: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      'c++': 'cpp',
      c: 'c',
      csharp: 'cs',
      ruby: 'rb',
      go: 'go',
      rust: 'rs',
      php: 'php',
      swift: 'swift',
      kotlin: 'kt',
      sql: 'sql',
      html: 'html',
      css: 'css',
      json: 'json',
      yaml: 'yaml',
      xml: 'xml',
      markdown: 'md',
      bash: 'sh',
      shell: 'sh',
    };

    return extMap[language.toLowerCase()] || 'txt';
  }
}

/**
 * Singleton instance
 */
let storeInstance: LocalDocumentStore | null = null;

export function getLocalDocumentStore(config?: LocalStoreConfig): LocalDocumentStore {
  if (!storeInstance) {
    storeInstance = new LocalDocumentStore(config);
  }
  return storeInstance;
}
