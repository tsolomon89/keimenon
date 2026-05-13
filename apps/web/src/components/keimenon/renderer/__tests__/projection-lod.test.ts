import { describe, expect, it } from 'vitest';
import { buildNeighborhood, type GraphEdgeWithData } from '../projection-lod';

describe('projection-lod', () => {
  describe('buildNeighborhood', () => {
    it('computes a 2-hop neighborhood correctly', () => {
      const edges: GraphEdgeWithData[] = [
        { id: 'e1', source: 'A', target: 'B', kind: 'LINK' },
        { id: 'e2', source: 'B', target: 'C', kind: 'LINK' },
        { id: 'e3', source: 'C', target: 'D', kind: 'LINK' },
        { id: 'e4', source: 'A', target: 'X', kind: 'LINK' },
      ] as GraphEdgeWithData[];

      // 2-hop neighborhood of A:
      // Hop 1: B, X
      // Hop 2: C
      // D is 3 hops away
      const neighborhood = buildNeighborhood('A', edges, 2);

      expect(neighborhood.has('A')).toBe(true);
      expect(neighborhood.has('B')).toBe(true);
      expect(neighborhood.has('X')).toBe(true);
      expect(neighborhood.has('C')).toBe(true);
      expect(neighborhood.has('D')).toBe(false);
    });

    it('computes a 1-hop neighborhood correctly', () => {
      const edges: GraphEdgeWithData[] = [
        { id: 'e1', source: 'A', target: 'B', kind: 'LINK' },
        { id: 'e2', source: 'B', target: 'C', kind: 'LINK' },
      ] as GraphEdgeWithData[];

      const neighborhood = buildNeighborhood('A', edges, 1);

      expect(neighborhood.has('A')).toBe(true);
      expect(neighborhood.has('B')).toBe(true);
      expect(neighborhood.has('C')).toBe(false);
    });

    it('returns only the node itself if no edges connect to it', () => {
      const edges: GraphEdgeWithData[] = [
        { id: 'e1', source: 'B', target: 'C', kind: 'LINK' },
      ] as GraphEdgeWithData[];

      const neighborhood = buildNeighborhood('A', edges, 2);

      expect(neighborhood.has('A')).toBe(true);
      expect(neighborhood.size).toBe(1);
    });
  });
});
