/**
 * Clustering Engine: NEAR_DUP detection with policy-driven decisions
 *
 * Features:
 * - LSH band candidate generation (O(1) lookup)
 * - Pairwise similarity scoring (MinHash + TF-IDF + token overlap)
 * - Gray-band decisions (attach/review/reject)
 * - Exclusive membership per slice (level × modality)
 * - Deterministic tie-breaking
 * - Reason code generation
 * - Decision audit logging
 */

import Database from 'better-sqlite3';
import { ClusteringPolicy, getThresholds, GrayBandThresholds } from '@canvas-memory/types';
import { GroupingStorage } from './grouping-storage';
import {
  calculateJaccardSimilarity,
  calculateCosineSimilarity,
  calculateTokenSketchSimilarity,
  MinHashSignature,
  TfIdfVector,
  TokenSketch,
} from '../breaking/signature-generator';
import { NodeSignature } from './content-processor';
import { ClusterRunTracker } from './cluster-run-tracker';

/**
 * Similarity score with breakdown
 */
export interface SimilarityScore {
  total: number; // Combined score ∈ [0, 1]
  jaccard: number; // MinHash similarity
  cosine?: number; // TF-IDF similarity (prose)
  token_sketch?: number; // Token sketch similarity (code)
  token_overlap?: number; // Raw token overlap
}

/**
 * Reason code for edge/decision
 */
export type ReasonCode =
  | 'TOK_OVERLAP' // High token overlap
  | 'BLOCK_MATCH' // Block-level match
  | 'SENT_MATCH' // Sentence-level match
  | 'ORDER_COHE' // Coherent ordering
  | 'STRUCT_SIM' // Structural similarity
  | 'MINHASH_HIGH' // High MinHash score
  | 'TFIDF_HIGH' // High TF-IDF cosine
  | 'CODE_SKETCH' // Code token sketch match
  | 'MULTI_CANDIDATE' // Multiple candidates within epsilon
  | 'BELOW_THRESHOLD' // Score below threshold
  | 'STRUCTURAL_CONFLICT'; // Structural path conflict

/**
 * Reason metadata (details for reason code)
 */
export interface ReasonMetadata {
  shared_tokens?: string[];
  shared_spans?: Array<{ start: number; end: number; text: string }>;
  top_features?: string[];
  score_breakdown?: SimilarityScore;
}

/**
 * Candidate cluster for a node
 */
export interface ClusterCandidate {
  cluster_id: string;
  representative_node: string;
  score: SimilarityScore;
  reason_code: ReasonCode;
  reason_metadata?: ReasonMetadata;
  structural_path: string;
}

/**
 * Clustering decision
 */
export type ClusterDecision = 'attach' | 'review' | 'reject';

/**
 * Decision result
 */
export interface DecisionResult {
  decision: ClusterDecision;
  cluster_id?: string; // If attach
  candidates: ClusterCandidate[];
  final_score: number;
  thresholds: GrayBandThresholds;
  reason_code: ReasonCode;
  reason_metadata?: ReasonMetadata;
  tiebreak_path?: string[]; // Rules applied for tie-breaking
}

/**
 * Clustering result
 */
export interface ClusteringResult {
  nodes_processed: number;
  clusters_created: number;
  edges_created: number;
  decisions_made: number;
  review_queue_size: number;
  attached_count: number;
  rejected_count: number;
}

/**
 * Clustering Engine
 */
export class ClusteringEngine {
  private db: Database.Database;
  private storage: GroupingStorage;
  private policy: ClusteringPolicy;
  private runTracker: ClusterRunTracker;

  constructor(
    db: Database.Database,
    storage: GroupingStorage,
    policy: ClusteringPolicy,
    runTracker?: ClusterRunTracker
  ) {
    this.db = db;
    this.storage = storage;
    this.policy = policy;
    this.runTracker = runTracker || new ClusterRunTracker(db);
  }

  /**
   * Run clustering for a specific slice (level × modality)
   *
   * @param level - Granularity level (sentence, block, section)
   * @param modality - Content modality
   * @param accountId - Account ID for multi-tenant isolation (required for security)
   * @param seed - Optional seed for deterministic clustering
   *
   * TODO: Make accountId required (non-optional) after migration 007 data backfill
   */
  async cluster(
    level: 'sentence' | 'block' | 'section',
    modality: string,
    accountId?: string,
    seed?: string
  ): Promise<ClusteringResult & { run_id: string }> {
    console.log(`Clustering ${level}/${modality}...`);

    // Start run tracking
    const runId = this.runTracker.startRun(level, modality, this.policy, seed);

    try {
      const result: ClusteringResult = {
        nodes_processed: 0,
        clusters_created: 0,
        edges_created: 0,
        decisions_made: 0,
        review_queue_size: 0,
        attached_count: 0,
        rejected_count: 0,
      };

      // Get all nodes for this slice (level × modality)
      const nodes = this.getNodesForSlice(level, modality, accountId);
      console.log(`Found ${nodes.length} nodes to process`);

      const createdClusters: string[] = [];

      // Process each node
      for (const nodeId of nodes) {
        // Check if already clustered (exclusive membership)
        if (this.isNodeClustered(nodeId, level, modality)) {
          continue;
        }

        // Find candidates via LSH
        const candidates = await this.findCandidates(nodeId, level, modality, accountId);

        if (candidates.length === 0) {
          // No candidates → create new cluster
          const clusterId = await this.createCluster(nodeId, level, modality);
          createdClusters.push(clusterId);
          result.clusters_created++;
          result.decisions_made++;
          result.attached_count++;
        } else {
          // Make decision (attach/review/reject)
          const decision = await this.makeDecision(nodeId, candidates, level, modality);

          if (decision.decision === 'attach' && decision.cluster_id) {
            await this.attachToCluster(nodeId, decision.cluster_id, decision.final_score);
            result.attached_count++;
          } else if (decision.decision === 'review') {
            await this.addToReviewQueue(nodeId, candidates, level, modality);
            result.review_queue_size++;
          } else {
            // Rejected → no cluster membership
            result.rejected_count++;
          }

          // Log decision
          await this.logDecision(nodeId, decision, level, modality);
          result.decisions_made++;
        }

        result.nodes_processed++;
      }

      // Link clusters to this run
      this.runTracker.linkClustersToRun(runId, createdClusters);

      // Finish run successfully
      this.runTracker.finishRun(runId, {
        nodes_processed: result.nodes_processed,
        clusters_created: result.clusters_created,
        edges_created: result.edges_created,
        review_queued: result.review_queue_size,
      });

      console.log('Clustering complete:', result);
      return { ...result, run_id: runId };
    } catch (error: any) {
      // Fail run
      this.runTracker.failRun(runId, error.message);
      throw error;
    }
  }

  /**
   * Find candidate clusters via LSH
   *
   * @param nodeId - Node ID to find candidates for
   * @param level - Granularity level
   * @param modality - Content modality
   * @param accountId - Account ID for multi-tenant isolation (required for security)
   *
   * TODO: Make accountId required (non-optional) after migration 007 data backfill
   */
  private async findCandidates(
    nodeId: string,
    level: string,
    modality: string,
    accountId?: string
  ): Promise<ClusterCandidate[]> {
    // Get node signature
    const signature = this.storage.getNodeSignature(nodeId, accountId);
    if (!signature) return [];

    // Get LSH bands
    const bands = this.extractBandsFromSignature(signature);

    // Find candidates by band hash
    const bandHashes = bands.map((b) => b.bandHash);
    const candidateNodeIds = this.storage.findCandidatesByBandHashes(
      bandHashes,
      accountId,
      1 // At least 1 band match
    );

    // Filter by level/modality
    const filteredCandidates = candidateNodeIds.filter((id) => {
      const spans = this.storage.getNodeSpan(id, accountId);
      return spans.some((s) => s.level === level && s.modality === modality);
    });

    // Get cluster representatives
    const clusterMap = new Map<string, string>(); // nodeId → clusterId
    for (const candId of filteredCandidates) {
      const cluster = this.storage.findClusterByNode(candId);
      if (cluster) {
        clusterMap.set(candId, cluster.cluster_id);
      }
    }

    // Compute similarity for each unique cluster
    const candidates: ClusterCandidate[] = [];
    const seenClusters = new Set<string>();

    for (const [candNodeId, clusterId] of clusterMap) {
      if (seenClusters.has(clusterId)) continue;
      seenClusters.add(clusterId);

      const candSignature = this.storage.getNodeSignature(candNodeId, accountId);
      if (!candSignature) continue;

      // Compute similarity
      const similarity = this.computeSimilarity(signature, candSignature, modality);
      const reasonCode = this.determineReasonCode(similarity, modality);

      // Get structural path
      const structuralPath = candSignature.structural_path;

      candidates.push({
        cluster_id: clusterId,
        representative_node: candNodeId,
        score: similarity,
        reason_code: reasonCode,
        structural_path: structuralPath,
      });
    }

    // Sort by total score descending
    candidates.sort((a, b) => b.score.total - a.score.total);

    return candidates;
  }

  /**
   * Make decision: attach/review/reject
   */
  private async makeDecision(
    nodeId: string,
    candidates: ClusterCandidate[],
    level: 'sentence' | 'block' | 'section',
    modality: string
  ): Promise<DecisionResult> {
    if (candidates.length === 0) {
      return {
        decision: 'reject',
        candidates: [],
        final_score: 0,
        thresholds: getThresholds(this.policy, modality as any, level),
        reason_code: 'BELOW_THRESHOLD',
      };
    }

    const thresholds = getThresholds(this.policy, modality as any, level);
    const topCandidate = candidates[0];
    const topScore = topCandidate.score.total;

    // Check for multi-candidate conflict
    if (candidates.length > 1) {
      const secondScore = candidates[1].score.total;
      const scoreDiff = Math.abs(topScore - secondScore);

      if (scoreDiff < this.policy.overlap.review_epsilon) {
        // Within epsilon → check structural conflict
        const structuralConflict = this.hasStructuralConflict(
          topCandidate.structural_path,
          candidates[1].structural_path
        );

        if (structuralConflict) {
          return {
            decision: 'review',
            candidates,
            final_score: topScore,
            thresholds,
            reason_code: 'MULTI_CANDIDATE',
          };
        }
      }
    }

    // Apply gray-band thresholds
    if (topScore >= thresholds.attach) {
      // Auto-attach
      return {
        decision: 'attach',
        cluster_id: topCandidate.cluster_id,
        candidates,
        final_score: topScore,
        thresholds,
        reason_code: topCandidate.reason_code,
        reason_metadata: topCandidate.reason_metadata,
      };
    } else if (topScore >= thresholds.review_lower) {
      // Review queue
      return {
        decision: 'review',
        candidates,
        final_score: topScore,
        thresholds,
        reason_code: topCandidate.reason_code,
      };
    } else if (topScore >= thresholds.reject_below) {
      // Reject but log
      return {
        decision: 'reject',
        candidates,
        final_score: topScore,
        thresholds,
        reason_code: 'BELOW_THRESHOLD',
      };
    } else {
      // Hard reject
      return {
        decision: 'reject',
        candidates: [],
        final_score: topScore,
        thresholds,
        reason_code: 'BELOW_THRESHOLD',
      };
    }
  }

  /**
   * Compute similarity between two signatures
   */
  private computeSimilarity(
    sig1: NodeSignature,
    sig2: NodeSignature,
    modality: string
  ): SimilarityScore {
    // Jaccard (MinHash)
    const minHash1: MinHashSignature = {
      hashes: sig1.minhash,
      numPermutations: sig1.minhash.length,
    };
    const minHash2: MinHashSignature = {
      hashes: sig2.minhash,
      numPermutations: sig2.minhash.length,
    };
    const jaccard = calculateJaccardSimilarity(minHash1, minHash2);

    let cosine: number | undefined;
    let tokenSketch: number | undefined;

    // TF-IDF (prose)
    if (sig1.tfidf_vector && sig2.tfidf_vector && modality !== 'code') {
      const tfidf1: TfIdfVector = {
        terms: sig1.tfidf_vector,
        totalTerms: Object.values(sig1.tfidf_vector).reduce((a, b) => a + b, 0),
        uniqueTerms: Object.keys(sig1.tfidf_vector),
      };
      const tfidf2: TfIdfVector = {
        terms: sig2.tfidf_vector,
        totalTerms: Object.values(sig2.tfidf_vector).reduce((a, b) => a + b, 0),
        uniqueTerms: Object.keys(sig2.tfidf_vector),
      };
      cosine = calculateCosineSimilarity(tfidf1, tfidf2);
    }

    // Token sketch (code)
    if (sig1.token_sketch && sig2.token_sketch && modality === 'code') {
      const sketch1: TokenSketch = {
        sketch: sig1.token_sketch,
        counts: {},
        uniqueTypes: [],
      };
      const sketch2: TokenSketch = {
        sketch: sig2.token_sketch,
        counts: {},
        uniqueTypes: [],
      };
      tokenSketch = calculateTokenSketchSimilarity(sketch1, sketch2);
    }

    // Combined score (weighted)
    let total = jaccard * 0.7;
    if (cosine !== undefined) {
      total += cosine * 0.3;
    } else if (tokenSketch !== undefined) {
      total += tokenSketch * 0.3;
    }

    return {
      total: Math.min(1.0, total),
      jaccard,
      cosine,
      token_sketch: tokenSketch,
    };
  }

  /**
   * Determine reason code from similarity
   */
  private determineReasonCode(similarity: SimilarityScore, modality: string): ReasonCode {
    if (similarity.jaccard >= 0.9) {
      return 'MINHASH_HIGH';
    } else if (similarity.cosine && similarity.cosine >= 0.85) {
      return 'TFIDF_HIGH';
    } else if (similarity.token_sketch && similarity.token_sketch >= 0.85) {
      return 'CODE_SKETCH';
    } else if (similarity.jaccard >= 0.75) {
      return 'TOK_OVERLAP';
    } else {
      return 'BLOCK_MATCH';
    }
  }

  /**
   * Check structural conflict
   */
  private hasStructuralConflict(path1: string, path2: string): boolean {
    // Extract root (first component)
    const root1 = path1.split('|')[0];
    const root2 = path2.split('|')[0];

    return root1 !== root2;
  }

  /**
   * Extract LSH bands from signature
   */
  private extractBandsFromSignature(
    signature: NodeSignature
  ): Array<{ bandHash: string; bandIndex: number }> {
    // Simple band extraction (16 bands, 8 hashes per band)
    const bandsCount = 16;
    const hashesPerBand = Math.ceil(signature.minhash.length / bandsCount);
    const bands: Array<{ bandHash: string; bandIndex: number }> = [];

    for (let i = 0; i < bandsCount; i++) {
      const start = i * hashesPerBand;
      const end = Math.min(start + hashesPerBand, signature.minhash.length);
      const bandHashes = signature.minhash.slice(start, end);
      const bandHashValue = this.simpleHash(bandHashes.join(','), 0);
      const bandHash = `band_${bandHashValue.toString(16)}`;

      bands.push({ bandHash, bandIndex: i });
    }

    return bands;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  /**
   * Get nodes for slice (level × modality)
   *
   * @param level - Granularity level
   * @param modality - Content modality
   * @param accountId - Account ID for multi-tenant isolation (required for security)
   *
   * TODO: Make accountId required (non-optional) after migration 007 data backfill
   */
  private getNodesForSlice(level: string, modality: string, accountId?: string): string[] {
    let stmt;
    let rows;

    if (accountId) {
      stmt = this.db.prepare(`
        SELECT DISTINCT node_id FROM node_spans
        WHERE level = ? AND modality = ? AND account_id = ?
      `);
      rows = stmt.all(level, modality, accountId) as any[];
    } else {
      // Legacy behavior without account filtering (INSECURE - for migration only)
      stmt = this.db.prepare(`
        SELECT DISTINCT node_id FROM node_spans
        WHERE level = ? AND modality = ?
      `);
      rows = stmt.all(level, modality) as any[];
    }

    return rows.map((r) => r.node_id);
  }

  /**
   * Check if node is already clustered
   */
  private isNodeClustered(nodeId: string, level: string, modality: string): boolean {
    const cluster = this.storage.findClusterByNode(nodeId);
    return cluster !== null;
  }

  /**
   * Create new cluster
   */
  private async createCluster(nodeId: string, level: string, modality: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const clusterId = `cluster_${level}_${modality}_${nodeId}`;

    this.storage.insertCluster({
      cluster_id: clusterId,
      representative_node: nodeId,
      member_count: 1,
      algorithm: 'minhash',
      threshold: 0.0,
      created_at: now,
      updated_at: now,
    });

    this.storage.insertClusterMember({
      cluster_id: clusterId,
      node_id: nodeId,
      similarity_score: 1.0,
      joined_at: now,
    });

    return clusterId;
  }

  /**
   * Attach node to cluster
   */
  private async attachToCluster(nodeId: string, clusterId: string, score: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    this.storage.insertClusterMember({
      cluster_id: clusterId,
      node_id: nodeId,
      similarity_score: score,
      joined_at: now,
    });

    // Update cluster member count
    const cluster = this.storage.getCluster(clusterId);
    if (cluster) {
      cluster.member_count++;
      cluster.updated_at = now;
      this.storage.insertCluster(cluster);
    }
  }

  /**
   * Add to review queue
   */
  private async addToReviewQueue(
    nodeId: string,
    candidates: ClusterCandidate[],
    level: string,
    modality: string
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const queueId = `review_${nodeId}_${now}`;

    const stmt = this.db.prepare(`
      INSERT INTO review_queue (
        queue_id, node_id, level, modality, candidates, top_score,
        score_epsilon, multi_candidate_structural_conflict, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      queueId,
      nodeId,
      level,
      modality,
      JSON.stringify(candidates),
      candidates[0]?.score.total || 0,
      this.policy.overlap.review_epsilon,
      candidates.length > 1,
      'Ambiguous clustering decision - requires human review',
      now
    );
  }

  /**
   * Log decision
   */
  private async logDecision(
    nodeId: string,
    decision: DecisionResult,
    level: string,
    modality: string
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const decisionId = `decision_${nodeId}_${now}`;

    const stmt = this.db.prepare(`
      INSERT INTO cluster_decisions (
        decision_id, node_id, cluster_id, candidate_clusters, final_score,
        threshold_attach, threshold_review, threshold_reject, decision,
        reason_code, reason_metadata, level, modality, policy_signature, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      decisionId,
      nodeId,
      decision.cluster_id || null,
      JSON.stringify(decision.candidates),
      decision.final_score,
      decision.thresholds.attach,
      decision.thresholds.review_lower,
      decision.thresholds.reject_below,
      decision.decision,
      decision.reason_code,
      decision.reason_metadata ? JSON.stringify(decision.reason_metadata) : null,
      level,
      modality,
      this.policy.signature || 'unknown',
      now
    );
  }
}

/**
 * Helper: Create clustering engine
 */
export function createClusteringEngine(
  db: Database.Database,
  storage: GroupingStorage,
  policy: ClusteringPolicy
): ClusteringEngine {
  return new ClusteringEngine(db, storage, policy);
}
