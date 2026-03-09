import { describe, expect, it } from 'vitest';
import { JobStateMachine, type JobStatus, type JobTransition } from './JobStateMachine';

function expectIllegalTransition(state: JobStatus, transition: JobTransition): void {
  expect(() =>
    JobStateMachine.transition(
      {
        ...JobStateMachine.initialState(),
        status: state,
      },
      transition
    )
  ).toThrowError(new RegExp(`Illegal transition: cannot '${transition}' from status '${state}'`));
}

describe('JobStateMachine regression matrix', () => {
  it('keeps terminal states sticky and disallows all outgoing transitions', () => {
    const terminalStates: JobStatus[] = ['succeeded', 'failed', 'canceled'];
    const allTransitions: JobTransition[] = [
      'start',
      'succeed',
      'fail',
      'cancel',
      'block',
      'retry',
    ];

    for (const status of terminalStates) {
      expect(JobStateMachine.isTerminal(status)).toBe(true);
      expect(JobStateMachine.getLegalTransitions(status)).toEqual([]);

      for (const transition of allTransitions) {
        expect(JobStateMachine.canTransition(status, transition)).toBe(false);
        expectIllegalTransition(status, transition);
      }
    }
  });

  it('exposes exact legal transitions for non-terminal states', () => {
    expect(JobStateMachine.getLegalTransitions('queued').sort()).toEqual(
      ['start', 'cancel', 'block'].sort()
    );
    expect(JobStateMachine.getLegalTransitions('running').sort()).toEqual(
      ['succeed', 'fail', 'cancel', 'block'].sort()
    );
    expect(JobStateMachine.getLegalTransitions('blocked').sort()).toEqual(
      ['cancel', 'retry'].sort()
    );
  });

  it('prevents illegal transition regressions (blocked -> start, queued -> retry, running -> retry)', () => {
    expectIllegalTransition('blocked', 'start');
    expectIllegalTransition('queued', 'retry');
    expectIllegalTransition('running', 'retry');
  });

  it('preserves retry semantics and clears block metadata on blocked -> queued', () => {
    const blockedState = {
      ...JobStateMachine.initialState(),
      status: 'blocked' as const,
      blockedAt: new Date(),
      blockedReason: 'Paused by user',
      retryCount: 2,
    };

    const retried = JobStateMachine.transition(blockedState, 'retry');
    expect(retried.status).toBe('queued');
    expect(retried.retryCount).toBe(3);
    expect(retried.blockedAt).toBeUndefined();
    expect(retried.blockedReason).toBeUndefined();
  });

  it('attaches timestamps/errors for terminal transitions without mutating prior state', () => {
    const runningState = JobStateMachine.transition(JobStateMachine.initialState(), 'start');
    const failedState = JobStateMachine.transition(runningState, 'fail', {
      error: {
        code: 'SCHEMA_MISMATCH',
        message: 'schema mismatch before deep pipeline',
      },
    });

    expect(failedState.status).toBe('failed');
    expect(failedState.completedAt).toBeInstanceOf(Date);
    expect(failedState.error).toEqual({
      code: 'SCHEMA_MISMATCH',
      message: 'schema mismatch before deep pipeline',
    });

    // Validate sticky terminal state guard after fail.
    expect(() => JobStateMachine.transition(failedState, 'start')).toThrow();
    expect(failedState.status).toBe('failed');
  });
});
