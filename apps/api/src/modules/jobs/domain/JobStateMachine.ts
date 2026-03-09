/**
 * Job State Machine
 *
 * Formal state machine enforcing legal transitions.
 * Prevents impossible states and ensures invariants hold.
 *
 * State diagram:
 *
 *   queued → running → succeeded
 *     ↓        ↓           ↓
 *  blocked → failed    canceled
 *     ↑
 *     └─ retry
 *
 * Legal transitions:
 * - queued → running (start)
 * - queued → canceled (cancel before start)
 * - queued → blocked (concurrency conflict before start)
 * - running → succeeded (complete successfully)
 * - running → failed (error occurred)
 * - running → canceled (user canceled)
 * - blocked → queued (retry after unblock)
 * - blocked → canceled (user canceled blocked job)
 *
 * Illegal transitions (will throw):
 * - succeeded → * (terminal state)
 * - failed → * (terminal state)
 * - canceled → * (terminal state)
 */

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'blocked';

export type JobTransition = 'start' | 'succeed' | 'fail' | 'cancel' | 'block' | 'retry';

export interface JobState {
  status: JobStatus;
  queuedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  canceledAt?: Date;
  blockedAt?: Date;
  error?: {
    code: string;
    message: string;
    stack?: string;
    details?: Record<string, unknown>;
  };
  blockedReason?: string;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * State Machine Definition
 */
export class JobStateMachine {
  // Define legal transitions
  private static readonly TRANSITIONS: Record<JobStatus, Record<JobTransition, JobStatus | null>> =
    {
      queued: {
        start: 'running',
        succeed: null, // illegal
        fail: null, // illegal
        cancel: 'canceled',
        block: 'blocked', // job blocked by concurrency before starting
        retry: null, // illegal (already queued)
      },
      running: {
        start: null, // illegal (already running)
        succeed: 'succeeded',
        fail: 'failed',
        cancel: 'canceled',
        block: 'blocked',
        retry: null, // illegal (can't retry while running)
      },
      succeeded: {
        start: null, // terminal state
        succeed: null, // terminal state
        fail: null, // terminal state
        cancel: null, // terminal state
        block: null, // terminal state
        retry: null, // terminal state
      },
      failed: {
        start: null, // terminal state
        succeed: null, // terminal state
        fail: null, // terminal state
        cancel: null, // terminal state
        block: null, // terminal state
        retry: null, // terminal state
      },
      canceled: {
        start: null, // terminal state
        succeed: null, // terminal state
        fail: null, // terminal state
        cancel: null, // terminal state
        block: null, // terminal state
        retry: null, // terminal state
      },
      blocked: {
        start: null, // illegal (must retry first)
        succeed: null, // illegal
        fail: null, // illegal
        cancel: 'canceled', // user can cancel blocked job
        block: null, // illegal (already blocked)
        retry: 'queued', // unblock and re-queue
      },
    };

  // Terminal states (cannot transition from)
  private static readonly TERMINAL_STATES: JobStatus[] = ['succeeded', 'failed', 'canceled'];

  /**
   * Attempt a state transition
   *
   * @throws {Error} if transition is illegal
   */
  static transition(
    currentState: JobState,
    transition: JobTransition,
    data?: Partial<JobState>
  ): JobState {
    const currentStatus = currentState.status;
    const nextStatus = this.TRANSITIONS[currentStatus][transition];

    // Check if transition is legal
    if (nextStatus === null) {
      throw new Error(`Illegal transition: cannot '${transition}' from status '${currentStatus}'`);
    }

    // Build new state based on transition
    const newState: JobState = {
      ...currentState,
      status: nextStatus,
    };

    // Update timestamps and metadata based on transition
    switch (transition) {
      case 'start':
        newState.startedAt = new Date();
        break;

      case 'succeed':
        newState.completedAt = new Date();
        break;

      case 'fail':
        newState.completedAt = new Date();
        if (data?.error) {
          newState.error = data.error;
        }
        break;

      case 'cancel':
        newState.canceledAt = new Date();
        break;

      case 'block':
        newState.blockedAt = new Date();
        if (data?.blockedReason) {
          newState.blockedReason = data.blockedReason;
        }
        break;

      case 'retry':
        newState.retryCount = (currentState.retryCount || 0) + 1;
        newState.blockedAt = undefined;
        newState.blockedReason = undefined;
        break;
    }

    return newState;
  }

  /**
   * Check if a transition is legal
   */
  static canTransition(currentStatus: JobStatus, transition: JobTransition): boolean {
    return this.TRANSITIONS[currentStatus][transition] !== null;
  }

  /**
   * Check if status is terminal (no further transitions allowed)
   */
  static isTerminal(status: JobStatus): boolean {
    return this.TERMINAL_STATES.includes(status);
  }

  /**
   * Get all legal transitions from current status
   */
  static getLegalTransitions(status: JobStatus): JobTransition[] {
    const transitions = this.TRANSITIONS[status];
    return Object.entries(transitions)
      .filter(([_, nextStatus]) => nextStatus !== null)
      .map(([transition, _]) => transition as JobTransition);
  }

  /**
   * Create initial state for new job
   */
  static initialState(): JobState {
    return {
      status: 'queued',
      queuedAt: new Date(),
      retryCount: 0,
    };
  }

  /**
   * Validate state invariants
   *
   * Ensures state is consistent (e.g., running jobs have startedAt)
   */
  static validate(state: JobState): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Running jobs must have startedAt
    if (state.status === 'running' && !state.startedAt) {
      errors.push('Running job must have startedAt timestamp');
    }

    // Completed jobs must have completedAt
    if ((state.status === 'succeeded' || state.status === 'failed') && !state.completedAt) {
      errors.push('Completed job must have completedAt timestamp');
    }

    // Failed jobs must have error
    if (state.status === 'failed' && !state.error) {
      errors.push('Failed job must have error details');
    }

    // Blocked jobs must have blockedReason
    if (state.status === 'blocked' && !state.blockedReason) {
      errors.push('Blocked job must have blockedReason');
    }

    // Canceled jobs must have canceledAt
    if (state.status === 'canceled' && !state.canceledAt) {
      errors.push('Canceled job must have canceledAt timestamp');
    }

    // All jobs must have queuedAt
    if (!state.queuedAt) {
      errors.push('Job must have queuedAt timestamp');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
