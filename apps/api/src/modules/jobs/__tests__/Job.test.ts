/**
 * Job Domain Model Unit Tests
 *
 * Tests the Job aggregate and its state machine transitions,
 * including pause, resume, cancel, and retry operations.
 *
 * Related:
 * - apps/api/src/modules/jobs/domain/Job.ts
 * - apps/api/src/modules/jobs/domain/JobStateMachine.ts
 */

import { describe, test as it } from 'node:test';
import assert from 'node:assert/strict';
import { Job, JobSpec } from '../domain/Job';

describe('Job Domain Model', () => {
  describe('Pause/Resume', () => {
    it('should pause a running job', () => {
      // Create job
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);

      // Start the job (transition to running)
      job.start();
      assert.strictEqual(job.status, 'running', 'Job should be running');

      // Pause the job
      job.pause();

      assert.strictEqual(job.status, 'blocked', 'Job should be blocked after pause');
      assert.ok(job.state.blockedAt, 'Job should have blockedAt timestamp');
      assert.strictEqual(
        job.state.blockedReason,
        'User paused job',
        'Block reason should indicate user pause'
      );
    });

    it('should pause a queued job (for concurrency reasons)', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      assert.strictEqual(job.status, 'queued', 'New job should be queued');

      // Pause/block is valid from queued state (for concurrency control)
      job.pause();
      assert.strictEqual(job.status, 'blocked', 'Job should be blocked');
      assert.ok(job.state.blockedAt, 'Should have blockedAt timestamp');
    });

    it('should resume a paused job', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      job.start();
      job.pause();

      assert.strictEqual(job.status, 'blocked', 'Job should be paused');

      // Resume the job
      job.resume();

      assert.strictEqual(job.status, 'queued', 'Job should be queued after resume');
      assert.strictEqual(job.state.blockedAt, undefined, 'blockedAt should be cleared');
      assert.strictEqual(job.state.blockedReason, undefined, 'blockedReason should be cleared');
    });

    it('should not resume a job that is not paused', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      assert.strictEqual(job.status, 'queued', 'New job should be queued');

      // Try to resume non-paused job (retry from queued is illegal)
      assert.throws(
        () => job.resume(),
        /Illegal transition/,
        'Should not allow resume from queued state'
      );
    });
  });

  describe('Cancel', () => {
    it('should cancel a queued job', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      assert.strictEqual(job.status, 'queued');

      job.cancel('User requested cancellation');

      assert.strictEqual(job.status, 'canceled', 'Job should be canceled');
      assert.ok(job.state.canceledAt, 'Job should have canceledAt timestamp');
    });

    it('should cancel a running job', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      job.start();
      assert.strictEqual(job.status, 'running');

      job.cancel('Worker aborted');

      assert.strictEqual(job.status, 'canceled', 'Job should be canceled');
      assert.ok(job.state.canceledAt, 'Job should have canceledAt timestamp');
    });

    it('should not cancel a completed job', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      job.start();
      job.succeed('Import completed');

      assert.strictEqual(job.status, 'succeeded');

      // Try to cancel completed job (succeeded is terminal)
      assert.throws(
        () => job.cancel(),
        /Illegal transition/,
        'Should not allow cancel from succeeded state'
      );
    });
  });

  describe('Retry', () => {
    it('should allow retry of blocked job', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      job.start();
      job.block('Concurrency limit reached');

      assert.strictEqual(job.status, 'blocked');

      // Retry transitions blocked → queued
      job.retry();

      assert.strictEqual(job.status, 'queued', 'Job should be queued for retry');
      assert.strictEqual(job.state.blockedAt, undefined, 'blockedAt should be cleared');
      assert.strictEqual(job.state.blockedReason, undefined, 'blockedReason should be cleared');
    });

    it('should not retry a failed job (terminal state)', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      job.start();
      job.fail({ code: 'PARSE_ERROR', message: 'Failed to parse file' });

      assert.strictEqual(job.status, 'failed');

      // Failed is a terminal state - retry should throw
      assert.throws(
        () => job.retry(),
        /Illegal transition/,
        'Should not allow retry from failed state (terminal)'
      );
    });

    it('should not retry a canceled job (terminal state)', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      job.start();
      job.cancel('Test cancellation');

      assert.strictEqual(job.status, 'canceled');

      // Canceled is a terminal state - retry should throw
      assert.throws(
        () => job.retry(),
        /Illegal transition/,
        'Should not allow retry from canceled state (terminal)'
      );
    });

    it('should not retry a running job', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      job.start();

      assert.strictEqual(job.status, 'running');

      assert.throws(
        () => job.retry(),
        /Illegal transition/,
        'Should not allow retry from running state'
      );
    });
  });

  describe('State Transitions', () => {
    it('should follow valid state machine transitions', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);

      // Valid flow: queued → running → blocked → queued → running → succeeded
      assert.strictEqual(job.status, 'queued');

      job.start();
      assert.strictEqual(job.status, 'running');

      job.pause();
      assert.strictEqual(job.status, 'blocked');

      job.resume();
      assert.strictEqual(job.status, 'queued');

      job.start();
      assert.strictEqual(job.status, 'running');

      job.succeed('Completed successfully');
      assert.strictEqual(job.status, 'succeeded');
    });

    it('should maintain timestamps correctly', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: { files: [] },
      };

      const job = Job.create(spec);
      assert.ok(job.state.queuedAt, 'Should have queuedAt on creation');

      job.start();
      assert.ok(job.state.startedAt, 'Should have startedAt when started');

      job.pause();
      assert.ok(job.state.blockedAt, 'Should have blockedAt when paused');

      job.resume();
      assert.strictEqual(job.state.blockedAt, undefined, 'blockedAt should be cleared on resume');

      job.start();
      job.succeed('Done');
      assert.ok(job.state.completedAt, 'Should have completedAt when succeeded');
    });
  });

  describe('Job Serialization', () => {
    it('should serialize to JSON correctly', () => {
      const spec: JobSpec = {
        type: 'import',
        accountId: 'acc_test',
        createdBy: 'user_test',
        config: {
          files: [{ fileName: 'test.json', fileSize: 1024, mimeType: 'application/json' }],
        },
      };

      const job = Job.create(spec);
      job.start();

      const json = job.toJSON();

      assert.strictEqual(json.type, 'import');
      assert.strictEqual(json.accountId, 'acc_test');
      assert.strictEqual(json.state.status, 'running');
      assert.ok(json.id, 'Should have job ID');
      assert.ok(json.state, 'Should have state object');
      assert.deepStrictEqual(json.config.files[0].fileName, 'test.json');
    });
  });
});
