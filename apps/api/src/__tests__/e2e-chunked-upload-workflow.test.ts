import { afterAll, afterEach, beforeAll, beforeEach, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  cleanupTestData,
  countNodes,
  createImportJob,
  getJob,
  getTestFilePath,
  login,
  waitForJobCompletion,
  waitForChunkedImportCompletion,
} from './utils/test-helpers';
import { IMPORT_CONTRACT_VERSION } from '@keimenon/types';

const API_URL = process.env.TEST_API_URL || 'http://localhost:4001';
const getDbPath = () => process.env.DB_PATH || path.join(os.homedir(), '.keimenon', 'keimenon.db');

const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123';

describe('E2E Chunked Upload Workflow', () => {
  let db: Database.Database;
  let adminToken: string;
  let adminAccountId: string;

  beforeAll(async () => {
    db = new Database(getDbPath());
    const auth = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = auth.token;
    adminAccountId = auth.accountId;
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    cleanupTestData(db, adminAccountId);
  });

  afterEach(() => {
    cleanupTestData(db, adminAccountId);
  });

  test('chunked upload rail runs real import job to terminal success', async () => {
    const filePath = getTestFilePath('tiny.json');
    const fileBytes = await fs.readFile(filePath);

    const initiateResponse = await fetch(`${API_URL}/api/v1/uploads/initiate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'tiny.json',
        fileSize: fileBytes.length,
        mimeType: 'application/json',
        chunkSize: Math.max(fileBytes.length, 1024),
        importConfig: {
          processingMode: 'automatic',
          minMessageLength: 1,
          extraction: {
            includeUser: true,
            includeAssistant: true,
          },
        },
      }),
    });

    assert.ok(initiateResponse.ok, `initiate failed: ${initiateResponse.status}`);
    const initiateData = (await initiateResponse.json()) as any;
    const sessionId: string = initiateData?.session?.id;
    assert.ok(sessionId, 'sessionId should be returned from initiate');

    const chunkResponse = await fetch(`${API_URL}/api/v1/uploads/${sessionId}/chunks/0`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: fileBytes,
    });

    assert.ok(chunkResponse.ok, `chunk upload failed: ${chunkResponse.status}`);
    const chunkData = (await chunkResponse.json()) as any;
    assert.strictEqual(chunkData.success, true);
    assert.strictEqual(chunkData.isComplete, true);

    const { jobId, job } = await waitForChunkedImportCompletion(sessionId, adminToken, 90000);
    assert.ok(jobId, 'chunked upload should produce a real import job id');
    assert.strictEqual(job.state.status, 'succeeded');
    const persistedJob = await getJob(jobId, adminToken);
    assert.strictEqual(
      persistedJob.config?.metadata?.importContractVersion,
      IMPORT_CONTRACT_VERSION
    );
    assert.strictEqual(persistedJob.config?.metadata?.processingRail, 'chunked');
    assert.strictEqual(persistedJob.config?.importOptions?.processingMode, 'automatic');

    const nodesAfter = countNodes(db, adminAccountId);
    assert.ok(nodesAfter > 0, 'chunked rail should create graph nodes');
  }, 120000);

  test('chunked initiate rejects missing importConfig', async () => {
    const filePath = getTestFilePath('tiny.json');
    const fileBytes = await fs.readFile(filePath);

    const initiateResponse = await fetch(`${API_URL}/api/v1/uploads/initiate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'tiny.json',
        fileSize: fileBytes.length,
        mimeType: 'application/json',
        chunkSize: Math.max(fileBytes.length, 1024),
      }),
    });

    assert.strictEqual(initiateResponse.ok, false);
    assert.strictEqual(initiateResponse.status, 400);
  });

  test('multipart and chunked rails produce equivalent output invariants for deterministic fixture', async () => {
    const filePath = getTestFilePath('tiny.json');
    const sharedConfig = {
      processingMode: 'automatic',
      minMessageLength: 1,
      extraction: {
        includeUser: true,
        includeAssistant: true,
      },
    };

    const getInvariantSnapshot = () => {
      const nodeRows = db
        .prepare(
          `
          SELECT kind, COUNT(*) as count
          FROM nodes
          WHERE account_id = ?
            AND kind IN ('ConversationThread', 'Message', 'SourceSpan', 'Packet', 'AtomicUnit')
          GROUP BY kind
        `
        )
        .all(adminAccountId) as Array<{ kind: string; count: number }>;
      const edgeRows = db
        .prepare(
          `
          SELECT kind, COUNT(*) as count
          FROM edges
          WHERE account_id = ?
            AND kind IN ('HAS_SPAN', 'OCCURS_IN_SPAN', 'COMPOSED_OF_ATOMIC')
          GROUP BY kind
        `
        )
        .all(adminAccountId) as Array<{ kind: string; count: number }>;

      return {
        nodes: Object.fromEntries(nodeRows.map((row) => [row.kind, row.count])),
        edges: Object.fromEntries(edgeRows.map((row) => [row.kind, row.count])),
      };
    };

    cleanupTestData(db, adminAccountId);
    const multipart = await createImportJob(filePath, adminToken, sharedConfig);
    const multipartJob = await waitForJobCompletion(multipart.jobId, adminToken, 90000);
    assert.strictEqual(multipartJob.state.status, 'succeeded');
    const persistedMultipart = await getJob(multipart.jobId, adminToken);
    assert.strictEqual(
      persistedMultipart.config?.metadata?.importContractVersion,
      IMPORT_CONTRACT_VERSION
    );
    assert.strictEqual(persistedMultipart.config?.metadata?.processingRail, 'multipart');
    assert.strictEqual(persistedMultipart.config?.importOptions?.processingMode, 'automatic');
    const multipartSnapshot = getInvariantSnapshot();

    cleanupTestData(db, adminAccountId);
    const fileBytes = await fs.readFile(filePath);
    const initiateResponse = await fetch(`${API_URL}/api/v1/uploads/initiate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'tiny.json',
        fileSize: fileBytes.length,
        mimeType: 'application/json',
        chunkSize: Math.max(fileBytes.length, 1024),
        importConfig: sharedConfig,
      }),
    });
    assert.ok(initiateResponse.ok, `initiate failed: ${initiateResponse.status}`);
    const initiateData = (await initiateResponse.json()) as any;
    const sessionId: string = initiateData?.session?.id;
    assert.ok(sessionId);

    const chunkResponse = await fetch(`${API_URL}/api/v1/uploads/${sessionId}/chunks/0`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: fileBytes,
    });
    assert.ok(chunkResponse.ok, `chunk upload failed: ${chunkResponse.status}`);

    const { jobId: chunkedJobId, job: chunkedJob } = await waitForChunkedImportCompletion(
      sessionId,
      adminToken,
      90000
    );
    assert.strictEqual(chunkedJob.state.status, 'succeeded');
    const persistedChunked = await getJob(chunkedJobId, adminToken);
    assert.strictEqual(
      persistedChunked.config?.metadata?.importContractVersion,
      IMPORT_CONTRACT_VERSION
    );
    assert.strictEqual(persistedChunked.config?.metadata?.processingRail, 'chunked');
    assert.strictEqual(persistedChunked.config?.importOptions?.processingMode, 'automatic');
    const chunkedSnapshot = getInvariantSnapshot();

    assert.deepStrictEqual(chunkedSnapshot.nodes, multipartSnapshot.nodes);
    assert.deepStrictEqual(chunkedSnapshot.edges, multipartSnapshot.edges);
    assert.ok(countNodes(db, adminAccountId) > 0);
  }, 180000);

  test('multipart and chunked rails stay invariant-equivalent for multi-chunk fixture', async () => {
    const filePath = getTestFilePath('tiny.json');
    const sharedConfig = {
      processingMode: 'automatic',
      minMessageLength: 1,
      extraction: {
        includeUser: true,
        includeAssistant: true,
      },
    };

    const getInvariantSnapshot = () => {
      const nodeRows = db
        .prepare(
          `
              SELECT kind, COUNT(*) as count
              FROM nodes
              WHERE account_id = ?
                AND kind IN ('ConversationThread', 'Message', 'SourceSpan', 'Packet', 'AtomicUnit')
              GROUP BY kind
            `
        )
        .all(adminAccountId) as Array<{ kind: string; count: number }>;

      const edgeRows = db
        .prepare(
          `
              SELECT kind, COUNT(*) as count
              FROM edges
              WHERE account_id = ?
                AND kind IN ('HAS_SPAN', 'OCCURS_IN_SPAN', 'COMPOSED_OF_ATOMIC')
              GROUP BY kind
            `
        )
        .all(adminAccountId) as Array<{ kind: string; count: number }>;

      return {
        nodes: Object.fromEntries(nodeRows.map((row) => [row.kind, row.count])),
        edges: Object.fromEntries(edgeRows.map((row) => [row.kind, row.count])),
      };
    };

    // Multipart baseline
    cleanupTestData(db, adminAccountId);
    const multipart = await createImportJob(filePath, adminToken, sharedConfig);
    const multipartJob = await waitForJobCompletion(multipart.jobId, adminToken, 120000);
    assert.strictEqual(multipartJob.state.status, 'succeeded');
    const persistedMultipart = await getJob(multipart.jobId, adminToken);
    assert.strictEqual(
      persistedMultipart.config?.metadata?.importContractVersion,
      IMPORT_CONTRACT_VERSION
    );
    assert.strictEqual(persistedMultipart.config?.metadata?.processingRail, 'multipart');
    const multipartSnapshot = getInvariantSnapshot();

    // Chunked comparison path (force true multi-chunk upload)
    cleanupTestData(db, adminAccountId);
    const fileBytes = await fs.readFile(filePath);
    const chunkSize = Math.max(1024, Math.floor(fileBytes.length / 3));
    const totalChunks = Math.ceil(fileBytes.length / chunkSize);
    assert.ok(totalChunks >= 2, 'fixture should split into multiple chunks');

    const initiateResponse = await fetch(`${API_URL}/api/v1/uploads/initiate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'tiny.json',
        fileSize: fileBytes.length,
        mimeType: 'application/json',
        chunkSize,
        importConfig: sharedConfig,
      }),
    });

    assert.ok(initiateResponse.ok, `initiate failed: ${initiateResponse.status}`);
    const initiateData = (await initiateResponse.json()) as any;
    const sessionId: string = initiateData?.session?.id;
    assert.ok(sessionId);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, fileBytes.length);
      const chunk = fileBytes.subarray(start, end);

      const chunkResponse = await fetch(
        `${API_URL}/api/v1/uploads/${sessionId}/chunks/${chunkIndex}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/octet-stream',
          },
          body: chunk,
        }
      );

      assert.ok(chunkResponse.ok, `chunk ${chunkIndex} upload failed: ${chunkResponse.status}`);
    }

    const { jobId: chunkedJobId, job: chunkedJob } = await waitForChunkedImportCompletion(
      sessionId,
      adminToken,
      120000
    );
    assert.strictEqual(chunkedJob.state.status, 'succeeded');
    const persistedChunked = await getJob(chunkedJobId, adminToken);
    assert.strictEqual(
      persistedChunked.config?.metadata?.importContractVersion,
      IMPORT_CONTRACT_VERSION
    );
    assert.strictEqual(persistedChunked.config?.metadata?.processingRail, 'chunked');

    const chunkedSnapshot = getInvariantSnapshot();
    assert.deepStrictEqual(chunkedSnapshot.nodes, multipartSnapshot.nodes);
    assert.deepStrictEqual(chunkedSnapshot.edges, multipartSnapshot.edges);
  }, 240000);
});
