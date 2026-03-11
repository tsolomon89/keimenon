/**
 * Enhanced Auto-Grouping Service
 * Uses TF-IDF keyword extraction and clustering for intelligent grouping
 */

import { nanoid } from 'nanoid';
import {
  extractKeywords,
  buildCooccurrenceMatrix,
  clusterKeywords,
  assignMessagesToClusters,
  findMessagesByKeywords,
  type KeywordScore,
  type Message,
} from './keyword-extractor';

export interface AutogroupRuntimeConfig {
  mode: 'automatic' | 'manual' | 'hybrid';
  automatic?: {
    targetGroupCount?: number;
    createCatchAll?: boolean;
    minGroupSize?: number;
    algorithm?: 'keyword' | 'tfidf' | 'embedding';
  };
  manual?: Array<{
    name: string;
    keywords: string[];
    color?: string;
    icon?: string;
  }>;
}

export interface Group {
  id: string;
  name: string;
  keywords: string[];
  sources: string[]; // Message IDs
  isManual: boolean;
  isCatchAll?: boolean;
  confidence?: number;
}

export interface AutoGroupResult {
  groups: Group[];
  stats: {
    totalGroups: number;
    manualGroups: number;
    autoGroups: number;
    catchAllGroup: boolean;
    totalSources: number;
    unmatchedSources: number;
    avgGroupSize: number;
  };
}

/**
 * Enhanced auto-grouping service using TF-IDF
 */
export class EnhancedAutogroupService {
  /**
   * Auto-group messages based on keyword clustering
   */
  async autoGroupMessages(
    messages: Message[],
    config: AutogroupRuntimeConfig
  ): Promise<AutoGroupResult> {
    const groups: Group[] = [];
    const mode: AutogroupRuntimeConfig['mode'] = config.mode;
    const useManualFirstPass = mode === 'manual' || mode === 'hybrid';

    // Step 1 (manual/hybrid only): Create manual groups first (manual-priority behavior)
    if (useManualFirstPass && config.manual && config.manual.length > 0) {
      for (const manual of config.manual) {
        const matchingMessages = findMessagesByKeywords(messages, manual.keywords);

        if (matchingMessages.length > 0) {
          groups.push({
            id: `grp_manual_${nanoid()}`,
            name: manual.name,
            keywords: manual.keywords,
            sources: matchingMessages.map((m) => m.id),
            isManual: true,
            confidence: 1.0,
          });
        }
      }
    }

    // Track which messages are already assigned to manual groups
    const assignedToManual = new Set<string>(groups.flatMap((g) => g.sources));

    // Filter out messages already in manual groups
    const unassignedMessages = messages.filter((m) => !assignedToManual.has(m.id));

    // Step 2: Extract keywords using TF-IDF
    const topKeywords = extractKeywords(unassignedMessages, 100);

    if (topKeywords.length === 0) {
      // No keywords found, return manual groups only
      const result = this.buildResult(groups, messages);
      console.log(
        '[AutoGroup] batch summary',
        JSON.stringify({
          mode,
          totalMessages: messages.length,
          manualGroups: result.stats.manualGroups,
          autoGroups: result.stats.autoGroups,
          unmatchedSources: result.stats.unmatchedSources,
        })
      );
      return result;
    }

    // Step 3: Build keyword co-occurrence matrix
    const cooccurrence = buildCooccurrenceMatrix(unassignedMessages, topKeywords);

    // Step 4: Cluster keywords
    const targetCount = config.automatic?.targetGroupCount || 25;
    const keywordClusters = clusterKeywords(cooccurrence, targetCount);

    // Step 5: Assign messages to clusters
    const messageAssignments = assignMessagesToClusters(unassignedMessages, keywordClusters);

    // Step 6: Create auto-generated groups
    let createdCount = 0;
    for (const [clusterName, clusteredMessages] of messageAssignments) {
      const minGroupSize = config.automatic?.minGroupSize || 2;

      if (clusteredMessages.length >= minGroupSize) {
        const keywords = keywordClusters.get(clusterName) || [clusterName];

        groups.push({
          id: `grp_auto_${nanoid()}`,
          name: this.formatGroupName(clusterName),
          keywords,
          sources: clusteredMessages.map((m) => m.id),
          isManual: false,
          confidence: this.calculateGroupConfidence(
            clusteredMessages.length,
            unassignedMessages.length
          ),
        });

        createdCount++;
      }
    }

    // Step 7: Create catch-all group for unmatched messages
    const createCatchAll = config.automatic?.createCatchAll !== false;

    if (createCatchAll) {
      const allAssigned = new Set(groups.flatMap((g) => g.sources));
      const unmatched = messages.filter((m) => !allAssigned.has(m.id));

      if (unmatched.length > 0) {
        groups.push({
          id: `grp_catchall_${nanoid()}`,
          name: 'Other / Uncategorized',
          keywords: [],
          sources: unmatched.map((m) => m.id),
          isManual: false,
          isCatchAll: true,
          confidence: 0.1,
        });
      }
    }

    const result = this.buildResult(groups, messages);
    console.log(
      '[AutoGroup] batch summary',
      JSON.stringify({
        mode,
        totalMessages: messages.length,
        manualGroups: result.stats.manualGroups,
        autoGroups: result.stats.autoGroups,
        unmatchedSources: result.stats.unmatchedSources,
      })
    );
    return result;
  }

  /**
   * Format cluster name for display
   */
  private formatGroupName(clusterName: string): string {
    // Capitalize first letter
    return clusterName.charAt(0).toUpperCase() + clusterName.slice(1);
  }

  /**
   * Calculate confidence score for a group
   */
  private calculateGroupConfidence(groupSize: number, totalMessages: number): number {
    // Higher confidence for larger groups (relative to total)
    const ratio = groupSize / totalMessages;

    if (ratio > 0.1) return 0.9; // > 10% of messages
    if (ratio > 0.05) return 0.7; // > 5%
    if (ratio > 0.02) return 0.5; // > 2%
    return 0.3; // Small group
  }

  /**
   * Build result with statistics
   */
  private buildResult(groups: Group[], allMessages: Message[]): AutoGroupResult {
    const manualGroups = groups.filter((g) => g.isManual);
    const autoGroups = groups.filter((g) => !g.isManual && !g.isCatchAll);
    const catchAllGroup = groups.find((g) => g.isCatchAll);

    const totalAssigned = new Set(groups.flatMap((g) => g.sources)).size;
    const avgGroupSize = groups.length > 0 ? Math.round(totalAssigned / groups.length) : 0;

    return {
      groups,
      stats: {
        totalGroups: groups.length,
        manualGroups: manualGroups.length,
        autoGroups: autoGroups.length,
        catchAllGroup: !!catchAllGroup,
        totalSources: allMessages.length,
        unmatchedSources: allMessages.length - totalAssigned,
        avgGroupSize,
      },
    };
  }

  /**
   * Re-compute groups with different target count
   */
  async recomputeGroups(
    messages: Message[],
    config: AutogroupRuntimeConfig,
    newTargetCount: number
  ): Promise<AutoGroupResult> {
    // Create new config with updated target
    const newConfig: AutogroupRuntimeConfig = {
      ...config,
      automatic: {
        targetGroupCount: newTargetCount,
        createCatchAll: config.automatic?.createCatchAll ?? true,
        minGroupSize: config.automatic?.minGroupSize ?? 2,
        algorithm: config.automatic?.algorithm ?? 'tfidf',
      },
    };

    return this.autoGroupMessages(messages, newConfig);
  }

  /**
   * Get group suggestions without creating them
   */
  async suggestGroups(
    messages: Message[],
    targetCount: number = 25
  ): Promise<Array<{ name: string; keywords: string[]; messageCount: number }>> {
    const keywords = extractKeywords(messages, 100);

    if (keywords.length === 0) {
      return [];
    }

    const cooccurrence = buildCooccurrenceMatrix(messages, keywords);
    const clusters = clusterKeywords(cooccurrence, targetCount);
    const assignments = assignMessagesToClusters(messages, clusters);

    const suggestions: Array<{ name: string; keywords: string[]; messageCount: number }> = [];

    for (const [clusterName, assignedMessages] of assignments) {
      if (assignedMessages.length >= 2) {
        suggestions.push({
          name: this.formatGroupName(clusterName),
          keywords: clusters.get(clusterName) || [clusterName],
          messageCount: assignedMessages.length,
        });
      }
    }

    return suggestions.sort((a, b) => b.messageCount - a.messageCount);
  }
}
