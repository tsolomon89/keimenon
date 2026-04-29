import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildGraphSnapshotResponse,
  type SnapshotEdgeRecord,
  type SnapshotNodeRecord,
} from '../graph-snapshot.service';

function node(
  id: string,
  kind: string,
  createdAt: number,
  properties: Record<string, unknown> = {}
): SnapshotNodeRecord {
  return {
    id,
    kind,
    properties,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function edge(
  id: string,
  kind: string,
  from: string,
  to: string,
  properties: Record<string, unknown> = {}
): SnapshotEdgeRecord {
  return {
    id,
    kind,
    from,
    to,
    properties,
    created_at: Date.now(),
  };
}

describe('buildGraphSnapshotResponse', () => {
  it('is deterministic for identical inputs', () => {
    const nodes: SnapshotNodeRecord[] = [
      node('n-account', 'AccountNode', 10),
      node('n-principal', 'Principal', 11),
      node('n-group', 'Group', 12),
      node('n-source', 'Source', 13),
      node('n-message', 'Message', 14, { mass: 3.2 }),
      node('n-topic', 'Topic', 15, { score: 1.3 }),
      node('n-lexeme', 'Lexeme', 16),
    ];

    const edges: SnapshotEdgeRecord[] = [
      edge('e-owned', 'OWNED_BY', 'n-principal', 'n-account'),
      edge('e-in-group', 'IN_GROUP', 'n-message', 'n-group'),
      edge('e-contains', 'CONTAINS', 'n-source', 'n-message'),
      edge('e-similar', 'SIMILAR_TO', 'n-message', 'n-topic', { strength: 0.82 }),
    ];

    const options = {
      nodes,
      edges,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodeBudget: 6,
      edgeBudget: 20,
    };

    const first = buildGraphSnapshotResponse(options);
    const second = buildGraphSnapshotResponse(options);
    assert.deepStrictEqual(first, second);
  });

  it('keeps hierarchy anchors and excludes noisy edge kinds by default', () => {
    const nodes: SnapshotNodeRecord[] = [
      node('account', 'AccountNode', 100),
      node('principal', 'Principal', 101),
      node('group', 'Group', 102),
      node('source', 'Source', 103),
      node('span', 'SourceSpan', 104),
      node('lexeme', 'Lexeme', 105),
    ];

    const edges: SnapshotEdgeRecord[] = [
      edge('e-hierarchy', 'OWNED_BY', 'principal', 'account'),
      edge('e-group', 'IN_GROUP', 'source', 'group'),
      edge('e-noisy-1', 'HAS_SPAN', 'source', 'span'),
      edge('e-noisy-2', 'OCCURS_IN_SPAN', 'lexeme', 'span'),
    ];

    const snapshot = buildGraphSnapshotResponse({
      nodes,
      edges,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodeBudget: 6,
      edgeBudget: 10,
    });

    const selectedKinds = new Set(snapshot.nodes.map((entry) => entry.kind));
    assert.ok(selectedKinds.has('AccountNode'));
    assert.ok(selectedKinds.has('Principal'));
    assert.ok(selectedKinds.has('Group'));
    assert.ok(selectedKinds.has('Source'));

    const edgeKinds = new Set(snapshot.edges.map((entry) => entry.kind));
    assert.ok(!edgeKinds.has('HAS_SPAN'));
    assert.ok(!edgeKinds.has('OCCURS_IN_SPAN'));

    for (const selectedEdge of snapshot.edges) {
      const sourcePresent = snapshot.nodes.some((n) => n.id === selectedEdge.from);
      const targetPresent = snapshot.nodes.some((n) => n.id === selectedEdge.to);
      assert.equal(sourcePresent, true);
      assert.equal(targetPresent, true);
    }
  });
});
