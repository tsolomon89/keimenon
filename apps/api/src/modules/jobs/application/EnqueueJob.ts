/**
 * EnqueueJob Use Case
 *
 * Command: Create and enqueue a new background job.
 *
 * Responsibilities:
 * - Validate job specification
 * - Check idempotency (prevent duplicates)
 * - Create job aggregate
 * - Persist to repository
 * - Return job ID for tracking
 *
 * Idempotency: If idempotency_key is provided and a job with that key
 * already exists for this account, return the existing job instead of
 * creating a new one.
 *
 * Related: Product Directive - "Idempotency keys"
 */

import { Job, JobSpec } from '../domain/Job';
import { JobRepository } from '../infrastructure/JobRepository';

export interface EnqueueJobCommand {
  type: 'import' | 'delete' | 'export' | 'analyze';
  accountId: string;
  createdBy: string; // user_id
  config: {
    // Import config
    files?: Array<{
      fileName: string;
      fileSize: number;
      mimeType: string;
    }>;
    importOptions?: {
      platform?: string;
      exportCode?: boolean;
      codeMinChars?: number;
    };

    // Delete config
    deleteScope?: 'canvas' | 'all-clients';

    // Export config
    exportFormat?: 'json' | 'csv' | 'markdown';
    exportScope?: string;

    // Common
    metadata?: Record<string, unknown>;
  };

  // Optional
  idempotencyKey?: string;
  concurrencyGroup?: string;
}

export interface EnqueueJobResult {
  jobId: string;
  status: 'created' | 'existing';
  job: Job;
}

/**
 * EnqueueJob Use Case
 */
export class EnqueueJob {
  constructor(private jobRepository: JobRepository) {}

  async execute(command: EnqueueJobCommand): Promise<EnqueueJobResult> {
    // 1. Validate command
    this.validate(command);

    // 2. Check idempotency
    if (command.idempotencyKey) {
      const existingJob = await this.jobRepository.existsByIdempotencyKey(
        command.idempotencyKey,
        command.accountId
      );

      if (existingJob) {
        return {
          jobId: existingJob.id,
          status: 'existing',
          job: existingJob,
        };
      }
    }

    // 3. Create job aggregate
    const jobSpec: JobSpec = {
      type: command.type,
      accountId: command.accountId,
      createdBy: command.createdBy,
      config: command.config,
      idempotencyKey: command.idempotencyKey,
      concurrencyGroup: command.concurrencyGroup,
    };

    const job = Job.create(jobSpec);

    // 4. Persist to repository
    await this.jobRepository.save(job);

    // 5. Return result
    return {
      jobId: job.id,
      status: 'created',
      job,
    };
  }

  /**
   * Validate command
   */
  private validate(command: EnqueueJobCommand): void {
    const errors: string[] = [];

    // Required fields
    if (!command.type) {
      errors.push('type is required');
    }

    if (!command.accountId) {
      errors.push('accountId is required');
    }

    if (!command.createdBy) {
      errors.push('createdBy is required');
    }

    if (!command.config) {
      errors.push('config is required');
    }

    // Type-specific validation
    if (command.type === 'import') {
      if (!command.config.files || command.config.files.length === 0) {
        errors.push('import jobs require at least one file');
      }
    }

    if (command.type === 'delete') {
      if (!command.config.deleteScope) {
        errors.push('delete jobs require deleteScope');
      }
    }

    if (command.type === 'export') {
      if (!command.config.exportFormat) {
        errors.push('export jobs require exportFormat');
      }
    }

    // Idempotency key format
    if (command.idempotencyKey) {
      if (command.idempotencyKey.length < 8 || command.idempotencyKey.length > 256) {
        errors.push('idempotencyKey must be 8-256 characters');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Invalid EnqueueJob command: ${errors.join(', ')}`);
    }
  }
}
