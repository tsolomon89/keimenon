import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createConversationsRoutes } from '../conversations.routes';
import { buildDeterministicPrincipalId } from '../../services/graph-hierarchy.service';

let activeDb: Database.Database;

vi.mock('../../utils/get-db-client', () => ({
  getDbClient: vi.fn(async () => ({
    getDatabase: () => activeDb,
  })),
}));

vi.mock('../../middleware/auth.middleware', () => ({
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
}));

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      account_type TEXT NOT NULL,
      account_class TEXT NOT NULL,
      email TEXT,
      name TEXT NOT NULL,
      owner_user_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT
    );

    CREATE TABLE user_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      permission_level TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      properties TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE edges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      properties TEXT,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE source_spans (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      start_char INTEGER NOT NULL,
      end_char INTEGER NOT NULL,
      boundary_kind TEXT NOT NULL,
      node_id TEXT,
      account_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const now = Date.now();
  db.prepare(
    `
      INSERT INTO accounts (id, account_type, account_class, email, name, owner_user_id, created_at, updated_at)
      VALUES (?, 'client', 'professional', 'owner@example.com', 'Acme Account', ?, ?, ?)
    `
  ).run('acc_1', 'user_1', now, now);
  db.prepare(`INSERT INTO users (id, email, name) VALUES (?, ?, ?)`).run(
    'user_1',
    'owner@example.com',
    'Owner One'
  );
  db.prepare(
    `
      INSERT INTO user_accounts (id, user_id, account_id, permission_level, status)
      VALUES (?, ?, ?, 'admin', 'active')
    `
  ).run('ua_1', 'user_1', 'acc_1');

  return db;
}

function createApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = {
      userId: req.header('x-test-user-id') || 'user_1',
      accountId: req.header('x-test-account-id') || 'acc_1',
      accountClass: req.header('x-test-account-class') || 'professional',
    };
    next();
  });
  app.use('/api/v1/conversations', createConversationsRoutes({} as any, {} as any));
  return app;
}

describe('Conversations Routes principal/context contract', () => {
  let app: express.Application;

  beforeEach(() => {
    activeDb = createTestDb();
    app = createApp();
  });

  afterEach(() => {
    activeDb.close();
    vi.clearAllMocks();
  });

  it('defaults human_principal_id to deterministic account-scoped principal and materializes hierarchy links', async () => {
    const response = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', 'Bearer test-token')
      .send({
        title: 'Planning Thread',
      })
      .expect(201);

    const expectedPrincipalId = buildDeterministicPrincipalId('acc_1', 'user_1');
    expect(response.body.conversation.human_principal_id).toBe(expectedPrincipalId);

    const principalRow = activeDb
      .prepare(`SELECT id FROM nodes WHERE id = ? AND kind = 'Principal'`)
      .get(expectedPrincipalId) as { id?: string } | undefined;
    expect(principalRow?.id).toBe(expectedPrincipalId);

    const accountContainsEdge = activeDb
      .prepare(
        `
          SELECT id FROM edges
          WHERE kind = 'CONTAINS' AND from_id = ? AND to_id = ?
        `
      )
      .get('account_node_acc_1', expectedPrincipalId) as { id?: string } | undefined;
    expect(accountContainsEdge?.id).toBeTruthy();
  });

  it('rejects agent principal usage when runtime entitlement is absent', async () => {
    const now = Date.now();
    activeDb
      .prepare(
        `
          INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
          VALUES (?, 'Principal', ?, 'acc_1', 'user_1', ?, ?)
        `
      )
      .run(
        'principal_agent_1',
        JSON.stringify({
          display_name: 'ChatGPT',
          principal_kind: 'agent',
          capabilities: {
            can_upload: true,
            can_run_tools: true,
            can_import_web: true,
            can_own_account: false,
            can_approve_runs: false,
          },
        }),
        now,
        now
      );

    const response = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', 'Bearer test-token')
      .set('x-test-account-class', 'free')
      .send({
        title: 'Free tier thread',
        agent_principal_id: 'principal_agent_1',
      })
      .expect(403);

    expect(response.body.requiredFeature).toBe('agent_runtime');
  });

  it('rejects context ids that are completely missing', async () => {
    const response = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', 'Bearer test-token')
      .send({
        title: 'Scoped thread',
        context_spec: {
          source_ids: ['missing_source'],
          group_ids: [],
          include_pinned: true,
          expansion_rule: 'none',
        },
      })
      .expect(400);

    expect(response.body.error).toContain('Invalid source_ids references');
  });

  it('rejects context ids of unsupported node kinds (e.g. Phrase)', async () => {
    const now = Date.now();
    activeDb
      .prepare(
        `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, '{}', 'acc_1', 'user_1', ?, ?)`
      )
      .run('phrase_1', 'Phrase', now, now);

    const response = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', 'Bearer test-token')
      .send({
        title: 'Scoped thread',
        context_spec: {
          source_ids: ['phrase_1'],
          group_ids: [],
          include_pinned: false,
          expansion_rule: 'none',
        },
      })
      .expect(400);

    expect(response.body.error).toContain(
      'Invalid source_ids references for account scope: phrase_1'
    );
  });

  it('persists valid context_spec in the database and returns it in response', async () => {
    const now = Date.now();
    activeDb
      .prepare(
        `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, '{}', 'acc_1', 'user_1', ?, ?)`
      )
      .run('source_1', 'Source', now, now);

    activeDb
      .prepare(
        `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, '{}', 'acc_1', 'user_1', ?, ?)`
      )
      .run('group_1', 'Group', now, now);

    const payload = {
      title: 'Valid scope thread',
      context_spec: {
        source_ids: ['source_1'],
        group_ids: ['group_1'],
        include_pinned: false,
        expansion_rule: 'none',
      },
    };

    const response = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', 'Bearer test-token')
      .send(payload)
      .expect(201);

    const resContext = response.body.conversation.context_spec;
    expect(resContext).toBeDefined();
    expect(resContext.source_ids).toEqual(['source_1']);
    expect(resContext.group_ids).toEqual(['group_1']);

    // Assert persistence in the database
    const conversationId = response.body.conversation.id;
    const row = activeDb
      .prepare(`SELECT properties FROM nodes WHERE id = ? AND kind = 'ConversationThread'`)
      .get(conversationId) as { properties: string };

    expect(row).toBeDefined();
    const dbProps = JSON.parse(row.properties);
    expect(dbProps.context_spec).toEqual(payload.context_spec);
  });

  describe('GET /api/v1/conversations/:id/context-pack', () => {
    it('returns 404 for missing conversation', async () => {
      const response = await request(app)
        .get('/api/v1/conversations/missing_conv/context-pack')
        .set('Authorization', 'Bearer test-token')
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });

    it('returns a scoped context pack based on context_spec', async () => {
      const now = Date.now();

      // Seed source
      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, 'acc_1', 'user_1', ?, ?)`
        )
        .run('source_pack_1', 'Source', JSON.stringify({ name: 'Test Source' }), now, now);

      // Seed group
      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, 'acc_1', 'user_1', ?, ?)`
        )
        .run('group_pack_1', 'Group', JSON.stringify({ name: 'Test Group' }), now, now);

      // Seed another source in the group
      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, 'acc_1', 'user_1', ?, ?)`
        )
        .run('source_pack_2', 'Source', JSON.stringify({ name: 'Group Source' }), now, now);

      // Seed an unsupported Phrase in the group
      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, 'acc_1', 'user_1', ?, ?)`
        )
        .run('phrase_pack_1', 'Phrase', JSON.stringify({ name: 'Unsupported Phrase' }), now, now);

      // Seed edge connecting source 2 to group 1
      activeDb
        .prepare(
          `INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at) VALUES (?, ?, ?, ?, '{}', 'acc_1', 'user_1', ?)`
        )
        .run('edge_pack_1', 'IN_GROUP', 'source_pack_2', 'group_pack_1', now);

      // Seed edge connecting phrase 1 to group 1
      activeDb
        .prepare(
          `INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at) VALUES (?, ?, ?, ?, '{}', 'acc_1', 'user_1', ?)`
        )
        .run('edge_pack_2', 'IN_GROUP', 'phrase_pack_1', 'group_pack_1', now);

      // Seed edge connecting a missing node to group 1
      activeDb
        .prepare(
          `INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at) VALUES (?, ?, ?, ?, '{}', 'acc_1', 'user_1', ?)`
        )
        .run('edge_pack_3', 'IN_GROUP', 'missing_pack_1', 'group_pack_1', now);

      // Seed source_spans for the sources
      activeDb
        .prepare(
          `INSERT INTO source_spans (id, source_id, message_id, conversation_id, text, normalized_text, start_char, end_char, boundary_kind, account_id, created_by, created_at, updated_at) VALUES (?, ?, 'msg_1', 'conv_1', ?, ?, 0, 10, 'sentence', 'acc_1', 'user_1', ?, ?)`
        )
        .run('span_1', 'source_pack_1', 'Hello world', 'hello world', now, now);

      activeDb
        .prepare(
          `INSERT INTO source_spans (id, source_id, message_id, conversation_id, text, normalized_text, start_char, end_char, boundary_kind, account_id, created_by, created_at, updated_at) VALUES (?, ?, 'msg_2', 'conv_2', ?, ?, 0, 15, 'sentence', 'acc_1', 'user_1', ?, ?)`
        )
        .run('span_2', 'source_pack_2', 'Group message', 'group message', now, now);

      // Seed conversation thread
      const payload = {
        title: 'Context pack thread',
        human_principal_id: 'user_1',
        purpose: 'general',
        context_spec: {
          source_ids: ['source_pack_1'],
          group_ids: ['group_pack_1'],
          include_pinned: false,
          expansion_rule: 'none',
        },
      };

      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, 'ConversationThread', ?, 'acc_1', 'user_1', ?, ?)`
        )
        .run('conv_pack_1', JSON.stringify(payload), now, now);

      const response = await request(app)
        .get('/api/v1/conversations/conv_pack_1/context-pack')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const pack = response.body.context_pack;
      expect(pack).toBeDefined();
      expect(pack.conversation_id).toBe('conv_pack_1');

      // Both source 1 (explicit) and source 2 (via group) should be resolved
      expect(pack.source_ids).toContain('source_pack_1');
      expect(pack.source_ids).toContain('source_pack_2');
      expect(pack.group_ids).toContain('group_pack_1');

      // Unsupported Phrase and missing nodes should NOT be in source_ids
      expect(pack.source_ids).not.toContain('phrase_pack_1');
      expect(pack.source_ids).not.toContain('missing_pack_1');

      // Truncation metadata should be populated
      expect(pack.truncation).toBeDefined();
      expect(pack.truncation.evidence_truncated).toBe(false);
      expect(pack.truncation.sources_truncated).toBe(false);
      expect(pack.truncation.groups_truncated).toBe(false);

      // Evidence should include Group metadata, Source metadata, and SourceSpan texts
      const kinds = pack.evidence.map((e: any) => e.kind);
      expect(kinds).toContain('Group');
      expect(kinds).toContain('Source');
      expect(kinds).toContain('SourceSpan');

      const spanEvidence = pack.evidence.filter((e: any) => e.kind === 'SourceSpan');
      expect(spanEvidence.length).toBe(2);
      expect(spanEvidence.map((s: any) => s.text)).toContain('Hello world');
      expect(spanEvidence.map((s: any) => s.text)).toContain('Group message');
    });
  });

  describe('Message Runtime', () => {
    beforeEach(() => {
      const now = Date.now();
      const convPayload = {
        title: 'Message Runtime Test',
        human_principal_id: 'prin_msg_user',
        agent_principal_id: 'prin_msg_agent',
        purpose: 'general',
      };

      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, 'Principal', '{}', 'acc_1', 'user_1', ?, ?)`
        )
        .run('prin_msg_user', now, now);

      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, 'Principal', '{}', 'acc_1', 'user_1', ?, ?)`
        )
        .run('prin_msg_agent', now, now);

      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, 'ConversationThread', ?, 'acc_1', 'user_1', ?, ?)`
        )
        .run('conv_msg_1', JSON.stringify(convPayload), now, now);
    });

    it('should persist user message and return mocked assistant synthesis', async () => {
      const response = await request(app)
        .post('/api/v1/conversations/conv_msg_1/messages')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Hello agent!', run_synthesis: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.userMessage).toBeDefined();
      expect(response.body.userMessage.content).toBe('Hello agent!');
      expect(response.body.assistantMessage).toBeDefined();
      expect(response.body.assistantMessage.content).toContain('Mocked Assistant Response');

      const edges = activeDb
        .prepare(
          `SELECT kind, to_id FROM edges WHERE from_id = 'conv_msg_1' AND kind = 'HAS_MESSAGE'`
        )
        .all() as any[];
      expect(edges.length).toBe(2);

      const userMsgId = response.body.userMessage.id;
      const asstMsgId = response.body.assistantMessage.id;

      const userAuthoredEdge = activeDb
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'AUTHORED_BY'`)
        .get(userMsgId, 'prin_msg_user');
      expect(userAuthoredEdge).toBeDefined();

      const asstAuthoredEdge = activeDb
        .prepare(`SELECT * FROM edges WHERE from_id = ? AND to_id = ? AND kind = 'AUTHORED_BY'`)
        .get(asstMsgId, 'prin_msg_agent');
      expect(asstAuthoredEdge).toBeDefined();
    });

    it('should retrieve ordered message history', async () => {
      // Post a message first
      await request(app)
        .post('/api/v1/conversations/conv_msg_1/messages')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Hello', run_synthesis: true })
        .expect(200);

      const response = await request(app)
        .get('/api/v1/conversations/conv_msg_1/messages')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messages.length).toBe(2);
      expect(response.body.messages[0].role).toBe('user');
      expect(response.body.messages[1].role).toBe('assistant');
    });

    it('should persist user message but return synthesis_error if adapter fails', async () => {
      const { mockSynthesisAdapter } =
        await import('../../services/conversation-synthesis-adapter');
      const originalSynthesize = mockSynthesisAdapter.synthesize;
      mockSynthesisAdapter.synthesize = vi
        .fn()
        .mockRejectedValue(new Error('Simulated adapter failure'));

      const response = await request(app)
        .post('/api/v1/conversations/conv_msg_1/messages')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Break the adapter!', run_synthesis: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.userMessage).toBeDefined();
      expect(response.body.assistantMessage).toBeUndefined();
      expect(response.body.synthesisError).toBe('Simulated adapter failure');

      mockSynthesisAdapter.synthesize = originalSynthesize;

      const messagesResponse = await request(app)
        .get('/api/v1/conversations/conv_msg_1/messages')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(messagesResponse.body.messages.length).toBe(1); // Only the user message
    });

    it('should reject access to cross-account conversation', async () => {
      const now = Date.now();
      activeDb
        .prepare(
          `INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at) VALUES (?, 'ConversationThread', '{}', 'other_acc', 'other_user', ?, ?)`
        )
        .run('conv_other_acc', now, now);

      await request(app)
        .get('/api/v1/conversations/conv_other_acc/messages')
        .set('Authorization', 'Bearer test-token')
        .expect(500);

      await request(app)
        .post('/api/v1/conversations/conv_other_acc/messages')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Hello' })
        .expect(500);
    });
  });
});
