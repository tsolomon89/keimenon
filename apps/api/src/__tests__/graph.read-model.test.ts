import Database from 'better-sqlite3';
import fetch from 'node-fetch';
import { register } from './utils/test-helpers';

const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';

describe('Graph Read Model (Two-Stage Hydration)', () => {
  let db: Database.Database;
  let accountId: string;
  let token: string;
  let otherAccountId: string;
  let otherToken: string;

  beforeAll(async () => {
    if (!process.env.DB_PATH) {
      throw new Error('DB_PATH env var not set by test runner');
    }
    db = new Database(process.env.DB_PATH);

    const u1 = await register(`readmodel1_${Date.now()}@test.com`, 'password123', 'U1');
    accountId = u1.accountId;
    token = u1.token;

    const u2 = await register(`readmodel2_${Date.now()}@test.com`, 'password123', 'U2');
    otherAccountId = u2.accountId;
    otherToken = u2.token;

    const stmtNode = db.prepare(
      'INSERT INTO nodes (id, kind, account_id, created_by, created_at, updated_at, properties) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const stmtPhrase = db.prepare(
      'INSERT INTO phrases (id, text, normalized_text, account_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const now = Date.now();

    // Create structural anchors for Account 1
    stmtNode.run('rm_anchor1', 'AccountNode', accountId, u1.userId, now, now, '{}');
    stmtNode.run('rm_anchor2', 'Principal', accountId, u1.userId, now, now, '{}');
    stmtNode.run('rm_anchor3', 'Source', accountId, u1.userId, now, now, '{}');

    // Create Phrases for Account 1
    for (let i = 0; i < 10; i++) {
      const id = `rm_phrase_${i}`;
      stmtNode.run(id, 'Phrase', accountId, u1.userId, now, now, '{}');
      stmtPhrase.run(id, `text ${i}`, `norm ${i}`, accountId, u1.userId, now, now);
    }

    // Create 1 Edge
    const stmtEdge = db.prepare(
      'INSERT INTO edges (id, kind, from_id, to_id, account_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmtEdge.run('rm_edge1', 'SIMILAR_TO', 'rm_phrase_1', 'rm_phrase_2', accountId, u1.userId, now);

    // Create seeds for Account 2
    stmtNode.run('rm_other_seed', 'Phrase', otherAccountId, u2.userId, now, now, '{}');
  });

  afterAll(() => {
    if (db) db.close();
  });

  it('hydrates payload properties and preserves structural anchors under tight budget', async () => {
    // node_budget=8 (less than total 15+ nodes).
    // Anchors (5) should be preserved. Remaining 3 will be regular nodes.
    const res = await fetch(`${API_URL}/api/v1/graph/read-model?node_budget=8`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.metadata.readModel).toBeDefined();
    expect(data.metadata.readModel.requestedNodeBudget).toBe(8);
    expect(data.metadata.readModel.effectiveNodeBudget).toBe(8);
    expect(data.metadata.readModel.returnedNodes).toBe(8);
    expect(data.nodes.length).toBe(8);
    expect(data.metadata.readModel.structuralAnchorsPreserved).toBe(true);

    const kinds = data.nodes.map((n: any) => n.kind);
    expect(kinds).toContain('AccountNode');
    expect(kinds).toContain('Principal');
    expect(kinds).toContain('Source');

    // Hydration check: Should have phrase_text property mapped to .text
    const phrases = data.nodes.filter((n: any) => n.kind === 'Phrase');
    if (phrases.length === 0) {
      console.log('Returned node kinds:', kinds);
      console.log('Returned nodes:', data.nodes);
    }
    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases[0].properties.text).toMatch(/^text \d+$/);
  });

  it('overrides node budget if structural anchors exceed it', async () => {
    // node_budget=2, but there are 5 anchors total (2 from register, 3 manually added)
    const res = await fetch(`${API_URL}/api/v1/graph/read-model?node_budget=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.metadata.readModel.requestedNodeBudget).toBe(2);
    // Overrides up to 5 because of structural anchors
    expect(data.metadata.readModel.effectiveNodeBudget).toBe(5);
    expect(data.nodes.length).toBe(5);
    expect(data.metadata.truncated).toBe(true);
    expect(data.metadata.readModel.truncated).toBe(true);
  });

  it('isolates seeds to the operating account', async () => {
    const res = await fetch(
      `${API_URL}/api/v1/graph/read-model?seed_node_ids=rm_phrase_1,rm_other_seed`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    const nodeIds = data.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain('rm_phrase_1');
    expect(nodeIds).not.toContain('rm_other_seed');
  });
});
