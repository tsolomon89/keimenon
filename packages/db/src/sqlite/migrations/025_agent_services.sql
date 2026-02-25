-- Migration 025: Agent Services - Add agent infrastructure tables and node kinds
-- Purpose: Enable AI agent task execution with deterministic, auditable outputs
--
-- New Node Types:
--   AgentNode:        AI agent identity and configuration
--   CanonicalDoc:     Agent-generated summaries/documents
--   DuplicateCluster: Proposed duplicate groupings
--   Evidence:         Verification evidence chains
--
-- New Edge Types:
--   DERIVED_FROM:     CanonicalDoc → Source (output derived from inputs)
--   CANDIDATE_DUP:    DuplicateCluster edge with similarity metadata
--
-- New Tables:
--   agent_tasks:      Task records with status and configuration
--   agent_runs:       Individual execution attempts
--   agent_artifacts:  Content-addressable outputs
--   account_ai_settings: BYOK model preferences
--   account_api_keys: Encrypted API keys per account/provider
--
-- Note: SQLite doesn't support altering CHECK constraints, so we recreate tables

-- ============================================================================
-- PART 1: Backup existing nodes and edges
-- ============================================================================

CREATE TABLE nodes_backup AS SELECT * FROM nodes;
CREATE TABLE edges_backup AS SELECT * FROM edges;

-- ============================================================================
-- PART 2: Drop existing tables (edges first due to FK)
-- ============================================================================

DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;

-- ============================================================================
-- PART 3: Recreate nodes table with Agent node kinds
-- ============================================================================

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    -- Original kinds
    'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
    'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation',
    'UserNode', 'AccountNode', 'Board',
    -- V2 UGC Spine nodes
    'SourceDoc',        -- Stitched user segments
    'Lexeme',           -- Canonical word token
    'Phrase',           -- Multiword unit / named entity
    'Topic',            -- Cluster of phrases
    -- V2 Verified nodes
    'VerifiedSource',   -- External authority with trust score
    'VerifiedClaim',    -- Fact anchored to verified source
    -- Agent Services nodes
    'AgentNode',        -- AI agent identity
    'CanonicalDoc',     -- Agent-generated summary document
    'DuplicateCluster', -- Proposed duplicate grouping
    'Evidence'          -- Verification evidence chain
  )),
  properties TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  content_hash TEXT,
  canonical_content TEXT,
  is_duplicate INTEGER DEFAULT 0,
  original_node_id TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Recreate node indexes
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
CREATE INDEX IF NOT EXISTS idx_nodes_data_tag ON nodes(data_tag);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes(content_hash);
CREATE INDEX IF NOT EXISTS idx_nodes_is_duplicate ON nodes(is_duplicate);

-- V2 specific indexes for spine queries
CREATE INDEX IF NOT EXISTS idx_nodes_spine ON nodes(kind) WHERE kind IN ('Lexeme', 'Phrase', 'Topic');
CREATE INDEX IF NOT EXISTS idx_nodes_verified ON nodes(kind) WHERE kind IN ('VerifiedSource', 'VerifiedClaim');

-- Agent specific indexes
CREATE INDEX IF NOT EXISTS idx_nodes_agent ON nodes(kind) WHERE kind IN ('AgentNode', 'CanonicalDoc', 'DuplicateCluster', 'Evidence');

-- ============================================================================
-- PART 4: Recreate edges table with Agent edge kinds
-- ============================================================================

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN (
    -- Original kinds
    'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
    'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
    'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
    'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
    'FOLDS_INTO_FOLDER', 'IN_GROUP', 'AFFINITY', 'DISCOURSE', 'OWNER_OF',
    -- Existing in types
    'EXACT_DUP', 'NEAR_DUP', 'SPAN_CONTAINS', 'CLUSTER_MEMBER',
    -- V2 UGC Spine edges
    'MENTIONS', 'ABOUT', 'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC',
    -- V2 Verified edges
    'SOURCED_FROM',
    -- Agent Services edges
    'DERIVED_FROM',     -- CanonicalDoc → Source (summary derived from sources)
    'CANDIDATE_DUP',    -- DuplicateCluster member with similarity score
    'CREATED_BY_AGENT', -- Node → AgentNode (agent created this)
    'EVIDENCE_FOR'      -- Evidence → Claim (evidence supports claim)
  )),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  properties TEXT,
  account_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Recreate edge indexes
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_account ON edges(account_id);
CREATE INDEX IF NOT EXISTS idx_edges_data_tag ON edges(data_tag);

-- V2 specific indexes
CREATE INDEX IF NOT EXISTS idx_edges_spine ON edges(kind) WHERE kind IN ('MENTIONS', 'ABOUT', 'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC');
CREATE INDEX IF NOT EXISTS idx_edges_verified ON edges(kind) WHERE kind IN ('SOURCED_FROM', 'VERIFIED_BY');

-- Agent specific indexes
CREATE INDEX IF NOT EXISTS idx_edges_agent ON edges(kind) WHERE kind IN ('DERIVED_FROM', 'CANDIDATE_DUP', 'CREATED_BY_AGENT', 'EVIDENCE_FOR');

-- ============================================================================
-- PART 5: Restore data from backup
-- ============================================================================

INSERT INTO nodes (
  id, kind, properties, account_id, created_by, created_at, updated_at,
  data_tag, content_hash, canonical_content, is_duplicate, original_node_id
)
SELECT
  id, kind, properties, account_id, created_by, created_at, updated_at,
  data_tag, content_hash, canonical_content, is_duplicate, original_node_id
FROM nodes_backup;

INSERT INTO edges (
  id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
)
SELECT
  id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag
FROM edges_backup;

-- ============================================================================
-- PART 6: Create Agent Services tables
-- ============================================================================

-- Agent Tasks: Units of work to be executed
CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN (
    'GROUP_SUMMARY_BUILD',
    'DUPLICATE_SUGGEST',
    'VERIFY_SOURCE_CHAIN'
  )),
  account_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),
  input TEXT NOT NULL,           -- JSON: type-specific input data
  config TEXT NOT NULL,          -- JSON: versioned configuration
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  metadata TEXT,                 -- JSON: additional metadata
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_account ON agent_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type ON agent_tasks(type);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created ON agent_tasks(created_at);

-- Agent Runs: Individual execution attempts
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN (
    'running', 'completed', 'failed'
  )),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  error TEXT,
  metrics TEXT,                  -- JSON: duration_ms, tokens_used, cost_usd, etc.
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);

-- Agent Artifacts: Content-addressable outputs
CREATE TABLE IF NOT EXISTS agent_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'canonical_doc', 'cluster_json', 'evidence_chain', 'diff', 'log'
  )),
  content_hash TEXT NOT NULL,    -- SHA-256 hash for deduplication
  storage_path TEXT NOT NULL,    -- Local CAS path
  created_at INTEGER NOT NULL,
  metadata TEXT,                 -- JSON: type-specific metadata
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run ON agent_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_hash ON agent_artifacts(content_hash);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_type ON agent_artifacts(type);

-- ============================================================================
-- PART 7: Create BYOK (Bring Your Own Key) tables
-- ============================================================================

-- Account-level AI configuration
CREATE TABLE IF NOT EXISTS account_ai_settings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  preferred_provider TEXT DEFAULT 'openai' CHECK(preferred_provider IN (
    'openai', 'anthropic', 'ollama', 'groq', 'google', 'azure', 'custom'
  )),
  preferred_model TEXT DEFAULT 'gpt-4',
  litellm_base_url TEXT,         -- Custom LiteLLM proxy URL
  searxng_base_url TEXT,         -- Self-hosted SearXNG URL
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_settings_account ON account_ai_settings(account_id);

-- Encrypted API keys (per account, per provider)
CREATE TABLE IF NOT EXISTS account_api_keys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN (
    'openai', 'anthropic', 'groq', 'google', 'azure', 'tavily', 'custom'
  )),
  encrypted_key TEXT NOT NULL,   -- AES-256 encrypted
  key_hint TEXT,                 -- Last 4 chars for UI display (e.g., '...k3y9')
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_account ON account_api_keys(account_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON account_api_keys(provider);

-- ============================================================================
-- PART 8: Cleanup backup tables
-- ============================================================================

DROP TABLE nodes_backup;
DROP TABLE edges_backup;

-- ============================================================================
-- VERIFICATION (run manually to confirm)
-- ============================================================================

-- Verify node counts:
-- SELECT 'nodes restored' AS check, COUNT(*) AS count FROM nodes;

-- Verify edge counts:
-- SELECT 'edges restored' AS check, COUNT(*) AS count FROM edges;

-- Check new node kinds constraint:
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes';

-- Check new edge kinds constraint:
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='edges';

-- Check agent tables created:
-- SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agent_%';

-- Test inserting agent node (should succeed):
-- INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
-- VALUES ('test-agent', 'AgentNode', '{"name":"Test Agent","capabilities":["summarize"]}', 'acc1', 'user1', 1234567890, 1234567890);
