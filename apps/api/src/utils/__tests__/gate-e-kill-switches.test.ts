import { afterEach, describe, expect, it } from 'vitest';
import {
  isObjectiveEnqueueKillSwitchEnabled,
  isSemanticStageKillSwitchEnabled,
} from '../gate-e-kill-switches';

const ORIGINAL_OBJECTIVE_SWITCH = process.env.KILL_SWITCH_OBJECTIVE_ENQUEUE;
const ORIGINAL_SEMANTIC_SWITCH = process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE;

describe('Gate E kill switches', () => {
  afterEach(() => {
    if (typeof ORIGINAL_OBJECTIVE_SWITCH === 'undefined') {
      delete process.env.KILL_SWITCH_OBJECTIVE_ENQUEUE;
    } else {
      process.env.KILL_SWITCH_OBJECTIVE_ENQUEUE = ORIGINAL_OBJECTIVE_SWITCH;
    }

    if (typeof ORIGINAL_SEMANTIC_SWITCH === 'undefined') {
      delete process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE;
    } else {
      process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE = ORIGINAL_SEMANTIC_SWITCH;
    }
  });

  it('defaults both kill switches to disabled', () => {
    delete process.env.KILL_SWITCH_OBJECTIVE_ENQUEUE;
    delete process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE;

    expect(isObjectiveEnqueueKillSwitchEnabled()).toBe(false);
    expect(isSemanticStageKillSwitchEnabled()).toBe(false);
  });

  it('accepts common truthy forms', () => {
    process.env.KILL_SWITCH_OBJECTIVE_ENQUEUE = '1';
    process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE = 'true';
    expect(isObjectiveEnqueueKillSwitchEnabled()).toBe(true);
    expect(isSemanticStageKillSwitchEnabled()).toBe(true);

    process.env.KILL_SWITCH_OBJECTIVE_ENQUEUE = 'ON';
    process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE = 'Yes';
    expect(isObjectiveEnqueueKillSwitchEnabled()).toBe(true);
    expect(isSemanticStageKillSwitchEnabled()).toBe(true);
  });

  it('treats unknown values as disabled', () => {
    process.env.KILL_SWITCH_OBJECTIVE_ENQUEUE = 'nope';
    process.env.KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE = '0';
    expect(isObjectiveEnqueueKillSwitchEnabled()).toBe(false);
    expect(isSemanticStageKillSwitchEnabled()).toBe(false);
  });
});
