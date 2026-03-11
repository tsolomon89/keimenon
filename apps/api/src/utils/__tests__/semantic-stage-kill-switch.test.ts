import { describe, expect, it } from 'vitest';
import { applySemanticStageKillSwitchToEdges } from '../semantic-stage-kill-switch';

describe('applySemanticStageKillSwitchToEdges', () => {
  it('zeroes semantic score and recomputes total/strength deterministically', () => {
    const edges = [
      {
        lexical: 0.8,
        structural: 0.6,
        semantic: 0.9,
        flow: 0.4,
        total: 0.0,
        strength: 'weak' as const,
      },
    ];

    const result = applySemanticStageKillSwitchToEdges(edges);
    expect(result[0].semantic).toBe(0);
    expect(result[0].total).toBeCloseTo(0.538462 * 0.8 + 0.307692 * 0.6 + 0.153846 * 0.4, 5);
    expect(result[0].strength).toBe('medium');
  });
});
