/**
 * Job Event Value Objects
 *
 * Immutable events representing state changes in Job lifecycle.
 * Forms the basis for event sourcing and audit trail.
 *
 * See: ai_context/schemas/Job.json (when created)
 */

import { ImportJobStage } from '@keimenon/types';

export type JobEventType =
  | 'job.queued'
  | 'job.started'
  | 'job.progress'
  | 'job.item.started'
  | 'job.item.completed'
  | 'job.item.failed'
  | 'job.succeeded'
  | 'job.failed'
  | 'job.canceled'
  | 'job.blocked';

export interface JobEventData {
  // Common fields
  message?: string;

  // Progress event fields
  progress?: {
    current: number;
    total: number;
    percent: number;
    stage?: ImportJobStage | string;
    metadata?: Record<string, unknown>;
  };

  // Item event fields
  itemId?: string;
  itemType?: string;

  // Error event fields
  error?: {
    code: string;
    message: string;
    stack?: string;
    details?: Record<string, unknown>;
  };

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * JobEvent Value Object
 *
 * Immutable event record. Once created, cannot be modified.
 */
export class JobEvent {
  readonly id: string;
  readonly jobId: string;
  readonly type: JobEventType;
  readonly timestamp: Date;
  readonly data: JobEventData;
  readonly sequenceNumber: number;

  constructor(props: {
    id: string;
    jobId: string;
    type: JobEventType;
    timestamp: Date;
    data: JobEventData;
    sequenceNumber: number;
  }) {
    this.id = props.id;
    this.jobId = props.jobId;
    this.type = props.type;
    this.timestamp = props.timestamp;
    this.data = Object.freeze({ ...props.data }); // Deep freeze data
    this.sequenceNumber = props.sequenceNumber;

    Object.freeze(this); // Make instance immutable
  }

  /**
   * Factory method for creating new events
   */
  static create(
    jobId: string,
    type: JobEventType,
    data: JobEventData,
    sequenceNumber: number
  ): JobEvent {
    const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return new JobEvent({
      id,
      jobId,
      type,
      timestamp: new Date(),
      data,
      sequenceNumber,
    });
  }

  /**
   * Serialize to JSON for storage
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      jobId: this.jobId,
      type: this.type,
      timestamp: this.timestamp.toISOString(),
      data: this.data,
      sequenceNumber: this.sequenceNumber,
    };
  }

  /**
   * Deserialize from JSON storage
   */
  static fromJSON(json: Record<string, unknown>): JobEvent {
    return new JobEvent({
      id: json.id as string,
      jobId: json.jobId as string,
      type: json.type as JobEventType,
      timestamp: new Date(json.timestamp as string),
      data: json.data as JobEventData,
      sequenceNumber: json.sequenceNumber as number,
    });
  }
}

/**
 * Event builder for common event patterns
 */
export class JobEventBuilder {
  static queued(jobId: string, sequenceNumber: number): JobEvent {
    return JobEvent.create(jobId, 'job.queued', {}, sequenceNumber);
  }

  static started(jobId: string, sequenceNumber: number): JobEvent {
    return JobEvent.create(jobId, 'job.started', {}, sequenceNumber);
  }

  static progress(
    jobId: string,
    current: number,
    total: number,
    sequenceNumber: number,
    message?: string,
    stage?: ImportJobStage | string,
    metadata?: Record<string, unknown>
  ): JobEvent {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;

    return JobEvent.create(
      jobId,
      'job.progress',
      {
        progress: { current, total, percent, stage, metadata },
        message,
      },
      sequenceNumber
    );
  }

  static succeeded(jobId: string, sequenceNumber: number, message?: string): JobEvent {
    return JobEvent.create(jobId, 'job.succeeded', { message }, sequenceNumber);
  }

  static failed(
    jobId: string,
    error: { code: string; message: string; stack?: string; details?: Record<string, unknown> },
    sequenceNumber: number
  ): JobEvent {
    return JobEvent.create(jobId, 'job.failed', { error }, sequenceNumber);
  }

  static canceled(jobId: string, sequenceNumber: number, message?: string): JobEvent {
    return JobEvent.create(jobId, 'job.canceled', { message }, sequenceNumber);
  }

  static blocked(jobId: string, sequenceNumber: number, message: string): JobEvent {
    return JobEvent.create(jobId, 'job.blocked', { message }, sequenceNumber);
  }

  static itemStarted(
    jobId: string,
    itemId: string,
    itemType: string,
    sequenceNumber: number
  ): JobEvent {
    return JobEvent.create(jobId, 'job.item.started', { itemId, itemType }, sequenceNumber);
  }

  static itemCompleted(
    jobId: string,
    itemId: string,
    itemType: string,
    sequenceNumber: number
  ): JobEvent {
    return JobEvent.create(jobId, 'job.item.completed', { itemId, itemType }, sequenceNumber);
  }

  static itemFailed(
    jobId: string,
    itemId: string,
    itemType: string,
    error: { code: string; message: string },
    sequenceNumber: number
  ): JobEvent {
    return JobEvent.create(jobId, 'job.item.failed', { itemId, itemType, error }, sequenceNumber);
  }
}
