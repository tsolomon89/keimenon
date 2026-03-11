import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createJobsRoutes } from '../jobs.routes';
import { Job } from '../../domain/Job';
import { SQLiteJobRepository } from '../JobRepository';

describe('Jobs Routes - Duplicate Review API', () => {
  let app: express.Application;
  let db: Database.Database;
  let jobRepository: SQLiteJobRepository;

  const authService = {
    verifyToken: async (token: string) => {
      if (token !== 'valid-token') {
        return null;
      }
      return {
        userId: 'user_1',
        accountId: 'acc_1',
        email: 'user@example.com',
        permissionLevel: 'admin',
        accountType: 'admin',
        accountClass: 'professional',
        rank: 4,
        sessionId: 'session_1',
      };
    },
  } as any;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        account_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        config TEXT NOT NULL,
        status TEXT NOT NULL,
        state_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        idempotency_key TEXT,
        concurrency_group TEXT,
        data_tag TEXT DEFAULT 'real'
      );

      CREATE TABLE IF NOT EXISTS job_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        type TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        data TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        properties TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        properties TEXT,
        account_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_duplicate_candidates (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        primary_node_id TEXT NOT NULL,
        duplicate_node_id TEXT NOT NULL,
        similarity REAL NOT NULL,
        metrics_json TEXT NOT NULL,
        primary_json TEXT NOT NULL,
        duplicate_json TEXT NOT NULL,
        decision TEXT CHECK(decision IN ('keep-primary', 'keep-duplicate', 'keep-both', 'merge', 'sequester')),
        decision_meta TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(job_id, account_id, candidate_id),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
    `);

    db.prepare('INSERT INTO accounts (id) VALUES (?)').run('acc_1');

    jobRepository = new SQLiteJobRepository(db);

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).db = { db, getDatabase: () => db };
      next();
    });
    app.use('/api/v1/jobs', createJobsRoutes(authService, db));
  });

  afterEach(() => {
    db.close();
  });

  async function createImportJobWithReview(): Promise<Job> {
    const job = Job.create({
      type: 'import',
      accountId: 'acc_1',
      createdBy: 'user_1',
      config: {
        files: [{ fileName: 'fixture.json', fileSize: 128, mimeType: 'application/json' }],
        importOptions: {
          duplicateDetection: {
            enabled: true,
            requireReview: true,
          },
        },
      },
    });

    await jobRepository.save(job);
    return job;
  }

  function insertNode(nodeId: string, properties: Record<string, unknown> = {}): void {
    db.prepare(
      `
      INSERT INTO nodes (id, account_id, properties, updated_at)
      VALUES (?, ?, ?, ?)
    `
    ).run(nodeId, 'acc_1', JSON.stringify(properties), 1700000000000);
  }

  function insertCandidate(params: {
    id: string;
    jobId: string;
    groupId: string;
    candidateId: string;
    primaryNodeId: string;
    duplicateNodeId: string;
  }): void {
    db.prepare(
      `
      INSERT INTO job_duplicate_candidates (
        id, job_id, account_id, group_id, candidate_id,
        primary_node_id, duplicate_node_id, similarity,
        metrics_json, primary_json, duplicate_json,
        decision, decision_meta, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      params.id,
      params.jobId,
      'acc_1',
      params.groupId,
      params.candidateId,
      params.primaryNodeId,
      params.duplicateNodeId,
      0.92,
      JSON.stringify({ token_overlap: 10 }),
      JSON.stringify({ id: params.primaryNodeId, content: 'primary' }),
      JSON.stringify({ id: params.duplicateNodeId, content: 'duplicate' }),
      null,
      null,
      1700000000000,
      1700000000000
    );
  }

  it('tracks duplicate-review stage transitions pending -> in_progress -> completed', async () => {
    const job = await createImportJobWithReview();
    insertNode('node_primary_a');
    insertNode('node_duplicate_a');
    insertNode('node_primary_b');
    insertNode('node_duplicate_b');
    insertCandidate({
      id: 'row_a',
      jobId: job.id,
      groupId: 'group_one',
      candidateId: 'cand_a',
      primaryNodeId: 'node_primary_a',
      duplicateNodeId: 'node_duplicate_a',
    });
    insertCandidate({
      id: 'row_b',
      jobId: job.id,
      groupId: 'group_two',
      candidateId: 'cand_b',
      primaryNodeId: 'node_primary_b',
      duplicateNodeId: 'node_duplicate_b',
    });

    const pendingStatus = await request(app)
      .get(`/api/v1/jobs/${job.id}/duplicate-review/status`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(pendingStatus.body.status.stage).toBe('pending');
    expect(pendingStatus.body.status.total_candidates).toBe(2);
    expect(pendingStatus.body.status.pending_candidates).toBe(2);
    expect(pendingStatus.body.status.review_required).toBe(true);

    await request(app)
      .post(`/api/v1/jobs/${job.id}/duplicate-review/apply`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        decisions: [{ duplicateId: 'cand_a', action: 'keep-both', timestamp: 1700000001000 }],
      })
      .expect(200);

    const inProgressStatus = await request(app)
      .get(`/api/v1/jobs/${job.id}/duplicate-review/status`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(inProgressStatus.body.status.stage).toBe('in_progress');
    expect(inProgressStatus.body.status.pending_candidates).toBe(1);
    expect(inProgressStatus.body.status.decided_candidates).toBe(1);
    expect(inProgressStatus.body.status.review_required).toBe(true);

    await request(app)
      .post(`/api/v1/jobs/${job.id}/duplicate-review/apply`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        decisions: [{ duplicateId: 'cand_b', action: 'keep-both', timestamp: 1700000002000 }],
      })
      .expect(200);

    const completedStatus = await request(app)
      .get(`/api/v1/jobs/${job.id}/duplicate-review/status`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(completedStatus.body.status.stage).toBe('completed');
    expect(completedStatus.body.status.pending_candidates).toBe(0);
    expect(completedStatus.body.status.decided_candidates).toBe(2);
    expect(completedStatus.body.status.completed).toBe(true);
    expect(completedStatus.body.status.review_required).toBe(false);
  });

  it('applies sequester decisions non-destructively and preserves raw nodes', async () => {
    const job = await createImportJobWithReview();
    insertNode('node_primary', { label: 'primary raw node' });
    insertNode('node_duplicate', { label: 'duplicate raw node' });
    insertCandidate({
      id: 'row_sequester',
      jobId: job.id,
      groupId: 'group_sequester',
      candidateId: 'cand_sequester',
      primaryNodeId: 'node_primary',
      duplicateNodeId: 'node_duplicate',
    });

    const applyResponse = await request(app)
      .post(`/api/v1/jobs/${job.id}/duplicate-review/apply`)
      .set('Authorization', 'Bearer valid-token')
      .send({
        decisions: [
          {
            duplicateId: 'cand_sequester',
            action: 'sequester',
            timestamp: 1700000003000,
          },
        ],
      })
      .expect(200);

    expect(applyResponse.body.success).toBe(true);
    expect(applyResponse.body.result.applied_decisions).toBe(1);
    expect(applyResponse.body.result.nodes_sequestered).toBe(1);
    expect(applyResponse.body.result.edges_created).toBe(0);
    expect(applyResponse.body.result.pending_candidates).toBe(0);

    const nodes = db
      .prepare('SELECT id, properties FROM nodes WHERE account_id = ? ORDER BY id ASC')
      .all('acc_1') as Array<{ id: string; properties: string }>;
    expect(nodes).toHaveLength(2);

    const duplicateNode = nodes.find((node) => node.id === 'node_duplicate');
    expect(duplicateNode).toBeDefined();
    const duplicateProperties = JSON.parse(duplicateNode!.properties || '{}');
    expect(duplicateProperties.model_scope_excluded).toBe(true);
    expect(duplicateProperties.duplicate_review_status).toBe('sequester');
    expect(Array.isArray(duplicateProperties.model_scope_exclusions)).toBe(true);
    expect(duplicateProperties.model_scope_exclusions[0].relatedNodeId).toBe('node_primary');

    const persistedDecision = db
      .prepare(
        `
        SELECT decision FROM job_duplicate_candidates
        WHERE job_id = ? AND account_id = ? AND candidate_id = ?
      `
      )
      .get(job.id, 'acc_1', 'cand_sequester') as { decision: string } | undefined;
    expect(persistedDecision?.decision).toBe('sequester');

    const duplicateReviewEdges = db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM edges
        WHERE account_id = ?
          AND kind IN ('DUP_OF', 'EQUIVALENT_TO')
      `
      )
      .get('acc_1') as { count: number };
    expect(duplicateReviewEdges.count).toBe(0);

    const statusResponse = await request(app)
      .get(`/api/v1/jobs/${job.id}/duplicate-review/status`)
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    expect(statusResponse.body.status.stage).toBe('completed');
    expect(statusResponse.body.status.completed).toBe(true);
  });
});
