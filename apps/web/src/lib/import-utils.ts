import { ImportResult } from '@/types/chat-import';
import { KeimenonNode, KeimenonEdge } from '@/store/keimenonStore';

/**
 * Convert import result to keimenon nodes and edges
 */
export function importResultToKeimenonData(result: ImportResult): {
  nodes: KeimenonNode[];
  edges: KeimenonEdge[];
} {
  const nodes: KeimenonNode[] = [];
  const edges: KeimenonEdge[] = [];

  // Position calculation helpers
  const CONVERSATION_SPACING = 300;
  const MESSAGE_SPACING = 80;
  const SOURCE_OFFSET_X = 400;
  const CODE_OFFSET_X = 800;

  // Create conversation nodes
  result.conversations.forEach((conv, convIndex) => {
    const convX = 0;
    const convY = convIndex * CONVERSATION_SPACING;

    nodes.push({
      id: conv.id,
      type: 'conversation',
      position: { x: convX, y: convY },
      data: {
        label: conv.title,
        metadata: {
          platform: conv.platform,
          messageCount: conv.message_count,
        },
      },
    });

    // Create message nodes (sample first few for visualization)
    const maxMessagesToShow = 5;
    for (let i = 0; i < Math.min(maxMessagesToShow, conv.message_count); i++) {
      const msgId = `${conv.id}_msg_${i}`;
      nodes.push({
        id: msgId,
        type: 'message',
        position: {
          x: convX + 200,
          y: convY + i * MESSAGE_SPACING,
        },
        data: {
          label: `Message ${i + 1}`,
          metadata: {
            conversationId: conv.id,
            index: i,
          },
        },
      });

      // Add edge from conversation to message
      edges.push({
        id: `${conv.id}-${msgId}`,
        source: conv.id,
        target: msgId,
        type: 'contains',
      });
    }
  });

  // Create source nodes
  result.sources.forEach((source, sourceIndex) => {
    const sourceY = sourceIndex * 150;

    nodes.push({
      id: source.source_id,
      type: 'source',
      position: {
        x: SOURCE_OFFSET_X,
        y: sourceY,
      },
      data: {
        label: source.canonical_title,
        metadata: {
          nSegments: source.n_segments,
          nChars: source.n_chars,
        },
      },
    });

    // Add edges from source to conversations it was compiled from
    source.provenance.forEach((prov: any) => {
      const targetConv = result.conversations.find((c) => c.id === prov.conversation_id);
      if (targetConv) {
        edges.push({
          id: `${source.source_id}-${prov.conversation_id}`,
          source: source.source_id,
          target: prov.conversation_id,
          type: 'compiled',
          data: {
            messageRange: `${prov.message_idx_start}-${prov.message_idx_end}`,
          },
        });
      }
    });
  });

  // Create code asset nodes
  result.code_assets.forEach((asset, assetIndex) => {
    const assetY = assetIndex * 100;

    nodes.push({
      id: asset.id,
      type: 'code',
      position: {
        x: CODE_OFFSET_X,
        y: assetY,
      },
      data: {
        label: `${asset.language} code`,
        metadata: {
          language: asset.language,
          ext: asset.ext,
          conversationId: asset.conversation_id,
        },
      },
    });

    // Add edge from code to source message
    edges.push({
      id: `${asset.id}-${asset.derived_from_message_id}`,
      source: asset.id,
      target: asset.derived_from_message_id,
      type: 'derives',
    });
  });

  return { nodes, edges };
}

/**
 * Calculate statistics from import result
 */
export function calculateImportStats(result: ImportResult) {
  return {
    totalConversations: result.stats.total_conversations,
    totalMessages: result.stats.total_messages,
    totalSources: result.stats.total_sources,
    totalCodeBlocks: result.stats.total_code_blocks,
    userMessages: result.stats.user_messages,
    assistantMessages: result.stats.assistant_messages,
    duplicateCandidates: result.stats.duplicate_candidates || 0,
    avgMessagesPerConv:
      result.stats.total_conversations > 0
        ? Math.round(result.stats.total_messages / result.stats.total_conversations)
        : 0,
    codeBlocksPerConv:
      result.stats.total_conversations > 0
        ? (result.stats.total_code_blocks / result.stats.total_conversations).toFixed(1)
        : '0',
  };
}

/**
 * Format file size in bytes to human readable
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Validate import configuration
 */
export function validateImportConfig(config: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.code_min_chars && config.code_min_chars < 0) {
    errors.push('Code minimum characters must be positive');
  }

  if (
    config.duplicate_similarity_threshold &&
    (config.duplicate_similarity_threshold < 0 || config.duplicate_similarity_threshold > 1)
  ) {
    errors.push('Duplicate similarity threshold must be between 0 and 1');
  }

  if (config.duplicate_length_ratio_tolerance && config.duplicate_length_ratio_tolerance < 0) {
    errors.push('Length ratio tolerance must be positive');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate a unique ID for import sessions
 */
export function generateImportId(): string {
  return `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse platform from file name or content
 */
export function detectPlatform(fileName: string): string | null {
  const lower = fileName.toLowerCase();

  if (lower.includes('claude')) return 'claude';
  if (lower.includes('chatgpt') || lower.includes('openai')) return 'chatgpt';
  if (lower.includes('gemini') || lower.includes('bard')) return 'gemini';
  if (lower.includes('copilot')) return 'copilot';

  return null;
}

/**
 * Sanitize user input for safe display
 */
export function sanitizeText(text: string, maxLength: number = 1000): string {
  // Remove potential XSS
  const sanitized = text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // Truncate if too long
  if (sanitized.length > maxLength) {
    return sanitized.substring(0, maxLength) + '...';
  }

  return sanitized;
}
