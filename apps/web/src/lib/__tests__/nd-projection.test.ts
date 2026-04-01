import { describe, expect, it } from 'vitest';
import type { GraphNode } from '@keimenon/graph';
import {
  DEFAULT_ND_CONFIG,
  deterministicNodePlanePosition,
  passesNdSlice,
  projectNodeVector,
  resolveNodeVector,
} from '@/lib/nd-projection';

describe('nd-projection', () => {
  it('is deterministic for synthesized vectors', () => {
    const node: GraphNode = {
      id: 'node_a',
      kind: 'Source',
    };

    const first = resolveNodeVector(node, 8);
    const second = resolveNodeVector(node, 8);
    expect(first).toEqual(second);
  });

  it('prefers explicit embedding vectors when present', () => {
    const node = {
      id: 'node_b',
      kind: 'Source',
      metadata: {
        embedding: [1, 2, 3, 4, 5, 6, 7, 8],
      },
    } as unknown as GraphNode;

    const vector = resolveNodeVector(node, 8);
    expect(vector.length).toBe(8);
    expect(vector[0]).not.toBe(0);
  });

  it('projects vectors into deterministic 3d coordinates', () => {
    const vector = [0.1, -0.2, 0.3, 0.4, 0.5, 0.6, -0.7, 0.8];
    const projected = projectNodeVector(vector, DEFAULT_ND_CONFIG);
    expect(projected).toEqual({
      x: 32,
      y: -64,
      z: 96,
    });
  });

  it('applies ND slice filtering with canonical defaults', () => {
    const passVector = [0, 0, 0, 0.1, 0, 0, 0, 0];
    const failVector = [0, 0, 0, 0.8, 0, 0, 0, 0];

    expect(passesNdSlice(passVector, DEFAULT_ND_CONFIG)).toBe(true);
    expect(passesNdSlice(failVector, DEFAULT_ND_CONFIG)).toBe(false);
  });

  it('provides deterministic fallback plane coordinates', () => {
    const node: GraphNode = { id: 'node_c', kind: 'Topic' };
    const first = deterministicNodePlanePosition(node);
    const second = deterministicNodePlanePosition(node);
    expect(first).toEqual(second);
  });
});
