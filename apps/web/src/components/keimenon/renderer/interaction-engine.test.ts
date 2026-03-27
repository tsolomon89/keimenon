import { describe, expect, it } from 'vitest';
import {
  applyDragDeltaForLens,
  applyMarqueeSelection,
  pickNearestEdge,
  selectNodesInMarquee,
} from './interaction-engine';
import type { MarqueeSelectionSession } from './types';

function marquee(startX: number, startY: number, currentX: number, currentY: number): MarqueeSelectionSession {
  return {
    active: true,
    start: { x: startX, y: startY },
    current: { x: currentX, y: currentY },
    modifiers: { shift: false, ctrlOrMeta: false },
  };
}

describe('interaction-engine', () => {
  it('picks nearest edge deterministically for 2D/3D/ND projected geometries', () => {
    const edges = [
      { edgeId: 'edge_2d', source: { x: 10, y: 10 }, target: { x: 110, y: 10 } },
      { edgeId: 'edge_3d', source: { x: 10, y: 50 }, target: { x: 110, y: 70 } },
      { edgeId: 'edge_nd', source: { x: 10, y: 90 }, target: { x: 110, y: 110 } },
    ];

    expect(pickNearestEdge({ x: 55, y: 12 }, edges, 8)).toMatchObject({
      kind: 'edge',
      edgeId: 'edge_2d',
    });
    expect(pickNearestEdge({ x: 55, y: 58 }, edges, 8)).toMatchObject({
      kind: 'edge',
      edgeId: 'edge_3d',
    });
    expect(pickNearestEdge({ x: 55, y: 98 }, edges, 8)).toMatchObject({
      kind: 'edge',
      edgeId: 'edge_nd',
    });
  });

  it('computes marquee node inclusion deterministically', () => {
    const selected = selectNodesInMarquee(
      [
        { nodeId: 'node_a', point: { x: 20, y: 20 } },
        { nodeId: 'node_b', point: { x: 90, y: 30 } },
        { nodeId: 'node_c', point: { x: 140, y: 140 } },
      ],
      marquee(0, 0, 100, 100)
    );
    expect(selected).toEqual(['node_a', 'node_b']);
  });

  it('applies marquee modifier semantics (replace/add/toggle)', () => {
    expect(
      applyMarqueeSelection(['node_a'], ['node_b'], {
        shift: false,
        ctrlOrMeta: false,
      })
    ).toEqual(['node_b']);

    expect(
      applyMarqueeSelection(['node_a'], ['node_b'], {
        shift: true,
        ctrlOrMeta: false,
      })
    ).toEqual(['node_a', 'node_b']);

    expect(
      applyMarqueeSelection(['node_a', 'node_b'], ['node_b', 'node_c'], {
        shift: false,
        ctrlOrMeta: true,
      })
    ).toEqual(['node_a', 'node_c']);
  });

  it('applies drag deltas by lens semantics', () => {
    expect(applyDragDeltaForLens([0, 0, 0], '2d', { dx: 10, dy: 5 }, 1)).toEqual([10, -5, 0]);

    const basis = {
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
    expect(applyDragDeltaForLens([5, 5, 5], '3d', { dx: 10, dy: 4 }, 0.5, basis)).toEqual([
      10,
      3,
      5,
    ]);
    expect(applyDragDeltaForLens([2, 3, 4], 'nd', { dx: -8, dy: 6 }, 0.25, basis)).toEqual([
      0,
      1.5,
      4,
    ]);
  });
});

