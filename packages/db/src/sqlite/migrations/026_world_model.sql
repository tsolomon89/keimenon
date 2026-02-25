-- Migration 026: World Model Alignment - Unified Principal Model
-- Purpose: Implement Phase 5 of Keimenon Vision - unified principal model with capability-based authorization
--
-- The Unifying Invariant: Everything is "account-scoped documents + edges"
--   Account = graph boundary (container / tenancy membrane)
--   Principal = any actor inside that boundary (human, agent, contact) - same shape, different capabilities
--   Source = any imported or created artifact (file, web capture, agent brief, citation pack)
--   Conversation = a trace: principal <-> agent <-> context-set <-> outputs/runs
--
-- New Node Types:
--   Principal:           Unified type for humans, agents, contacts (capabilities are policy-controlled)
--   ConversationThread:  Formal join between (human_principal, agent_principal, context_set, purpose)
--
-- New Edge Types:
--   CREATED_BY:       Source (workspace) -> Principal (creator)
--   ATTACHED_TO:      Source (workspace) -> Principal (agent)
--   PINS_CONTEXT:     Source (workspace) -> Any Node (context root)
--   INITIATED_BY:     ConversationThread -> Principal (human who started)
--   PARTICIPATED_IN:  Principal -> ConversationThread (participant)
--   PRODUCED_BY:      Node -> Run (output attribution with run_id)
--
-- Key Principles:
--   1. Account is the hard boundary - every node/edge belongs to exactly ONE account
--   2. Principals are one type - same shape with principal_kind + capabilities + policy_profile_id
--   3. Provenance is non-negotiable - every source answers WHO/HOW/FROM WHAT/VERIFIED
--   4. Special source = role, not ontology - source_role field, not separate node kinds
--   5. Conversations are joins - explicit first-class objects
--   6. Context must be visible - UI shows "chatting with X, using context Y, created Z"
--
-- Falsification Tests (model coherence verification):
--   F1: Principal Equivalence - identical capabilities = identical permissions regardless of principal_kind
--   F2: Account Boundary Integrity - no cross-account data leakage or edges
--   F3: Provenance Completeness - every source has origin_principal_id, origin_type, origin_ref, trust_state
--   F4: Context-Set Legibility - every chat UI shows agent identity + context set + run attribution
--   F5: Run Reproducibility - deterministic records given same inputs/config
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
-- PART 3: Recreate nodes table with World Model node kinds
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
    'AgentNode',        -- AI agent identity (deprecated - use Principal with principal_kind='agent')
    'CanonicalDoc',     -- Agent-generated summary document
    'DuplicateCluster', -- Proposed duplicate grouping
    'Evidence',         -- Verification evidence chain
    -- World Model V5 nodes (Phase 5)
    'Principal',        -- Unified type for humans, agents, contacts
    'ConversationThread' -- Formal join: (human, agent, context_set, purpose)
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

-- World Model V5 specific indexes (Phase 5)
-- Principal nodes: fast lookup for authorization and identity resolution
CREATE INDEX IF NOT EXISTS idx_nodes_principal ON nodes(kind) WHERE kind = 'Principal';

-- ConversationThread nodes: fast lookup for chat history
CREATE INDEX IF NOT EXISTS idx_nodes_conversation ON nodes(kind) WHERE kind = 'ConversationThread';

-- Combined actor index: all actor types (for transition period)
CREATE INDEX IF NOT EXISTS idx_nodes_actors ON nodes(kind) WHERE kind IN ('Principal', 'UserNode', 'AgentNode');

-- ============================================================================
-- PART 4: Recreate edges table with World Model edge kinds
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
    'DERIVED_FROM',     -- CanonicalDoc -> Source (summary derived from sources)
    'CANDIDATE_DUP',    -- DuplicateCluster member with similarity score
    'CREATED_BY_AGENT', -- Node -> AgentNode (agent created this)
    'EVIDENCE_FOR',     -- Evidence -> Claim (evidence supports claim)
    -- World Model V5 edges (Phase 5)
    'CREATED_BY',       -- Source (workspace) -> Principal (creator)
    'ATTACHED_TO',      -- Source (workspace) -> Principal (agent)
    'PINS_CONTEXT',     -- Source (workspace) -> Any Node (context root)
    'INITIATED_BY',     -- ConversationThread -> Principal (human who started)
    'PARTICIPATED_IN',  -- Principal -> ConversationThread (participant)
    'PRODUCED_BY'       -- Node -> Run (output attribution with run_id in properties)
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

-- World Model V5 specific indexes (Phase 5)
-- Workspace relationship edges: find workspaces by creator/agent
CREATE INDEX IF NOT EXISTS idx_edges_workspace ON edges(kind) WHERE kind IN ('CREATED_BY', 'ATTACHED_TO', 'PINS_CONTEXT');

-- Conversation relationship edges: find conversations by participant
CREATE INDEX IF NOT EXISTS idx_edges_conversation ON edges(kind) WHERE kind IN ('INITIATED_BY', 'PARTICIPATED_IN');

-- Run attribution: find what a run produced
CREATE INDEX IF NOT EXISTS idx_edges_run_attribution ON edges(kind) WHERE kind = 'PRODUCED_BY';

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
-- PART 6: Create policy profiles table (for capability-based authorization)
-- ============================================================================

-- Policy profiles define capability sets that can be assigned to principals
-- This enables "capabilities are policy-controlled, not hard-coded"
CREATE TABLE IF NOT EXISTS policy_profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Capability flags (mirrored in PrincipalCapabilitiesSchema)
  can_upload INTEGER NOT NULL DEFAULT 1,      -- Create sources from uploads
  can_run_tools INTEGER NOT NULL DEFAULT 0,   -- Execute tool calls (agents)
  can_import_web INTEGER NOT NULL DEFAULT 0,  -- Fetch external sources (agents)
  can_own_account INTEGER NOT NULL DEFAULT 0, -- Be account owner (humans)
  can_approve_runs INTEGER NOT NULL DEFAULT 0, -- Approve agent outputs (humans)
  -- Metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_policy_profiles_account ON policy_profiles(account_id);

-- ============================================================================
-- PART 7: Create default policy profiles for each account
-- ============================================================================

-- Note: In production, these would be created when accounts are created
-- For existing accounts, we create default profiles

-- Default human profile: can upload, can own account, can approve runs
INSERT OR IGNORE INTO policy_profiles (
  id, account_id, name, description,
  can_upload, can_run_tools, can_import_web, can_own_account, can_approve_runs,
  created_at, updated_at
)
SELECT
  'policy_human_default_' || id,
  id,
  'Default Human',
  'Standard capabilities for human principals',
  1, 0, 0, 1, 1,
  strftime('%s', 'now') * 1000,
  strftime('%s', 'now') * 1000
FROM accounts;

-- Default agent profile: can run tools, can import web (no ownership/approval)
INSERT OR IGNORE INTO policy_profiles (
  id, account_id, name, description,
  can_upload, can_run_tools, can_import_web, can_own_account, can_approve_runs,
  created_at, updated_at
)
SELECT
  'policy_agent_default_' || id,
  id,
  'Default Agent',
  'Standard capabilities for agent principals',
  1, 1, 1, 0, 0,
  strftime('%s', 'now') * 1000,
  strftime('%s', 'now') * 1000
FROM accounts;

-- Restricted agent profile: can only run tools locally (no web import)
INSERT OR IGNORE INTO policy_profiles (
  id, account_id, name, description,
  can_upload, can_run_tools, can_import_web, can_own_account, can_approve_runs,
  created_at, updated_at
)
SELECT
  'policy_agent_restricted_' || id,
  id,
  'Restricted Agent',
  'Limited capabilities for restricted agent principals',
  0, 1, 0, 0, 0,
  strftime('%s', 'now') * 1000,
  strftime('%s', 'now') * 1000
FROM accounts;

-- Contact profile: read-only, no special capabilities
INSERT OR IGNORE INTO policy_profiles (
  id, account_id, name, description,
  can_upload, can_run_tools, can_import_web, can_own_account, can_approve_runs,
  created_at, updated_at
)
SELECT
  'policy_contact_default_' || id,
  id,
  'Default Contact',
  'Read-only capabilities for external contacts',
  0, 0, 0, 0, 0,
  strftime('%s', 'now') * 1000,
  strftime('%s', 'now') * 1000
FROM accounts;

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

-- Check new node kinds constraint includes Principal and ConversationThread:
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes';

-- Check new edge kinds constraint includes World Model V5 edges:
-- SELECT sql FROM sqlite_master WHERE type='table' AND name='edges';

-- Check policy profiles created:
-- SELECT * FROM policy_profiles;

-- Test inserting Principal node (should succeed):
-- INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
-- VALUES (
--   'test-principal',
--   'Principal',
--   '{"display_name":"Test User","principal_kind":"human","capabilities":{"can_upload":true,"can_run_tools":false,"can_import_web":false,"can_own_account":true,"can_approve_runs":true}}',
--   'acc1',
--   'user1',
--   1234567890,
--   1234567890
-- );

-- Test inserting ConversationThread node (should succeed):
-- INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
-- VALUES (
--   'test-conversation',
--   'ConversationThread',
--   '{"human_principal_id":"principal1","agent_principal_id":"agent1","purpose":"summarize","title":"Test Conversation"}',
--   'acc1',
--   'user1',
--   1234567890,
--   1234567890
-- );

-- Test inserting CREATED_BY edge (should succeed):
-- INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
-- VALUES (
--   'test-created-by-edge',
--   'CREATED_BY',
--   'source1',
--   'principal1',
--   '{}',
--   'acc1',
--   'user1',
--   1234567890
-- );

-- Test inserting PRODUCED_BY edge with run_id (should succeed):
-- INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
-- VALUES (
--   'test-produced-by-edge',
--   'PRODUCED_BY',
--   'output-node1',
--   'run1',
--   '{"run_id":"run1","task_type":"GROUP_SUMMARY_BUILD"}',
--   'acc1',
--   'user1',
--   1234567890
-- );
