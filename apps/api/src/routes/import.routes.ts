import { Router, Request, Response } from 'express';
import { SimilarityEngineV2, type SimilarityEngineDocument } from '@keimenon/parsers';
import { normalizeImportOptions } from '@keimenon/types';
import { requireAuth } from '../middleware/auth.middleware';
import type { AuthServiceV2 } from '../services/auth.service';
import { isSemanticStageKillSwitchEnabled } from '../utils/gate-e-kill-switches';
import { applySemanticStageKillSwitchToEdges } from '../utils/semantic-stage-kill-switch';

type PreviewMessage = {
  id?: string;
  content?: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system' | string;
  timestamp?: number;
  index?: number;
  conversationId?: string;
  conversation_id?: string;
};

type PreviewConversation = {
  id?: string;
  conversationId?: string;
  messages?: PreviewMessage[];
};

function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function hashId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0)
    .toString(16)
    .padStart(8, '0');
}

function toNumeric(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(percentile * (sorted.length - 1)))
  );
  return sorted[index];
}

function extractAnchorTerms(
  docs: SimilarityEngineDocument[],
  maxTerms: number
): Array<{ term: string; count: number }> {
  const stopWords = new Set([
    'about',
    'after',
    'also',
    'and',
    'are',
    'because',
    'been',
    'before',
    'between',
    'from',
    'have',
    'just',
    'more',
    'most',
    'only',
    'other',
    'that',
    'their',
    'there',
    'these',
    'this',
    'those',
    'what',
    'when',
    'where',
    'which',
    'with',
    'would',
    'your',
    'the',
    'for',
    'not',
    'you',
  ]);

  const frequencies = new Map<string, number>();
  for (const doc of docs) {
    const tokens = normalizeText(doc.text).match(/[a-z0-9_]{3,}/g) || [];
    const unique = new Set<string>();
    for (const token of tokens) {
      if (stopWords.has(token)) {
        continue;
      }
      unique.add(token);
    }
    for (const token of unique) {
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }
  }

  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms)
    .map(([term, count]) => ({ term, count }));
}

function parsePreviewMessages(payload: any): PreviewMessage[] {
  if (Array.isArray(payload?.messages)) {
    return payload.messages;
  }

  if (Array.isArray(payload?.conversations)) {
    const flattened: PreviewMessage[] = [];
    for (const conversation of payload.conversations as PreviewConversation[]) {
      const conversationId =
        conversation.id || conversation.conversationId || `conv_${flattened.length + 1}`;
      for (const message of conversation.messages || []) {
        flattened.push({
          ...message,
          conversationId: message.conversationId || message.conversation_id || conversationId,
        });
      }
    }
    return flattened;
  }

  if (Array.isArray(payload?.sources)) {
    return payload.sources.map((source: any, index: number) => ({
      id: source.id || `src_${index + 1}`,
      content: source.text || source.content || '',
      role: source.role || 'user',
      conversationId: source.conversationId || source.conversation_id || `source_${index + 1}`,
      timestamp: source.timestamp || Date.now() + index,
      index,
    }));
  }

  return [];
}

function materializePreviewDocuments(
  messages: PreviewMessage[],
  config: ReturnType<typeof normalizeImportOptions>
): SimilarityEngineDocument[] {
  const filteredMessages = messages
    .map((message, index) => ({
      id: message.id || `msg_${index + 1}`,
      content: (message.content || message.text || '').trim(),
      role: message.role || 'user',
      conversationId: message.conversationId || message.conversation_id || `conv_${index + 1}`,
      timestamp: toNumeric(message.timestamp, Date.now() + index),
      index: toNumeric(message.index, index),
    }))
    .filter((message) => {
      if (message.role === 'user' && !config.extraction.includeUser) {
        return false;
      }
      if (message.role === 'assistant' && !config.extraction.includeAssistant) {
        return false;
      }
      return message.content.length >= config.minMessageLength;
    })
    .sort(
      (a, b) =>
        a.conversationId.localeCompare(b.conversationId) ||
        a.index - b.index ||
        a.timestamp - b.timestamp
    );

  if (filteredMessages.length === 0) {
    return [];
  }

  if (config.branches === 'merged') {
    const byConversation = new Map<string, typeof filteredMessages>();
    for (const message of filteredMessages) {
      if (!byConversation.has(message.conversationId)) {
        byConversation.set(message.conversationId, []);
      }
      byConversation.get(message.conversationId)!.push(message);
    }

    return [...byConversation.entries()].map(([conversationId, conversationMessages]) => ({
      id: `preview_${hashId(`merged:${conversationId}`)}`,
      text: conversationMessages.map((message) => message.content).join('\n\n'),
      conversationId,
      role: 'user',
      timestamp: conversationMessages[0]?.timestamp,
    }));
  }

  const byBranch = new Map<string, typeof filteredMessages>();
  for (const message of filteredMessages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue;
    }
    const key = `${message.conversationId}:${message.role}`;
    if (!byBranch.has(key)) {
      byBranch.set(key, []);
    }
    byBranch.get(key)!.push(message);
  }

  return [...byBranch.entries()].map(([branchKey, branchMessages]) => {
    const [conversationId, role] = branchKey.split(':');
    return {
      id: `preview_${hashId(`branch:${branchKey}`)}`,
      text: branchMessages.map((message) => message.content).join('\n\n'),
      conversationId,
      role,
      timestamp: branchMessages[0]?.timestamp,
    };
  });
}

export function createImportRoutes(authService: AuthServiceV2): Router {
  const router = Router();
  const similarityEngine = new SimilarityEngineV2();

  router.post('/similarity-preview', requireAuth(authService), (req: Request, res: Response) => {
    try {
      const config = normalizeImportOptions(req.body?.config);
      const messages = parsePreviewMessages(req.body);
      const documents = materializePreviewDocuments(messages, config);

      if (documents.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No eligible messages found for preview after applying import filters.',
        });
      }

      const semanticKillSwitchEnabled = isSemanticStageKillSwitchEnabled();
      const result = similarityEngine.analyze({
        documents,
        runtime: {
          disableSemanticStage: semanticKillSwitchEnabled,
        },
      });
      if (semanticKillSwitchEnabled) {
        applySemanticStageKillSwitchToEdges(result.edges as any[]);
      }

      const massValues = Object.values(result.massByNode);
      const strong = result.edges.filter((edge) => edge.strength === 'strong').length;
      const medium = result.edges.filter((edge) => edge.strength === 'medium').length;
      const weak = result.edges.filter((edge) => edge.strength === 'weak').length;
      const duplicateThreshold = config.duplicateDetection.similarityThreshold;
      const expectedReviewLoad = config.duplicateDetection.enabled
        ? result.edges.filter(
            (edge) => edge.lexical >= duplicateThreshold || edge.total >= duplicateThreshold
          ).length
        : 0;

      const response = {
        success: true,
        summary: {
          input: {
            messages: messages.length,
            previewDocuments: documents.length,
            branches: config.branches,
            processingMode: config.processingMode,
          },
          runtime: {
            semanticStageEnabled: !semanticKillSwitchEnabled,
          },
          predicted: {
            clusterCount: result.clusters.length,
            edgeCount: result.edges.length,
            edgeStrength: {
              strong,
              medium,
              weak,
            },
            expectedReviewLoad,
          },
          mass: {
            min: Math.min(...massValues),
            mean:
              massValues.length > 0
                ? massValues.reduce((sum, value) => sum + value, 0) / massValues.length
                : 0,
            p50: computePercentile(massValues, 0.5),
            p95: computePercentile(massValues, 0.95),
            max: Math.max(...massValues),
          },
          anchors: extractAnchorTerms(documents, 12),
          generatedAt: Date.now(),
        },
      };

      return res.json(response);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: error?.message || 'Failed to generate similarity preview',
      });
    }
  });

  return router;
}
