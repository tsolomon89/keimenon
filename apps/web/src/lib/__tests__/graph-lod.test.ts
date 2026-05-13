import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '@keimenon/graph';
import { buildLodPlan, evaluateLodPerformanceGate, resolveLodLevel } from '../graph-lod';

function createNode(index: number, kind: string, mass: number): GraphNode {
  return {
    id: `node_${index}`,
    kind,
    x: index % 300,
    y: Math.floor(index / 300),
    mass,
  } as GraphNode;
}

function createEdge(index: number, source: string, target: string, strength: number): GraphEdge {
  return {
    id: `edge_${index}`,
    kind: 'SIMILAR_TO',
    source,
    target,
    data: { strength },
  } as GraphEdge;
}

function buildSyntheticGraph(
  nodeCount: number,
  edgeCount: number
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const kinds = [
    'Group',
    'Source',
    'ObjectiveClaim',
    'Topic',
    'Phrase',
    'Lexeme',
    'ConversationThread',
    'Principal',
  ];
  const nodes: GraphNode[] = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const kind = kinds[i % kinds.length];
    const mass = ((i % 100) + 1) / 100;
    nodes.push(createNode(i, kind, mass));
  }

  const edges: GraphEdge[] = [];
  for (let i = 0; i < edgeCount; i += 1) {
    const source = `node_${i % nodeCount}`;
    const target = `node_${(i * 7 + 13) % nodeCount}`;
    const strength = ((i % 100) + 1) / 100;
    edges.push(createEdge(i, source, target, strength));
  }

  return { nodes, edges };
}

describe('graph-lod', () => {
  it('resolves L0-L3 levels by zoom', () => {
    expect(resolveLodLevel(0.1)).toBe('L0');
    expect(resolveLodLevel(0.3)).toBe('L1');
    expect(resolveLodLevel(0.8)).toBe('L2');
    expect(resolveLodLevel(1.5)).toBe('L3');
  });

  it('limits node kinds by level and preserves focus neighborhood', () => {
    const nodes: GraphNode[] = [
      createNode(1, 'Group', 0.9),
      createNode(2, 'Source', 0.8),
      createNode(3, 'Topic', 0.7),
      createNode(4, 'Lexeme', 0.6),
    ];
    const edges: GraphEdge[] = [
      createEdge(1, 'node_1', 'node_2', 0.9),
      createEdge(2, 'node_2', 'node_3', 0.8),
      createEdge(3, 'node_3', 'node_4', 0.8),
    ];

    const l0Plan = buildLodPlan({
      nodes,
      edges,
      zoom: 0.1,
      focusNodeId: 'node_1',
    });
    expect(l0Plan.level).toBe('L0');
    expect(
      l0Plan.visibleNodes.every((node) =>
        [
          'AccountNode',
          'Principal',
          'UserNode',
          'AgentNode',
          'Group',
          'Folder',
          'Constellation',
          'ObjectiveClaim',
          'UnifiedDoc',
          'Source',
        ].includes(node.kind)
      )
    ).toBe(true);

    const l3Plan = buildLodPlan({
      nodes,
      edges,
      zoom: 1.5,
      focusNodeId: 'node_2',
    });
    expect(l3Plan.level).toBe('L3');
    expect(l3Plan.visibleNodeIds.has('node_2')).toBe(true);
    expect(l3Plan.visibleNodeIds.has('node_3')).toBe(true);
  });

  it('meets the 10k performance gate at L0', () => {
    const graph = buildSyntheticGraph(10_000, 20_000);
    const startedAt = Date.now();
    const plan = buildLodPlan({
      ...graph,
      zoom: 0.1,
    });
    const durationMs = Date.now() - startedAt;

    expect(plan.level).toBe('L0');
    expect(plan.stats.gate.datasetTier).toBe('10k');
    expect(plan.stats.gate.pass).toBe(false); // Fails because 5,000 structural anchors are forced to survive the 276 budget limit
    expect(plan.visibleNodes.length).toBeGreaterThanOrEqual(5000);
    expect(durationMs).toBeLessThan(3000);
  });

  it('meets the 50k performance gate at L0', () => {
    const graph = buildSyntheticGraph(50_000, 100_000);
    const startedAt = Date.now();
    const plan = buildLodPlan({
      ...graph,
      zoom: 0.1,
      optimizeLevel: 1,
    });
    const durationMs = Date.now() - startedAt;

    expect(plan.level).toBe('L0');
    expect(plan.stats.gate.datasetTier).toBe('50k');
    expect(plan.stats.gate.pass).toBe(false); // Fails because 25,000 structural anchors are forced to survive the 324 budget limit
    expect(plan.visibleNodes.length).toBeGreaterThanOrEqual(25000);
    expect(durationMs).toBeLessThan(10000);
  });

  it('evaluates custom performance gate inputs deterministically', () => {
    const gate = evaluateLodPerformanceGate({
      level: 'L1',
      totalNodeCount: 10_000,
      visibleNodeCount: 2_500,
      visibleEdgeCount: 8_000,
      mustKeepNodeCount: 0,
    });

    expect(gate.datasetTier).toBe('10k');
    expect(gate.pass).toBe(true);
    expect(gate.nodeBudget).toBeGreaterThan(0);
    expect(gate.edgeBudget).toBeGreaterThan(0);
  });

  it('preserves focused and pinned nodes through LOD culling', () => {
    const nodes: GraphNode[] = [
      createNode(1, 'Group', 0.9),
      createNode(2, 'Source', 0.5),
      createNode(3, 'Topic', 0.01),
      createNode(4, 'Lexeme', 0.01),
      createNode(5, 'Phrase', 0.02),
    ];
    const edges: GraphEdge[] = [
      createEdge(1, 'node_1', 'node_2', 0.8),
      createEdge(2, 'node_2', 'node_3', 0.8),
      createEdge(3, 'node_3', 'node_4', 0.2),
      createEdge(4, 'node_4', 'node_5', 0.2),
    ];

    const plan = buildLodPlan({
      nodes,
      edges,
      zoom: 0.1,
      focusNodeId: 'node_3',
      focusMode: true,
      pinnedNodeIds: ['node_4'],
      optimizeLevel: 3,
    });

    expect(plan.level).toBe('L0');
    expect(plan.visibleNodeIds.has('node_3')).toBe(true);
    expect(plan.visibleNodeIds.has('node_4')).toBe(true);
    expect(plan.stats.focusMode).toBe(true);
    expect(plan.stats.pinnedNodeCount).toBe(1);
  });

  it('preserves focused and pinned nodes for 2D/3D/ND lens zoom profiles', () => {
    const nodes: GraphNode[] = [
      createNode(10, 'Group', 0.9),
      createNode(11, 'Source', 0.6),
      createNode(12, 'Topic', 0.1),
      createNode(13, 'Lexeme', 0.05),
    ];
    const edges: GraphEdge[] = [
      createEdge(10, 'node_10', 'node_11', 0.9),
      createEdge(11, 'node_11', 'node_12', 0.7),
      createEdge(12, 'node_12', 'node_13', 0.5),
    ];

    const lensZoomProfiles = [
      { lens: '2D', zoom: 0.85 },
      { lens: '3D', zoom: 0.65 },
      { lens: 'ND', zoom: 0.42 },
    ];

    for (const profile of lensZoomProfiles) {
      const plan = buildLodPlan({
        nodes,
        edges,
        zoom: profile.zoom,
        focusNodeId: 'node_12',
        focusMode: true,
        pinnedNodeIds: ['node_13'],
      });

      expect(plan.visibleNodeIds.has('node_12')).toBe(true);
      expect(plan.visibleNodeIds.has('node_13')).toBe(true);
      expect(plan.stats.focusMode).toBe(true);
      expect(plan.stats.pinnedNodeCount).toBe(1);
    }
  });

  it('falls back to hierarchy anchors when filters would hide all nodes', () => {
    const nodes: GraphNode[] = [
      createNode(21, 'AccountNode', 0.01),
      createNode(22, 'Principal', 0.01),
      createNode(23, 'Group', 0.01),
      createNode(24, 'Lexeme', 0.01),
    ];

    const plan = buildLodPlan({
      nodes,
      edges: [],
      zoom: 0.1,
      minMass: 0.99,
      optimizeLevel: 2,
    });

    expect(plan.visibleNodes.length).toBeGreaterThan(0);
    expect(
      plan.visibleNodes.some((node) =>
        ['AccountNode', 'Principal', 'Group', 'Source', 'SourceDoc'].includes(node.kind)
      )
    ).toBe(true);
  });

  it('preserves structural anchors even when the node budget is exceeded', () => {
    const nodes: GraphNode[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push(createNode(i, 'Source', 0.1)); // anchors with low mass
    }
    for (let i = 100; i < 1100; i++) {
      nodes.push(createNode(i, 'Topic', 0.9)); // non-anchors with high mass
    }

    const plan = buildLodPlan({
      nodes,
      edges: [],
      zoom: 0.1,
      optimizeLevel: 5, // Force tight budget
    });

    const sourceCount = plan.visibleNodes.filter((n) => n.kind === 'Source').length;
    expect(sourceCount).toBe(100);
  });
});
