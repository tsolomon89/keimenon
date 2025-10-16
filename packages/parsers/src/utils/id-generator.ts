import crypto from 'crypto';
import { ulid } from 'ulid';

/**
 * Three-key ID system for deterministic, content-addressable storage
 *
 * 1. BlobId: Identifies physical content (immutable, content-addressed)
 * 2. NodeKey: Stable identifier for virtual nodes across re-ingests
 * 3. ContentId: Canonical content hash for deduplication
 */

/**
 * Generate a content-addressed blob ID from bytes
 *
 * Format: blob_{sha256}
 * Purpose: Identify physical content, immutable
 * Stability: Never changes for same bytes
 *
 * @param blobBytes - Raw content bytes
 * @returns Blob ID like "blob_abc123..."
 */
export function generateBlobId(blobBytes: Buffer): string {
  const hash = crypto.createHash('sha256')
    .update(blobBytes)
    .digest('hex');
  return `blob_${hash}`;
}

/**
 * Generate a stable node key for virtual nodes
 *
 * Format: nk_{sha256(blob_id|level|modality|byte_start|byte_end)}
 * Purpose: Stable identifier across re-ingests
 * Stability: Same for same span in same blob, even if parser re-runs
 *
 * This is critical for reproducibility:
 * - Re-importing the same file should yield same NodeKeys
 * - Allows graph updates without breaking external references
 *
 * @param blobId - Source blob identifier
 * @param level - Break level (token, phrase, sentence, block, section)
 * @param modality - Content type (code, prose, math, json, csv)
 * @param byteStart - Start offset in blob (byte-addressed)
 * @param byteEnd - End offset in blob (byte-addressed)
 * @returns Node key like "nk_def456..."
 */
export function generateNodeKey(
  blobId: string,
  level: string,
  modality: string,
  byteStart: number,
  byteEnd: number
): string {
  // Canonical string representation
  const input = `${blobId}|${level}|${modality}|${byteStart}|${byteEnd}`;
  const hash = crypto.createHash('sha256')
    .update(input, 'utf-8')
    .digest('hex');
  return `nk_${hash}`;
}

/**
 * Generate a canonical content ID from normalized text
 *
 * Format: cid_{sha256(normalized_text)}
 * Purpose: Identify semantically equivalent content for deduplication
 * Stability: Same for equivalent content after normalization
 *
 * This enables cross-source deduplication:
 * - Same code in different messages → same ContentId
 * - Same equation with different formatting → same ContentId
 * - Same JSON with different key order → same ContentId
 *
 * @param normalizedText - Text after modality-specific normalization
 * @returns Content ID like "cid_789abc..."
 */
export function generateContentId(normalizedText: string): string {
  const hash = crypto.createHash('sha256')
    .update(normalizedText, 'utf-8')
    .digest('hex');
  return `cid_${hash}`;
}

/**
 * Generate a time-ordered ULID for database primary keys
 *
 * Format: ULID (26 characters, sortable, collision-resistant)
 * Purpose: Database primary key for nodes/edges/etc
 * Stability: Unique per creation, not stable across re-ingests
 *
 * Use this for:
 * - Database row IDs (nodes.id, edges.id, etc.)
 * - NOT for external references (use NodeKey or ContentId instead)
 *
 * @returns ULID like "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 */
export function generateNodeId(): string {
  return ulid();
}

/**
 * Generate a cluster ID as lexicographically smallest NodeKey
 *
 * Format: Same as NodeKey (nk_...)
 * Purpose: Deterministic cluster identifier
 * Stability: Stable as long as the smallest-keyed node remains in cluster
 *
 * @param nodeKeys - Array of NodeKeys in cluster
 * @returns Smallest NodeKey (cluster ID)
 */
export function generateClusterId(nodeKeys: string[]): string {
  if (nodeKeys.length === 0) {
    throw new Error('Cannot generate cluster ID from empty node key array');
  }
  // Lexicographic sort, take first
  return nodeKeys.sort()[0];
}

/**
 * Parse a BlobId to extract the hash
 *
 * @param blobId - Blob ID like "blob_abc123..."
 * @returns SHA-256 hash or null if invalid format
 */
export function parseBlobId(blobId: string): string | null {
  if (!blobId.startsWith('blob_')) return null;
  const hash = blobId.substring(5);
  return hash.length === 64 ? hash : null; // SHA-256 is 64 hex chars
}

/**
 * Parse a NodeKey to extract the hash
 *
 * @param nodeKey - Node key like "nk_def456..."
 * @returns SHA-256 hash or null if invalid format
 */
export function parseNodeKey(nodeKey: string): string | null {
  if (!nodeKey.startsWith('nk_')) return null;
  const hash = nodeKey.substring(3);
  return hash.length === 64 ? hash : null;
}

/**
 * Parse a ContentId to extract the hash
 *
 * @param contentId - Content ID like "cid_789abc..."
 * @returns SHA-256 hash or null if invalid format
 */
export function parseContentId(contentId: string): string | null {
  if (!contentId.startsWith('cid_')) return null;
  const hash = contentId.substring(4);
  return hash.length === 64 ? hash : null;
}

/**
 * Validate ID format
 *
 * @param id - ID to validate
 * @param type - Expected type (blob, nk, cid)
 * @returns true if valid, false otherwise
 */
export function validateIdFormat(
  id: string,
  type: 'blob' | 'nk' | 'cid'
): boolean {
  switch (type) {
    case 'blob':
      return parseBlobId(id) !== null;
    case 'nk':
      return parseNodeKey(id) !== null;
    case 'cid':
      return parseContentId(id) !== null;
    default:
      return false;
  }
}

/**
 * Batch generate NodeKeys for multiple spans
 *
 * @param blobId - Source blob
 * @param spans - Array of {level, modality, byteStart, byteEnd}
 * @returns Array of NodeKeys in same order as spans
 */
export function generateNodeKeys(
  blobId: string,
  spans: Array<{
    level: string;
    modality: string;
    byteStart: number;
    byteEnd: number;
  }>
): string[] {
  return spans.map(span =>
    generateNodeKey(blobId, span.level, span.modality, span.byteStart, span.byteEnd)
  );
}

/**
 * Batch generate ContentIds for multiple texts
 *
 * @param normalizedTexts - Array of normalized text strings
 * @returns Array of ContentIds in same order
 */
export function generateContentIds(normalizedTexts: string[]): string[] {
  return normalizedTexts.map(text => generateContentId(text));
}

/**
 * Generate a deterministic node key with optional parent context
 *
 * For hierarchical structures, you may want to include parent info
 * to distinguish nodes that would otherwise have identical spans.
 *
 * @param blobId - Source blob
 * @param level - Break level
 * @param modality - Content type
 * @param byteStart - Start offset
 * @param byteEnd - End offset
 * @param parentNodeKey - Optional parent's NodeKey for hierarchy
 * @returns Node key with parent context
 */
export function generateHierarchicalNodeKey(
  blobId: string,
  level: string,
  modality: string,
  byteStart: number,
  byteEnd: number,
  parentNodeKey?: string
): string {
  const baseInput = `${blobId}|${level}|${modality}|${byteStart}|${byteEnd}`;
  const input = parentNodeKey ? `${baseInput}|${parentNodeKey}` : baseInput;
  const hash = crypto.createHash('sha256')
    .update(input, 'utf-8')
    .digest('hex');
  return `nk_${hash}`;
}

/**
 * ID generation statistics
 *
 * Useful for debugging and monitoring
 */
export interface IdGenerationStats {
  blobIds: number;
  nodeKeys: number;
  contentIds: number;
  nodeIds: number;
  clusterIds: number;
}

/**
 * ID generator with statistics tracking
 */
export class IdGeneratorWithStats {
  private stats: IdGenerationStats = {
    blobIds: 0,
    nodeKeys: 0,
    contentIds: 0,
    nodeIds: 0,
    clusterIds: 0,
  };

  generateBlobId(blobBytes: Buffer): string {
    this.stats.blobIds++;
    return generateBlobId(blobBytes);
  }

  generateNodeKey(
    blobId: string,
    level: string,
    modality: string,
    byteStart: number,
    byteEnd: number
  ): string {
    this.stats.nodeKeys++;
    return generateNodeKey(blobId, level, modality, byteStart, byteEnd);
  }

  generateContentId(normalizedText: string): string {
    this.stats.contentIds++;
    return generateContentId(normalizedText);
  }

  generateNodeId(): string {
    this.stats.nodeIds++;
    return generateNodeId();
  }

  generateClusterId(nodeKeys: string[]): string {
    this.stats.clusterIds++;
    return generateClusterId(nodeKeys);
  }

  getStats(): Readonly<IdGenerationStats> {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      blobIds: 0,
      nodeKeys: 0,
      contentIds: 0,
      nodeIds: 0,
      clusterIds: 0,
    };
  }
}
