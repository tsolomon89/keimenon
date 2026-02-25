/**
 * Edge styling configuration for Keimenon graph visualization
 *
 * Colors are chosen to be visually distinct and semantically meaningful:
 * - Structural edges: Blues/Purples (containment, derivation)
 * - Similarity edges: Oranges/Reds (duplicates, equivalents)
 * - Semantic edges: Greens/Teals (mentions, co-occurrence, topics)
 * - Verification edges: Bright greens/reds (support/refute claims)
 */

export interface EdgeStyle {
  color: string;           // Base color (rgba format)
  highlightColor: string;  // Hover/selected color
  dashArray?: number[];    // Optional dash pattern [dash, gap]
  label: string;           // Human-readable label for tooltips
  category: 'structural' | 'similarity' | 'semantic' | 'verification';
}

export const EDGE_STYLES: Record<string, EdgeStyle> = {
  // Structural edges
  CONTAINS: {
    color: 'rgba(59, 130, 246, 0.4)',      // Blue
    highlightColor: 'rgba(59, 130, 246, 0.8)',
    label: 'Contains',
    category: 'structural',
  },
  HAS_MESSAGE: {
    color: 'rgba(59, 130, 246, 0.4)',      // Blue (same as CONTAINS)
    highlightColor: 'rgba(59, 130, 246, 0.8)',
    label: 'Has Message',
    category: 'structural',
  },
  DERIVES_FROM: {
    color: 'rgba(168, 85, 247, 0.4)',      // Purple
    highlightColor: 'rgba(168, 85, 247, 0.8)',
    label: 'Derives From',
    category: 'structural',
  },
  EXTRACTED_FROM: {
    color: 'rgba(168, 85, 247, 0.4)',      // Purple
    highlightColor: 'rgba(168, 85, 247, 0.8)',
    label: 'Extracted From',
    category: 'structural',
  },
  COMPILED_FROM: {
    color: 'rgba(139, 92, 246, 0.4)',      // Violet
    highlightColor: 'rgba(139, 92, 246, 0.8)',
    label: 'Compiled From',
    category: 'structural',
  },
  STITCHED_FROM: {
    color: 'rgba(139, 92, 246, 0.4)',      // Violet
    highlightColor: 'rgba(139, 92, 246, 0.8)',
    label: 'Stitched From',
    category: 'structural',
  },

  // Similarity edges
  NEAR_DUP: {
    color: 'rgba(251, 146, 60, 0.5)',      // Orange
    highlightColor: 'rgba(251, 146, 60, 0.9)',
    label: 'Near Duplicate',
    category: 'similarity',
    dashArray: [4, 4],
  },
  EXACT_DUP: {
    color: 'rgba(239, 68, 68, 0.5)',       // Red
    highlightColor: 'rgba(239, 68, 68, 0.9)',
    label: 'Exact Duplicate',
    category: 'similarity',
  },
  EQUIVALENT_TO: {
    color: 'rgba(234, 179, 8, 0.5)',       // Yellow
    highlightColor: 'rgba(234, 179, 8, 0.9)',
    label: 'Equivalent To',
    category: 'similarity',
  },
  DUP_OF: {
    color: 'rgba(251, 146, 60, 0.5)',      // Orange
    highlightColor: 'rgba(251, 146, 60, 0.9)',
    label: 'Duplicate Of',
    category: 'similarity',
  },
  SIMILAR_TO: {
    color: 'rgba(251, 191, 36, 0.5)',      // Amber
    highlightColor: 'rgba(251, 191, 36, 0.9)',
    label: 'Similar To',
    category: 'similarity',
    dashArray: [6, 3],
  },
  CLUSTER_MEMBER: {
    color: 'rgba(245, 158, 11, 0.4)',      // Amber
    highlightColor: 'rgba(245, 158, 11, 0.8)',
    label: 'Cluster Member',
    category: 'similarity',
    dashArray: [2, 2],
  },

  // Semantic edges (V2 Spine)
  MENTIONS: {
    color: 'rgba(148, 163, 184, 0.35)',    // Slate (subtle)
    highlightColor: 'rgba(148, 163, 184, 0.75)',
    label: 'Mentions',
    category: 'semantic',
  },
  CO_OCCURS_WITH: {
    color: 'rgba(16, 185, 129, 0.45)',     // Emerald
    highlightColor: 'rgba(16, 185, 129, 0.85)',
    label: 'Co-occurs With',
    category: 'semantic',
  },
  BELONGS_TO_TOPIC: {
    color: 'rgba(236, 72, 153, 0.45)',     // Pink
    highlightColor: 'rgba(236, 72, 153, 0.85)',
    label: 'Belongs To Topic',
    category: 'semantic',
  },
  ABOUT: {
    color: 'rgba(139, 92, 246, 0.45)',     // Violet
    highlightColor: 'rgba(139, 92, 246, 0.85)',
    label: 'About',
    category: 'semantic',
  },
  IN_SCOPE_FOR: {
    color: 'rgba(6, 182, 212, 0.4)',       // Cyan
    highlightColor: 'rgba(6, 182, 212, 0.8)',
    label: 'In Scope For',
    category: 'semantic',
  },

  // Verification edges
  SUPPORTS: {
    color: 'rgba(34, 197, 94, 0.55)',      // Green
    highlightColor: 'rgba(34, 197, 94, 0.95)',
    label: 'Supports',
    category: 'verification',
  },
  REFUTES: {
    color: 'rgba(239, 68, 68, 0.55)',      // Red
    highlightColor: 'rgba(239, 68, 68, 0.95)',
    label: 'Refutes',
    category: 'verification',
  },
  VERIFIED_BY: {
    color: 'rgba(6, 182, 212, 0.45)',      // Cyan
    highlightColor: 'rgba(6, 182, 212, 0.85)',
    label: 'Verified By',
    category: 'verification',
  },
  SOURCED_FROM: {
    color: 'rgba(20, 184, 166, 0.45)',     // Teal
    highlightColor: 'rgba(20, 184, 166, 0.85)',
    label: 'Sourced From',
    category: 'verification',
  },
};

// Default style for unknown edge types
export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  color: 'rgba(100, 116, 139, 0.3)',
  highlightColor: 'rgba(100, 116, 139, 0.6)',
  label: 'Related',
  category: 'structural',
};

/**
 * Get style for an edge kind
 */
export function getEdgeStyle(kind: string): EdgeStyle {
  return EDGE_STYLES[kind] || DEFAULT_EDGE_STYLE;
}

/**
 * Get visual thickness for an edge based on its metadata
 * Returns a value between 1 and 6 (in graph space, will be scaled by zoom)
 */
export function getEdgeThickness(
  kind: string,
  metadata?: Record<string, unknown>,
  baseThickness: number = 2
): number {
  if (!metadata) return baseThickness;

  // NEAR_DUP: thickness based on score (0-1)
  if (kind === 'NEAR_DUP' && typeof metadata.score === 'number') {
    return baseThickness + (metadata.score * 4); // 2-6 range
  }

  // MENTIONS: thickness based on count
  if (kind === 'MENTIONS' && typeof metadata.count === 'number') {
    return Math.min(baseThickness + Math.log2(metadata.count + 1), 6);
  }

  // CO_OCCURS_WITH: thickness based on PMI or count
  if (kind === 'CO_OCCURS_WITH') {
    if (typeof metadata.pmi === 'number') {
      return baseThickness + Math.min(Math.abs(metadata.pmi), 4);
    }
    if (typeof metadata.count === 'number') {
      return Math.min(baseThickness + Math.log2(metadata.count + 1), 6);
    }
  }

  // BELONGS_TO_TOPIC / SUPPORTS / REFUTES: thickness based on weight/strength
  if (typeof metadata.weight === 'number') {
    return baseThickness + (metadata.weight * 4);
  }
  if (typeof metadata.strength === 'number') {
    return baseThickness + (metadata.strength * 4);
  }

  // CLUSTER_MEMBER: thickness based on similarity_score
  if (typeof metadata.similarity_score === 'number') {
    return baseThickness + (metadata.similarity_score * 4);
  }

  return baseThickness;
}

/**
 * Get opacity modifier based on edge metadata
 * Returns multiplier to apply to base color opacity
 */
export function getEdgeOpacity(
  kind: string,
  metadata?: Record<string, unknown>
): number {
  if (!metadata) return 1.0;

  // Score-based edges (NEAR_DUP, CLUSTER_MEMBER)
  if (typeof metadata.score === 'number') {
    return 0.4 + (metadata.score * 0.6); // 0.4-1.0 range
  }

  // Weight-based edges (BELONGS_TO_TOPIC)
  if (typeof metadata.weight === 'number') {
    return 0.4 + (metadata.weight * 0.6);
  }

  // Strength-based edges (SUPPORTS, REFUTES)
  if (typeof metadata.strength === 'number') {
    return 0.4 + (metadata.strength * 0.6);
  }

  // Similarity score (CLUSTER_MEMBER)
  if (typeof metadata.similarity_score === 'number') {
    return 0.4 + (metadata.similarity_score * 0.6);
  }

  // Confidence (DERIVES_FROM)
  if (typeof metadata.confidence === 'number') {
    return 0.4 + (metadata.confidence * 0.6);
  }

  return 1.0;
}

/**
 * Apply opacity modifier to an rgba color string
 */
export function applyOpacity(rgba: string, multiplier: number): string {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return rgba;
  const [, r, g, b, a = '1'] = match;
  const newAlpha = Math.min(1, parseFloat(a) * multiplier);
  return `rgba(${r}, ${g}, ${b}, ${newAlpha.toFixed(3)})`;
}

/**
 * Get all unique edge kinds from a list, sorted by category
 */
export function getEdgeKindsSorted(kinds: string[]): string[] {
  const unique = [...new Set(kinds)];
  return unique.sort((a, b) => {
    const styleA = EDGE_STYLES[a] || DEFAULT_EDGE_STYLE;
    const styleB = EDGE_STYLES[b] || DEFAULT_EDGE_STYLE;
    // Sort by category first, then alphabetically
    const categoryOrder = { structural: 0, similarity: 1, semantic: 2, verification: 3 };
    const catDiff = categoryOrder[styleA.category] - categoryOrder[styleB.category];
    if (catDiff !== 0) return catDiff;
    return styleA.label.localeCompare(styleB.label);
  });
}
