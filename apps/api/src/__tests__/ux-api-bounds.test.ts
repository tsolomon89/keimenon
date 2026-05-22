import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fetch from 'node-fetch';
import { register } from './utils/test-helpers';

const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';

describe('Phase 5: UX/API Bounds & Conversation Context Validation', () => {
  let db: Database.Database;
  let accountId: string;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    if (!process.env.DB_PATH) {
      throw new Error('DB_PATH env var not set by test runner');
    }
    db = new Database(process.env.DB_PATH);

    const u = await register(`uxbounds_${Date.now()}@test.com`, 'password123', 'UX Bounds User');
    accountId = u.accountId;
    token = u.token;
    userId = u.userId;

    const stmtNode = db.prepare(
      'INSERT INTO nodes (id, kind, account_id, created_by, created_at, updated_at, properties) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const now = Date.now();

    // Insert structural anchors for Account
    stmtNode.run('ux_anchor_acc', 'AccountNode', accountId, userId, now, now, '{}');
    stmtNode.run(
      'ux_anchor_pr',
      'Principal',
      accountId,
      userId,
      now,
      now,
      '{"principal_kind":"human"}'
    );
    stmtNode.run('ux_anchor_src', 'Source', accountId, userId, now, now, '{}');
    stmtNode.run('ux_anchor_grp', 'Group', accountId, userId, now, now, '{}');

    // Create 15 regular Phrase nodes to test limits
    for (let i = 0; i < 15; i++) {
      const id = `ux_phrase_${i}`;
      stmtNode.run(id, 'Phrase', accountId, userId, now, now, '{}');
    }

    // Create some edges
    const stmtEdge = db.prepare(
      'INSERT INTO edges (id, kind, from_id, to_id, account_id, created_by, created_at, properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < 10; i++) {
      stmtEdge.run(
        `ux_edge_${i}`,
        'SIMILAR_TO',
        'ux_phrase_0',
        `ux_phrase_${i + 1}`,
        accountId,
        userId,
        now,
        '{}'
      );
    }
  });

  afterAll(() => {
    if (db) db.close();
  });

  describe('Graph Route Pagination & Clamp Bounds', () => {
    it('paginates and clamps bounds successfully on /snapshot', async () => {
      const limit = 5;
      const page = 1;
      const res = await fetch(`${API_URL}/api/v1/graph/snapshot?limit=${limit}&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.metadata).toBeDefined();
      expect(data.metadata.page).toBe(page);
      expect(data.metadata.limit).toBe(limit);
      expect(data.metadata.offset).toBe(0);

      // Since we paginated at the database query level, nodes count should be limited by our query limit parameter
      expect(data.nodes.length).toBeLessThanOrEqual(limit);
      expect(data.edges.length).toBeLessThanOrEqual(limit);
    });

    it('handles second page with offset offset correctly on /snapshot', async () => {
      const limit = 5;
      const page = 2;
      const res = await fetch(`${API_URL}/api/v1/graph/snapshot?limit=${limit}&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.metadata.page).toBe(page);
      expect(data.metadata.limit).toBe(limit);
      expect(data.metadata.offset).toBe(5);
    });

    it('paginates and clamps budgets on /read-model', async () => {
      const limit = 5;
      const page = 1;
      const res = await fetch(`${API_URL}/api/v1/graph/read-model?limit=${limit}&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.metadata.pagination).toBeDefined();
      expect(data.metadata.pagination.page).toBe(page);
      expect(data.metadata.pagination.limit).toBe(limit);

      // Node and edge counts returned should respect the limit bounds
      expect(data.nodes.length).toBeLessThanOrEqual(limit);
      expect(data.edges.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('Canvas Context Validation and Filtering', () => {
    it('successfully creates conversation after filtering non-Source/Group kinds with warnings', async () => {
      // Create a conversation with a mix of valid node kinds ('ux_anchor_src', 'ux_anchor_grp')
      // and invalid node kinds ('ux_phrase_1', 'nonexistent_id')
      const payload = {
        title: 'Canvas Filtering Test Conversation',
        purpose: 'general',
        context_spec: {
          source_ids: ['ux_anchor_src', 'ux_phrase_1', 'nonexistent_src_id'],
          group_ids: ['ux_anchor_grp', 'ux_phrase_2', 'nonexistent_grp_id'],
          include_pinned: true,
          expansion_rule: 'none',
        },
      };

      const res = await fetch(`${API_URL}/api/v1/conversations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.conversation).toBeDefined();

      // Check filtered context_spec
      // Invalid kinds (Phrase 'ux_phrase_1', nonexistent IDs) must be filtered out
      const contextSpec = data.conversation.context_spec;
      expect(contextSpec.source_ids).toContain('ux_anchor_src');
      expect(contextSpec.source_ids).not.toContain('ux_phrase_1');
      expect(contextSpec.source_ids).not.toContain('nonexistent_src_id');

      expect(contextSpec.group_ids).toContain('ux_anchor_grp');
      expect(contextSpec.group_ids).not.toContain('ux_phrase_2');
      expect(contextSpec.group_ids).not.toContain('nonexistent_grp_id');

      // Check context indicators reflect the filtered values
      expect(data.conversation.context_indicators.source_count).toBe(1);
      expect(data.conversation.context_indicators.group_count).toBe(1);
    });
  });
});
