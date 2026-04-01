import { MetricsService } from '../MetricsService';

export interface ImportJobStartMetadata {
  jobId: string;
  accountId: string;
  mode: string;
}

export interface ImportJobTerminalMetadata {
  jobId: string;
  accountId: string;
  mode: string;
  status: 'succeeded' | 'failed' | 'canceled';
  durationMs: number;
  errorCode?: string;
}

export interface ImportWriteQueueFailureMetadata {
  mode: string;
  stage?: string;
  deadLetterCount: number;
  circuitOpen: boolean;
}

export class ImportMetrics extends MetricsService {
  constructor() {
    super('import_operations');
  }

  recordJobStarted(metadata: ImportJobStartMetadata): void {
    this.incrementCounter('import_jobs_started_total', { mode: metadata.mode });
    this.setGauge('import_job_last_started_at', Date.now());
  }

  recordJobTerminal(metadata: ImportJobTerminalMetadata): void {
    const { mode, status, durationMs, errorCode } = metadata;
    this.incrementCounter('import_jobs_terminal_total', { mode, status });
    this.recordValue('import_job_duration_ms', durationMs, { mode, status });

    if (status === 'failed' && errorCode === 'SCHEMA_MISMATCH') {
      this.incrementCounter('import_schema_mismatch_total', { mode });
    }

    if (status === 'failed' && errorCode === 'IMPORT_STALLED') {
      this.incrementCounter('import_stall_detected_total', { mode });
    }

    if (status === 'failed' && errorCode === 'WRITE_QUEUE_FAILURE') {
      this.incrementCounter('import_hard_zero_violation_total', { mode });
    }
    if (status === 'failed' && errorCode === 'GRAPH_MATERIALIZATION_FAILED') {
      this.incrementCounter('import_graph_materialization_failed_total', { mode });
    }
  }

  recordSchemaMismatch(mode: string = 'unknown'): void {
    this.incrementCounter('import_schema_mismatch_total', { mode });
  }

  recordStallDetected(mode: string = 'unknown'): void {
    this.incrementCounter('import_stall_detected_total', { mode });
  }

  recordWriteQueueIntegrityFailure(metadata: ImportWriteQueueFailureMetadata): void {
    const stage = metadata.stage || 'unknown';
    this.incrementCounter('import_write_queue_integrity_failure_total', {
      mode: metadata.mode,
      stage,
      circuitOpen: String(metadata.circuitOpen),
    });
    if (metadata.deadLetterCount > 0) {
      this.incrementCounter('import_write_queue_dead_letter_total', {
        mode: metadata.mode,
        stage,
      });
    }
    if (metadata.circuitOpen) {
      this.incrementCounter('import_write_queue_circuit_open_total', {
        mode: metadata.mode,
        stage,
      });
    }
    this.incrementCounter('import_hard_zero_violation_total', { mode: metadata.mode });
    this.recordValue('import_write_queue_dead_letter_count', metadata.deadLetterCount, {
      mode: metadata.mode,
      stage,
    });
  }

  getPerformanceSnapshot(): {
    totalStarted: number;
    totalTerminal: number;
    failureRatePercent: number;
    schemaMismatchCount: number;
    stallCount: number;
    hardZeroViolations: number;
    writeQueueIntegrityFailures: number;
    durationP95Ms: number | null;
  } {
    const summary = this.getSummary();
    let started = 0;
    let terminal = 0;
    let failed = 0;
    let schemaMismatch = 0;
    let stalls = 0;
    let hardZeroViolations = 0;
    let writeQueueIntegrityFailures = 0;

    for (const counter of summary.counters) {
      if (counter.name === 'import_jobs_started_total') {
        started += counter.value;
      }
      if (counter.name === 'import_jobs_terminal_total') {
        terminal += counter.value;
        if (counter.labels?.status === 'failed') {
          failed += counter.value;
        }
      }
      if (counter.name === 'import_schema_mismatch_total') {
        schemaMismatch += counter.value;
      }
      if (counter.name === 'import_stall_detected_total') {
        stalls += counter.value;
      }
      if (counter.name === 'import_hard_zero_violation_total') {
        hardZeroViolations += counter.value;
      }
      if (counter.name === 'import_write_queue_integrity_failure_total') {
        writeQueueIntegrityFailures += counter.value;
      }
    }

    const failureRatePercent = terminal > 0 ? (failed / terminal) * 100 : 0;

    return {
      totalStarted: started,
      totalTerminal: terminal,
      failureRatePercent,
      schemaMismatchCount: schemaMismatch,
      stallCount: stalls,
      hardZeroViolations,
      writeQueueIntegrityFailures,
      durationP95Ms: this.getPercentile('import_job_duration_ms', 0.95),
    };
  }
}

let importMetricsInstance: ImportMetrics | null = null;

export function getImportMetrics(): ImportMetrics {
  if (!importMetricsInstance) {
    importMetricsInstance = new ImportMetrics();
  }
  return importMetricsInstance;
}

export function resetImportMetrics(): void {
  if (importMetricsInstance) {
    importMetricsInstance.reset();
  }
  importMetricsInstance = null;
}
