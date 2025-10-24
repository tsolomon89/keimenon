/**
 * Job Aggregate Root
 *
 * Core domain entity representing a background job.
 * Encapsulates all business logic for job lifecycle management.
 *
 * Invariants enforced:
 * - Job ID is immutable and unique
 * - State transitions follow JobStateMachine rules
 * - Events are append-only and ordered by sequence number
 * - Account ID is immutable (multi-tenant isolation)
 * - Config is immutable once set
 *
 * Related: Product Directive - "Jobs as first-class citizens"
 */

import { JobStateMachine, JobState, JobStatus, JobTransition } from './JobStateMachine';
import { JobEvent, JobEventBuilder, JobEventData, JobEventType } from './JobEvent';

export type JobType = 'import' | 'delete' | 'export' | 'analyze';

export interface JobConfig {
  // Import job config
  files?: Array<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    filePath?: string; // Path to temp file for processing
  }>;
  importOptions?: {
    platform?: string;
    exportCode?: boolean;
    codeMinChars?: number;
  };

  // Delete job config
  deleteScope?: 'canvas' | 'all-clients';

  // Export job config
  exportFormat?: 'json' | 'csv' | 'markdown';
  exportScope?: string; // scope_id

  // Common config
  metadata?: Record<string, unknown>;
}

export interface JobSpec {
  type: JobType;
  accountId: string;
  createdBy: string; // user_id
  config: JobConfig;
  idempotencyKey?: string;
  concurrencyGroup?: string;
}

/**
 * Job Aggregate Root
 */
export class Job {
  // Immutable properties
  readonly id: string;
  readonly type: JobType;
  readonly accountId: string;
  readonly createdBy: string;
  readonly config: JobConfig;
  readonly idempotencyKey?: string;
  readonly concurrencyGroup?: string;

  // Mutable state (via state machine)
  private _state: JobState;

  // Event log (append-only)
  private _events: JobEvent[] = [];
  private _sequenceNumber: number = 0;

  // Progress tracking
  private _progress: {
    current: number;
    total: number;
    message?: string;
  } = { current: 0, total: 0 };

  constructor(props: {
    id: string;
    type: JobType;
    accountId: string;
    createdBy: string;
    config: JobConfig;
    idempotencyKey?: string;
    concurrencyGroup?: string;
    state?: JobState;
    events?: JobEvent[];
  }) {
    this.id = props.id;
    this.type = props.type;
    this.accountId = props.accountId;
    this.createdBy = props.createdBy;
    this.config = Object.freeze({ ...props.config }); // Immutable config
    this.idempotencyKey = props.idempotencyKey;
    this.concurrencyGroup = props.concurrencyGroup;

    this._state = props.state || JobStateMachine.initialState();
    this._events = props.events || [];
    this._sequenceNumber = this._events.length;

    // Validate state
    const validation = JobStateMachine.validate(this._state);
    if (!validation.valid) {
      throw new Error(`Invalid job state: ${validation.errors.join(', ')}`);
    }
  }

  // ============================================================================
  // Factory Methods
  // ============================================================================

  /**
   * Create a new job
   */
  static create(spec: JobSpec): Job {
    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const initialState = JobStateMachine.initialState();

    const job = new Job({
      id,
      type: spec.type,
      accountId: spec.accountId,
      createdBy: spec.createdBy,
      config: spec.config,
      idempotencyKey: spec.idempotencyKey,
      concurrencyGroup: spec.concurrencyGroup,
      state: initialState,
      events: [],
    });

    // Add queued event
    job.addEvent(JobEventBuilder.queued(job.id, job._sequenceNumber));

    return job;
  }

  // ============================================================================
  // State Machine Operations
  // ============================================================================

  /**
   * Start the job (queued → running)
   */
  start(): void {
    this.transitionTo('start');
    this.addEvent(JobEventBuilder.started(this.id, this._sequenceNumber));
  }

  /**
   * Mark job as succeeded (running → succeeded)
   */
  succeed(message?: string): void {
    this.transitionTo('succeed');
    this.addEvent(JobEventBuilder.succeeded(this.id, this._sequenceNumber, message));
  }

  /**
   * Mark job as failed (running → failed)
   */
  fail(error: { code: string; message: string; stack?: string }): void {
    this.transitionTo('fail', { error });
    this.addEvent(JobEventBuilder.failed(this.id, error, this._sequenceNumber));
  }

  /**
   * Cancel the job (queued|running → canceled)
   */
  cancel(message?: string): void {
    this.transitionTo('cancel');
    this.addEvent(JobEventBuilder.canceled(this.id, this._sequenceNumber, message));
  }

  /**
   * Block the job (running → blocked)
   */
  block(reason: string): void {
    this.transitionTo('block', { blockedReason: reason });
    this.addEvent(JobEventBuilder.blocked(this.id, this._sequenceNumber, reason));
  }

  /**
   * Retry blocked job (blocked → queued)
   */
  retry(): void {
    this.transitionTo('retry');
    this.addEvent(JobEventBuilder.queued(this.id, this._sequenceNumber));
  }

  /**
   * Pause the job (convenience method for block)
   * Allows user to temporarily stop a running job
   */
  pause(): void {
    this.block('User paused job');
  }

  /**
   * Resume a paused job (convenience method for retry)
   * Allows user to restart a paused job
   */
  resume(): void {
    this.retry();
  }

  /**
   * Check if job is paused
   */
  get isPaused(): boolean {
    return this._state.status === 'blocked';
  }

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  /**
   * Update progress
   */
  updateProgress(current: number, total: number, message?: string): void {
    // Only update if job is running
    if (this._state.status !== 'running') {
      throw new Error(`Cannot update progress for job in status: ${this._state.status}`);
    }

    this._progress = { current, total, message };

    // Add progress event
    this.addEvent(JobEventBuilder.progress(this.id, current, total, this._sequenceNumber, message));
  }

  /**
   * Report item started
   */
  itemStarted(itemId: string, itemType: string): void {
    if (this._state.status !== 'running') {
      throw new Error(`Cannot report item progress for job in status: ${this._state.status}`);
    }

    this.addEvent(JobEventBuilder.itemStarted(this.id, itemId, itemType, this._sequenceNumber));
  }

  /**
   * Report item completed
   */
  itemCompleted(itemId: string, itemType: string): void {
    if (this._state.status !== 'running') {
      throw new Error(`Cannot report item progress for job in status: ${this._state.status}`);
    }

    this.addEvent(JobEventBuilder.itemCompleted(this.id, itemId, itemType, this._sequenceNumber));
  }

  /**
   * Report item failed
   */
  itemFailed(itemId: string, itemType: string, error: { code: string; message: string }): void {
    if (this._state.status !== 'running') {
      throw new Error(`Cannot report item progress for job in status: ${this._state.status}`);
    }

    this.addEvent(
      JobEventBuilder.itemFailed(this.id, itemId, itemType, error, this._sequenceNumber)
    );
  }

  // ============================================================================
  // Getters
  // ============================================================================

  get status(): JobStatus {
    return this._state.status;
  }

  get state(): JobState {
    return { ...this._state }; // Return copy to prevent mutation
  }

  get events(): JobEvent[] {
    return [...this._events]; // Return copy
  }

  get progress(): { current: number; total: number; percent: number; message?: string } {
    const percent =
      this._progress.total > 0
        ? Math.round((this._progress.current / this._progress.total) * 100)
        : 0;

    return {
      current: this._progress.current,
      total: this._progress.total,
      percent,
      message: this._progress.message,
    };
  }

  get isTerminal(): boolean {
    return JobStateMachine.isTerminal(this._state.status);
  }

  get canStart(): boolean {
    return JobStateMachine.canTransition(this._state.status, 'start');
  }

  get canCancel(): boolean {
    return JobStateMachine.canTransition(this._state.status, 'cancel');
  }

  get canPause(): boolean {
    return JobStateMachine.canTransition(this._state.status, 'block');
  }

  get canResume(): boolean {
    return JobStateMachine.canTransition(this._state.status, 'retry');
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Serialize to JSON for storage
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      accountId: this.accountId,
      createdBy: this.createdBy,
      config: this.config,
      idempotencyKey: this.idempotencyKey,
      concurrencyGroup: this.concurrencyGroup,
      state: {
        status: this._state.status,
        queuedAt: this._state.queuedAt?.toISOString(),
        startedAt: this._state.startedAt?.toISOString(),
        completedAt: this._state.completedAt?.toISOString(),
        canceledAt: this._state.canceledAt?.toISOString(),
        blockedAt: this._state.blockedAt?.toISOString(),
        error: this._state.error,
        blockedReason: this._state.blockedReason,
        retryCount: this._state.retryCount,
      },
      progress: this.progress,
      eventsCount: this._events.length,
    };
  }

  /**
   * Deserialize from database record
   */
  static fromDatabase(record: {
    id: string;
    type: JobType;
    account_id: string;
    created_by: string;
    config: string;
    status: JobStatus;
    state_data: string;
    idempotency_key?: string;
    concurrency_group?: string;
  }): Job {
    const config = JSON.parse(record.config);
    const stateData = JSON.parse(record.state_data);

    const state: JobState = {
      status: record.status,
      queuedAt: stateData.queuedAt ? new Date(stateData.queuedAt) : undefined,
      startedAt: stateData.startedAt ? new Date(stateData.startedAt) : undefined,
      completedAt: stateData.completedAt ? new Date(stateData.completedAt) : undefined,
      canceledAt: stateData.canceledAt ? new Date(stateData.canceledAt) : undefined,
      blockedAt: stateData.blockedAt ? new Date(stateData.blockedAt) : undefined,
      error: stateData.error,
      blockedReason: stateData.blockedReason,
      retryCount: stateData.retryCount,
    };

    return new Job({
      id: record.id,
      type: record.type,
      accountId: record.account_id,
      createdBy: record.created_by,
      config,
      idempotencyKey: record.idempotency_key,
      concurrencyGroup: record.concurrency_group,
      state,
      events: [], // Events loaded separately
    });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private transitionTo(transition: JobTransition, data?: Partial<JobState>): void {
    const oldStatus = this._state.status;
    this._state = JobStateMachine.transition(this._state, transition, data);
    const newStatus = this._state.status;

    console.log(
      `[Job ${this.id}] State transition: ${oldStatus} → ${newStatus} (via '${transition}')`
    );

    // Log additional context for certain transitions
    if (transition === 'fail' && data?.error) {
      console.log(`[Job ${this.id}]   Error: ${data.error.message}`);
    }
    if (transition === 'block' && data?.blockedReason) {
      console.log(`[Job ${this.id}]   Blocked: ${data.blockedReason}`);
    }
  }

  private addEvent(event: JobEvent): void {
    this._events.push(event);
    this._sequenceNumber++;
  }
}
