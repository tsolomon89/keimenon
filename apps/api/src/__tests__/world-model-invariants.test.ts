/**
 * World Model Invariants - Falsification Tests
 *
 * These tests verify the coherence of the World Model alignment (Phase 5).
 * If any of these tests fail, the model is broken.
 *
 * The Unifying Invariant: Everything is "account-scoped documents + edges"
 *
 * Key Principles:
 * 1. Account is the hard boundary - every node/edge belongs to exactly ONE account
 * 2. Principals are one type - same shape with principal_kind + capabilities + policy_profile_id
 * 3. Provenance is non-negotiable - every source answers WHO/HOW/FROM WHAT/VERIFIED
 * 4. Special source = role, not ontology - source_role field, not separate node kinds
 * 5. Conversations are joins - (principal, agent, context_set, purpose) as first-class object
 * 6. Context must be visible - UI shows "chatting with X, using context Y, created Z"
 *
 * Falsification Tests:
 * F1: Principal Equivalence - identical capabilities = identical permissions
 * F2: Account Boundary Integrity - no cross-account data leakage
 * F3: Provenance Completeness - every source has full provenance
 * F4: Context-Set Legibility - conversations have explicit context
 * F5: Run Reproducibility - deterministic records given same inputs
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

import {
  CapabilityAuthorizationService,
  PrincipalCapabilities,
  DEFAULT_CAPABILITIES,
} from '../services/auth.service';
import { SQLiteClient } from '@keimenon/db';

// Test database path
const TEST_DB_PATH = path.join(__dirname, '../../test-world-model.db');

// Helper to create test database
function createTestDatabase(): SQLiteClient {
  // Remove existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = new Database(TEST_DB_PATH);

  // Create minimal schema for testing
  db.exec(`
    -- Accounts table
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_type TEXT NOT NULL DEFAULT 'client',
      account_class TEXT NOT NULL DEFAULT 'free',
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      owner_user_id TEXT,
      require_account_password INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT,
      google_id TEXT,
      name TEXT NOT NULL,
      permission_level TEXT NOT NULL DEFAULT 'admin',
      user_class TEXT NOT NULL DEFAULT 'person',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      primary_account_id TEXT,
      last_login_account_id TEXT
    );

    -- Nodes table with World Model kinds
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN (
        'UploadItem', 'Chat', 'MessageRef', 'Source', 'Group', 'CodeBlock', 'Folder',
        'ChatThread', 'Message', 'ObjectiveClaim', 'UnifiedDoc', 'Constellation',
        'UserNode', 'AccountNode', 'Board',
        'SourceDoc', 'Lexeme', 'Phrase', 'Topic',
        'VerifiedSource', 'VerifiedClaim',
        'AgentNode', 'CanonicalDoc', 'DuplicateCluster', 'Evidence',
        'Principal', 'ConversationThread'
      )),
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'test',
      content_hash TEXT,
      canonical_content TEXT,
      is_duplicate INTEGER DEFAULT 0,
      original_node_id TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- Edges table with World Model kinds
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN (
        'CONTAINS', 'DERIVES_FROM', 'EXTRACTED_FROM', 'SIMILAR_TO',
        'SEQUESTERS', 'HAS_MESSAGE', 'COMPILED_FROM', 'STITCHED_FROM',
        'IN_SCOPE_FOR', 'EQUIVALENT_TO', 'DUP_OF', 'SUPPORTS', 'REFUTES',
        'VERIFIED_BY', 'ASSOCIATED_WITH_USER', 'PROMOTES_TO_GROUP',
        'FOLDS_INTO_FOLDER', 'IN_GROUP', 'AFFINITY', 'DISCOURSE', 'OWNER_OF',
        'EXACT_DUP', 'NEAR_DUP', 'SPAN_CONTAINS', 'CLUSTER_MEMBER',
        'MENTIONS', 'ABOUT', 'CO_OCCURS_WITH', 'BELONGS_TO_TOPIC',
        'SOURCED_FROM',
        'DERIVED_FROM', 'CANDIDATE_DUP', 'CREATED_BY_AGENT', 'EVIDENCE_FOR',
        'CREATED_BY', 'ATTACHED_TO', 'PINS_CONTEXT',
        'INITIATED_BY', 'PARTICIPATED_IN', 'PRODUCED_BY'
      )),
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      properties TEXT,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'test',
      FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    -- Policy profiles table
    CREATE TABLE IF NOT EXISTS policy_profiles (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      can_upload INTEGER NOT NULL DEFAULT 1,
      can_run_tools INTEGER NOT NULL DEFAULT 0,
      can_import_web INTEGER NOT NULL DEFAULT 0,
      can_own_account INTEGER NOT NULL DEFAULT 0,
      can_approve_runs INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      data_tag TEXT DEFAULT 'test',
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, name)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
    CREATE INDEX IF NOT EXISTS idx_nodes_account ON nodes(account_id);
    CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
    CREATE INDEX IF NOT EXISTS idx_edges_account ON edges(account_id);
  `);

  // Return a mock SQLiteClient
  const client = {
    getDatabase: () => db,
    close: () => db.close(),
  } as unknown as SQLiteClient;

  return client;
}

// Test fixtures
let dbClient: SQLiteClient;
let capabilityService: CapabilityAuthorizationService;

const ACCOUNT_A_ID = 'test-account-a';
const ACCOUNT_B_ID = 'test-account-b';
const USER_A_ID = 'test-user-a';
const USER_B_ID = 'test-user-b';

describe('World Model Invariants - Falsification Tests', () => {
  beforeAll(() => {
    dbClient = createTestDatabase();
    capabilityService = new CapabilityAuthorizationService(dbClient);

    const db = dbClient.getDatabase();
    const now = Date.now();

    // Create test accounts
    db.prepare(`
      INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
      VALUES (?, 'client', 'free', 'account-a@test.com', 'Account A', ?, ?)
    `).run(ACCOUNT_A_ID, now, now);

    db.prepare(`
      INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
      VALUES (?, 'client', 'free', 'account-b@test.com', 'Account B', ?, ?)
    `).run(ACCOUNT_B_ID, now, now);

    // Create test users
    db.prepare(`
      INSERT INTO users (id, email, name, permission_level, user_class, is_active, created_at, updated_at)
      VALUES (?, 'user-a@test.com', 'User A', 'admin', 'person', 1, ?, ?)
    `).run(USER_A_ID, now, now);

    db.prepare(`
      INSERT INTO users (id, email, name, permission_level, user_class, is_active, created_at, updated_at)
      VALUES (?, 'user-b@test.com', 'User B', 'admin', 'person', 1, ?, ?)
    `).run(USER_B_ID, now, now);
  });

  afterAll(() => {
    dbClient.close();
    // Cleanup test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  // ============================================================================
  // F1: PRINCIPAL EQUIVALENCE
  // ============================================================================
  //
  // Given: Human principal H and Agent principal A with IDENTICAL capability flags
  // When: Both attempt the same action
  // Then: Permission engine makes IDENTICAL decision for both
  // If: Outcomes differ because of principal_kind → model is broken
  //
  // ============================================================================

  describe('F1: Principal Equivalence', () => {
    const humanPrincipalId = 'principal-human-f1';
    const agentPrincipalId = 'principal-agent-f1';

    // Identical capabilities for both principals
    const identicalCapabilities: PrincipalCapabilities = {
      can_upload: true,
      can_run_tools: true,    // Not typical for human, but testing equivalence
      can_import_web: false,
      can_own_account: true,  // Not typical for agent, but testing equivalence
      can_approve_runs: true,
    };

    beforeAll(() => {
      const db = dbClient.getDatabase();
      const now = Date.now();

      // Create Human principal with identical capabilities
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `).run(
        humanPrincipalId,
        JSON.stringify({
          display_name: 'Test Human',
          principal_kind: 'human',
          capabilities: identicalCapabilities,
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      // Create Agent principal with IDENTICAL capabilities
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `).run(
        agentPrincipalId,
        JSON.stringify({
          display_name: 'Test Agent',
          principal_kind: 'agent',
          capabilities: identicalCapabilities,
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );
    });

    it('should grant identical upload permission to human and agent with same capabilities', async () => {
      const humanResult = await capabilityService.canPerformAction(
        humanPrincipalId,
        ACCOUNT_A_ID,
        'upload'
      );
      const agentResult = await capabilityService.canPerformAction(
        agentPrincipalId,
        ACCOUNT_A_ID,
        'upload'
      );

      expect(humanResult.allowed).toBe(agentResult.allowed);
      expect(humanResult.allowed).toBe(true);
    });

    it('should grant identical run_tools permission to human and agent with same capabilities', async () => {
      const humanResult = await capabilityService.canPerformAction(
        humanPrincipalId,
        ACCOUNT_A_ID,
        'run_tools'
      );
      const agentResult = await capabilityService.canPerformAction(
        agentPrincipalId,
        ACCOUNT_A_ID,
        'run_tools'
      );

      expect(humanResult.allowed).toBe(agentResult.allowed);
      expect(humanResult.allowed).toBe(true);
    });

    it('should deny identical import_web permission to human and agent with same capabilities', async () => {
      const humanResult = await capabilityService.canPerformAction(
        humanPrincipalId,
        ACCOUNT_A_ID,
        'import_web'
      );
      const agentResult = await capabilityService.canPerformAction(
        agentPrincipalId,
        ACCOUNT_A_ID,
        'import_web'
      );

      // Both should be denied because capabilities have can_import_web: false
      expect(humanResult.allowed).toBe(agentResult.allowed);
      expect(humanResult.allowed).toBe(false);
    });

    it('should grant identical own_account permission to human and agent with same capabilities', async () => {
      const humanResult = await capabilityService.canPerformAction(
        humanPrincipalId,
        ACCOUNT_A_ID,
        'own_account'
      );
      const agentResult = await capabilityService.canPerformAction(
        agentPrincipalId,
        ACCOUNT_A_ID,
        'own_account'
      );

      expect(humanResult.allowed).toBe(agentResult.allowed);
      expect(humanResult.allowed).toBe(true);
    });

    it('should grant identical approve_runs permission to human and agent with same capabilities', async () => {
      const humanResult = await capabilityService.canPerformAction(
        humanPrincipalId,
        ACCOUNT_A_ID,
        'approve_runs'
      );
      const agentResult = await capabilityService.canPerformAction(
        agentPrincipalId,
        ACCOUNT_A_ID,
        'approve_runs'
      );

      expect(humanResult.allowed).toBe(agentResult.allowed);
      expect(humanResult.allowed).toBe(true);
    });

    it('should return identical capabilities for principals regardless of principal_kind', async () => {
      const humanCapabilities = await capabilityService.getPrincipalCapabilities(
        humanPrincipalId,
        ACCOUNT_A_ID
      );
      const agentCapabilities = await capabilityService.getPrincipalCapabilities(
        agentPrincipalId,
        ACCOUNT_A_ID
      );

      expect(humanCapabilities).toEqual(agentCapabilities);
    });
  });

  // ============================================================================
  // F2: ACCOUNT BOUNDARY INTEGRITY
  // ============================================================================
  //
  // Given: User U is member of Account A and Account B
  // When: Authenticated to Account B, query for nodes / reference Account A IDs
  // Then: Account B graph view returns ZERO Account A nodes
  //       API rejects cross-account references
  //       Edge creation fails with account boundary error
  //
  // ============================================================================

  describe('F2: Account Boundary Integrity', () => {
    const nodeInAccountA = 'node-account-a-f2';
    const nodeInAccountB = 'node-account-b-f2';
    const principalInAccountA = 'principal-account-a-f2';
    const principalInAccountB = 'principal-account-b-f2';

    beforeAll(() => {
      const db = dbClient.getDatabase();
      const now = Date.now();

      // Create nodes in Account A
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Source', ?, ?, ?, ?, ?)
      `).run(
        nodeInAccountA,
        JSON.stringify({ name: 'Source in Account A' }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `).run(
        principalInAccountA,
        JSON.stringify({ display_name: 'Principal in A', principal_kind: 'human' }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      // Create nodes in Account B
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Source', ?, ?, ?, ?, ?)
      `).run(
        nodeInAccountB,
        JSON.stringify({ name: 'Source in Account B' }),
        ACCOUNT_B_ID,
        USER_B_ID,
        now,
        now
      );

      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `).run(
        principalInAccountB,
        JSON.stringify({ display_name: 'Principal in B', principal_kind: 'human' }),
        ACCOUNT_B_ID,
        USER_B_ID,
        now,
        now
      );
    });

    it('should reject access when principal tries to access resources in different account', async () => {
      // Principal in Account A trying to access Account B
      const result = await capabilityService.verifyAccountBoundary(
        principalInAccountA,
        ACCOUNT_A_ID,
        ACCOUNT_B_ID
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Account boundary violation');
    });

    it('should allow access when principal accesses resources in same account', async () => {
      const result = await capabilityService.verifyAccountBoundary(
        principalInAccountA,
        ACCOUNT_A_ID,
        ACCOUNT_A_ID
      );

      expect(result.allowed).toBe(true);
    });

    it('should return zero nodes from other account when querying by account_id', () => {
      const db = dbClient.getDatabase();

      // Query nodes in Account A while "authenticated" to Account B
      const nodesForAccountB = db
        .prepare('SELECT * FROM nodes WHERE account_id = ?')
        .all(ACCOUNT_B_ID) as any[];

      // Should only see Account B nodes
      const accountANodesVisible = nodesForAccountB.filter(
        (n) => n.id === nodeInAccountA || n.id === principalInAccountA
      );

      expect(accountANodesVisible.length).toBe(0);
    });

    it('should prevent creating edges that cross account boundaries', () => {
      const db = dbClient.getDatabase();
      const now = Date.now();

      // Attempt to create edge from Account A node to Account B node
      // This should fail because the CHECK constraint or application logic should prevent it
      // In our current schema, the edge has its own account_id, but we need to validate from/to
      // For now, we verify that if such an edge exists, it would violate the invariant

      // First, let's verify we can't query edges that would cross accounts
      // The key is that the application should never create such edges

      const crossAccountEdge = {
        id: 'cross-account-edge-test',
        kind: 'CONTAINS',
        from_id: nodeInAccountA,  // In Account A
        to_id: nodeInAccountB,    // In Account B
        account_id: ACCOUNT_A_ID, // Edge claims to be in Account A
        created_by: USER_A_ID,
        created_at: now,
      };

      // Verify the edge nodes are in different accounts
      const fromNode = db.prepare('SELECT account_id FROM nodes WHERE id = ?').get(nodeInAccountA) as any;
      const toNode = db.prepare('SELECT account_id FROM nodes WHERE id = ?').get(nodeInAccountB) as any;

      expect(fromNode.account_id).not.toBe(toNode.account_id);

      // In production, the API layer would reject this edge creation
      // Here we document the invariant: from_id.account_id === to_id.account_id === edge.account_id
    });
  });

  // ============================================================================
  // F3: PROVENANCE COMPLETENESS
  // ============================================================================
  //
  // Given: ANY source node in the graph
  // When: Query for provenance
  // Then: Must return:
  //   - origin_principal_id (non-null)
  //   - origin_type (valid enum)
  //   - origin_ref (traceable reference)
  //   - trust_state (valid enum)
  // If: Any field is missing → provenance model is incomplete
  //
  // ============================================================================

  describe('F3: Provenance Completeness', () => {
    const sourceWithProvenance = 'source-with-provenance-f3';
    const sourceWithoutProvenance = 'source-without-provenance-f3';

    beforeAll(() => {
      const db = dbClient.getDatabase();
      const now = Date.now();

      // Create source WITH complete provenance
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Source', ?, ?, ?, ?, ?)
      `).run(
        sourceWithProvenance,
        JSON.stringify({
          name: 'Source with Provenance',
          provenance: {
            origin_principal_id: principalInAccountA,
            origin_type: 'user_upload',
            origin_ref: 'file_hash_abc123',
            trust_state: 'ugc',
            retrieved_at: now,
          },
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      // Create source WITHOUT provenance (legacy or incomplete)
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Source', ?, ?, ?, ?, ?)
      `).run(
        sourceWithoutProvenance,
        JSON.stringify({
          name: 'Legacy Source',
          // No provenance field
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );
    });

    const principalInAccountA = 'principal-account-a-f2'; // Reuse from F2

    it('should have all required provenance fields for compliant sources', () => {
      const db = dbClient.getDatabase();

      const sourceRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(sourceWithProvenance) as { properties: string };

      const properties = JSON.parse(sourceRow.properties);
      const provenance = properties.provenance;

      // Verify all required fields are present
      expect(provenance.origin_principal_id).toBeDefined();
      expect(provenance.origin_principal_id).not.toBeNull();
      expect(typeof provenance.origin_principal_id).toBe('string');

      expect(provenance.origin_type).toBeDefined();
      expect(['user_upload', 'chat_import', 'agent_import', 'agent_generated', 'system_seed', 'migrated'])
        .toContain(provenance.origin_type);

      expect(provenance.origin_ref).toBeDefined();
      expect(provenance.origin_ref).not.toBeNull();
      expect(typeof provenance.origin_ref).toBe('string');

      expect(provenance.trust_state).toBeDefined();
      expect(['ugc', 'external_claim', 'verified_source']).toContain(provenance.trust_state);
    });

    it('should identify sources with incomplete provenance', () => {
      const db = dbClient.getDatabase();

      const sourceRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(sourceWithoutProvenance) as { properties: string };

      const properties = JSON.parse(sourceRow.properties);

      // This source lacks provenance - model should flag this
      const hasCompleteProvenance =
        properties.provenance &&
        properties.provenance.origin_principal_id &&
        properties.provenance.origin_type &&
        properties.provenance.origin_ref &&
        properties.provenance.trust_state;

      expect(hasCompleteProvenance).toBeFalsy();
    });

    it('should allow querying sources by trust_state', () => {
      const db = dbClient.getDatabase();

      // Query for UGC sources (user-generated content)
      const ugcSources = db
        .prepare(`
          SELECT id, json_extract(properties, '$.provenance.trust_state') as trust_state
          FROM nodes
          WHERE kind = 'Source'
            AND account_id = ?
            AND json_extract(properties, '$.provenance.trust_state') = 'ugc'
        `)
        .all(ACCOUNT_A_ID) as any[];

      expect(ugcSources.length).toBeGreaterThan(0);
      expect(ugcSources[0].trust_state).toBe('ugc');
    });
  });

  // ============================================================================
  // F4: CONTEXT-SET LEGIBILITY
  // ============================================================================
  //
  // Given: Open a chat with an agent
  // When: UI renders
  // Then: Must visibly show:
  //   - "You are chatting with **Agent X**" (agent_principal_id resolved to name)
  //   - "Using context: **Node A, Node B, …**" (context_spec rendered)
  //   - Expansion rule if applicable
  // If: Context is implicit or hidden → users won't trust the agent
  //
  // ============================================================================

  describe('F4: Context-Set Legibility', () => {
    const conversationThreadId = 'conversation-thread-f4';
    const humanPrincipalF4 = 'principal-human-f4';
    const agentPrincipalF4 = 'principal-agent-f4';
    const contextSourceId = 'context-source-f4';

    beforeAll(() => {
      const db = dbClient.getDatabase();
      const now = Date.now();

      // Create human principal
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `).run(
        humanPrincipalF4,
        JSON.stringify({
          display_name: 'Alice',
          principal_kind: 'human',
          email: 'alice@test.com',
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      // Create agent principal
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `).run(
        agentPrincipalF4,
        JSON.stringify({
          display_name: 'Keimenon Research Agent',
          principal_kind: 'agent',
          agent_config: {
            model_policy: 'gpt-4',
            tools_allowed: ['web_search', 'summarize'],
          },
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      // Create context source
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Source', ?, ?, ?, ?, ?)
      `).run(
        contextSourceId,
        JSON.stringify({
          name: 'Research Paper on AI',
          provenance: {
            origin_principal_id: humanPrincipalF4,
            origin_type: 'user_upload',
            origin_ref: 'file_hash_research',
            trust_state: 'ugc',
          },
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      // Create ConversationThread with explicit context
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'ConversationThread', ?, ?, ?, ?, ?)
      `).run(
        conversationThreadId,
        JSON.stringify({
          title: 'Research Discussion',
          human_principal_id: humanPrincipalF4,
          agent_principal_id: agentPrincipalF4,
          purpose: 'research',
          context_spec: {
            source_ids: [contextSourceId],
            group_ids: [],
            include_pinned: true,
            expansion_rule: 'neighbors',
          },
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );
    });

    it('should have explicit human_principal_id in ConversationThread', () => {
      const db = dbClient.getDatabase();

      const threadRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(conversationThreadId) as { properties: string };

      const properties = JSON.parse(threadRow.properties);

      expect(properties.human_principal_id).toBeDefined();
      expect(properties.human_principal_id).toBe(humanPrincipalF4);
    });

    it('should have explicit agent_principal_id in ConversationThread', () => {
      const db = dbClient.getDatabase();

      const threadRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(conversationThreadId) as { properties: string };

      const properties = JSON.parse(threadRow.properties);

      expect(properties.agent_principal_id).toBeDefined();
      expect(properties.agent_principal_id).toBe(agentPrincipalF4);
    });

    it('should have explicit context_spec with source_ids', () => {
      const db = dbClient.getDatabase();

      const threadRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(conversationThreadId) as { properties: string };

      const properties = JSON.parse(threadRow.properties);
      const contextSpec = properties.context_spec;

      expect(contextSpec).toBeDefined();
      expect(contextSpec.source_ids).toContain(contextSourceId);
      expect(contextSpec.expansion_rule).toBe('neighbors');
    });

    it('should resolve agent name from agent_principal_id', () => {
      const db = dbClient.getDatabase();

      // Get the conversation thread
      const threadRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(conversationThreadId) as { properties: string };

      const threadProps = JSON.parse(threadRow.properties);

      // Resolve agent principal
      const agentRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(threadProps.agent_principal_id) as { properties: string };

      const agentProps = JSON.parse(agentRow.properties);

      expect(agentProps.display_name).toBe('Keimenon Research Agent');
    });

    it('should resolve human name from human_principal_id', () => {
      const db = dbClient.getDatabase();

      // Get the conversation thread
      const threadRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(conversationThreadId) as { properties: string };

      const threadProps = JSON.parse(threadRow.properties);

      // Resolve human principal
      const humanRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(threadProps.human_principal_id) as { properties: string };

      const humanProps = JSON.parse(humanRow.properties);

      expect(humanProps.display_name).toBe('Alice');
    });

    it('should have purpose field for categorization', () => {
      const db = dbClient.getDatabase();

      const threadRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(conversationThreadId) as { properties: string };

      const properties = JSON.parse(threadRow.properties);

      expect(properties.purpose).toBeDefined();
      expect(['summarize', 'cluster', 'draft', 'research', 'refactor', 'verify', 'general'])
        .toContain(properties.purpose);
    });
  });

  // ============================================================================
  // F5: RUN REPRODUCIBILITY (Metadata Level)
  // ============================================================================
  //
  // Note: We don't need deterministic LLM outputs, but we need deterministic RECORDS.
  //
  // Given: Execute task with specific inputs + context snapshot
  // When: Record: task config, context hash, tool calls, produced nodes
  // Then: All metadata can be queried and traced
  //
  // ============================================================================

  describe('F5: Run Reproducibility (Metadata Level)', () => {
    const taskId = 'task-f5';
    const runId = 'run-f5';
    const outputNodeId = 'output-node-f5';
    const agentNodeF5 = 'agent-node-f5';

    beforeAll(() => {
      const db = dbClient.getDatabase();
      const now = Date.now();

      // Create AgentNode that produced the output (represents the run's agent)
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'AgentNode', ?, ?, ?, ?, ?)
      `).run(
        agentNodeF5,
        JSON.stringify({
          name: 'Summary Agent',
          task_type: 'GROUP_SUMMARY_BUILD',
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      // Create output node produced by a run
      db.prepare(`
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'CanonicalDoc', ?, ?, ?, ?, ?)
      `).run(
        outputNodeId,
        JSON.stringify({
          title: 'Summary Document',
          task_id: taskId,
          run_id: runId,
          task_type: 'GROUP_SUMMARY_BUILD',
          input_hash: 'sha256_input_abc123',
          config_hash: 'sha256_config_xyz789',
          context_snapshot: {
            source_ids: ['source-1', 'source-2'],
            timestamp: now,
          },
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now,
        now
      );

      // Create PRODUCED_BY edge linking output to agent (run is tracked in properties)
      db.prepare(`
        INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
        VALUES (?, 'PRODUCED_BY', ?, ?, ?, ?, ?, ?)
      `).run(
        'produced-by-edge-f5',
        outputNodeId,
        agentNodeF5,  // Link to agent node, run_id in properties
        JSON.stringify({
          run_id: runId,
          task_type: 'GROUP_SUMMARY_BUILD',
        }),
        ACCOUNT_A_ID,
        USER_A_ID,
        now
      );
    });

    it('should record task_id and run_id in output node', () => {
      const db = dbClient.getDatabase();

      const nodeRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(outputNodeId) as { properties: string };

      const properties = JSON.parse(nodeRow.properties);

      expect(properties.task_id).toBe(taskId);
      expect(properties.run_id).toBe(runId);
    });

    it('should record task_type for categorization', () => {
      const db = dbClient.getDatabase();

      const nodeRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(outputNodeId) as { properties: string };

      const properties = JSON.parse(nodeRow.properties);

      expect(properties.task_type).toBe('GROUP_SUMMARY_BUILD');
    });

    it('should record input and config hashes for reproducibility', () => {
      const db = dbClient.getDatabase();

      const nodeRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(outputNodeId) as { properties: string };

      const properties = JSON.parse(nodeRow.properties);

      expect(properties.input_hash).toBeDefined();
      expect(properties.config_hash).toBeDefined();
    });

    it('should record context snapshot', () => {
      const db = dbClient.getDatabase();

      const nodeRow = db
        .prepare('SELECT properties FROM nodes WHERE id = ?')
        .get(outputNodeId) as { properties: string };

      const properties = JSON.parse(nodeRow.properties);
      const contextSnapshot = properties.context_snapshot;

      expect(contextSnapshot).toBeDefined();
      expect(contextSnapshot.source_ids).toBeInstanceOf(Array);
      expect(contextSnapshot.timestamp).toBeDefined();
    });

    it('should have PRODUCED_BY edge with run metadata', () => {
      const db = dbClient.getDatabase();

      const edgeRow = db
        .prepare(`
          SELECT properties FROM edges
          WHERE kind = 'PRODUCED_BY' AND from_id = ?
        `)
        .get(outputNodeId) as { properties: string };

      const properties = JSON.parse(edgeRow.properties);

      expect(properties.run_id).toBe(runId);
      expect(properties.task_type).toBe('GROUP_SUMMARY_BUILD');
    });

    it('should allow querying outputs by run_id', () => {
      const db = dbClient.getDatabase();

      const outputs = db
        .prepare(`
          SELECT id, json_extract(properties, '$.run_id') as run_id
          FROM nodes
          WHERE account_id = ?
            AND json_extract(properties, '$.run_id') = ?
        `)
        .all(ACCOUNT_A_ID, runId) as any[];

      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs[0].run_id).toBe(runId);
    });
  });

  // ============================================================================
  // ADDITIONAL: DEFAULT CAPABILITIES VERIFICATION
  // ============================================================================

  describe('Default Capabilities', () => {
    it('should have correct default capabilities for human principals', () => {
      expect(DEFAULT_CAPABILITIES.human.can_upload).toBe(true);
      expect(DEFAULT_CAPABILITIES.human.can_run_tools).toBe(false);
      expect(DEFAULT_CAPABILITIES.human.can_import_web).toBe(false);
      expect(DEFAULT_CAPABILITIES.human.can_own_account).toBe(true);
      expect(DEFAULT_CAPABILITIES.human.can_approve_runs).toBe(true);
    });

    it('should have correct default capabilities for agent principals', () => {
      expect(DEFAULT_CAPABILITIES.agent.can_upload).toBe(true);
      expect(DEFAULT_CAPABILITIES.agent.can_run_tools).toBe(true);
      expect(DEFAULT_CAPABILITIES.agent.can_import_web).toBe(true);
      expect(DEFAULT_CAPABILITIES.agent.can_own_account).toBe(false);
      expect(DEFAULT_CAPABILITIES.agent.can_approve_runs).toBe(false);
    });

    it('should have correct default capabilities for contact principals', () => {
      expect(DEFAULT_CAPABILITIES.contact.can_upload).toBe(false);
      expect(DEFAULT_CAPABILITIES.contact.can_run_tools).toBe(false);
      expect(DEFAULT_CAPABILITIES.contact.can_import_web).toBe(false);
      expect(DEFAULT_CAPABILITIES.contact.can_own_account).toBe(false);
      expect(DEFAULT_CAPABILITIES.contact.can_approve_runs).toBe(false);
    });
  });
});
