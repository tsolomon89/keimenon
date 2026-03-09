/**
 * UploadSession Aggregate Root
 *
 * Core domain entity representing a chunked file upload session.
 * Encapsulates all business logic for chunk tracking and session management.
 *
 * Invariants enforced:
 * - Session ID is immutable and unique (upl_xxx format)
 * - Account ID is immutable (multi-tenant isolation)
 * - Chunk indexes are validated (0 <= index < totalChunks)
 * - Cannot record chunks after session expires
 * - Cannot mark completed unless all chunks received
 * - File size and chunk configuration are immutable
 *
 * Related: Chunked Upload System - Option 3
 */

import { ulid } from 'ulid';
import { tmpdir } from 'os';
import { join } from 'path';
import { sanitizeUploadFilename } from '../../../utils/upload-filename';

export type UploadStatus = 'uploading' | 'assembling' | 'completed' | 'failed' | 'expired';

export interface UploadSessionSpec {
  accountId: string;
  userId: string;
  jobId?: string; // Optional: Job created after assembly completes
  fileName: string;
  fileSize: number;
  mimeType?: string;
  chunkSize?: number; // Defaults to 10MB (local-optimized)
  metadata?: Record<string, any>; // Optional metadata (e.g., import config)
}

export interface UploadSessionJSON {
  id: string;
  accountId: string;
  userId: string;
  jobId: string | null; // Nullable: Set after assembly completes
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  chunkSize: number;
  totalChunks: number;
  chunksReceived: Record<number, boolean>;
  chunksPath: string;
  status: UploadStatus;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  completedAt: number | null;
  isLocal: boolean;
  dataTag: string;
  metadata: Record<string, any> | null;
  progress?: number;
  chunksUploaded?: number[];
  missingChunks?: number[];
}

/**
 * UploadSession Aggregate Root
 */
export class UploadSession {
  // Immutable properties
  readonly id: string;
  readonly accountId: string;
  readonly userId: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string | null;
  readonly chunkSize: number;
  readonly totalChunks: number;
  readonly chunksPath: string;
  readonly createdAt: number;
  readonly isLocal: boolean;

  // Mutable job reference (set after assembly)
  private _jobId: string | null;

  // Mutable properties
  private _chunksReceived: Map<number, boolean>; // Map for O(1) lookup
  private _status: UploadStatus;
  private _errorMessage: string | null;
  private _updatedAt: number;
  private _expiresAt: number;
  private _completedAt: number | null;
  private _dataTag: string;
  private _metadata: Record<string, any> | null;

  private constructor(props: {
    id: string;
    accountId: string;
    userId: string;
    jobId: string | null;
    fileName: string;
    fileSize: number;
    mimeType: string | null;
    chunkSize: number;
    totalChunks: number;
    chunksPath: string;
    chunksReceived: Map<number, boolean>;
    status: UploadStatus;
    errorMessage: string | null;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    completedAt: number | null;
    isLocal: boolean;
    dataTag: string;
    metadata: Record<string, any> | null;
  }) {
    this.id = props.id;
    this.accountId = props.accountId;
    this.userId = props.userId;
    this.fileName = props.fileName;
    this.fileSize = props.fileSize;
    this.mimeType = props.mimeType;
    this.chunkSize = props.chunkSize;
    this.totalChunks = props.totalChunks;
    this.chunksPath = props.chunksPath;
    this.createdAt = props.createdAt;
    this.isLocal = props.isLocal;

    this._jobId = props.jobId;
    this._chunksReceived = props.chunksReceived;
    this._status = props.status;
    this._errorMessage = props.errorMessage;
    this._updatedAt = props.updatedAt;
    this._expiresAt = props.expiresAt;
    this._completedAt = props.completedAt;
    this._dataTag = props.dataTag;
    this._metadata = props.metadata;
  }

  /**
   * Factory: Create new upload session
   */
  static create(spec: UploadSessionSpec): UploadSession {
    const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB (local-optimized)
    const DEFAULT_TTL = 4 * 60 * 60 * 1000; // 4 hours (local sessions)

    const id = `upl_${ulid()}`;
    const sanitizedFile = sanitizeUploadFilename(spec.fileName);
    const chunkSize = spec.chunkSize || DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(spec.fileSize / chunkSize);
    const now = Date.now();

    // Temp directory path for chunk storage (OS-appropriate)
    const chunksPath = join(tmpdir(), 'keimenon-uploads', id);

    return new UploadSession({
      id,
      accountId: spec.accountId,
      userId: spec.userId,
      jobId: spec.jobId || null, // Optional: Set after assembly
      fileName: sanitizedFile.sanitized,
      fileSize: spec.fileSize,
      mimeType: spec.mimeType || null,
      chunkSize,
      totalChunks,
      chunksPath,
      chunksReceived: new Map(),
      status: 'uploading',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + DEFAULT_TTL,
      completedAt: null,
      isLocal: true,
      dataTag: 'real',
      metadata: {
        ...(spec.metadata || {}),
        originalFileName: sanitizedFile.original || (spec.metadata as any)?.originalFileName,
      },
    });
  }

  /**
   * Factory: Reconstitute from database
   */
  static fromJSON(json: UploadSessionJSON): UploadSession {
    // Parse JSON string to Map
    const chunksReceived = new Map<number, boolean>();
    const parsed =
      typeof json.chunksReceived === 'string'
        ? JSON.parse(json.chunksReceived)
        : json.chunksReceived;

    // Handle null/undefined chunks (new sessions start with empty map)
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([index, value]) => {
        chunksReceived.set(Number(index), value as boolean);
      });
    }

    // Parse metadata if it's a JSON string
    let metadata = json.metadata;
    if (typeof json.metadata === 'string') {
      try {
        metadata = JSON.parse(json.metadata);
      } catch {
        metadata = null;
      }
    }

    return new UploadSession({
      id: json.id,
      accountId: json.accountId,
      userId: json.userId,
      jobId: json.jobId,
      fileName: json.fileName,
      fileSize: json.fileSize,
      mimeType: json.mimeType,
      chunkSize: json.chunkSize,
      totalChunks: json.totalChunks,
      chunksPath: json.chunksPath,
      chunksReceived,
      status: json.status,
      errorMessage: json.errorMessage,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      expiresAt: json.expiresAt,
      completedAt: json.completedAt,
      isLocal: json.isLocal,
      metadata: metadata || null,
      dataTag: json.dataTag,
    });
  }

  // Getters
  get status(): UploadStatus {
    return this._status;
  }

  get errorMessage(): string | null {
    return this._errorMessage;
  }

  get updatedAt(): number {
    return this._updatedAt;
  }

  get expiresAt(): number {
    return this._expiresAt;
  }

  get completedAt(): number | null {
    return this._completedAt;
  }

  get dataTag(): string {
    return this._dataTag;
  }

  get jobId(): string | null {
    return this._jobId;
  }

  get metadata(): Record<string, any> | null {
    return this._metadata;
  }

  /**
   * Set job ID after job creation (called after assembly completes)
   */
  setJobId(jobId: string): void {
    this._jobId = jobId;
    this._updatedAt = Date.now();
  }

  /**
   * Record that a chunk has been received
   */
  recordChunk(chunkIndex: number): void {
    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= this.totalChunks) {
      throw new Error(
        `Invalid chunk index: ${chunkIndex}. Must be between 0 and ${this.totalChunks - 1}`
      );
    }

    // Check if expired
    if (this._status === 'expired') {
      throw new Error('Cannot record chunk: session has expired');
    }

    if (this.isExpired()) {
      throw new Error('Cannot record chunk: session has expired');
    }

    // Check if already failed
    if (this._status === 'failed') {
      throw new Error('Cannot record chunk: session has failed');
    }

    // Record chunk
    this._chunksReceived.set(chunkIndex, true);
    this._updatedAt = Date.now();

    // Auto-transition to 'assembling' if all chunks received
    if (this.isComplete()) {
      this._status = 'assembling';
    }
  }

  /**
   * Check if all chunks have been received
   */
  isComplete(): boolean {
    return this._chunksReceived.size === this.totalChunks;
  }

  /**
   * Get array of missing chunk indexes
   */
  getMissingChunks(): number[] {
    const missing: number[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      if (!this._chunksReceived.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  /**
   * Get upload progress (0-100%)
   */
  getProgress(): number {
    if (this.totalChunks === 0) return 100;
    return Math.round((this._chunksReceived.size / this.totalChunks) * 100);
  }

  /**
   * Check if session has expired
   */
  isExpired(): boolean {
    return Date.now() > this._expiresAt;
  }

  /**
   * Mark session as completed (after assembly)
   */
  markCompleted(): void {
    if (!this.isComplete()) {
      throw new Error('Cannot mark completed: not all chunks received');
    }

    this._status = 'completed';
    this._completedAt = Date.now();
    this._updatedAt = Date.now();
  }

  /**
   * Mark session as failed
   */
  markFailed(errorMessage: string): void {
    this._status = 'failed';
    this._errorMessage = errorMessage;
    this._updatedAt = Date.now();
  }

  /**
   * Mark session as expired
   */
  expire(): void {
    if (this._status === 'uploading' || this._status === 'assembling') {
      this._status = 'expired';
      this._errorMessage = 'Session expired after 4 hours';
      this._updatedAt = Date.now();
    }
  }

  /**
   * Set data tag (for test isolation)
   */
  setDataTag(tag: 'test' | 'real'): void {
    this._dataTag = tag;
  }

  /**
   * Serialize to JSON for persistence
   */
  toJSON(): UploadSessionJSON {
    // Convert Map to plain object for JSON storage
    const chunksReceived: Record<number, boolean> = {};
    this._chunksReceived.forEach((value, key) => {
      chunksReceived[key] = value;
    });

    return {
      id: this.id,
      accountId: this.accountId,
      userId: this.userId,
      jobId: this.jobId,
      fileName: this.fileName,
      fileSize: this.fileSize,
      mimeType: this.mimeType,
      chunkSize: this.chunkSize,
      totalChunks: this.totalChunks,
      chunksReceived,
      chunksPath: this.chunksPath,
      status: this._status,
      errorMessage: this._errorMessage,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      expiresAt: this._expiresAt,
      completedAt: this._completedAt,
      isLocal: this.isLocal,
      dataTag: this._dataTag,
      metadata: this._metadata,
      // Computed fields for API responses
      progress: this.getProgress(),
      chunksUploaded: Array.from(this._chunksReceived.keys()).sort((a, b) => a - b),
      missingChunks: this.getMissingChunks(),
    };
  }

  /**
   * Get display-friendly summary
   */
  toString(): string {
    return `UploadSession(${this.id}, ${this.fileName}, ${this.getProgress()}%, ${this._chunksReceived.size}/${this.totalChunks} chunks, ${this._status})`;
  }
}
