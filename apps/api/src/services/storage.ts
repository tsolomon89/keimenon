import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

export interface StorageConfig {
  basePath: string;
  maxSizeBytes: number;
}

export class StorageService {
  private basePath: string;
  private maxSizeBytes: number;

  constructor(config: StorageConfig) {
    this.basePath = config.basePath;
    this.maxSizeBytes = config.maxSizeBytes;
  }

  /**
   * Initialize storage directories
   */
  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'uploads'), { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'temp'), { recursive: true });
  }

  /**
   * Store uploaded file
   */
  async storeFile(
    file: Express.Multer.File,
    fingerprint: string
  ): Promise<{ storedPath: string; relativePath: string }> {
    // Check size
    if (file.size > this.maxSizeBytes) {
      throw new Error(
        `File size ${file.size} exceeds maximum ${this.maxSizeBytes}`
      );
    }

    // Use fingerprint-based filename to enable deduplication
    const ext = path.extname(file.originalname);
    const filename = `${fingerprint}${ext}`;
    const relativePath = path.join('uploads', filename);
    const storedPath = path.join(this.basePath, relativePath);

    // Check if file already exists (deduplication)
    try {
      await fs.access(storedPath);
      // File already exists - return existing path
      return { storedPath, relativePath };
    } catch {
      // File doesn't exist - store it
      await fs.copyFile(file.path, storedPath);
      // Clean up temp file
      await fs.unlink(file.path).catch(() => {});
      return { storedPath, relativePath };
    }
  }

  /**
   * Store content from buffer
   */
  async storeBuffer(
    buffer: Buffer,
    filename: string,
    fingerprint: string
  ): Promise<{ storedPath: string; relativePath: string }> {
    if (buffer.length > this.maxSizeBytes) {
      throw new Error(
        `Content size ${buffer.length} exceeds maximum ${this.maxSizeBytes}`
      );
    }

    const ext = path.extname(filename);
    const storedFilename = `${fingerprint}${ext}`;
    const relativePath = path.join('uploads', storedFilename);
    const storedPath = path.join(this.basePath, relativePath);

    // Check for existing file
    try {
      await fs.access(storedPath);
      return { storedPath, relativePath };
    } catch {
      await fs.writeFile(storedPath, buffer);
      return { storedPath, relativePath };
    }
  }

  /**
   * Get file path
   */
  async getFilePath(relativePath: string): Promise<string> {
    const fullPath = path.join(this.basePath, relativePath);
    await fs.access(fullPath); // Check if exists
    return fullPath;
  }

  /**
   * Delete file
   */
  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, relativePath);
    await fs.unlink(fullPath);
  }

  /**
   * Get storage usage statistics
   */
  async getUsageStats(): Promise<{
    totalFiles: number;
    totalSizeBytes: number;
  }> {
    const uploadsDir = path.join(this.basePath, 'uploads');

    let totalFiles = 0;
    let totalSizeBytes = 0;

    try {
      const files = await fs.readdir(uploadsDir);
      totalFiles = files.length;

      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          totalSizeBytes += stats.size;
        }
      }
    } catch (error) {
      // Directory doesn't exist or is empty
    }

    return { totalFiles, totalSizeBytes };
  }

  /**
   * Clean up old temp files
   */
  async cleanupTemp(olderThanMs: number = 3600000): Promise<number> {
    const tempDir = path.join(this.basePath, 'temp');
    const now = Date.now();
    let cleaned = 0;

    try {
      const files = await fs.readdir(tempDir);

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > olderThanMs) {
          await fs.unlink(filePath);
          cleaned++;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return cleaned;
  }
}

/**
 * Singleton storage instance
 */
let storageInstance: StorageService | null = null;

export function getStorageService(config?: StorageConfig): StorageService {
  if (!storageInstance) {
    if (!config) {
      throw new Error('Storage config required for first initialization');
    }
    storageInstance = new StorageService(config);
  }
  return storageInstance;
}
