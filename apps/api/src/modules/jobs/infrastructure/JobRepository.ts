/**
 * Job Repository
 *
 * Persistence layer for Job aggregate.
 * Handles saving/loading jobs and their events from SQLite.
 *
 * Responsibilities:
 * - Save job state to database
 * - Load job by ID with full event history
 * - Find jobs by status, account, etc.
 * - Append events to event log
 * - Enforce multi-tenant isolation (account_id)
 *
 * Related: Product Directive - "Single source of truth"
 */

import { Job, JobSpec, JobType } from '../domain/Job';
import { JobEvent } from '../domain/JobEvent';
import { JobStatus } from '../domain/JobStateMachine';
import Database from 'better-sqlite3';
import { ErrorFactory } from '../../../middleware/error-handler.middleware';

const TERMINAL_JOB_STATUSES = new Set<JobStatus>(['succeeded', 'failed', 'canceled']);
const CHANGE_TRACKER_PAGE_SIZE = Number.parseInt(
  process.env.CHANGE_TRACKER_PAGE_SIZE || '5000',
  10
);
const CHANGE_TRACKER_KEYS = [
  'nodesCreated',
  'edgesCreated',
  'nodesDeleted',
  'edgesDeleted',
] as const;
type ChangeTrackerKey = (typeof CHANGE_TRACKER_KEYS)[number];

function isTerminalStatus(status: JobStatus | string | undefined): status is JobStatus {
  return !!status && TERMINAL_JOB_STATUSES.has(status as JobStatus);
}

export interface JobFilters {
  accountId?: string; // Optional - if not provided, fetch from all accounts
  status?: JobStatus | JobStatus[];
  type?: JobType;
  limit?: number;
  offset?: number;
}

export interface JobRepository {
  save(job: Job): Promise<void>;
  findById(id: string, accountId: string, req?: any): Promise<Job | null>;
  find(filters: JobFilters, req?: any): Promise<Job[]>;
  appendEvent(event: JobEvent, dbOrReq?: any): Promise<void>;
  loadEvents(jobId: string, accountId: string, req?: any): Promise<JobEvent[]>;
  existsByIdempotencyKey(key: string, accountId: string): Promise<Job | null>;
  countActiveInGroup(concurrencyGroup: string, accountId: string, req?: any): Promise<number>;
  atomicTransition(
    jobId: string,
    accountId: string,
    fromStatus: JobStatus,
    toStatus: JobStatus,
    stateData: string,
    req?: any
  ): Promise<boolean>;
  delete(id: string, accountId: string, req?: any): Promise<void>;
  getRawStateData(jobId: string, accountId: string): Promise<any | null>;
  updateStateData(jobId: string, accountId: string, stateData: string): Promise<void>;
}

/**
 * SQLite implementation of JobRepository
 */
export class SQLiteJobRepository implements JobRepository {
  private changeTrackerPagesReady = false;

  constructor(private db: Database.Database) {}

  /**
   * Get the correct database for a job (test DB if job has testContext, otherwise production)
   */
  private async getDbForJob(job: Job): Promise<Database.Database> {
    const testDbPath = job.config.testContext?.dbPath;
    const isTestMode = process.env.NODE_ENV === 'test';

    if (testDbPath && isTestMode) {
      const { getJobsDbClient } = await import('../../../utils/get-db-client');
      const mockReq = { testDbPath } as any;
      const jobsClient = await getJobsDbClient(mockReq);
      const { SQLiteClient } = await import('@keimenon/db');
      return (jobsClient as InstanceType<typeof SQLiteClient>).getDatabase();
    }

    return this.db;
  }

  /**
   * Get the correct database for a request (test DB if request has testDbPath, otherwise production)
   */
  private async getDbForRequest(req?: any): Promise<Database.Database> {
    if (req?.testDbPath) {
      const { getJobsDbClient } = await import('../../../utils/get-db-client');
      const jobsClient = await getJobsDbClient(req);
      const { SQLiteClient } = await import('@keimenon/db');
      return (jobsClient as InstanceType<typeof SQLiteClient>).getDatabase();
    }

    return this.db;
  }

  private ensureChangeTrackerPagesTable(db: Database.Database): void {
    if (this.changeTrackerPagesReady) {
      return;
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS job_change_pages (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        page_type TEXT NOT NULL CHECK(page_type IN ('nodesCreated', 'edgesCreated', 'nodesDeleted', 'edgesDeleted')),
        page_index INTEGER NOT NULL,
        ids_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(job_id, page_type, page_index),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_job_change_pages_job ON job_change_pages(job_id);
      CREATE INDEX IF NOT EXISTS idx_job_change_pages_account ON job_change_pages(account_id);
      CREATE INDEX IF NOT EXISTS idx_job_change_pages_type ON job_change_pages(page_type);
    `);
    this.changeTrackerPagesReady = true;
  }

  private pageChangeTracker(
    stateData: Record<string, any>,
    jobId: string,
    accountId: string,
    db: Database.Database
  ): Record<string, any> {
    const changeTracker = stateData.changeTracker as Record<string, any> | undefined;
    if (!changeTracker || typeof changeTracker !== 'object') {
      return stateData;
    }

    const arraysToPage = CHANGE_TRACKER_KEYS.filter((key) => {
      const value = changeTracker[key];
      return Array.isArray(value) && value.length > CHANGE_TRACKER_PAGE_SIZE;
    });

    if (arraysToPage.length === 0) {
      return stateData;
    }

    this.ensureChangeTrackerPagesTable(db);
    db.prepare('DELETE FROM job_change_pages WHERE job_id = ? AND account_id = ?').run(
      jobId,
      accountId
    );

    const insertPage = db.prepare(`
      INSERT OR REPLACE INTO job_change_pages (
        id, job_id, account_id, page_type, page_index, ids_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const pageInfo: Record<string, { pageSize: number; pageCount: number; totalIds: number }> = {};

    for (const key of arraysToPage) {
      const values = changeTracker[key] as string[];
      const pageCount = Math.ceil(values.length / CHANGE_TRACKER_PAGE_SIZE);
      pageInfo[key] = {
        pageSize: CHANGE_TRACKER_PAGE_SIZE,
        pageCount,
        totalIds: values.length,
      };

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const start = pageIndex * CHANGE_TRACKER_PAGE_SIZE;
        const end = start + CHANGE_TRACKER_PAGE_SIZE;
        const page = values.slice(start, end);
        const pageId = `jcp_${jobId}_${key}_${pageIndex}`;
        insertPage.run(pageId, jobId, accountId, key, pageIndex, JSON.stringify(page), now);
      }

      changeTracker[key] = [];
    }

    changeTracker.pageInfo = {
      ...(changeTracker.pageInfo || {}),
      ...pageInfo,
    };
    changeTracker.paged = true;
    stateData.changeTrackerPaged = true;

    return stateData;
  }

  private serializeStateData(job: Job, db: Database.Database): string {
    const stateData = this.pageChangeTracker(
      { ...job.state, progress: job.progress, stats: job.stats },
      job.id,
      job.accountId,
      db
    );
    return JSON.stringify(stateData);
  }

  private hydrateChangeTrackerPages(
    jobId: string,
    accountId: string,
    stateData: Record<string, any>
  ): Record<string, any> {
    const tracker = stateData.changeTracker as Record<string, any> | undefined;
    const pageInfo = tracker?.pageInfo as
      | Record<string, { pageCount?: number; totalIds?: number }>
      | undefined;

    if (!stateData.changeTrackerPaged || !pageInfo || !tracker) {
      return stateData;
    }

    this.ensureChangeTrackerPagesTable(this.db);
    const rows = this.db
      .prepare(
        `
        SELECT page_type, page_index, ids_json
        FROM job_change_pages
        WHERE job_id = ? AND account_id = ?
        ORDER BY page_type ASC, page_index ASC
      `
      )
      .all(jobId, accountId) as Array<{
      page_type: ChangeTrackerKey;
      page_index: number;
      ids_json: string;
    }>;

    for (const key of CHANGE_TRACKER_KEYS) {
      const pages = rows.filter((row) => row.page_type === key);
      if (pages.length === 0) {
        continue;
      }

      const hydrated: string[] = [];
      for (const page of pages) {
        try {
          const ids = JSON.parse(page.ids_json || '[]');
          if (Array.isArray(ids)) {
            hydrated.push(...ids);
          }
        } catch {
          // Ignore malformed page payloads during hydration.
        }
      }

      tracker[key] = hydrated;
    }

    return stateData;
  }

  /**
   * Save job state to database
   */
  async save(job: Job): Promise<void> {
    try {
      const now = Date.now();
      const db = await this.getDbForJob(job);
      const existing = db
        .prepare('SELECT status FROM jobs WHERE id = ? AND account_id = ?')
        .get(job.id, job.accountId) as { status?: JobStatus } | undefined;

      if (isTerminalStatus(existing?.status)) {
        const incomingTerminal = isTerminalStatus(job.status);
        const sameTerminalStatus = job.status === existing.status;

        if (!incomingTerminal || !sameTerminalStatus) {
          console.warn(
            `[JobRepository] Ignoring stale state write for terminal job ${job.id}: existing=${existing.status}, incoming=${job.status}`
          );
          return;
        }
      }

      const stmt = db.prepare(`
        INSERT INTO jobs (
          id, type, account_id, created_by, config, status,
          state_data, created_at, updated_at, idempotency_key,
          concurrency_group, data_tag
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          state_data = excluded.state_data,
          updated_at = excluded.updated_at
      `);

      const result = stmt.run(
        job.id,
        job.type,
        job.accountId,
        job.createdBy,
        JSON.stringify(job.config),
        job.status,
        this.serializeStateData(job, db),
        now,
        now,
        job.idempotencyKey || null,
        job.concurrencyGroup || null,
        'real'
      );

      // Opportunistically checkpoint for cross-connection visibility in the test jobs database.
      try {
        db.pragma('wal_checkpoint(PASSIVE)');
      } catch (walError: any) {
        console.warn(
          `[JobRepository] WAL checkpoint failed after saving ${job.id}: ${walError.message}`
        );
      }

      for (const event of job.events) {
        await this.appendEvent(event, db);
      }
    } catch (error: any) {
      console.error(`[JobRepository] ❌ Failed to save job ${job.id}:`);
      console.error(`   Job ID: ${job.id}`);
      console.error(`   Type: ${job.type}`);
      console.error(`   Status: ${job.status}`);
      console.error(`   Account: ${job.accountId}`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);

      // Throw structured API error for proper error handling middleware
      throw ErrorFactory.database(`Failed to save job: ${error.message}`, 'JobRepository.save', {
        jobId: job.id,
        jobType: job.type,
        jobStatus: job.status,
        accountId: job.accountId,
        originalError: error.message,
      });
    }
  }

  /**
   * Load job by ID with full event history
   */
  async findById(id: string, accountId: string, req?: any): Promise<Job | null> {
    const db = await this.getDbForRequest(req);

    const stmt = db.prepare(`
      SELECT * FROM jobs
      WHERE id = ? AND account_id = ?
    `);

    const record = stmt.get(id, accountId) as any;

    if (!record) {
      return null;
    }

    const events = await this.loadEvents(id, accountId, req);

    return Job.fromDatabase(
      {
        ...record,
        state_data: record.state_data,
      },
      events
    ); // ✅ Pass events to factory method
  }

  /**
   * Find jobs by filters
   */
  async find(filters: JobFilters, req?: any): Promise<Job[]> {
    const { accountId, status, type, limit = 100, offset = 0 } = filters;
    const db = await this.getDbForRequest(req);

    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params: any[] = [];

    if (accountId) {
      query += ' AND account_id = ?';
      params.push(accountId);
    }

    if (status) {
      if (Array.isArray(status)) {
        query += ` AND status IN (${status.map(() => '?').join(', ')})`;
        params.push(...status);
      } else {
        query += ' AND status = ?';
        params.push(status);
      }
    }

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const records = stmt.all(...params) as any[];

    const jobs: Job[] = [];
    for (const record of records) {
      try {
        const job = Job.fromDatabase({
          ...record,
          state_data: record.state_data,
        });
        jobs.push(job);
      } catch (error: any) {
        console.error(`[JobRepository] Failed to load job ${record.id}:`, error.message);
      }
    }

    return jobs;
  }

  /**
   * Append event to event log
   */
  async appendEvent(event: JobEvent, dbOrReq?: any): Promise<void> {
    let database = this.db;

    if (dbOrReq) {
      if (typeof (dbOrReq as any).prepare === 'function') {
        database = dbOrReq;
      } else {
        database = await this.getDbForRequest(dbOrReq);
      }
    }
    const stmt = database.prepare(`
      INSERT OR IGNORE INTO job_events (
        id, job_id, type, data, sequence_number, timestamp, account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Get account_id from job (use same database as statement)
    const jobStmt = database.prepare('SELECT account_id FROM jobs WHERE id = ?');
    const job = jobStmt.get(event.jobId) as any;
    if (!job) {
      throw new Error(`Job not found: ${event.jobId}`);
    }

    stmt.run(
      event.id,
      event.jobId,
      event.type,
      JSON.stringify(event.data),
      event.sequenceNumber,
      event.timestamp.getTime(),
      job.account_id
    );
  }

  /**
   * Load all events for a job
   * CRITICAL FIX: Routes to correct database (test or production) based on request context
   */
  async loadEvents(jobId: string, accountId: string, req?: any): Promise<JobEvent[]> {
    // CRITICAL FIX: Use request-scoped database if available
    const db = await this.getDbForRequest(req);

    const stmt = db.prepare(`
      SELECT * FROM job_events
      WHERE job_id = ? AND account_id = ?
      ORDER BY sequence_number ASC
    `);

    const records = stmt.all(jobId, accountId) as any[];

    return records.map((record) =>
      JobEvent.fromJSON({
        id: record.id,
        jobId: record.job_id,
        type: record.type,
        timestamp: new Date(record.timestamp).toISOString(),
        data: JSON.parse(record.data),
        sequenceNumber: record.sequence_number,
      })
    );
  }

  /**
   * Check if job exists by idempotency key
   */
  async existsByIdempotencyKey(key: string, accountId: string): Promise<Job | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM jobs
      WHERE idempotency_key = ? AND account_id = ?
    `);

    const record = stmt.get(key, accountId) as any;
    if (!record) {
      return null;
    }

    return Job.fromDatabase({
      ...record,
      state_data: record.state_data,
    });
  }

  /**
   * Count active jobs in concurrency group
   * Only counts RUNNING jobs (queued jobs haven't started yet)
   */
  async countActiveInGroup(
    concurrencyGroup: string,
    accountId: string,
    req?: any
  ): Promise<number> {
    const db = await this.getDbForRequest(req);
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM jobs
      WHERE concurrency_group = ?
        AND account_id = ?
        AND status = 'running'
    `);

    const result = stmt.get(concurrencyGroup, accountId) as any;
    return result?.count || 0;
  }

  /**
   * Delete job and all related data
   */
  async delete(id: string, accountId: string, req?: any): Promise<void> {
    // SQLite cascade delete will handle events and items
    const db = await this.getDbForRequest(req);
    const stmt = db.prepare(`
      DELETE FROM jobs
      WHERE id = ? AND account_id = ?
    `);

    stmt.run(id, accountId);
  }

  /**
   * Get raw state_data JSON for a job
   * Used by CompensateJob to access changeTracker for rollback
   */
  async getRawStateData(jobId: string, accountId: string): Promise<any | null> {
    const stmt = this.db.prepare(`
      SELECT state_data FROM jobs
      WHERE id = ? AND account_id = ?
    `);

    const record = stmt.get(jobId, accountId) as any;
    if (!record) {
      return null;
    }

    try {
      const parsed = JSON.parse(record.state_data);
      return this.hydrateChangeTrackerPages(jobId, accountId, parsed);
    } catch {
      return null;
    }
  }

  /**
   * Update state_data for a job (used by CompensateJob to mark as compensated)
   */
  async updateStateData(jobId: string, accountId: string, stateData: string): Promise<void> {
    let serializedStateData = stateData;
    try {
      const parsed = JSON.parse(stateData);
      const paged = this.pageChangeTracker(parsed, jobId, accountId, this.db);
      serializedStateData = JSON.stringify(paged);
    } catch {
      // Preserve original state_data payload if parsing fails.
    }

    const stmt = this.db.prepare(`
      UPDATE jobs
      SET state_data = ?, updated_at = ?
      WHERE id = ? AND account_id = ?
    `);

    stmt.run(serializedStateData, Date.now(), jobId, accountId);
  }

  /**
   * Get jobs summary for an account
   */
  async getSummary(accountId: string): Promise<{
    total: number;
    byStatus: Record<JobStatus, number>;
    byType: Record<JobType, number>;
  }> {
    const totalStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM jobs WHERE account_id = ?
    `);
    const total = (totalStmt.get(accountId) as any).count;

    const byStatusStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM jobs
      WHERE account_id = ?
      GROUP BY status
    `);
    const statusRows = byStatusStmt.all(accountId) as any[];
    const byStatus = statusRows.reduce(
      (acc, row) => {
        acc[row.status] = row.count;
        return acc;
      },
      {} as Record<JobStatus, number>
    );

    const byTypeStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM jobs
      WHERE account_id = ?
      GROUP BY type
    `);
    const typeRows = byTypeStmt.all(accountId) as any[];
    const byType = typeRows.reduce(
      (acc, row) => {
        acc[row.type] = row.count;
        return acc;
      },
      {} as Record<JobType, number>
    );

    return { total, byStatus, byType };
  }

  /**
   * Find active jobs (queued or running)
   */
  async findActive(accountId: string, limit = 100, req?: any): Promise<Job[]> {
    return this.find(
      {
        accountId,
        status: ['queued', 'running'],
        limit,
      },
      req
    );
  }

  /**
   * Find jobs for SSE broadcasting
   * Returns jobs that had events in the last N seconds
   */
  async findRecentlyActive(accountId: string, sinceSeconds: number = 60): Promise<Job[]> {
    const since = Date.now() - sinceSeconds * 1000;

    const stmt = this.db.prepare(`
      SELECT DISTINCT j.*
      FROM jobs j
      INNER JOIN job_events e ON j.id = e.job_id
      WHERE j.account_id = ?
        AND e.timestamp > ?
      ORDER BY j.updated_at DESC
      LIMIT 50
    `);

    const records = stmt.all(accountId, since) as any[];

    return records.map((record) =>
      Job.fromDatabase({
        ...record,
        state_data: record.state_data,
      })
    );
  }

  /**
   * Atomic state transition with optimistic locking
   * Prevents race conditions in multi-instance deployments
   */
  async atomicTransition(
    jobId: string,
    accountId: string,
    fromStatus: JobStatus,
    toStatus: JobStatus,
    stateData: string,
    req?: any
  ): Promise<boolean> {
    const db = await this.getDbForRequest(req);
    const stmt = db.prepare(`
      UPDATE jobs
      SET status = ?, state_data = ?, updated_at = ?
      WHERE id = ? AND account_id = ? AND status = ?
    `);

    const result = stmt.run(toStatus, stateData, Date.now(), jobId, accountId, fromStatus);
    const succeeded = result.changes > 0;

    return succeeded;
  }
}
