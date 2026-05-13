import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '@keimenon/graph';
import {
  buildClusterPlan,
  clusterToGraphNode,
  clusterRadius,
  clusterEdgeToGraphEdge,
  type ClusterSupernode,
} from '../cluster-supernodes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createNode(id: string, kind: string, mass = 1): GraphNode {
  return { id, kind, mass } as GraphNode;
}

function createEdge(id: string, source: string, target: string, kind = 'SIMILAR_TO'): GraphEdge {
  return { id, kind, source, target, data: { strength: 0.5 } } as GraphEdge;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cluster-supernodes', () => {
  describe('buildClusterPlan', () => {
    it('returns empty plan for empty input', () => {
      const plan = buildClusterPlan([], []);
      expect(plan.clusters).toHaveLength(0);
      expect(plan.clusterEdges).toHaveLength(0);
      expect(plan.passthrough).toHaveLength(0);
      expect(plan.stats.totalInputNodes).toBe(0);
    });

    it('passes through AccountNode and Principal nodes', () => {
      const nodes = [
        createNode('acct-1', 'AccountNode'),
        createNode('princ-1', 'Principal'),
        createNode('user-1', 'UserNode'),
        createNode('agent-1', 'AgentNode'),
        createNode('grp-1', 'Group'),
        createNode('src-1', 'Source'),
      ];
      const edges: GraphEdge[] = [];
      const plan = buildClusterPlan(nodes, edges);

      expect(plan.passthrough.map((n) => n.id).sort()).toEqual([
        'acct-1',
        'agent-1',
        'princ-1',
        'user-1',
      ]);
      expect(plan.stats.passthroughCount).toBe(4);
    });

    it('creates cluster supernodes from Group membership', () => {
      const nodes = [
        createNode('acct-1', 'AccountNode'),
        createNode('grp-1', 'Group', 2),
        createNode('src-1', 'Source', 1),
        createNode('src-2', 'Source', 1),
        createNode('src-3', 'Source', 1),
        createNode('topic-1', 'Topic', 0.5),
      ];
      const edges = [
        createEdge('e1', 'src-1', 'grp-1', 'IN_GROUP'),
        createEdge('e2', 'src-2', 'grp-1', 'IN_GROUP'),
        createEdge('e3', 'src-3', 'grp-1', 'IN_GROUP'),
        createEdge('e4', 'topic-1', 'grp-1', 'IN_GROUP'),
      ];

      const plan = buildClusterPlan(nodes, edges);

      // Should have 1 real cluster (grp-1 as anchor)
      const realClusters = plan.clusters.filter((c) => c.anchorId !== '__orphans__');
      expect(realClusters).toHaveLength(1);

      const cluster = realClusters[0];
      expect(cluster.anchorId).toBe('grp-1');
      expect(cluster.memberCount).toBe(5); // grp-1 + src-1,2,3 + topic-1
      expect(cluster.memberIds).toContain('grp-1');
      expect(cluster.memberIds).toContain('src-1');
      expect(cluster.memberIds).toContain('topic-1');
      expect(cluster.aggregateMass).toBe(5.5); // 2 + 1 + 1 + 1 + 0.5
      expect(cluster.kind).toBe('ClusterSupernode');
    });

    it('handles CONTAINS edges (parent → child direction)', () => {
      const nodes = [
        createNode('grp-1', 'Group', 1),
        createNode('src-1', 'Source', 1),
        createNode('src-2', 'Source', 1),
      ];
      const edges = [
        createEdge('e1', 'grp-1', 'src-1', 'CONTAINS'),
        createEdge('e2', 'grp-1', 'src-2', 'CONTAINS'),
      ];

      const plan = buildClusterPlan(nodes, edges);
      const realClusters = plan.clusters.filter((c) => c.anchorId !== '__orphans__');
      expect(realClusters).toHaveLength(1);
      expect(realClusters[0].memberCount).toBe(3); // grp-1 + src-1 + src-2
    });

    it('merges tiny clusters (< MIN_CLUSTER_SIZE) into orphans', () => {
      const nodes = [
        createNode('grp-1', 'Group', 1),
        createNode('src-1', 'Source', 1), // only 1 member → too small
        createNode('grp-2', 'Group', 1),
        createNode('src-2', 'Source', 1),
        createNode('src-3', 'Source', 1),
      ];
      const edges = [
        createEdge('e1', 'src-1', 'grp-1', 'IN_GROUP'),
        createEdge('e2', 'src-2', 'grp-2', 'IN_GROUP'),
        createEdge('e3', 'src-3', 'grp-2', 'IN_GROUP'),
      ];

      const plan = buildClusterPlan(nodes, edges);

      // grp-2 should survive (2 members), grp-1 should be merged into orphans
      const realClusters = plan.clusters.filter((c) => c.anchorId !== '__orphans__');
      expect(realClusters).toHaveLength(1);
      expect(realClusters[0].anchorId).toBe('grp-2');

      // Orphan cluster should contain grp-1 + src-1
      const orphanCluster = plan.clusters.find((c) => c.anchorId === '__orphans__');
      expect(orphanCluster).toBeDefined();
      expect(orphanCluster!.memberIds).toContain('grp-1');
      expect(orphanCluster!.memberIds).toContain('src-1');
    });

    it('creates orphan cluster for ungrouped nodes', () => {
      const nodes = [
        createNode('src-1', 'Source', 1),
        createNode('src-2', 'Source', 1),
        createNode('topic-1', 'Topic', 0.5),
      ];

      const plan = buildClusterPlan(nodes, []);

      // No group anchors → everything is orphans
      expect(plan.clusters).toHaveLength(1);
      expect(plan.clusters[0].anchorId).toBe('__orphans__');
      expect(plan.clusters[0].memberCount).toBe(3);
    });

    it('computes inter-cluster edges', () => {
      const nodes = [
        createNode('grp-1', 'Group', 1),
        createNode('grp-2', 'Group', 1),
        createNode('src-1', 'Source', 1),
        createNode('src-2', 'Source', 1),
        createNode('src-3', 'Source', 1),
        createNode('src-4', 'Source', 1),
      ];
      const edges = [
        // Membership
        createEdge('m1', 'src-1', 'grp-1', 'IN_GROUP'),
        createEdge('m2', 'src-2', 'grp-1', 'IN_GROUP'),
        createEdge('m3', 'src-3', 'grp-2', 'IN_GROUP'),
        createEdge('m4', 'src-4', 'grp-2', 'IN_GROUP'),
        // Cross-cluster edges
        createEdge('x1', 'src-1', 'src-3', 'SIMILAR_TO'),
        createEdge('x2', 'src-2', 'src-4', 'SIMILAR_TO'),
        createEdge('x3', 'src-1', 'src-4', 'SIMILAR_TO'),
      ];

      const plan = buildClusterPlan(nodes, edges);

      expect(plan.clusterEdges).toHaveLength(1); // One inter-cluster edge (grp-1 ↔ grp-2)
      expect(plan.clusterEdges[0].weight).toBe(3); // 3 cross-cluster edges
      expect(plan.stats.interClusterEdgeCount).toBe(1);
    });

    it('is deterministic — same input produces same output', () => {
      const nodes = [
        createNode('acct', 'AccountNode'),
        createNode('grp-a', 'Group', 3),
        createNode('grp-b', 'Group', 2),
        createNode('s1', 'Source', 1),
        createNode('s2', 'Source', 1),
        createNode('s3', 'Source', 1),
        createNode('s4', 'Source', 1),
      ];
      const edges = [
        createEdge('e1', 's1', 'grp-a', 'IN_GROUP'),
        createEdge('e2', 's2', 'grp-a', 'IN_GROUP'),
        createEdge('e3', 's3', 'grp-b', 'IN_GROUP'),
        createEdge('e4', 's4', 'grp-b', 'IN_GROUP'),
        createEdge('e5', 's1', 's3', 'SIMILAR_TO'),
      ];

      const plan1 = buildClusterPlan(nodes, edges);
      const plan2 = buildClusterPlan(nodes, edges);

      expect(plan1.clusters.map((c) => c.id)).toEqual(plan2.clusters.map((c) => c.id));
      expect(plan1.clusterEdges.map((e) => e.id)).toEqual(plan2.clusterEdges.map((e) => e.id));
      expect(plan1.stats).toEqual(plan2.stats);
    });

    it('handles 10k node graph within performance budget', () => {
      // Generate large synthetic graph
      const nodes: GraphNode[] = [];
      const edges: GraphEdge[] = [];

      // 50 groups
      for (let g = 0; g < 50; g++) {
        nodes.push(createNode(`grp-${g}`, 'Group', 5));
      }

      // 10,000 sources distributed across groups
      for (let i = 0; i < 10_000; i++) {
        nodes.push(createNode(`src-${i}`, 'Source', ((i % 100) + 1) / 100));
        edges.push(createEdge(`mem-${i}`, `src-${i}`, `grp-${i % 50}`, 'IN_GROUP'));
      }

      // 5,000 cross-cluster edges
      for (let i = 0; i < 5_000; i++) {
        edges.push(createEdge(`xc-${i}`, `src-${i}`, `src-${(i * 7 + 13) % 10_000}`, 'SIMILAR_TO'));
      }

      const startedAt = Date.now();
      const plan = buildClusterPlan(nodes, edges);
      const durationMs = Date.now() - startedAt;

      expect(plan.clusters.length).toBe(50); // 50 groups → 50 clusters (all have ≥200 members)
      expect(plan.stats.clusterCount).toBe(50);
      expect(plan.stats.totalInputNodes).toBe(10_050);
      expect(durationMs).toBeLessThan(2000); // Should complete in < 2s
    });
  });

  describe('rendering helpers', () => {
    const sampleCluster: ClusterSupernode = {
      id: 'cluster:grp-1',
      anchorId: 'grp-1',
      label: 'Test Group',
      memberIds: ['grp-1', 'src-1', 'src-2'],
      memberCount: 3,
      aggregateMass: 5,
      interClusterEdgeCount: 2,
      kind: 'ClusterSupernode',
    };

    it('converts cluster to GraphNode for rendering', () => {
      const graphNode = clusterToGraphNode(sampleCluster);
      expect(graphNode.id).toBe('cluster:grp-1');
      expect(graphNode.kind).toBe('Constellation');
      expect((graphNode as any).mass).toBe(5);
      expect(graphNode.label).toBe('Test Group');
    });

    it('computes radius scaled by member count', () => {
      expect(clusterRadius({ ...sampleCluster, memberCount: 1 })).toBeCloseTo(11, 0);
      expect(clusterRadius({ ...sampleCluster, memberCount: 8 })).toBeCloseTo(14, 0);
      expect(clusterRadius({ ...sampleCluster, memberCount: 512 })).toBeCloseTo(20, 0);
    });

    it('converts cluster edge to GraphEdge', () => {
      const clusterEdge = {
        id: 'ce-1',
        sourceClusterId: 'cluster:grp-1',
        targetClusterId: 'cluster:grp-2',
        weight: 25,
        kind: 'CLUSTER_LINK' as const,
      };

      const graphEdge = clusterEdgeToGraphEdge(clusterEdge);
      expect(graphEdge.id).toBe('ce-1');
      expect(graphEdge.source).toBe('cluster:grp-1');
      expect(graphEdge.target).toBe('cluster:grp-2');
      expect((graphEdge as any).data.weight).toBe(25);
    });
  });
});
