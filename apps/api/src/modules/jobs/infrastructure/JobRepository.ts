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

export interface JobFilters {
  accountId?: string; // Optional - if not provided, fetch from all accounts
  status?: JobStatus | JobStatus[];
  type?: JobType;
  limit?: number;
  offset?: number;
}

export interface JobRepository {
  save(job: Job): Promise<void>;
  findById(id: string, accountId: string): Promise<Job | null>;
  find(filters: JobFilters): Promise<Job[]>;
  appendEvent(event: JobEvent): Promise<void>;
  loadEvents(jobId: string, accountId: string): Promise<JobEvent[]>;
  existsByIdempotencyKey(key: string, accountId: string): Promise<Job | null>;
  countActiveInGroup(concurrencyGroup: string, accountId: string): Promise<number>;
  delete(id: string, accountId: string): Promise<void>;
}

/**
 * SQLite implementation of JobRepository
 */
export class SQLiteJobRepository implements JobRepository {
  constructor(private db: Database.Database) {}

  /**
   * Save job state to database
   */
  async save(job: Job): Promise<void> {
    try {
      const now = Date.now();

      const stmt = this.db.prepare(`
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

      stmt.run(
        job.id,
        job.type,
        job.accountId,
        job.createdBy,
        JSON.stringify(job.config),
        job.status,
        JSON.stringify(job.state),
        now,
        now,
        job.idempotencyKey || null,
        job.concurrencyGroup || null,
        'real'
      );

      console.log(
        `[JobRepository] ✅ Saved job ${job.id} (status: ${job.status}, type: ${job.type})`
      );

      // Save events (append-only)
      for (const event of job.events) {
        await this.appendEvent(event);
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
  async findById(id: string, accountId: string): Promise<Job | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM jobs
      WHERE id = ? AND account_id = ?
    `);

    const record = stmt.get(id, accountId) as any;
    if (!record) {
      return null;
    }

    // Load events
    const events = await this.loadEvents(id, accountId);

    // Reconstruct job from database
    return Job.fromDatabase({
      ...record,
      state_data: record.state_data,
    });
  }

  /**
   * Find jobs by filters
   */
  async find(filters: JobFilters): Promise<Job[]> {
    const { accountId, status, type, limit = 100, offset = 0 } = filters;

    // Build query dynamically based on which filters are provided
    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params: any[] = [];

    // Add account filter if provided (multi-tenant isolation)
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

    const stmt = this.db.prepare(query);
    const records = stmt.all(...params) as any[];

    console.log(`[JobRepository] Query returned ${records.length} records`);

    // Load jobs without events for performance
    // Events can be loaded separately if needed
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
        console.error('[JobRepository] Record data:', {
          id: record.id,
          type: record.type,
          status: record.status,
          config: record.config,
          state_data: record.state_data,
        });
      }
    }

    console.log(`[JobRepository] Successfully loaded ${jobs.length} jobs`);
    return jobs;
  }

  /**
   * Append event to event log
   */
  async appendEvent(event: JobEvent): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO job_events (
        id, job_id, type, data, sequence_number, timestamp, account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Get account_id from job
    const jobStmt = this.db.prepare('SELECT account_id FROM jobs WHERE id = ?');
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
   */
  async loadEvents(jobId: string, accountId: string): Promise<JobEvent[]> {
    const stmt = this.db.prepare(`
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
  async countActiveInGroup(concurrencyGroup: string, accountId: string): Promise<number> {
    const stmt = this.db.prepare(`
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
  async delete(id: string, accountId: string): Promise<void> {
    // SQLite cascade delete will handle events and items
    const stmt = this.db.prepare(`
      DELETE FROM jobs
      WHERE id = ? AND account_id = ?
    `);

    stmt.run(id, accountId);
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
  async findActive(accountId: string, limit = 100): Promise<Job[]> {
    return this.find({
      accountId,
      status: ['queued', 'running'],
      limit,
    });
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
}
