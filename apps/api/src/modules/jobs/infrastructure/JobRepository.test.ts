import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { SQLiteJobRepository } from './JobRepository';
import { Job } from '../domain/Job';

function createJobTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE jobs (
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
      data_tag TEXT NOT NULL DEFAULT 'real'
    );

    CREATE TABLE job_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      sequence_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      UNIQUE(job_id, sequence_number)
    );
  `);
}

describe('SQLiteJobRepository terminal-state guard', () => {
  it('does not allow stale running saves to overwrite a terminal row', async () => {
    const db = new Database(':memory:');
    try {
      createJobTables(db);
      const repo = new SQLiteJobRepository(db);

      const job = Job.create({
        type: 'import',
        accountId: 'acc_terminal_guard',
        createdBy: 'usr_terminal_guard',
        config: {
          files: [
            {
              fileName: 'conversations.json',
              fileSize: 1024,
              mimeType: 'application/json',
              filePath: '/tmp/conversations.json',
            },
          ],
        },
      });

      await repo.save(job);
      job.start();
      await repo.save(job);

      // Simulate an in-memory stale copy that still believes the job is running.
      const staleRunning = Job.fromJSON(job.toJSON());

      // Persist terminal failure first.
      job.fail({ code: 'IMPORT_FAILED', message: 'Batch failure' });
      await repo.save(job);

      // Attempt stale non-terminal write after terminal persistence.
      await repo.save(staleRunning);

      const row = db.prepare('SELECT status FROM jobs WHERE id = ?').get(job.id) as
        | { status: string }
        | undefined;
      expect(row?.status).toBe('failed');
    } finally {
      db.close();
    }
  });
});
