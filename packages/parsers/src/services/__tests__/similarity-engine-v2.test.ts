import { describe, expect, it } from 'vitest';
import { SimilarityEngineV2 } from '../similarity-engine-v2';

describe('SimilarityEngineV2', () => {
  const engine = new SimilarityEngineV2();

  const corpus = [
    {
      id: 'src_a',
      text: 'Build import pipeline with similarity graph and objective nodes.',
      conversationId: 'conv_1',
      role: 'user',
      timestamp: 1_700_000_000_000,
    },
    {
      id: 'src_b',
      text: 'Implement similarity graph edges and objective verification workflow.',
      conversationId: 'conv_1',
      role: 'assistant',
      timestamp: 1_700_000_030_000,
    },
    {
      id: 'src_c',
      text: 'Draft grocery list with apples, bread, and milk.',
      conversationId: 'conv_2',
      role: 'user',
      timestamp: 1_700_500_000_000,
    },
    {
      id: 'src_d',
      text: 'Similarity weighted graph and objective claims should be deterministic.',
      conversationId: 'conv_3',
      role: 'user',
      timestamp: 1_700_001_000_000,
    },
  ] as const;

  it('returns deterministic outputs for the same corpus', () => {
    const run1 = engine.analyze({ documents: corpus as any[] });
    const run2 = engine.analyze({ documents: corpus as any[] });

    expect(run1).toEqual(run2);
  });

  it('uses the locked weighted score formula', () => {
    const result = engine.analyze({ documents: corpus as any[] });
    expect(result.edges.length).toBeGreaterThan(0);

    for (const edge of result.edges) {
      const expected =
        Math.round(
          (0.35 * edge.lexical + 0.2 * edge.structural + 0.35 * edge.semantic + 0.1 * edge.flow) *
            1_000_000
        ) / 1_000_000;
      expect(edge.total).toBeCloseTo(expected, 5);
    }
  });

  it('produces stable cluster memberships and non-zero mass values', () => {
    const result = engine.analyze({ documents: corpus as any[] });

    const allMembers = result.clusters.flatMap((cluster) => cluster.memberIds).sort();
    expect(allMembers).toEqual(corpus.map((doc) => doc.id).sort());

    for (const doc of corpus) {
      expect(result.massByNode[doc.id]).toBeGreaterThan(0);
      expect(result.massByNode[doc.id]).toBeLessThanOrEqual(1);
    }
  });

  it('supports semantic-stage kill switch with deterministic reweighting', () => {
    const result = engine.analyze({
      documents: corpus as any[],
      runtime: {
        disableSemanticStage: true,
      },
    });
    expect(result.edges.length).toBeGreaterThan(0);

    for (const edge of result.edges) {
      expect(edge.semantic).toBe(0);

      const expected =
        Math.round(
          (0.538462 * edge.lexical + 0.307692 * edge.structural + 0.153846 * edge.flow) * 1_000_000
        ) / 1_000_000;
      expect(edge.total).toBeCloseTo(expected, 5);
    }
  });
});
