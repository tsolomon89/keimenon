import { describe, expect, it } from 'vitest';
import { evaluateObjectiveQueueDecision } from './ImportWorker';

describe('ImportWorker objective queue decision', () => {
  it('enqueues when entitlements are enabled and kill switch is disabled', () => {
    const decision = evaluateObjectiveQueueDecision({
      objectiveLayerEnabled: true,
      agentRuntimeEnabled: true,
      agentBootstrapMode: 'auto',
      objectiveEnqueueKillSwitchEnabled: false,
    });

    expect(decision).toEqual({
      shouldEnqueue: true,
      reason: 'enabled',
    });
  });

  it('skips enqueue when entitlements are missing', () => {
    const decision = evaluateObjectiveQueueDecision({
      objectiveLayerEnabled: true,
      agentRuntimeEnabled: false,
      agentBootstrapMode: 'auto',
      objectiveEnqueueKillSwitchEnabled: false,
    });

    expect(decision).toEqual({
      shouldEnqueue: false,
      reason: 'entitlement_missing',
    });
  });

  it('skips enqueue when kill switch is enabled', () => {
    const decision = evaluateObjectiveQueueDecision({
      objectiveLayerEnabled: true,
      agentRuntimeEnabled: true,
      agentBootstrapMode: 'auto',
      objectiveEnqueueKillSwitchEnabled: true,
    });

    expect(decision).toEqual({
      shouldEnqueue: false,
      reason: 'kill_switch_enabled',
    });
  });

  it('skips enqueue when manual activation is required', () => {
    const decision = evaluateObjectiveQueueDecision({
      objectiveLayerEnabled: true,
      agentRuntimeEnabled: true,
      agentBootstrapMode: 'manual',
      objectiveEnqueueKillSwitchEnabled: false,
    });

    expect(decision).toEqual({
      shouldEnqueue: false,
      reason: 'manual_activation_required',
    });
  });

  it('prioritizes kill switch over bootstrap mode', () => {
    const decision = evaluateObjectiveQueueDecision({
      objectiveLayerEnabled: true,
      agentRuntimeEnabled: true,
      agentBootstrapMode: 'manual',
      objectiveEnqueueKillSwitchEnabled: true,
    });

    expect(decision).toEqual({
      shouldEnqueue: false,
      reason: 'kill_switch_enabled',
    });
  });
});
