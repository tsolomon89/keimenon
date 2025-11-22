/**
 * Job System Structured Logger
 *
 * Provides structured, correlation-ID-tracked logging for the job system.
 * All log entries include job context for easier debugging and monitoring.
 *
 * Features:
 * - Correlation IDs for request tracing
 * - Structured JSON output (when enabled)
 * - Automatic context enrichment (job ID, account ID, type, status)
 * - Integration with monitoring systems (Datadog, New Relic, etc.)
 *
 * Usage:
 *   const logger = createJobLogger(job);
 *   logger.info('Processing started', { batchNumber: 1, totalBatches: 10 });
 *   logger.error('Import failed', { error: err.message, stack: err.stack });
 *
 * Related: Product Directive - "Observable job system with correlation tracking"
 */

import { Job } from '../domain/Job';
import { v4 as uuidv4 } from 'uuid';

/**
 * Log levels (from least to most severe)
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId: string;
  jobId: string;
  accountId: string;
  jobType: string;
  jobStatus: string;
  metadata?: Record<string, unknown>;
}

/**
 * Job Logger Configuration
 */
export interface JobLoggerConfig {
  /** Enable JSON output (default: false, uses pretty console logs) */
  jsonOutput: boolean;

  /** Minimum log level to output */
  minLevel: LogLevel;

  /** Custom correlation ID (auto-generated if not provided) */
  correlationId?: string;

  /** Additional context to include in every log entry */
  context?: Record<string, unknown>;
}

/**
 * Job Logger
 */
export class JobLogger {
  private correlationId: string;
  private config: JobLoggerConfig;

  constructor(
    private job: Job,
    config?: Partial<JobLoggerConfig>
  ) {
    this.config = {
      jsonOutput: config?.jsonOutput ?? process.env.LOG_FORMAT === 'json',
      minLevel: config?.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? LogLevel.INFO,
      correlationId: config?.correlationId,
      context: config?.context ?? {},
    };

    // Generate or use provided correlation ID
    this.correlationId = this.config.correlationId || uuidv4();
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log error message
   */
  error(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    // Check if log level is enabled
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.correlationId,
      jobId: this.job.id,
      accountId: this.job.accountId,
      jobType: this.job.type,
      jobStatus: this.job.status,
      metadata: {
        ...this.config.context,
        ...metadata,
      },
    };

    if (this.config.jsonOutput) {
      // JSON output for production/monitoring
      console.log(JSON.stringify(entry));
    } else {
      // Pretty console output for development
      this.logPretty(entry);
    }
  }

  /**
   * Pretty console output for development
   */
  private logPretty(entry: LogEntry): void {
    const emoji = {
      [LogLevel.DEBUG]: '🔍',
      [LogLevel.INFO]: 'ℹ️',
      [LogLevel.WARN]: '⚠️',
      [LogLevel.ERROR]: '❌',
    }[entry.level];

    const color = {
      [LogLevel.DEBUG]: '\x1b[90m', // Gray
      [LogLevel.INFO]: '\x1b[36m', // Cyan
      [LogLevel.WARN]: '\x1b[33m', // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    }[entry.level];

    const reset = '\x1b[0m';

    // Format: [🔍 INFO] [job_123] [import] Processing started { batchNumber: 1 }
    let output = `${color}[${emoji} ${entry.level.toUpperCase()}]${reset} `;
    output += `[${entry.jobId.substring(0, 8)}...] `;
    output += `[${entry.jobType}] `;
    output += `${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      output += ` ${JSON.stringify(entry.metadata)}`;
    }

    console.log(output);
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.config.minLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Get correlation ID for this logger
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, unknown>): JobLogger {
    return new JobLogger(this.job, {
      ...this.config,
      context: {
        ...this.config.context,
        ...context,
      },
      correlationId: this.correlationId, // Inherit parent's correlation ID
    });
  }
}

/**
 * Create a job logger
 *
 * @param job - Job to log for
 * @param config - Optional logger configuration
 * @returns JobLogger instance
 */
export function createJobLogger(job: Job, config?: Partial<JobLoggerConfig>): JobLogger {
  return new JobLogger(job, config);
}

/**
 * Extract correlation ID from request headers (for HTTP request tracking)
 *
 * Looks for common correlation ID headers:
 * - X-Correlation-ID
 * - X-Request-ID
 * - X-Trace-ID
 *
 * @param headers - Request headers
 * @returns Correlation ID or undefined
 */
export function extractCorrelationId(headers: Record<string, string | string[] | undefined>): string | undefined {
  const headerNames = ['x-correlation-id', 'x-request-id', 'x-trace-id'];

  for (const name of headerNames) {
    const value = headers[name];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      return value[0];
    }
  }

  return undefined;
}
