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
    expect(plan.stats.gate.pass).toBe(true);
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
    expect(plan.stats.gate.pass).toBe(true);
    expect(durationMs).toBeLessThan(5000);
  });

  it('evaluates custom performance gate inputs deterministically', () => {
    const gate = evaluateLodPerformanceGate({
      level: 'L1',
      totalNodeCount: 10_000,
      visibleNodeCount: 2_500,
      visibleEdgeCount: 8_000,
    });

    expect(gate.datasetTier).toBe('10k');
    expect(gate.pass).toBe(true);
    expect(gate.nodeBudget).toBeGreaterThan(0);
    expect(gate.edgeBudget).toBeGreaterThan(0);
  });
});
