import { KeimenonNode } from '@/store/keimenonStore';

export type ConversationContextSpec = {
  source_ids: string[];
  group_ids: string[];
  include_pinned: boolean;
  expansion_rule: 'none' | 'neighbors' | 'connected';
};

export type ConversationContextSummary = {
  contextSpec: ConversationContextSpec;
  selectedNodeCount: number;
  unsupportedNodeCount: number;
};

// Eligible source kinds map directly to source_ids
const ELIGIBLE_SOURCE_KINDS = new Set(['Source', 'SourceDoc', 'VerifiedSource']);

// Eligible group kinds map directly to group_ids
const ELIGIBLE_GROUP_KINDS = new Set(['Group', 'Folder']);

/**
 * Classifies an array of selected nodes by their backend canonical `kind`
 * and maps eligible nodes into a valid ConversationContextSpec.
 * Ineligible nodes are ignored in the spec but counted in the summary.
 */
export function buildConversationContextFromSelection(
  nodes: KeimenonNode[]
): ConversationContextSummary {
  const source_ids: string[] = [];
  const group_ids: string[] = [];
  let unsupportedNodeCount = 0;

  for (const node of nodes) {
    // Prefer node.kind, fallback to node.type if kind is strictly undefined (though kind is the canonical backend field)
    const nodeKind = node.kind || node.type;

    if (ELIGIBLE_SOURCE_KINDS.has(nodeKind)) {
      source_ids.push(node.id);
    } else if (ELIGIBLE_GROUP_KINDS.has(nodeKind)) {
      group_ids.push(node.id);
    } else {
      unsupportedNodeCount++;
    }
  }

  return {
    contextSpec: {
      source_ids,
      group_ids,
      include_pinned: false,
      expansion_rule: 'none',
    },
    selectedNodeCount: nodes.length,
    unsupportedNodeCount,
  };
}
