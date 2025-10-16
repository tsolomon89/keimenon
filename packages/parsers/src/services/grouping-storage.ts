/**
 * Grouping Storage: Persist blobs, node_spans, and signatures to SQLite
 *
 * Implements the schema from migration 003_grouping_engine_schema.ts
 * Provides CRUD operations for:
 * - Blobs (content-addressed storage)
 * - Node spans (virtual nodes with byte offsets)
 * - Node signatures (MinHash, TF-IDF, token sketches)
 * - LSH bands (for O(1) candidate lookup)
 */

import Database from 'better-sqlite3';
import { Blob, NodeSpan, NodeSignature } from './content-processor';

/**
 * LSH Band for incremental persistence (database record)
 */
export interface LshBandRecord {
  band_hash: string;         // band_abc123
  band_index: number;        // 0-15
  node_id: string;
  data_tag: string;          // For test isolation
  created_at: number;
}

/**
 * Cluster metadata
 */
export interface Cluster {
  cluster_id: string;        // Smallest NodeKey in cluster
  representative_node: string;
  member_count: number;
  algorithm: 'minhash' | 'jaccard' | 'cosine' | 'ast' | 'combined';
  threshold: number;
  created_at: number;
  updated_at: number;
}

/**
 * Cluster membership
 */
export interface ClusterMember {
  cluster_id: string;
  node_id: string;
  similarity_score: number;
  joined_at: number;
}

/**
 * Grouping Storage Service
 */
export class GroupingStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  // ==================== Blobs ====================

  /**
   * Insert blob (content-addressed storage)
   */
  insertBlob(blob: Blob): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO blobs (
        hash, size_bytes, mime_type, encoding, storage_path, data_tag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      blob.hash,
      blob.size_bytes,
      null, // mime_type
      blob.encoding,
      blob.original_path || blob.blob_id, // storage_path
      blob.data_tag,
      blob.created_at
    );
  }

  /**
   * Get blob by ID
   */
  getBlob(blobId: string): Blob | null {
    const stmt = this.db.prepare(`
      SELECT * FROM blobs WHERE blob_id = ?
    `);

    const row = stmt.get(blobId) as any;
    if (!row) return null;

    return {
      blob_id: row.hash, // Use hash as blob_id
      hash: row.hash,
      size_bytes: row.size_bytes,
      encoding: row.encoding,
      data_tag: row.data_tag,
      created_at: row.created_at,
      original_path: row.storage_path,
    };
  }

  /**
   * Get blob by content hash
   */
  getBlobByHash(hash: string): Blob | null {
    const stmt = this.db.prepare(`
      SELECT * FROM blobs WHERE hash = ?
    `);

    const row = stmt.get(hash) as any;
    if (!row) return null;

    return {
      blob_id: row.hash, // Use hash as blob_id
      hash: row.hash,
      size_bytes: row.size_bytes,
      encoding: row.encoding,
      data_tag: row.data_tag,
      created_at: row.created_at,
      original_path: row.storage_path,
    };
  }

  // ==================== Node Spans ====================

  /**
   * Insert node span (virtual node)
   */
  insertNodeSpan(span: NodeSpan): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO node_spans (
        node_id, node_key, blob_hash, byte_start, byte_end, encoding, offset_kind,
        level, modality, parent_node_id, data_tag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      span.node_id,
      span.node_key,
      span.blob_hash,
      span.byte_start,
      span.byte_end,
      span.encoding,
      span.offset_kind,
      span.level,
      span.modality,
      span.parent_node_id || null,
      span.data_tag,
      span.created_at
    );
  }

  /**
   * Insert multiple node spans (batch)
   */
  insertNodeSpans(spans: NodeSpan[]): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO node_spans (
        node_id, node_key, blob_hash, byte_start, byte_end, encoding, offset_kind,
        level, modality, parent_node_id, data_tag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((spans: NodeSpan[]) => {
      for (const span of spans) {
        insert.run(
          span.node_id,
          span.node_key,
          span.blob_hash,
          span.byte_start,
          span.byte_end,
          span.encoding,
          span.offset_kind,
          span.level,
          span.modality,
          span.parent_node_id || null,
          span.data_tag,
          span.created_at
        );
      }
    });

    transaction(spans);
  }

  /**
   * Get node span by ID
   */
  getNodeSpan(nodeId: string): NodeSpan[] {
    const stmt = this.db.prepare(`
      SELECT * FROM node_spans WHERE node_id = ?
    `);

    const rows = stmt.all(nodeId) as any[];
    return rows.map(this.rowToNodeSpan);
  }

  /**
   * Get node spans by blob hash
   */
  getNodeSpansByBlob(blobHash: string): NodeSpan[] {
    const stmt = this.db.prepare(`
      SELECT * FROM node_spans WHERE blob_hash = ?
    `);

    const rows = stmt.all(blobHash) as any[];
    return rows.map(this.rowToNodeSpan);
  }

  /**
   * Get node spans by level
   */
  getNodeSpansByLevel(level: NodeSpan['level']): NodeSpan[] {
    const stmt = this.db.prepare(`
      SELECT * FROM node_spans WHERE level = ?
    `);

    const rows = stmt.all(level) as any[];
    return rows.map(this.rowToNodeSpan);
  }

  /**
   * Get child spans
   */
  getChildSpans(parentNodeId: string): NodeSpan[] {
    const stmt = this.db.prepare(`
      SELECT * FROM node_spans WHERE parent_node_id = ?
    `);

    const rows = stmt.all(parentNodeId) as any[];
    return rows.map(this.rowToNodeSpan);
  }

  private rowToNodeSpan(row: any): NodeSpan {
    return {
      node_id: row.node_id,
      node_key: row.node_key || '',
      blob_hash: row.blob_hash,
      byte_start: row.byte_start,
      byte_end: row.byte_end,
      encoding: row.encoding,
      offset_kind: row.offset_kind,
      level: row.level,
      modality: row.modality,
      parent_node_id: row.parent_node_id,
      data_tag: row.data_tag,
      created_at: row.created_at,
    };
  }

  // ==================== Node Signatures ====================

  /**
   * Insert node signature
   */
  insertNodeSignature(signature: NodeSignature): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO node_signatures (
        node_id, node_key, content_id, minhash, tfidf_vector,
        token_sketch, structural_path, data_tag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      signature.node_id,
      signature.node_id, // Use node_id as node_key fallback
      signature.content_id,
      JSON.stringify(signature.minhash),
      signature.tfidf_vector ? JSON.stringify(signature.tfidf_vector) : null,
      signature.token_sketch || null,
      signature.structural_path,
      signature.data_tag,
      signature.created_at
    );
  }

  /**
   * Insert multiple node signatures (batch)
   */
  insertNodeSignatures(signatures: NodeSignature[]): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO node_signatures (
        node_id, node_key, content_id, minhash, tfidf_vector,
        token_sketch, structural_path, data_tag, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((signatures: NodeSignature[]) => {
      for (const sig of signatures) {
        insert.run(
          sig.node_id,
          sig.node_id, // Use node_id as node_key fallback
          sig.content_id,
          JSON.stringify(sig.minhash),
          sig.tfidf_vector ? JSON.stringify(sig.tfidf_vector) : null,
          sig.token_sketch || null,
          sig.structural_path,
          sig.data_tag,
          sig.created_at
        );
      }
    });

    transaction(signatures);
  }

  /**
   * Get node signature
   */
  getNodeSignature(nodeId: string): NodeSignature | null {
    const stmt = this.db.prepare(`
      SELECT * FROM node_signatures WHERE node_id = ?
    `);

    const row = stmt.get(nodeId) as any;
    if (!row) return null;

    return this.rowToNodeSignature(row);
  }

  /**
   * Find nodes by content ID (exact duplicates)
   */
  findNodesByContentId(contentId: string): NodeSignature[] {
    const stmt = this.db.prepare(`
      SELECT * FROM node_signatures WHERE content_id = ?
    `);

    const rows = stmt.all(contentId) as any[];
    return rows.map(this.rowToNodeSignature);
  }

  private rowToNodeSignature(row: any): NodeSignature {
    return {
      node_id: row.node_id,
      content_id: row.content_id,
      minhash: JSON.parse(row.minhash),
      minhash_bands: row.minhash_bands ? JSON.parse(row.minhash_bands) : undefined,
      tfidf_vector: row.tfidf_vector ? JSON.parse(row.tfidf_vector) : undefined,
      token_sketch: row.token_sketch,
      structural_path: row.structural_path,
      data_tag: row.data_tag,
      created_at: row.created_at,
    };
  }

  // ==================== LSH Bands ====================

  /**
   * Insert LSH band
   */
  insertLshBand(band: LshBandRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO lsh_bands (
        band_hash, band_index, node_id, data_tag, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(band.band_hash, band.band_index, band.node_id, band.data_tag, band.created_at);
  }

  /**
   * Insert multiple LSH bands (batch)
   */
  insertLshBands(bands: LshBandRecord[]): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO lsh_bands (
        band_hash, band_index, node_id, data_tag, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((bands: LshBandRecord[]) => {
      for (const band of bands) {
        insert.run(band.band_hash, band.band_index, band.node_id, band.data_tag, band.created_at);
      }
    });

    transaction(bands);
  }

  /**
   * Find candidate nodes by LSH band (O(1) lookup)
   */
  findCandidatesByBandHash(bandHash: string): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT node_id FROM lsh_bands WHERE band_hash = ?
    `);

    const rows = stmt.all(bandHash) as any[];
    return rows.map(r => r.node_id);
  }

  /**
   * Find candidate nodes matching multiple bands
   */
  findCandidatesByBandHashes(bandHashes: string[], minMatches: number = 1): string[] {
    const placeholders = bandHashes.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT node_id, COUNT(*) as match_count
      FROM lsh_bands
      WHERE band_hash IN (${placeholders})
      GROUP BY node_id
      HAVING match_count >= ?
      ORDER BY match_count DESC
    `);

    const rows = stmt.all(...bandHashes, minMatches) as any[];
    return rows.map(r => r.node_id);
  }

  // ==================== Clusters ====================

  /**
   * Insert cluster
   */
  insertCluster(cluster: Cluster): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO clusters (
        cluster_id, representative_node, member_count, algorithm,
        threshold, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      cluster.cluster_id,
      cluster.representative_node,
      cluster.member_count,
      cluster.algorithm,
      cluster.threshold,
      cluster.created_at,
      cluster.updated_at
    );
  }

  /**
   * Get cluster
   */
  getCluster(clusterId: string): Cluster | null {
    const stmt = this.db.prepare(`
      SELECT * FROM clusters WHERE cluster_id = ?
    `);

    const row = stmt.get(clusterId) as any;
    if (!row) return null;

    return {
      cluster_id: row.cluster_id,
      representative_node: row.representative_node,
      member_count: row.member_count,
      algorithm: row.algorithm,
      threshold: row.threshold,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Insert cluster member
   */
  insertClusterMember(member: ClusterMember): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cluster_members (
        cluster_id, node_id, similarity_score, joined_at
      ) VALUES (?, ?, ?, ?)
    `);

    stmt.run(member.cluster_id, member.node_id, member.similarity_score, member.joined_at);
  }

  /**
   * Get cluster members
   */
  getClusterMembers(clusterId: string): ClusterMember[] {
    const stmt = this.db.prepare(`
      SELECT * FROM cluster_members WHERE cluster_id = ?
      ORDER BY similarity_score DESC
    `);

    const rows = stmt.all(clusterId) as any[];
    return rows.map(r => ({
      cluster_id: r.cluster_id,
      node_id: r.node_id,
      similarity_score: r.similarity_score,
      joined_at: r.joined_at,
    }));
  }

  /**
   * Find cluster containing node
   */
  findClusterByNode(nodeId: string): Cluster | null {
    const stmt = this.db.prepare(`
      SELECT c.* FROM clusters c
      JOIN cluster_members cm ON c.cluster_id = cm.cluster_id
      WHERE cm.node_id = ?
    `);

    const row = stmt.get(nodeId) as any;
    if (!row) return null;

    return {
      cluster_id: row.cluster_id,
      representative_node: row.representative_node,
      member_count: row.member_count,
      algorithm: row.algorithm,
      threshold: row.threshold,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // ==================== Statistics ====================

  /**
   * Get storage statistics
   */
  getStats(): {
    blob_count: number;
    node_count: number;
    signature_count: number;
    lsh_band_count: number;
    cluster_count: number;
  } {
    const blobCount = this.db.prepare('SELECT COUNT(*) as count FROM blobs').get() as any;
    const nodeCount = this.db.prepare('SELECT COUNT(DISTINCT node_id) as count FROM node_spans').get() as any;
    const sigCount = this.db.prepare('SELECT COUNT(*) as count FROM node_signatures').get() as any;
    const bandCount = this.db.prepare('SELECT COUNT(*) as count FROM lsh_bands').get() as any;
    const clusterCount = this.db.prepare('SELECT COUNT(*) as count FROM clusters').get() as any;

    return {
      blob_count: blobCount.count,
      node_count: nodeCount.count,
      signature_count: sigCount.count,
      lsh_band_count: bandCount.count,
      cluster_count: clusterCount.count,
    };
  }
}

/**
 * Helper: Create storage instance
 */
export function createGroupingStorage(dbPath: string): GroupingStorage {
  return new GroupingStorage(dbPath);
}
