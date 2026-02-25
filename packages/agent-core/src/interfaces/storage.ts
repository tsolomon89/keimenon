/**
 * Storage Interface
 *
 * Content-addressable storage (CAS) for task artifacts.
 * All content is stored by hash for deduplication.
 */

/**
 * Result of a storage put operation
 */
export interface StoragePutResult {
  /** Content hash (SHA-256) */
  hash: string;
  /** Storage path relative to CAS root */
  path: string;
  /** Whether this was a new write or existing content */
  isNew: boolean;
  /** Content size in bytes */
  size: number;
}

/**
 * Storage metadata for content
 */
export interface StorageMetadata {
  /** Content hash */
  hash: string;
  /** Content size in bytes */
  size: number;
  /** Creation timestamp */
  created_at: number;
  /** Content type (MIME) */
  content_type?: string;
  /** Original filename (if applicable) */
  filename?: string;
}

/**
 * Storage interface for artifact content
 *
 * Implements content-addressable storage where content
 * is stored and retrieved by hash. This enables:
 * - Automatic deduplication
 * - Integrity verification
 * - Efficient caching
 */
export interface Storage {
  /**
   * Store content and return its hash and path
   *
   * @param content - String or binary content to store
   * @param options - Optional metadata
   * @returns Storage result with hash and path
   */
  put(
    content: string | Buffer,
    options?: {
      content_type?: string;
      filename?: string;
    }
  ): Promise<StoragePutResult>;

  /**
   * Store JSON content (convenience method)
   *
   * @param data - Object to serialize and store
   * @param filename - Optional filename hint
   * @returns Storage result
   */
  putJson(data: unknown, filename?: string): Promise<StoragePutResult>;

  /**
   * Retrieve content by hash
   *
   * @param hash - Content hash
   * @returns Content as string or Buffer, or null if not found
   */
  get(hash: string): Promise<string | Buffer | null>;

  /**
   * Retrieve content as JSON
   *
   * @param hash - Content hash
   * @returns Parsed JSON object or null if not found
   */
  getJson<T = unknown>(hash: string): Promise<T | null>;

  /**
   * Check if content exists
   *
   * @param hash - Content hash
   * @returns True if content exists
   */
  exists(hash: string): Promise<boolean>;

  /**
   * Get metadata for stored content
   *
   * @param hash - Content hash
   * @returns Metadata or null if not found
   */
  getMetadata(hash: string): Promise<StorageMetadata | null>;

  /**
   * Delete content by hash
   * Usually not needed due to CAS deduplication
   *
   * @param hash - Content hash
   * @returns True if deleted, false if not found
   */
  delete(hash: string): Promise<boolean>;

  /**
   * Get the full filesystem path for a hash
   * Useful for external tools that need file access
   *
   * @param hash - Content hash
   * @returns Full path or null if not found
   */
  getPath(hash: string): Promise<string | null>;

  /**
   * Calculate hash for content without storing
   *
   * @param content - Content to hash
   * @returns SHA-256 hash
   */
  calculateHash(content: string | Buffer): string;

  /**
   * List all stored hashes (for maintenance)
   *
   * @param options - Pagination options
   * @returns Array of hashes
   */
  list(options?: { limit?: number; offset?: number }): Promise<string[]>;

  /**
   * Get total storage usage
   *
   * @returns Total bytes used
   */
  getUsage(): Promise<number>;
}
