/**
 * NEAR_DUP Edge Generation: Scored similarity links with reason codes
 *
 * Creates edges for near-duplicates with:
 * - Score ∈ (0, 1)
 * - Reason codes (TOK_OVERLAP, BLOCK_MATCH, etc.)
 * - Metadata (shared spans, top tokens, features)
 * - Many-to-many (independent of cluster membership)
 */

import Database from 'better-sqlite3';
import { SimilarityScore, ReasonCode, ReasonMetadata } from './clustering-engine';
import { NodeSignature } from './content-processor';

/**
 * NEAR_DUP edge
 */
export interface NearDupEdge {
  edge_id: string;
  from_node: string;
  to_node: string;
  score: number;
  reason_code: ReasonCode;
  reason_metadata?: ReasonMetadata;
  similarity_breakdown: SimilarityScore;
  level: string;
  modality: string;
  created_at: number;
}

/**
 * Edge generation result
 */
export interface EdgeGenerationResult {
  edges_created: number;
  nodes_connected: number;
  avg_score: number;
  reason_code_counts: Record<ReasonCode, number>;
}

/**
 * NEAR_DUP Edge Generator
 */
export class NearDupEdgeGenerator {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Generate NEAR_DUP edge
   */
  createEdge(
    fromNode: string,
    toNode: string,
    similarity: SimilarityScore,
    reasonCode: ReasonCode,
    level: string,
    modality: string,
    reasonMetadata?: ReasonMetadata
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const edgeId = `edge_neardup_${fromNode}_${toNode}`;

    // Check if edge already exists
    const existing = this.db.prepare(`
      SELECT 1 FROM edges WHERE id = ?
    `).get(edgeId);

    if (existing) {
      // Update existing edge
      this.updateEdge(edgeId, similarity, reasonCode, reasonMetadata);
      return;
    }

    // Insert new edge
    const stmt = this.db.prepare(`
      INSERT INTO edges (
        id, from_node, to_node, kind, weight, metadata, created_at
      ) VALUES (?, ?, ?, 'NEAR_DUP', ?, ?, ?)
    `);

    const metadata = {
      score: similarity.total,
      jaccard: similarity.jaccard,
      cosine: similarity.cosine,
      token_sketch: similarity.token_sketch,
      reason_code: reasonCode,
      reason_metadata: reasonMetadata,
      level,
      modality,
    };

    stmt.run(
      edgeId,
      fromNode,
      toNode,
      similarity.total,
      JSON.stringify(metadata),
      now
    );
  }

  /**
   * Update existing edge
   */
  private updateEdge(
    edgeId: string,
    similarity: SimilarityScore,
    reasonCode: ReasonCode,
    reasonMetadata?: ReasonMetadata
  ): void {
    const stmt = this.db.prepare(`
      UPDATE edges
      SET weight = ?, metadata = ?
      WHERE id = ?
    `);

    const metadata = {
      score: similarity.total,
      jaccard: similarity.jaccard,
      cosine: similarity.cosine,
      token_sketch: similarity.token_sketch,
      reason_code: reasonCode,
      reason_metadata: reasonMetadata,
    };

    stmt.run(similarity.total, JSON.stringify(metadata), edgeId);
  }

  /**
   * Create bidirectional edges (A → B and B → A)
   */
  createBidirectionalEdges(
    nodeA: string,
    nodeB: string,
    similarity: SimilarityScore,
    reasonCode: ReasonCode,
    level: string,
    modality: string,
    reasonMetadata?: ReasonMetadata
  ): void {
    this.createEdge(nodeA, nodeB, similarity, reasonCode, level, modality, reasonMetadata);
    this.createEdge(nodeB, nodeA, similarity, reasonCode, level, modality, reasonMetadata);
  }

  /**
   * Batch create edges from cluster members
   */
  createClusterEdges(
    clusterId: string,
    memberScores: Map<string, { nodeId: string; score: number; similarity: SimilarityScore; reasonCode: ReasonCode }>,
    level: string,
    modality: string
  ): EdgeGenerationResult {
    const result: EdgeGenerationResult = {
      edges_created: 0,
      nodes_connected: 0,
      avg_score: 0,
      reason_code_counts: {} as Record<ReasonCode, number>,
    };

    const members = Array.from(memberScores.values());
    let totalScore = 0;

    // Create edges between all pairs (fully connected within cluster)
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const memberA = members[i];
        const memberB = members[j];

        // Use average of their scores to representative
        const avgSimilarity: SimilarityScore = {
          total: (memberA.score + memberB.score) / 2,
          jaccard: (memberA.similarity.jaccard + memberB.similarity.jaccard) / 2,
          cosine: memberA.similarity.cosine && memberB.similarity.cosine
            ? (memberA.similarity.cosine + memberB.similarity.cosine) / 2
            : undefined,
          token_sketch: memberA.similarity.token_sketch && memberB.similarity.token_sketch
            ? (memberA.similarity.token_sketch + memberB.similarity.token_sketch) / 2
            : undefined,
        };

        // Pick reason code from higher-scored member
        const reasonCode = memberA.score > memberB.score
          ? memberA.reasonCode
          : memberB.reasonCode;

        this.createBidirectionalEdges(
          memberA.nodeId,
          memberB.nodeId,
          avgSimilarity,
          reasonCode,
          level,
          modality
        );

        result.edges_created += 2; // Bidirectional
        totalScore += avgSimilarity.total;

        // Count reason codes
        result.reason_code_counts[reasonCode] =
          (result.reason_code_counts[reasonCode] || 0) + 1;
      }
    }

    result.nodes_connected = members.length;
    result.avg_score = members.length > 0 ? totalScore / result.edges_created : 0;

    return result;
  }

  /**
   * Get NEAR_DUP edges for a node
   */
  getEdgesForNode(nodeId: string): NearDupEdge[] {
    const stmt = this.db.prepare(`
      SELECT * FROM edges
      WHERE (from_node = ? OR to_node = ?)
      AND kind = 'NEAR_DUP'
    `);

    const rows = stmt.all(nodeId, nodeId) as any[];
    return rows.map(this.rowToEdge);
  }

  /**
   * Get edges by score threshold
   */
  getEdgesByScoreThreshold(minScore: number): NearDupEdge[] {
    const stmt = this.db.prepare(`
      SELECT * FROM edges
      WHERE kind = 'NEAR_DUP'
      AND weight >= ?
      ORDER BY weight DESC
    `);

    const rows = stmt.all(minScore) as any[];
    return rows.map(this.rowToEdge);
  }

  /**
   * Get edges by reason code
   */
  getEdgesByReasonCode(reasonCode: ReasonCode): NearDupEdge[] {
    const stmt = this.db.prepare(`
      SELECT * FROM edges
      WHERE kind = 'NEAR_DUP'
      AND json_extract(metadata, '$.reason_code') = ?
    `);

    const rows = stmt.all(reasonCode) as any[];
    return rows.map(this.rowToEdge);
  }

  /**
   * Get edge statistics
   */
  getStats(): {
    total_edges: number;
    avg_score: number;
    min_score: number;
    max_score: number;
    reason_code_distribution: Record<ReasonCode, number>;
  } {
    const totalStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM edges WHERE kind = 'NEAR_DUP'
    `);
    const totalRow = totalStmt.get() as any;
    const totalEdges = totalRow?.count || 0;

    const avgStmt = this.db.prepare(`
      SELECT AVG(weight) as avg, MIN(weight) as min, MAX(weight) as max
      FROM edges WHERE kind = 'NEAR_DUP'
    `);
    const avgRow = avgStmt.get() as any;

    const reasonStmt = this.db.prepare(`
      SELECT json_extract(metadata, '$.reason_code') as reason_code, COUNT(*) as count
      FROM edges
      WHERE kind = 'NEAR_DUP'
      GROUP BY reason_code
    `);
    const reasonRows = reasonStmt.all() as any[];
    const reasonDistribution: Record<ReasonCode, number> = {} as any;
    for (const row of reasonRows) {
      reasonDistribution[row.reason_code as ReasonCode] = row.count;
    }

    return {
      total_edges: totalEdges,
      avg_score: avgRow?.avg || 0,
      min_score: avgRow?.min || 0,
      max_score: avgRow?.max || 0,
      reason_code_distribution: reasonDistribution,
    };
  }

  /**
   * Delete edges below threshold
   */
  deleteEdgesBelowThreshold(minScore: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM edges
      WHERE kind = 'NEAR_DUP'
      AND weight < ?
    `);

    const result = stmt.run(minScore);
    return result.changes;
  }

  /**
   * Convert row to edge
   */
  private rowToEdge(row: any): NearDupEdge {
    const metadata = row.metadata ? JSON.parse(row.metadata) : {};

    return {
      edge_id: row.id,
      from_node: row.from_node,
      to_node: row.to_node,
      score: row.weight,
      reason_code: metadata.reason_code,
      reason_metadata: metadata.reason_metadata,
      similarity_breakdown: {
        total: metadata.score,
        jaccard: metadata.jaccard,
        cosine: metadata.cosine,
        token_sketch: metadata.token_sketch,
      },
      level: metadata.level,
      modality: metadata.modality,
      created_at: row.created_at,
    };
  }
}

/**
 * Helper: Create edge generator
 */
export function createNearDupEdgeGenerator(db: Database.Database): NearDupEdgeGenerator {
  return new NearDupEdgeGenerator(db);
}

/**
 * Generate reason metadata from shared features
 */
export function generateReasonMetadata(
  sig1: NodeSignature,
  sig2: NodeSignature,
  similarity: SimilarityScore
): ReasonMetadata {
  const metadata: ReasonMetadata = {
    score_breakdown: similarity,
  };

  // Extract shared tokens (from TF-IDF)
  if (sig1.tfidf_vector && sig2.tfidf_vector) {
    const sharedTokens: string[] = [];
    for (const token of Object.keys(sig1.tfidf_vector)) {
      if (token in sig2.tfidf_vector) {
        sharedTokens.push(token);
      }
    }
    metadata.shared_tokens = sharedTokens.slice(0, 10); // Top 10
  }

  // Extract top features
  metadata.top_features = [
    `jaccard=${similarity.jaccard.toFixed(3)}`,
    similarity.cosine ? `cosine=${similarity.cosine.toFixed(3)}` : null,
    similarity.token_sketch ? `token_sketch=${similarity.token_sketch.toFixed(3)}` : null,
  ].filter(Boolean) as string[];

  return metadata;
}
