/**
 * Content-Addressable Storage (CAS) Utilities
 *
 * Implements content addressing for the Canvas Memory OS graph database.
 * Content is addressed by cryptographic hash of its canonical form.
 *
 * Key properties:
 * - Deterministic: same content always produces same hash
 * - Collision-resistant: different content produces different hash
 * - Deduplication: identical content shares single storage
 *
 * @see docs/architecture/ARCHITECTURE_CONTRACT.md
 * @see docs/architecture/CANONICALIZATION.md
 */

import { createHash } from 'crypto';
import { canonicalize, canonicalizeForNodeType } from './canonicalization';

/**
 * Hash algorithm used for content addressing
 */
export const HASH_ALGORITHM = 'sha256' as const;

/**
 * Hash encoding format
 */
export const HASH_ENCODING = 'hex' as const;

/**
 * Content hash type (hex-encoded SHA-256)
 */
export type ContentHash = string & { readonly __brand: 'ContentHash' };

/**
 * Node ID format: {nodeType}_{contentHash}_{timestamp}
 */
export type NodeId = string & { readonly __brand: 'NodeId' };

/**
 * Content-addressed node metadata
 */
export interface ContentAddressedNode {
  node_id: NodeId;
  node_type: string;
  content_hash: ContentHash;
  canonical_content: string;
  created_at: number;
  is_duplicate: boolean;
  original_node_id?: NodeId; // If duplicate, reference to original
}

/**
 * Deduplication result
 */
export interface DeduplicationResult {
  total_nodes: number;
  unique_content: number;
  duplicate_count: number;
  space_saved_bytes: number;
  duplicate_groups: Array<{
    content_hash: ContentHash;
    node_ids: NodeId[];
    occurrences: number;
  }>;
}

/**
 * Generate a content hash for a value
 *
 * Uses SHA-256 hash of the canonical form of the content.
 * Identical content will always produce identical hashes.
 *
 * @param content - Content to hash
 * @returns Content hash (hex-encoded SHA-256)
 *
 * @example
 * ```typescript
 * const hash = contentHash({ text: 'Hello, world!' });
 * // => 'a7f3c77f3e9e2c...' (64 hex characters)
 * ```
 */
export function contentHash(content: unknown): ContentHash {
  const canonical = canonicalize(content);
  const hash = createHash(HASH_ALGORITHM).update(canonical, 'utf8').digest(HASH_ENCODING);

  return hash as ContentHash;
}

/**
 * Generate a content hash for a specific node type
 *
 * Applies node-type-specific canonicalization before hashing.
 *
 * @param nodeType - Type of node
 * @param content - Content to hash
 * @returns Content hash
 *
 * @example
 * ```typescript
 * // Code nodes preserve whitespace
 * const codeHash = contentHashForNodeType('code', { code: '  const x = 1;  ' });
 *
 * // Message nodes normalize whitespace
 * const msgHash = contentHashForNodeType('message', { text: '  hello  ' });
 * ```
 */
export function contentHashForNodeType(nodeType: string, content: unknown): ContentHash {
  const canonical = canonicalizeForNodeType(nodeType, content);
  const hash = createHash(HASH_ALGORITHM).update(canonical, 'utf8').digest(HASH_ENCODING);

  return hash as ContentHash;
}

/**
 * Generate a node ID
 *
 * Node ID format: {nodeType}_{contentHash}_{timestamp}
 * This format ensures:
 * - Type-safety: prefix indicates node type
 * - Content-derived: hash component is deterministic
 * - Time-ordered: timestamp allows sorting by creation
 * - Globally unique: combination of all three components
 *
 * @param nodeType - Type of node
 * @param contentHash - Content hash
 * @param timestamp - Creation timestamp (defaults to now)
 * @returns Node ID
 *
 * @example
 * ```typescript
 * const nodeId = generateNodeId('message', hash);
 * // => 'message_a7f3c77f3e9e2c..._1729728000000'
 * ```
 */
export function generateNodeId(
  nodeType: string,
  contentHash: ContentHash,
  timestamp: number = Date.now()
): NodeId {
  return `${nodeType}_${contentHash}_${timestamp}` as NodeId;
}

/**
 * Parse a node ID into its components
 *
 * @param nodeId - Node ID to parse
 * @returns Parsed components
 * @throws Error if node ID format is invalid
 *
 * @example
 * ```typescript
 * const { nodeType, contentHash, timestamp } = parseNodeId(nodeId);
 * ```
 */
export function parseNodeId(nodeId: NodeId): {
  nodeType: string;
  contentHash: ContentHash;
  timestamp: number;
} {
  const parts = nodeId.split('_');

  if (parts.length < 3) {
    throw new Error(`Invalid node ID format: ${nodeId}`);
  }

  // Handle node types with underscores (e.g., 'chat_message')
  const timestamp = parseInt(parts[parts.length - 1], 10);
  const contentHash = parts[parts.length - 2] as ContentHash;
  const nodeType = parts.slice(0, -2).join('_');

  if (isNaN(timestamp)) {
    throw new Error(`Invalid timestamp in node ID: ${nodeId}`);
  }

  return { nodeType, contentHash, timestamp };
}

/**
 * Check if two content hashes are equal
 *
 * @param a - First hash
 * @param b - Second hash
 * @returns True if hashes are equal
 */
export function areHashesEqual(a: ContentHash, b: ContentHash): boolean {
  return a === b;
}

/**
 * Validate a content hash format
 *
 * SHA-256 hashes are 64 hex characters
 *
 * @param hash - Hash to validate
 * @returns True if valid
 */
export function isValidContentHash(hash: string): hash is ContentHash {
  return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * Validate a node ID format
 *
 * @param nodeId - Node ID to validate
 * @returns True if valid
 */
export function isValidNodeId(nodeId: string): nodeId is NodeId {
  try {
    const parsed = parseNodeId(nodeId as NodeId);
    return (
      parsed.nodeType.length > 0 && isValidContentHash(parsed.contentHash) && parsed.timestamp > 0
    );
  } catch {
    return false;
  }
}

/**
 * Create a content-addressed node
 *
 * This is the primary function for creating nodes with content addressing.
 * It handles:
 * - Canonicalization
 * - Hash generation
 * - Node ID creation
 * - Duplicate detection metadata
 *
 * @param nodeType - Type of node
 * @param content - Node content
 * @param options - Creation options
 * @returns Content-addressed node metadata
 *
 * @example
 * ```typescript
 * const node = createContentAddressedNode('message', {
 *   text: 'Hello, world!',
 *   author: 'Alice'
 * });
 *
 * // Store in database
 * await db.insert(node);
 * ```
 */
export function createContentAddressedNode(
  nodeType: string,
  content: unknown,
  options: {
    timestamp?: number;
    existingNodeId?: NodeId;
  } = {}
): ContentAddressedNode {
  const timestamp = options.timestamp ?? Date.now();

  // Generate content hash
  const hash = contentHashForNodeType(nodeType, content);

  // Generate node ID
  const nodeId = generateNodeId(nodeType, hash, timestamp);

  // Canonicalize content for storage
  const canonicalContent = canonicalizeForNodeType(nodeType, content);

  return {
    node_id: nodeId,
    node_type: nodeType,
    content_hash: hash,
    canonical_content: canonicalContent,
    created_at: timestamp,
    is_duplicate: !!options.existingNodeId,
    original_node_id: options.existingNodeId,
  };
}

/**
 * Calculate deduplication savings
 *
 * Analyzes content sizes to estimate storage savings from deduplication.
 *
 * @param duplicateGroups - Groups of duplicate content
 * @returns Space saved in bytes
 */
export function calculateDeduplicationSavings(
  duplicateGroups: Array<{
    canonical_content: string;
    occurrences: number;
  }>
): number {
  let totalSaved = 0;

  for (const group of duplicateGroups) {
    const contentSize = Buffer.byteLength(group.canonical_content, 'utf8');
    // We save (n-1) copies of the content
    const saved = contentSize * (group.occurrences - 1);
    totalSaved += saved;
  }

  return totalSaved;
}

/**
 * Analyze deduplication opportunities in a dataset
 *
 * This function analyzes a set of nodes to identify duplicate content
 * and calculate potential storage savings.
 *
 * @param nodes - Array of nodes to analyze
 * @returns Deduplication analysis result
 *
 * @example
 * ```typescript
 * const nodes = await db.getAllNodes(accountId);
 * const result = analyzeDeduplication(nodes);
 *
 * console.log(`Found ${result.duplicate_count} duplicates`);
 * console.log(`Can save ${result.space_saved_bytes} bytes`);
 * ```
 */
export function analyzeDeduplication(
  nodes: Array<{
    node_id: NodeId;
    content: unknown;
    canonical_content?: string;
  }>
): DeduplicationResult {
  // Group nodes by content hash
  const hashGroups = new Map<ContentHash, NodeId[]>();

  for (const node of nodes) {
    const hash = contentHash(node.content);

    if (!hashGroups.has(hash)) {
      hashGroups.set(hash, []);
    }
    hashGroups.get(hash)!.push(node.node_id);
  }

  // Find duplicate groups (more than one node with same hash)
  const duplicateGroups: Array<{
    content_hash: ContentHash;
    node_ids: NodeId[];
    occurrences: number;
  }> = [];

  let duplicateCount = 0;

  // Convert entries to array to avoid iteration issues
  Array.from(hashGroups.entries()).forEach(([hash, nodeIds]) => {
    if (nodeIds.length > 1) {
      duplicateGroups.push({
        content_hash: hash,
        node_ids: nodeIds,
        occurrences: nodeIds.length,
      });
      duplicateCount += nodeIds.length - 1; // All but one are duplicates
    }
  });

  // Calculate space savings
  const spaceSaved = calculateDeduplicationSavings(
    duplicateGroups.map((group) => {
      const node = nodes.find((n) => n.node_id === group.node_ids[0])!;
      return {
        canonical_content: node.canonical_content ?? canonicalize(node.content),
        occurrences: group.occurrences,
      };
    })
  );

  return {
    total_nodes: nodes.length,
    unique_content: hashGroups.size,
    duplicate_count: duplicateCount,
    space_saved_bytes: spaceSaved,
    duplicate_groups: duplicateGroups,
  };
}

/**
 * Merge duplicate nodes
 *
 * When duplicates are detected, this function creates a merge plan
 * that preserves the earliest node and marks others as duplicates.
 *
 * @param duplicateNodeIds - Array of duplicate node IDs
 * @returns Merge plan
 *
 * @example
 * ```typescript
 * const plan = createMergePlan(['node1', 'node2', 'node3']);
 * // => {
 * //   canonical_node_id: 'node1', // earliest by timestamp
 * //   duplicate_node_ids: ['node2', 'node3']
 * // }
 * ```
 */
export function createMergePlan(duplicateNodeIds: NodeId[]): {
  canonical_node_id: NodeId;
  duplicate_node_ids: NodeId[];
} {
  if (duplicateNodeIds.length === 0) {
    throw new Error('Cannot create merge plan for empty array');
  }

  // Sort by timestamp (earliest first)
  const sorted = [...duplicateNodeIds].sort((a, b) => {
    const tsA = parseNodeId(a).timestamp;
    const tsB = parseNodeId(b).timestamp;
    return tsA - tsB;
  });

  return {
    canonical_node_id: sorted[0],
    duplicate_node_ids: sorted.slice(1),
  };
}

/**
 * Generate a batch of content hashes
 *
 * Efficiently processes multiple content items in batch.
 *
 * @param contents - Array of content to hash
 * @returns Array of content hashes
 */
export function batchContentHash(contents: unknown[]): ContentHash[] {
  return contents.map((content) => contentHash(content));
}

/**
 * Find duplicate content in a batch
 *
 * Returns indices of content items that are duplicates.
 *
 * @param contents - Array of content to check
 * @returns Map of content hash to array of indices
 *
 * @example
 * ```typescript
 * const contents = [
 *   { text: 'Hello' },
 *   { text: 'World' },
 *   { text: 'Hello' }, // Duplicate of index 0
 * ];
 *
 * const duplicates = findDuplicatesInBatch(contents);
 * // => Map { hash1 => [0, 2], hash2 => [1] }
 * ```
 */
export function findDuplicatesInBatch(contents: unknown[]): Map<ContentHash, number[]> {
  const hashToIndices = new Map<ContentHash, number[]>();

  contents.forEach((content, index) => {
    const hash = contentHash(content);
    if (!hashToIndices.has(hash)) {
      hashToIndices.set(hash, []);
    }
    hashToIndices.get(hash)!.push(index);
  });

  return hashToIndices;
}

/**
 * Content addressing statistics
 */
export interface ContentAddressingStats {
  total_hashes_generated: number;
  unique_hashes: number;
  duplicate_rate: number;
  avg_hash_time_ms: number;
}

/**
 * Performance monitoring for content addressing
 */
export class ContentAddressingMonitor {
  private hashCount = 0;
  private uniqueHashes = new Set<ContentHash>();
  private totalHashTime = 0;

  recordHash(hash: ContentHash, timeMs: number): void {
    this.hashCount++;
    this.uniqueHashes.add(hash);
    this.totalHashTime += timeMs;
  }

  getStats(): ContentAddressingStats {
    return {
      total_hashes_generated: this.hashCount,
      unique_hashes: this.uniqueHashes.size,
      duplicate_rate: this.hashCount > 0 ? 1 - this.uniqueHashes.size / this.hashCount : 0,
      avg_hash_time_ms: this.hashCount > 0 ? this.totalHashTime / this.hashCount : 0,
    };
  }

  reset(): void {
    this.hashCount = 0;
    this.uniqueHashes.clear();
    this.totalHashTime = 0;
  }
}

/**
 * Create a monitored content hash function
 *
 * Wraps contentHash with performance monitoring.
 *
 * @param monitor - Monitor instance
 * @returns Monitored hash function
 */
export function createMonitoredHashFunction(
  monitor: ContentAddressingMonitor
): (content: unknown) => ContentHash {
  return (content: unknown): ContentHash => {
    const start = performance.now();
    const hash = contentHash(content);
    const end = performance.now();

    monitor.recordHash(hash, end - start);
    return hash;
  };
}
