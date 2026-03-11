type SimilarityStrength = 'strong' | 'medium' | 'weak';

type MutableSimilarityEdge = {
  lexical: number;
  structural: number;
  semantic: number;
  flow: number;
  total: number;
  strength: SimilarityStrength;
};

const SEMANTIC_DISABLED_WEIGHTS = {
  lexical: 0.538462,
  structural: 0.307692,
  flow: 0.153846,
} as const;

const STRONG_THRESHOLD = 0.72;
const MEDIUM_THRESHOLD = 0.54;

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function scoreToStrength(total: number): SimilarityStrength {
  if (total >= STRONG_THRESHOLD) {
    return 'strong';
  }
  if (total >= MEDIUM_THRESHOLD) {
    return 'medium';
  }
  return 'weak';
}

/**
 * Enforces semantic-stage disable behavior at API runtime.
 * This is intentionally idempotent and safe even if parser package already applied the switch.
 */
export function applySemanticStageKillSwitchToEdges<T extends MutableSimilarityEdge>(
  edges: T[]
): T[] {
  for (const edge of edges) {
    edge.semantic = 0;
    edge.total = round6(
      edge.lexical * SEMANTIC_DISABLED_WEIGHTS.lexical +
        edge.structural * SEMANTIC_DISABLED_WEIGHTS.structural +
        edge.flow * SEMANTIC_DISABLED_WEIGHTS.flow
    );
    edge.strength = scoreToStrength(edge.total);
  }

  return edges;
}
