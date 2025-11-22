/**
 * Job System Configuration
 *
 * Centralized configuration for the entire job system.
 * All timeouts, limits, and thresholds defined in one place.
 *
 * Usage:
 *   import { JOB_CONFIG } from './jobs.config';
 *   const timeout = JOB_CONFIG.workers.import.timeoutMs;
 *
 * Environment Variables:
 *   - WORKER_POOL_MAX_CONCURRENT: Override maxConcurrentJobs (default: 5)
 *   - WORKER_POOL_POLL_INTERVAL_MS: Override pollIntervalMs (default: 1000)
 *   - IMPORT_WORKER_TIMEOUT_MS: Override import worker timeout (default: 600000)
 *   - DELETE_WORKER_TIMEOUT_MS: Override delete worker timeout (default: 300000)
 *   - JOB_CHECKPOINT_BATCH_INTERVAL: Override checkpoint frequency (default: 10)
 *   - JOB_ORPHAN_THRESHOLD_MS: Override orphan detection threshold (default: 120000)
 *
 * Related: Product Directive - "Enterprise-scale job system (100+ concurrent jobs)"
 */

/**
 * Worker Pool Configuration
 */
export const WORKER_POOL_CONFIG = {
  /** Maximum number of jobs that can run concurrently */
  maxConcurrentJobs: parseInt(process.env.WORKER_POOL_MAX_CONCURRENT || '5'),

  /** How often to poll for new jobs (in milliseconds) */
  pollIntervalMs: parseInt(process.env.WORKER_POOL_POLL_INTERVAL_MS || '1000'),

  /** Jobs running longer than this are considered orphaned (server restart detection) */
  orphanThresholdMs: parseInt(process.env.JOB_ORPHAN_THRESHOLD_MS || '120000'), // 2 minutes
} as const;

/**
 * Worker-specific Configuration
 */
export const WORKER_CONFIG = {
  import: {
    /** Timeout for import jobs (10 minutes default) */
    timeoutMs: parseInt(process.env.IMPORT_WORKER_TIMEOUT_MS || '600000'),

    /** Batch size for import operations */
    batchSize: 500,

    /** Save checkpoint every N batches */
    checkpointInterval: parseInt(process.env.JOB_CHECKPOINT_BATCH_INTERVAL || '10'),
  },

  delete: {
    /** Timeout for delete jobs (5 minutes default) */
    timeoutMs: parseInt(process.env.DELETE_WORKER_TIMEOUT_MS || '300000'),

    /** Batch size for delete operations */
    batchSize: 500,

    /** Save checkpoint every N batches */
    checkpointInterval: parseInt(process.env.JOB_CHECKPOINT_BATCH_INTERVAL || '10'),
  },
} as const;

/**
 * Job Persistence Configuration
 */
export const JOB_PERSISTENCE_CONFIG = {
  /** Batch size for entity deletion in CompensateJob */
  compensationBatchSize: 500,

  /** How often to save changeTracker (every N changes) */
  checkpointThreshold: 500,

  /** Maximum retries for failed database writes */
  maxRetries: 3,

  /** Delay between retries (exponential backoff base) */
  retryDelayMs: 100,
} as const;

/**
 * SSE Broadcasting Configuration
 */
export const SSE_CONFIG = {
  /** How often to broadcast job updates (in milliseconds) */
  broadcastIntervalMs: 500, // 2Hz

  /** How often to send heartbeat pings (in milliseconds) */
  heartbeatIntervalMs: 30000, // 30 seconds

  /** Maximum number of pending events per account before dropping */
  maxPendingEventsPerAccount: 100,
} as const;

/**
 * Database Write Queue Configuration
 */
export const WRITE_QUEUE_CONFIG = {
  /** Maximum batch size for writes */
  maxBatchSize: 100,

  /** How often to flush the write queue (in milliseconds) */
  flushIntervalMs: 100,

  /** Maximum retries for failed writes */
  maxRetries: 3,

  /** Dead letter queue max size before automatic cleanup */
  deadLetterQueueMaxSize: 1000,
} as const;

/**
 * Job Concurrency Configuration
 */
export const CONCURRENCY_CONFIG = {
  /** Default concurrency limit per group */
  defaultGroupLimit: 1,

  /** Known concurrency groups and their limits */
  groups: {
    'delete-canvas': 1, // Only one delete operation per account at a time
    'import': 3, // Allow up to 3 concurrent imports per account
    'analysis': 5, // Allow up to 5 concurrent analysis jobs
  },
} as const;

/**
 * Full Job System Configuration
 * Combines all config sections
 */
export const JOB_CONFIG = {
  workerPool: WORKER_POOL_CONFIG,
  workers: WORKER_CONFIG,
  persistence: JOB_PERSISTENCE_CONFIG,
  sse: SSE_CONFIG,
  writeQueue: WRITE_QUEUE_CONFIG,
  concurrency: CONCURRENCY_CONFIG,
} as const;

/**
 * Type exports for TypeScript
 */
export type WorkerPoolConfig = typeof WORKER_POOL_CONFIG;
export type WorkerConfig = typeof WORKER_CONFIG;
export type JobPersistenceConfig = typeof JOB_PERSISTENCE_CONFIG;
export type SSEConfig = typeof SSE_CONFIG;
export type WriteQueueConfig = typeof WRITE_QUEUE_CONFIG;
export type ConcurrencyConfig = typeof CONCURRENCY_CONFIG;
export type JobSystemConfig = typeof JOB_CONFIG;

/**
 * Configuration Validation
 * Throws errors if configuration is invalid
 */
export function validateJobConfig(): void {
  const errors: string[] = [];

  // Validate worker pool
  if (WORKER_POOL_CONFIG.maxConcurrentJobs < 1) {
    errors.push('maxConcurrentJobs must be >= 1');
  }
  if (WORKER_POOL_CONFIG.pollIntervalMs < 100) {
    errors.push('pollIntervalMs must be >= 100ms (minimum 10Hz)');
  }
  if (WORKER_POOL_CONFIG.orphanThresholdMs < 60000) {
    errors.push('orphanThresholdMs must be >= 60000ms (1 minute minimum)');
  }

  // Validate worker timeouts
  if (WORKER_CONFIG.import.timeoutMs < 60000) {
    errors.push('Import worker timeout must be >= 60000ms (1 minute)');
  }
  if (WORKER_CONFIG.delete.timeoutMs < 30000) {
    errors.push('Delete worker timeout must be >= 30000ms (30 seconds)');
  }

  // Validate batch sizes
  if (WORKER_CONFIG.import.batchSize < 10 || WORKER_CONFIG.import.batchSize > 10000) {
    errors.push('Import batch size must be between 10 and 10000');
  }
  if (WORKER_CONFIG.delete.batchSize < 10 || WORKER_CONFIG.delete.batchSize > 10000) {
    errors.push('Delete batch size must be between 10 and 10000');
  }

  // Validate SSE config
  if (SSE_CONFIG.broadcastIntervalMs < 100) {
    errors.push('SSE broadcast interval must be >= 100ms (maximum 10Hz)');
  }
  if (SSE_CONFIG.heartbeatIntervalMs < 5000) {
    errors.push('SSE heartbeat interval must be >= 5000ms (5 seconds)');
  }

  if (errors.length > 0) {
    throw new Error(`Job system configuration is invalid:\n  - ${errors.join('\n  - ')}`);
  }
}

// Validate configuration on module load
validateJobConfig();

console.log('✅ Job system configuration validated successfully');
console.log(`   Worker pool: ${WORKER_POOL_CONFIG.maxConcurrentJobs} concurrent jobs`);
console.log(`   Import timeout: ${WORKER_CONFIG.import.timeoutMs / 1000}s`);
console.log(`   Delete timeout: ${WORKER_CONFIG.delete.timeoutMs / 1000}s`);
console.log(`   Checkpoint interval: every ${WORKER_CONFIG.import.checkpointInterval} batches`);
