import { describe, it, expect } from 'vitest';
import { AgentRunProvenance } from '@/services/organization-service';
import {
  buildProvenanceGraph,
  filterGraphByKind,
  searchEvidenceItems,
  calculateZoomToFit,
  calculateNodeFocusTransform,
  resetNodeLayout,
} from '../provenance-graph-utils';

describe('provenance-graph-utils', () => {
  const mockProvenance: AgentRunProvenance = {
    runId: 'run_123',
    provider: 'local-gemma',
    model: 'gemma-4-e2b',
    skill_used: 'bounded-answer',
    duration_ms: 1200,
    status: 'success',
    evidence: [
      {
        id: 'span_1',
        kind: 'SourceSpan',
        text: 'Keimenon is local-first.',
        source_id: 'src_abc',
        frequency: 2,
      },
      {
        id: 'phrase_1',
        kind: 'Phrase',
        text: 'Similarity graph platforms.',
        source_id: 'src_xyz',
        frequency: 1,
      },
      {
        id: 'topic_1',
        kind: 'Topic',
        text: 'Obsidian meets Poppy.',
      },
    ],
    stats: {
      total_items: 3,
      spans: 1,
      phrases: 1,
      topics: 1,
    },
  };

  it('should build the center AgentRun node and map unique Source nodes', () => {
    const { nodes, edges } = buildProvenanceGraph(mockProvenance, 'run_123');

    // Expected nodes: center (AgentRun), span_1 (SourceSpan), phrase_1 (Phrase), topic_1 (Topic), src_abc (Source), src_xyz (Source)
    expect(nodes).toHaveLength(6);

    const centerNode = nodes.find((n) => n.id === 'run-center');
    expect(centerNode).toBeDefined();
    expect(centerNode!.kind).toBe('AgentRun');

    const sourceNodes = nodes.filter((n) => n.kind === 'Source');
    expect(sourceNodes).toHaveLength(2);
    expect(sourceNodes.map((n) => n.id)).toContain('src_abc');
    expect(sourceNodes.map((n) => n.id)).toContain('src_xyz');

    // Expected edges:
    // center -> span_1, center -> phrase_1, center -> topic_1
    // src_abc -> span_1, src_xyz -> phrase_1
    // center -> src_abc, center -> src_xyz
    expect(edges.length).toBeGreaterThanOrEqual(5);
  });

  it('should filter visible node kinds and hide edges connected to hidden nodes', () => {
    const graph = buildProvenanceGraph(mockProvenance, 'run_123');
    const activeKinds = new Set<string>(['AgentRun', 'Source', 'SourceSpan']); // Hide Phrase & Topic

    const { nodes, edges } = filterGraphByKind(graph, activeKinds);

    expect(nodes.some((n) => n.kind === 'Phrase')).toBe(false);
    expect(nodes.some((n) => n.kind === 'Topic')).toBe(false);
    expect(nodes.some((n) => n.kind === 'SourceSpan')).toBe(true);

    // Edges connected to hidden nodes (e.g. Phrase/Topic) should be omitted
    edges.forEach((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      const targetNode = nodes.find((n) => n.id === e.target);
      expect(sourceNode).toBeDefined();
      expect(targetNode).toBeDefined();
    });
  });

  it('should match query keywords in searchEvidenceItems', () => {
    const items = mockProvenance.evidence;

    const matchedText = searchEvidenceItems(items, 'local-first');
    expect(matchedText).toHaveLength(1);
    expect(matchedText[0].id).toBe('span_1');

    const matchedKind = searchEvidenceItems(items, 'Phrase');
    expect(matchedKind).toHaveLength(1);
    expect(matchedKind[0].id).toBe('phrase_1');

    const matchedSource = searchEvidenceItems(items, 'src_abc');
    expect(matchedSource).toHaveLength(1);
    expect(matchedSource[0].id).toBe('span_1');
  });

  it('should return finite transformation coordinates in calculateZoomToFit', () => {
    const { nodes } = buildProvenanceGraph(mockProvenance, 'run_123');
    const transform = calculateZoomToFit(nodes, 800, 600);

    expect(Number.isFinite(transform.x)).toBe(true);
    expect(Number.isFinite(transform.y)).toBe(true);
    expect(Number.isFinite(transform.zoom)).toBe(true);
    expect(transform.zoom).toBeGreaterThan(0.2);
  });

  it('should center the target node in calculateNodeFocusTransform', () => {
    const { nodes } = buildProvenanceGraph(mockProvenance, 'run_123');
    const targetNode = nodes[1];
    const transform = calculateNodeFocusTransform(targetNode, 800, 600, 1.5);

    expect(transform.zoom).toBe(1.5);
    const expectedX = 800 / 2 - targetNode.x * 1.5;
    const expectedY = 600 / 2 - targetNode.y * 1.5;
    expect(transform.x).toBeCloseTo(expectedX);
    expect(transform.y).toBeCloseTo(expectedY);
  });

  it('should reset node coordinates in resetNodeLayout', () => {
    const { nodes } = buildProvenanceGraph(mockProvenance, 'run_123');

    // Scramble non-center nodes only
    nodes.forEach((n) => {
      if (n.id !== 'run-center') {
        n.x = 999;
        n.y = 999;
      }
    });

    const resetNodes = resetNodeLayout(nodes);
    const nonCenterNode = resetNodes.find((n) => n.id !== 'run-center');
    expect(nonCenterNode!.x).not.toBe(999);
    expect(nonCenterNode!.y).not.toBe(999);
    expect(nonCenterNode!.vx).toBe(0);
    expect(nonCenterNode!.vy).toBe(0);
  });
});
