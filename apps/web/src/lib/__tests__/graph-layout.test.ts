import { describe, it, expect } from 'vitest';
import {
  computeDeterministicPositions,
  computeSingleNodePosition,
  HIERARCHY_RING_RADII,
  KIND_TO_SHELL,
  type LayoutNode,
  type LayoutEdge,
} from '../graph-layout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, kind: string, x?: number, y?: number): LayoutNode {
  return { id, kind, x, y };
}

function makeEdge(source: string, target: string, kind: string): LayoutEdge {
  return { source, target, kind };
}

function distance(pos: { x: number; y: number }): number {
  return Math.sqrt(pos.x * pos.x + pos.y * pos.y);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeDeterministicPositions', () => {
  it('returns identical positions for the same input on every call', () => {
    const nodes = [
      makeNode('acct-1', 'AccountNode'),
      makeNode('principal-1', 'Principal'),
      makeNode('group-1', 'Group'),
      makeNode('source-1', 'Source'),
      makeNode('topic-1', 'Topic'),
    ];
    const edges = [
      makeEdge('principal-1', 'acct-1', 'OWNED_BY'),
      makeEdge('source-1', 'group-1', 'IN_GROUP'),
    ];

    const positionsA = computeDeterministicPositions(nodes, edges);
    const positionsB = computeDeterministicPositions(nodes, edges);

    expect(positionsA.size).toBe(nodes.length);
    for (const [id, posA] of positionsA.entries()) {
      const posB = positionsB.get(id)!;
      expect(posA.x).toBe(posB.x);
      expect(posA.y).toBe(posB.y);
    }
  });

  it('places AccountNode at origin', () => {
    const nodes = [makeNode('acct-1', 'AccountNode')];
    const positions = computeDeterministicPositions(nodes, []);
    const pos = positions.get('acct-1')!;
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it('places Principal nodes in shell 1 (near radius 80)', () => {
    const nodes = [
      makeNode('acct-1', 'AccountNode'),
      makeNode('p1', 'Principal'),
      makeNode('p2', 'Principal'),
    ];
    const edges = [makeEdge('p1', 'acct-1', 'OWNED_BY'), makeEdge('p2', 'acct-1', 'OWNED_BY')];

    const positions = computeDeterministicPositions(nodes, edges);
    const r1 = distance(positions.get('p1')!);
    const r2 = distance(positions.get('p2')!);

    // Should be near shell 1 radius (80) ± 15% jitter
    const expectedRadius = HIERARCHY_RING_RADII[1];
    const tolerance = expectedRadius * 0.2;
    expect(r1).toBeGreaterThan(expectedRadius - tolerance);
    expect(r1).toBeLessThan(expectedRadius + tolerance);
    expect(r2).toBeGreaterThan(expectedRadius - tolerance);
    expect(r2).toBeLessThan(expectedRadius + tolerance);
  });

  it('places Group, Source, and Topic nodes at distinct radial shells', () => {
    const nodes = [
      makeNode('acct-1', 'AccountNode'),
      makeNode('g1', 'Group'),
      makeNode('s1', 'Source'),
      makeNode('t1', 'Topic'),
    ];

    const positions = computeDeterministicPositions(nodes, []);
    const rGroup = distance(positions.get('g1')!);
    const rSource = distance(positions.get('s1')!);
    const rTopic = distance(positions.get('t1')!);

    // Each shell should be at progressively larger radii
    expect(rGroup).toBeLessThan(rSource);
    expect(rSource).toBeLessThan(rTopic);
  });

  it('preserves explicit x/y positions when provided', () => {
    const nodes = [makeNode('acct-1', 'AccountNode'), makeNode('s1', 'Source', 999, 888)];

    const positions = computeDeterministicPositions(nodes, []);
    const pos = positions.get('s1')!;
    expect(pos.x).toBe(999);
    expect(pos.y).toBe(888);
  });

  it('returns empty map for empty input', () => {
    const positions = computeDeterministicPositions([], []);
    expect(positions.size).toBe(0);
  });

  it('handles a single node without crashing', () => {
    const nodes = [makeNode('solo', 'Source')];
    const positions = computeDeterministicPositions(nodes, []);
    const pos = positions.get('solo')!;
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });

  it('produces same positions regardless of input array order', () => {
    const nodesA = [
      makeNode('acct-1', 'AccountNode'),
      makeNode('p1', 'Principal'),
      makeNode('g1', 'Group'),
      makeNode('s1', 'Source'),
    ];
    const nodesB = [
      makeNode('s1', 'Source'),
      makeNode('g1', 'Group'),
      makeNode('acct-1', 'AccountNode'),
      makeNode('p1', 'Principal'),
    ];
    const edges: LayoutEdge[] = [
      makeEdge('p1', 'acct-1', 'OWNED_BY'),
      makeEdge('s1', 'g1', 'IN_GROUP'),
    ];

    const positionsA = computeDeterministicPositions(nodesA, edges);
    const positionsB = computeDeterministicPositions(nodesB, edges);

    for (const [id, posA] of positionsA.entries()) {
      const posB = positionsB.get(id)!;
      expect(posA.x).toBe(posB.x);
      expect(posA.y).toBe(posB.y);
    }
  });

  it('clusters children near their parent angle via hierarchy edges', () => {
    const nodes = [
      makeNode('g1', 'Group'),
      makeNode('s1', 'Source'),
      makeNode('s2', 'Source'),
      makeNode('s3', 'Source'),
    ];
    const edges = [
      makeEdge('s1', 'g1', 'IN_GROUP'),
      makeEdge('s2', 'g1', 'IN_GROUP'),
      // s3 is orphan — no IN_GROUP edge
    ];

    const positions = computeDeterministicPositions(nodes, edges);
    const groupAngle = Math.atan2(positions.get('g1')!.y, positions.get('g1')!.x);
    const s1Angle = Math.atan2(positions.get('s1')!.y, positions.get('s1')!.x);
    const s2Angle = Math.atan2(positions.get('s2')!.y, positions.get('s2')!.x);
    const s3Angle = Math.atan2(positions.get('s3')!.y, positions.get('s3')!.x);

    // s1 and s2 (children of g1) should be closer to g1's angle than s3 (orphan)
    const s1Delta = Math.abs(s1Angle - groupAngle);
    const s2Delta = Math.abs(s2Angle - groupAngle);
    const s3Delta = Math.abs(s3Angle - groupAngle);

    // Children should cluster within ~60° of parent, orphan has no such constraint
    expect(s1Delta).toBeLessThan(Math.PI / 2); // ≤ 90°
    expect(s2Delta).toBeLessThan(Math.PI / 2);
    // s3 may or may not be near — just check it has a valid position
    expect(Number.isFinite(s3Delta)).toBe(true);
  });

  it('handles CONTAINS edges (parent → child direction)', () => {
    const nodes = [makeNode('g1', 'Group'), makeNode('s1', 'Source')];
    const edges = [makeEdge('g1', 's1', 'CONTAINS')];

    const positions = computeDeterministicPositions(nodes, edges);
    const groupAngle = Math.atan2(positions.get('g1')!.y, positions.get('g1')!.x);
    const sourceAngle = Math.atan2(positions.get('s1')!.y, positions.get('s1')!.x);

    // Source should cluster near group
    const delta = Math.abs(sourceAngle - groupAngle);
    expect(delta).toBeLessThan(Math.PI / 2);
  });

  it('all node kinds have a defined shell mapping', () => {
    const criticalKinds = [
      'AccountNode',
      'Principal',
      'UserNode',
      'AgentNode',
      'Group',
      'Folder',
      'Source',
      'SourceDoc',
      'ChatThread',
      'ConversationThread',
      'ObjectiveClaim',
      'VerifiedSource',
      'VerifiedClaim',
      'Topic',
      'Phrase',
      'Lexeme',
    ];

    for (const kind of criticalKinds) {
      expect(KIND_TO_SHELL[kind]).toBeDefined();
      expect(typeof KIND_TO_SHELL[kind]).toBe('number');
    }
  });
});

describe('computeSingleNodePosition', () => {
  it('returns deterministic position for the same node', () => {
    const node = makeNode('test-1', 'Source');
    const posA = computeSingleNodePosition(node);
    const posB = computeSingleNodePosition(node);
    expect(posA.x).toBe(posB.x);
    expect(posA.y).toBe(posB.y);
  });

  it('preserves explicit positions', () => {
    const node = makeNode('test-1', 'Source', 42, 99);
    const pos = computeSingleNodePosition(node);
    expect(pos.x).toBe(42);
    expect(pos.y).toBe(99);
  });

  it('places AccountNode at origin', () => {
    const node = makeNode('acct-1', 'AccountNode');
    const pos = computeSingleNodePosition(node);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });

  it('places unknown kinds in the outermost shell', () => {
    const node = makeNode('mystery-1', 'UnknownKind');
    const pos = computeSingleNodePosition(node);
    const r = distance(pos);
    const outerRadius = HIERARCHY_RING_RADII[5];
    const tolerance = outerRadius * 0.2;
    expect(r).toBeGreaterThan(outerRadius - tolerance);
    expect(r).toBeLessThan(outerRadius + tolerance);
  });

  it('produces finite coordinates for all shell levels', () => {
    const kindsPerShell = [
      ['AccountNode'],
      ['Principal'],
      ['Group'],
      ['Source'],
      ['ObjectiveClaim'],
      ['Topic'],
    ];

    for (const kinds of kindsPerShell) {
      for (const kind of kinds) {
        const pos = computeSingleNodePosition(makeNode(`test-${kind}`, kind));
        expect(Number.isFinite(pos.x)).toBe(true);
        expect(Number.isFinite(pos.y)).toBe(true);
      }
    }
  });
});
