/**
 * Node Label Utility
 *
 * Provides human-readable labels for graph nodes.
 * Used by both Keimenon2D canvas visualization and NodeDetailPanel.
 */

/**
 * Extended node interface with optional label-related properties.
 * These properties are spread from KeimenonNode.data.metadata.
 */
export interface LabelableNode {
  id: string;
  kind: string;
  // Label properties (spread from metadata)
  label?: string;
  title?: string;
  name?: string;
  role?: string;
  language?: string;
  text?: string; // For Phrase nodes
  lemma?: string; // For Lexeme nodes
  claim_text?: string; // For VerifiedClaim nodes
  normalized_text?: string; // For Phrase nodes (alternative)
  // World Model V5: Principal nodes
  display_name?: string; // For Principal nodes
  principal_kind?: 'human' | 'agent' | 'contact';
  email?: string; // For human Principals
  platform?: string; // For agent Principals (chatgpt, claude, gemini)
  // World Model V5: ConversationThread nodes
  purpose?: string;
}

/**
 * Get a human-readable label for a graph node.
 * Checks multiple properties in priority order based on node type.
 *
 * @param node - The graph node to get label for
 * @param maxLength - Maximum label length before truncation (default: 24)
 * @returns Human-readable label string
 */
export function getNodeLabel(node: LabelableNode, maxLength: number = 24): string {
  let label: string;

  // Priority 1: Explicit label property
  if (node.label) {
    label = node.label;
  }
  // Priority 2: Title (common for Source, VerifiedSource)
  else if (node.title) {
    label = node.title;
  }
  // Priority 3: Name (common for Topic, general nodes)
  else if (node.name) {
    label = node.name;
  }
  // Priority 4: V2 Spine node specific properties
  else if (node.kind === 'Lexeme' && node.lemma) {
    label = node.lemma;
  } else if (node.kind === 'Phrase' && (node.text || node.normalized_text)) {
    label = node.text || node.normalized_text || '';
  } else if (node.kind === 'VerifiedClaim' && node.claim_text) {
    label = node.claim_text;
  }
  // Priority 4b: World Model V5 Principal nodes
  else if (node.kind === 'Principal') {
    if (node.display_name) {
      label = node.display_name;
    } else if (node.principal_kind === 'agent' && node.platform) {
      label = formatPlatformName(node.platform);
    } else if (node.principal_kind === 'human' && node.email) {
      label = node.email;
    } else {
      label = formatPrincipalKind(node.principal_kind);
    }
  }
  // Priority 4c: World Model V5 ConversationThread nodes
  else if (node.kind === 'ConversationThread') {
    if (node.title) {
      label = node.title;
    } else if (node.purpose) {
      label = `${capitalize(node.purpose)} thread`;
    } else {
      label = 'Conversation';
    }
  }
  // Priority 5: Role-based label (for messages)
  else if (node.role) {
    label = `${capitalize(node.role)} message`;
  }
  // Priority 6: Language-based label (for code)
  else if (node.language) {
    label = `${node.language} code`;
  }
  // Fallback: Node type name
  else {
    label = formatNodeType(node.kind);
  }

  return truncateText(label, maxLength);
}

/**
 * Truncate text with ellipsis if exceeds maxLength
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026'; // Unicode ellipsis
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Format node type/kind to readable label
 * Handles camelCase and PascalCase
 */
function formatNodeType(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Format platform name for agent Principals
 */
function formatPlatformName(platform: string): string {
  const platformNames: Record<string, string> = {
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    unknown: 'AI Assistant',
  };
  return platformNames[platform.toLowerCase()] || platform;
}

/**
 * Format principal_kind to human-readable label
 */
function formatPrincipalKind(kind?: string): string {
  if (!kind) return 'Principal';
  const kindLabels: Record<string, string> = {
    human: 'User',
    agent: 'AI Assistant',
    contact: 'Contact',
  };
  return kindLabels[kind] || 'Principal';
}
