/**
 * Migration 005: Clustering Schema with J+MD Integration
 *
 * Adds:
 * - chat_records: J+MD surface (raw_text + normalized md)
 * - jmd_span_mappings: Map node spans to md coordinates
 * - cluster_evidence: Aggregate evidence with coherence
 * - cluster_decisions: Audit log for attach/review/reject
 * - review_queue: Gray-band cases for human review
 *
 * Updates:
 * - node_spans: Add md_char_start, md_char_end, md_norm_sha256
 */

import Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  console.log('Running migration 005: Clustering Schema with J+MD...');

  // 1. chat_records: J+MD surface for every conversational turn
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_records (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
      raw_text TEXT NOT NULL,
      md TEXT NOT NULL,
      md_norm_sha256 TEXT NOT NULL,
      islands TEXT NOT NULL, -- JSON array of ContentIsland
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_chat_records_conversation ON chat_records(conversation_id);
    CREATE INDEX idx_chat_records_md_hash ON chat_records(md_norm_sha256);
    CREATE INDEX idx_chat_records_role ON chat_records(role);
    CREATE INDEX idx_chat_records_timestamp ON chat_records(timestamp);
  `);

  // 2. jmd_span_mappings: Map node spans to J+MD coordinates
  db.exec(`
    CREATE TABLE IF NOT EXISTS jmd_span_mappings (
      node_id TEXT NOT NULL,
      chat_record_id TEXT NOT NULL,
      blob_hash TEXT NOT NULL,
      byte_start INTEGER NOT NULL,
      byte_end INTEGER NOT NULL,
      md_char_start INTEGER NOT NULL,
      md_char_end INTEGER NOT NULL,
      raw_text_start INTEGER NOT NULL,
      raw_text_end INTEGER NOT NULL,
      island_index INTEGER, -- NULL if not in island
      island_type TEXT CHECK(island_type IN ('code', 'math', NULL)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (node_id, chat_record_id),
      FOREIGN KEY (chat_record_id) REFERENCES chat_records(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_jmd_mappings_chat_record ON jmd_span_mappings(chat_record_id);
    CREATE INDEX idx_jmd_mappings_node ON jmd_span_mappings(node_id);
    CREATE INDEX idx_jmd_mappings_md_coords ON jmd_span_mappings(md_char_start, md_char_end);
  `);

  // 3. cluster_evidence: Aggregate evidence with coherence
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_evidence (
      cluster_id TEXT PRIMARY KEY,

      -- Phase-2 instance evidence (inherited from canonical_stats)
      instances_count INTEGER NOT NULL DEFAULT 1,
      distinct_blobs INTEGER NOT NULL DEFAULT 1,
      distinct_roles INTEGER NOT NULL DEFAULT 1,
      distinct_modalities INTEGER NOT NULL DEFAULT 1,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,

      -- Cluster-specific metrics
      member_count INTEGER NOT NULL DEFAULT 1,
      avg_edge_score REAL NOT NULL DEFAULT 0.0,
      min_edge_score REAL NOT NULL DEFAULT 0.0,
      max_edge_score REAL NOT NULL DEFAULT 0.0,
      coherence_score REAL NOT NULL DEFAULT 0.0,

      -- Evidence weights
      freq_weight REAL NOT NULL DEFAULT 0.0,
      diversity_weight REAL NOT NULL DEFAULT 0.0,
      role_weight REAL NOT NULL DEFAULT 0.0,
      temporal_weight REAL NOT NULL DEFAULT 0.0,
      modality_weight REAL NOT NULL DEFAULT 0.0,
      coherence_weight REAL NOT NULL DEFAULT 0.0,

      -- Total evidence score
      evidence_score REAL NOT NULL DEFAULT 0.0,

      updated_at INTEGER NOT NULL,
      FOREIGN KEY (cluster_id) REFERENCES clusters(cluster_id) ON DELETE CASCADE
    );

    CREATE INDEX idx_cluster_evidence_score ON cluster_evidence(evidence_score DESC);
    CREATE INDEX idx_cluster_evidence_coherence ON cluster_evidence(coherence_score DESC);
    CREATE INDEX idx_cluster_evidence_members ON cluster_evidence(member_count DESC);
  `);

  // 4. cluster_decisions: Audit log for attach/review/reject decisions
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_decisions (
      decision_id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      cluster_id TEXT, -- NULL if rejected
      candidate_clusters TEXT NOT NULL, -- JSON array of {cluster_id, score}
      final_score REAL NOT NULL,
      threshold_attach REAL NOT NULL,
      threshold_review REAL NOT NULL,
      threshold_reject REAL NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('attach', 'review', 'reject')),
      reason_code TEXT NOT NULL, -- TOK_OVERLAP, BLOCK_MATCH, etc.
      reason_metadata TEXT, -- JSON with details (shared spans, tokens, etc.)
      level TEXT NOT NULL,
      modality TEXT NOT NULL,
      policy_signature TEXT NOT NULL, -- For reproducibility
      tiebreak_path TEXT, -- JSON array of rules applied
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_decisions_node ON cluster_decisions(node_id);
    CREATE INDEX idx_decisions_cluster ON cluster_decisions(cluster_id);
    CREATE INDEX idx_decisions_decision ON cluster_decisions(decision);
    CREATE INDEX idx_decisions_timestamp ON cluster_decisions(timestamp);
    CREATE INDEX idx_decisions_policy ON cluster_decisions(policy_signature);
  `);

  // 5. review_queue: Gray-band cases for human review
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_queue (
      queue_id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      level TEXT NOT NULL,
      modality TEXT NOT NULL,
      candidates TEXT NOT NULL, -- JSON array of {cluster_id, score, reason}
      top_score REAL NOT NULL,
      score_epsilon REAL NOT NULL,
      multi_candidate_structural_conflict BOOLEAN NOT NULL DEFAULT FALSE,
      reason TEXT NOT NULL, -- Human-readable explanation
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER, -- NULL if not yet reviewed
      reviewer TEXT, -- User who reviewed
      final_decision TEXT CHECK(final_decision IN ('attach', 'reject', 'new_cluster', NULL)),
      final_cluster_id TEXT, -- Chosen cluster (if attach)
      notes TEXT,
      FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_review_queue_pending ON review_queue(created_at) WHERE reviewed_at IS NULL;
    CREATE INDEX idx_review_queue_node ON review_queue(node_id);
    CREATE INDEX idx_review_queue_level_modality ON review_queue(level, modality);
  `);

  // 6. Update node_spans with J+MD coordinates
  db.exec(`
    -- Add J+MD columns to node_spans
    ALTER TABLE node_spans ADD COLUMN md_char_start INTEGER;
    ALTER TABLE node_spans ADD COLUMN md_char_end INTEGER;
    ALTER TABLE node_spans ADD COLUMN md_norm_sha256 TEXT;

    CREATE INDEX idx_node_spans_md_hash ON node_spans(md_norm_sha256);
    CREATE INDEX idx_node_spans_md_coords ON node_spans(md_char_start, md_char_end);
  `);

  // 7. Helper view: Nodes with J+MD provenance
  db.exec(`
    CREATE VIEW IF NOT EXISTS nodes_with_jmd AS
    SELECT
      ns.node_id,
      ns.level,
      ns.modality,
      ns.byte_start,
      ns.byte_end,
      ns.md_char_start,
      ns.md_char_end,
      ns.md_norm_sha256,
      cr.id AS chat_record_id,
      cr.conversation_id,
      cr.role,
      cr.md,
      cr.raw_text,
      jsm.island_index,
      jsm.island_type
    FROM node_spans ns
    LEFT JOIN jmd_span_mappings jsm ON ns.node_id = jsm.node_id
    LEFT JOIN chat_records cr ON jsm.chat_record_id = cr.id;
  `);

  // 8. Helper view: Cluster evidence with members
  db.exec(`
    CREATE VIEW IF NOT EXISTS clusters_with_evidence AS
    SELECT
      c.cluster_id,
      c.representative_node,
      c.algorithm,
      c.threshold,
      ce.member_count,
      ce.instances_count,
      ce.distinct_blobs,
      ce.coherence_score,
      ce.evidence_score,
      ce.avg_edge_score,
      ce.first_seen_at,
      ce.last_seen_at,
      c.created_at,
      c.updated_at
    FROM clusters c
    LEFT JOIN cluster_evidence ce ON c.cluster_id = ce.cluster_id;
  `);

  console.log('Migration 005 complete: Clustering schema with J+MD integration');
}

export function down(db: Database.Database): void {
  console.log('Rolling back migration 005...');

  db.exec(`
    DROP VIEW IF EXISTS clusters_with_evidence;
    DROP VIEW IF EXISTS nodes_with_jmd;

    DROP TABLE IF EXISTS review_queue;
    DROP TABLE IF EXISTS cluster_decisions;
    DROP TABLE IF EXISTS cluster_evidence;
    DROP TABLE IF EXISTS jmd_span_mappings;
    DROP TABLE IF EXISTS chat_records;

    -- Remove J+MD columns from node_spans
    -- Note: SQLite doesn't support DROP COLUMN before 3.35.0
    -- If needed, create new table and migrate data
  `);

  console.log('Migration 005 rollback complete');
}

export const version = 5;
