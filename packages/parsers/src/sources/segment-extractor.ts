import { NormalizedConversation, UserSegment, ImportConfig } from '../types';
import { fingerprint } from '../utils/fingerprint';
import { nanoid } from 'nanoid';

/**
 * Extract user/assistant segments from conversations for Sources Mode
 */
export class SegmentExtractor {
  constructor(private config: ImportConfig) {}

  /**
   * Extract segments from multiple conversations
   */
  extractAll(conversations: NormalizedConversation[]): UserSegment[] {
    const segments: UserSegment[] = [];

    for (const conv of conversations) {
      const convSegments = this.extractFromConversation(conv);
      segments.push(...convSegments);
    }

    return segments;
  }

  /**
   * Extract segments from a single conversation
   */
  private extractFromConversation(conv: NormalizedConversation): UserSegment[] {
    const segments: UserSegment[] = [];
    const { sources_role_subset, sources_min_chars_user, sources_min_chars_assistant } =
      this.config;

    // Group consecutive messages by same role if needed
    const messageGroups = this.groupConsecutiveMessages(conv);

    for (const group of messageGroups) {
      const role = group.role;

      // Filter by role subset
      if (sources_role_subset === 'user' && role !== 'user') continue;
      if (sources_role_subset === 'assistant' && role !== 'assistant') continue;
      // 'both' includes everything

      // Check minimum character threshold
      const minChars =
        role === 'user' ? sources_min_chars_user : sources_min_chars_assistant;

      const combinedContent = group.messages.map(m => m.content).join('\n\n');

      if (combinedContent.length < minChars) continue;

      // Create segment
      const segment: UserSegment = {
        segment_id: `seg_${nanoid()}`,
        conversation_id: conv.conversation_id,
        role: role as 'user' | 'assistant',
        content: combinedContent,
        hash: fingerprint(combinedContent),
        char_count: combinedContent.length,
        timestamp: group.messages[0].timestamp,
        message_idx_start: group.messages[0].index,
        message_idx_end: group.messages[group.messages.length - 1].index,
        original_title: conv.title,
      };

      segments.push(segment);
    }

    return segments;
  }

  /**
   * Group consecutive messages by same role
   */
  private groupConsecutiveMessages(conv: NormalizedConversation) {
    const groups: Array<{
      role: string;
      messages: typeof conv.messages;
    }> = [];

    let currentGroup: typeof groups[0] | null = null;

    for (const msg of conv.messages) {
      // Skip system messages
      if (msg.role === 'system') continue;

      if (!currentGroup || currentGroup.role !== msg.role) {
        // Start new group
        currentGroup = {
          role: msg.role,
          messages: [msg],
        };
        groups.push(currentGroup);
      } else {
        // Add to current group
        currentGroup.messages.push(msg);
      }
    }

    return groups;
  }

  /**
   * Filter segments by dedupe (exact hash)
   */
  dedupeExact(segments: UserSegment[]): UserSegment[] {
    const seen = new Set<string>();
    const unique: UserSegment[] = [];

    for (const segment of segments) {
      if (!seen.has(segment.hash)) {
        seen.add(segment.hash);
        unique.push(segment);
      }
    }

    return unique;
  }
}
