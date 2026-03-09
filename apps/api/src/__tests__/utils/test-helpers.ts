/**
 * Test Helper Utilities
 *
 * Common test utilities for E2E and integration tests including:
 * - Authentication helpers
 * - Job creation helpers
 * - SSE connection helpers
 * - Wait utilities
 * - Database helpers
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { EventSource } from 'eventsource';

// Dynamic API URL getter
const getApiUrl = () => process.env.TEST_API_URL || 'http://localhost:4001';

/**
 * Register a new user or login if exists
 */
export async function register(
  email: string,
  password: string,
  name: string
): Promise<{ token: string; accountId: string; userId: string }> {
  try {
    const response = await fetch(`${getApiUrl()}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const text = await response.text();
      if (text.includes('already exists')) {
        return login(email, password);
      }
      // If registration disabled (e.g. production), try login
      if (response.status === 403 || response.status === 404) {
        return login(email, password);
      }
      throw new Error(`Registration failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as any;
    return {
      token: data.token,
      accountId: data.user.account_id || data.account.id,
      userId: data.user.id,
    };
  } catch (e) {
    console.log('[test-helpers] Register failed, falling back to login:', e);
    return login(email, password);
  }
}

// Type definitions for API responses
interface LoginResponse {
  token: string;
  user?: {
    id?: string;
    userId?: string;
    account_id?: string;
    accountId?: string;
    account?: string;
  };
  accountId?: string;
  userId?: string;
  requiresAccountSelection?: boolean;
  availableAccounts?: Array<{ accountId: string; name: string }>;
  tempToken?: string;
}

interface JobResponse {
  job: {
    id: string;
    state: {
      status: string;
      progress?: number;
    };
    status?: string;
    progress?: {
      percent?: number;
    };
  };
}

interface JobListResponse {
  jobs: Array<{
    id: string;
    state: {
      status: string;
      progress?: number;
    };
  }>;
}

interface ImportJobResponse {
  success: boolean;
  jobId: string;
  uploadIds?: string[];
  job?: any;
}

interface DeleteJobResponse {
  success: boolean;
  jobId: string;
}

interface CountResult {
  count: number;
}

interface NodesByKindResult {
  kind: string;
  count: number;
}

/**
 * Login and get JWT token
 */
export async function login(
  email: string,
  password: string
): Promise<{ token: string; accountId: string; userId: string }> {
  if (process.env.NODE_ENV !== 'production' || process.env.DISABLE_RATE_LIMIT === '1') {
    try {
      const dbPath = process.env.DB_PATH || path.join(os.homedir(), '.keimenon', 'keimenon.db');
      const db = new Database(dbPath);

      // Clear login attempts (if login_attempts table exists)
      const tablesResult = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_attempts'")
        .all();
      if (tablesResult.length > 0) {
        db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
      }

      // Note: account_lockout_until column doesn't exist in current schema
      // If lockout functionality is added in future, add column first

      db.close();
    } catch (err) {
      console.warn('[test-helpers] Failed to reset login attempts', err);
    }
  }

  const response = await fetch(`${getApiUrl()}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Login failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as LoginResponse;

  if (data.requiresAccountSelection) {
    const targetAccount = data.availableAccounts?.[0];
    if (!targetAccount || !data.tempToken) {
      throw new Error('Login requires account selection but no account information was returned');
    }

    const selectResponse = await fetch(`${getApiUrl()}/api/v1/auth/select-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tempToken: data.tempToken,
        accountId: targetAccount.accountId,
      }),
    });

    if (!selectResponse.ok) {
      const error = await selectResponse.text();
      throw new Error(`Account selection failed (${selectResponse.status}): ${error}`);
    }

    const selection = (await selectResponse.json()) as {
      token?: string;
      account?: { id?: string; account_id?: string };
      user?: { id?: string };
    };

    const selectedToken = selection.token;
    const selectedUserId = selection.user?.id;
    if (!selectedToken || !selectedUserId) {
      throw new Error('Account selection did not return full authentication details');
    }

    return {
      token: selectedToken,
      accountId: selection.account?.id || selection.account?.account_id || targetAccount.accountId,
      userId: selectedUserId,
    };
  }

  // Extract accountId from various possible locations
  const accountId =
    data.user?.account_id || data.user?.accountId || data.accountId || data.user?.account;
  const userId = data.user?.id || data.user?.userId || data.userId;

  // If still undefined, try to decode from JWT (accountId is in the token)
  if (!accountId && data.token) {
    try {
      const payload = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64').toString());
      return {
        token: data.token,
        accountId: payload.accountId,
        userId: payload.userId,
      };
    } catch (err) {
      console.warn('[test-helpers] Failed to decode JWT:', err);
    }
  }

  return {
    token: data.token,
    accountId: accountId || '',
    userId: userId || '',
  };
}

/**
 * Create multipart form data with file
 */
export function createFormData(filePath: string, config?: any): FormData {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Test file not found: ${filePath}`);
  }

  const form = new FormData();
  form.append('files', fs.createReadStream(filePath));

  if (config) {
    form.append('config', JSON.stringify(config));
  }

  return form;
}

/**
 * Wait for job to reach terminal status (succeeded/failed/canceled)
 */
export async function waitForJobCompletion(
  jobId: string,
  token: string,
  timeoutMs: number = 60000
): Promise<any> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${getApiUrl()}/api/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch job: ${response.statusText}`);
    }

    const data = (await response.json()) as JobResponse;
    const job = data.job;

    // Check if terminal status
    if (['succeeded', 'failed', 'canceled'].includes(job.state.status)) {
      return job;
    }

    // Wait 500ms before polling again
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

/**
 * Wait for upload session to be associated with a real import job ID.
 */
export async function waitForUploadSessionJobId(
  sessionId: string,
  token: string,
  timeoutMs: number = 15000
): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${getApiUrl()}/api/v1/uploads/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      const jobId = data?.session?.jobId;
      if (typeof jobId === 'string' && jobId.length > 0) {
        return jobId;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Upload session ${sessionId} did not receive jobId within ${timeoutMs}ms`);
}

/**
 * Wait for chunked upload session import path to reach a terminal job state.
 */
export async function waitForChunkedImportCompletion(
  sessionId: string,
  token: string,
  timeoutMs: number = 60000
): Promise<{ jobId: string; job: any }> {
  const jobId = await waitForUploadSessionJobId(sessionId, token, Math.min(timeoutMs, 20000));
  const job = await waitForJobCompletion(jobId, token, timeoutMs);
  return { jobId, job };
}

/**
 * Create import job via API (job-based system)
 * Uses POST /api/v1/jobs/import (primary production rail)
 */
export async function createImportJob(
  filePath: string,
  token: string,
  config?: any
): Promise<{ jobId: string; uploadId: string }> {
  const form = createFormData(filePath, config);

  const response = await fetch(`${getApiUrl()}/api/v1/jobs/import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Import failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as ImportJobResponse;

  // Job-based response format: { success, jobId, uploadIds, job }
  return {
    jobId: data.jobId,
    uploadId: data.uploadIds?.[0] || data.jobId, // Use first uploadId or fallback to jobId
  };
}

/**
 * Create delete job via API
 */
export async function createDeleteJob(
  scope: 'keimenon' | 'all-clients',
  token: string
): Promise<{ jobId: string }> {
  const response = await fetch(`${getApiUrl()}/api/v1/jobs/delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scope }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Delete job creation failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as DeleteJobResponse;
  return {
    jobId: data.jobId,
  };
}

/**
 * Count nodes in database for an account
 */
export function countNodes(db: Database.Database, accountId: string): number {
  const result = db
    .prepare('SELECT COUNT(*) as count FROM nodes WHERE account_id = ?')
    .get(accountId) as CountResult;
  return result.count;
}

/**
 * Count edges in database for an account
 */
export function countEdges(db: Database.Database, accountId: string): number {
  const result = db
    .prepare('SELECT COUNT(*) as count FROM edges WHERE account_id = ?')
    .get(accountId) as CountResult;
  return result.count;
}

/**
 * Get nodes by kind for an account
 */
export function getNodesByKind(db: Database.Database, accountId: string): NodesByKindResult[] {
  const results = db
    .prepare(
      'SELECT kind, COUNT(*) as count FROM nodes WHERE account_id = ? GROUP BY kind ORDER BY count DESC'
    )
    .all(accountId) as NodesByKindResult[];
  return results;
}

/**
 * Create test nodes in database
 */
export function createTestNodes(
  db: Database.Database,
  accountId: string,
  count: number = 10,
  kind: string = 'ChatThread'
): string[] {
  const nodeIds: string[] = [];
  const now = Date.now();
  const createdByRow = db
    .prepare(
      `SELECT user_id
       FROM user_accounts
       WHERE account_id = ?
       ORDER BY role_rank ASC
       LIMIT 1`
    )
    .get(accountId) as { user_id?: string } | undefined;
  const createdBy = createdByRow?.user_id || accountId;

  const stmt = db.prepare(`
    INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'test')
  `);

  for (let i = 0; i < count; i++) {
    const nodeId = `test_${kind}_${Date.now()}_${i}`;
    stmt.run(
      nodeId,
      kind,
      JSON.stringify({ index: i, label: `Test ${kind} ${i + 1}` }),
      accountId,
      createdBy,
      now,
      now
    );
    nodeIds.push(nodeId);
  }

  return nodeIds;
}

/**
 * Connect to SSE stream and collect events
 */
export class SSECollector {
  private eventSource: EventSource | null = null;
  private events: any[] = [];
  private isConnected: boolean = false;
  private _connectionError: Error | null = null;

  constructor(
    private url: string,
    private token: string,
    private eventType: string = 'jobs.update'
  ) {}

  /**
   * Start listening to SSE stream
   */
  async connect(): Promise<void> {
    const fullUrl = `${this.url}?token=${this.token}`;
    console.log('[SSECollector] EventSource Constructor:', EventSource);
    try {
      this.eventSource = new EventSource(fullUrl);
    } catch (e) {
      console.error('[SSECollector] EventSource constructor threw:', e);
      throw e;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SSE connection timeout'));
      }, 5000);

      this.eventSource!.addEventListener('open', () => {
        this.isConnected = true;
        clearTimeout(timeout);
        resolve();
      });

      this.eventSource!.addEventListener('error', (error) => {
        this._connectionError = error as any;
        this.isConnected = false;
        clearTimeout(timeout);
        reject(error);
      });

      this.eventSource!.addEventListener(this.eventType, (event: any) => {
        try {
          const data = JSON.parse(event.data);
          this.events.push(data);
        } catch (error) {
          console.error('Failed to parse SSE event:', error);
        }
      });
    });
  }

  /**
   * Wait for specific condition in events
   */
  async waitForCondition(
    condition: (events: any[]) => boolean,
    timeoutMs: number = 10000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (condition(this.events)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error('Condition not met within timeout');
  }

  /**
   * Get all events received
   */
  getEvents(): any[] {
    return [...this.events];
  }

  /**
   * Get events matching predicate
   */
  getEventsWhere(predicate: (event: any) => boolean): any[] {
    return this.events.filter(predicate);
  }

  /**
   * Get latest event
   */
  getLatestEvent(): any | null {
    return this.events.length > 0 ? this.events[this.events.length - 1] : null;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.isConnected = false;
    }
  }

  /**
   * Clear collected events
   */
  clear(): void {
    this.events = [];
  }
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cleanup test data for an account
 */
export function cleanupTestData(db: Database.Database, accountId: string): void {
  try {
    // Delete in correct order (respecting foreign keys)
    db.prepare('DELETE FROM edges WHERE account_id = ?').run(accountId);
    db.prepare('DELETE FROM nodes WHERE account_id = ?').run(accountId);
    db.prepare(
      'DELETE FROM job_events WHERE job_id IN (SELECT id FROM jobs WHERE account_id = ?)'
    ).run(accountId);
    db.prepare(
      'DELETE FROM job_items WHERE job_id IN (SELECT id FROM jobs WHERE account_id = ?)'
    ).run(accountId);
    db.prepare('DELETE FROM jobs WHERE account_id = ?').run(accountId);
  } catch (error: any) {
    console.error(`[test-helpers] Cleanup failed for account ${accountId}:`, error);
    throw error;
  }
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string, token: string): Promise<any> {
  const response = await fetch(`${getApiUrl()}/api/v1/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch job: ${response.statusText}`);
  }

  const data = (await response.json()) as JobResponse;
  return data.job;
}

/**
 * List jobs
 */
export async function listJobs(
  token: string,
  filters?: { status?: string; limit?: number }
): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.limit) params.append('limit', filters.limit.toString());

  const url = `${getApiUrl()}/api/v1/jobs?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list jobs: ${response.statusText}`);
  }

  const data = (await response.json()) as JobListResponse;
  return data.jobs || [];
}

/**
 * Cancel job
 */
export async function cancelJob(jobId: string, token: string): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/v1/jobs/${jobId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to cancel job: ${response.statusText}`);
  }
}

/**
 * Assert job status
 */
export function assertJobStatus(job: any, expectedStatus: string): void {
  const actualStatus = job.state?.status || job.status;
  if (actualStatus !== expectedStatus) {
    throw new Error(`Expected job status "${expectedStatus}" but got "${actualStatus}"`);
  }
}

/**
 * Assert job progress
 */
export function assertJobProgress(job: any, expectedPercent: number): void {
  const actualPercent = job.state?.progress || job.progress?.percent || 0;
  if (actualPercent !== expectedPercent) {
    throw new Error(`Expected job progress ${expectedPercent}% but got ${actualPercent}%`);
  }
}

/**
 * Get test file path
 */
export function getTestFilePath(filename: string): string {
  const candidates = [
    path.join(__dirname, '..', 'fixtures', filename),
    path.join(process.cwd(), 'src', '__tests__', 'fixtures', filename),
    path.join(process.cwd(), 'apps', 'api', 'src', '__tests__', 'fixtures', filename),
    path.join(process.cwd(), 'tests', 'test_data', 'chat_data', 'test-samples', filename),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

export default {
  login,
  createFormData,
  waitForJobCompletion,
  waitForUploadSessionJobId,
  waitForChunkedImportCompletion,
  createImportJob,
  createDeleteJob,
  countNodes,
  countEdges,
  getNodesByKind,
  createTestNodes,
  SSECollector,
  waitFor,
  sleep,
  cleanupTestData,
  getJob,
  listJobs,
  cancelJob,
  assertJobStatus,
  assertJobProgress,
  getTestFilePath,
};
