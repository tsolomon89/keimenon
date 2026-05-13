/**
 * Enhanced Auto-Grouping Service
 * Deterministic grouping using mixed keyword/phrase/n-gram TF-IDF features.
 */

import { createHash } from 'node:crypto';
import {
  extractKeywords,
  buildCooccurrenceMatrix,
  clusterKeywords,
  assignMessagesToClusters,
  findMessagesByKeywords,
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
  sources: string[];
  isManual: boolean;
  isCatchAll?: boolean;
  confidence?: number;
}

export interface GroupingDiagnostics {
  featureModel: 'tfidf_mixed_features_v1';
  eligibleMessages: number;
  assignedMessages: number;
  unmatchedMessages: number;
  duplicateAssignments: number;
  nonCatchAllGroupCount: number;
  topLabels: string[];
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
    diagnostics: GroupingDiagnostics;
  };
}

const LOW_SIGNAL_LABELS = new Set([
  'analysis',
  'other',
  'uncategorized',
  'general',
  'misc',
  'messages',
  'conversation',
  'chat',
  'topic',
]);

export function normalizeGroupLabelKey(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

function stableHash(value: string, length: number = 16): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function toDisplayLabel(raw: string): string {
  const normalized = raw
    .replace(/^phrase:/, '')
    .replace(/^bi:/, '')
    .replace(/^tri:/, '')
    .replace(/_/g, ' ')
    .trim();
  if (!normalized) {
    return 'Untitled Group';
  }
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isLowSignalLabel(raw: string): boolean {
  const normalized = raw
    .toLowerCase()
    .replace(/^phrase:|^bi:|^tri:/, '')
    .replace(/_/g, ' ')
    .trim();
  if (!normalized) {
    return true;
  }
  return LOW_SIGNAL_LABELS.has(normalized);
}

function toDeterministicGroupId(
  prefix: 'manual' | 'auto',
  name: string,
  sourceIds: string[]
): string {
  const payload = `${prefix}:${name}:${[...sourceIds].sort().join('|')}`;
  return `grp_${prefix}_${stableHash(payload, 20)}`;
}

function pickGroupName(clusterName: string, keywords: string[], usedNames: Set<string>): string {
  const candidates = [clusterName, ...keywords];
  const selected = candidates.find((candidate) => !isLowSignalLabel(candidate)) || clusterName;
  let display = toDisplayLabel(selected);
  if (!display) {
    display = 'Untitled Group';
  }

  if (!usedNames.has(display)) {
    usedNames.add(display);
    return display;
  }

  let suffix = 2;
  let next = `${display} ${suffix}`;
  while (usedNames.has(next)) {
    suffix += 1;
    next = `${display} ${suffix}`;
  }
  usedNames.add(next);
  return next;
}

function sortSourcesByInputOrder(sourceIds: string[], messageOrder: Map<string, number>): string[] {
  return [...sourceIds].sort((left, right) => {
    const leftOrder = messageOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = messageOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.localeCompare(right);
  });
}

export class EnhancedAutogroupService {
  async autoGroupMessages(
    messages: Message[],
    config: AutogroupRuntimeConfig
  ): Promise<AutoGroupResult> {
    const groups: Group[] = [];
    const mode = config.mode;
    const useManualFirstPass = mode === 'manual' || mode === 'hybrid';
    const usedNames = new Set<string>();
    const messageOrder = new Map<string, number>();

    messages.forEach((message, index) => {
      messageOrder.set(message.id, index);
    });

    // Manual groups always run first in manual/hybrid mode, with non-overlapping assignments.
    const assignedToManual = new Set<string>();
    if (useManualFirstPass && config.manual && config.manual.length > 0) {
      for (const manual of config.manual) {
        const matchingMessages = findMessagesByKeywords(messages, manual.keywords).filter(
          (message) => !assignedToManual.has(message.id)
        );

        if (matchingMessages.length === 0) {
          continue;
        }

        const sourceIds = sortSourcesByInputOrder(
          matchingMessages.map((message) => message.id),
          messageOrder
        );
        sourceIds.forEach((sourceId) => assignedToManual.add(sourceId));

        const groupName = pickGroupName(manual.name, manual.keywords, usedNames);
        groups.push({
          id: toDeterministicGroupId('manual', groupName, sourceIds),
          name: groupName,
          keywords: [...new Set(manual.keywords.map((keyword) => keyword.trim()).filter(Boolean))],
          sources: sourceIds,
          isManual: true,
          confidence: 1.0,
        });
      }
    }

    const unassignedMessages = messages.filter((message) => !assignedToManual.has(message.id));
    const topKeywords = extractKeywords(unassignedMessages, 100);

    if (topKeywords.length > 0) {
      const cooccurrence = buildCooccurrenceMatrix(unassignedMessages, topKeywords);
      const targetCount = config.automatic?.targetGroupCount || 25;
      const keywordClusters = clusterKeywords(cooccurrence, targetCount);
      const messageAssignments = assignMessagesToClusters(unassignedMessages, keywordClusters);
      const minGroupSize = config.automatic?.minGroupSize || 2;

      const sortedAssignments = Array.from(messageAssignments.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      for (const [clusterName, clusteredMessages] of sortedAssignments) {
        if (clusteredMessages.length < minGroupSize) {
          continue;
        }

        const keywords = (keywordClusters.get(clusterName) || [clusterName]).slice().sort();
        const sourceIds = sortSourcesByInputOrder(
          clusteredMessages.map((message) => message.id),
          messageOrder
        );
        const groupName = pickGroupName(clusterName, keywords, usedNames);

        groups.push({
          id: toDeterministicGroupId('auto', groupName, sourceIds),
          name: groupName,
          keywords,
          sources: sourceIds,
          isManual: false,
          confidence: this.calculateGroupConfidence(sourceIds.length, unassignedMessages.length),
        });
      }
    }

    if (config.automatic?.createCatchAll && unassignedMessages.length > 0) {
      const assignedToAny = new Set<string>();
      for (const group of groups) {
        for (const sourceId of group.sources) {
          assignedToAny.add(sourceId);
        }
      }
      const leftovers = unassignedMessages.filter((m) => !assignedToAny.has(m.id));
      if (leftovers.length > 0) {
        const sourceIds = sortSourcesByInputOrder(
          leftovers.map((message) => message.id),
          messageOrder
        );
        groups.push({
          id: toDeterministicGroupId('auto', 'Miscellaneous', sourceIds),
          name: 'Miscellaneous',
          keywords: [],
          sources: sourceIds,
          isManual: false,
          isCatchAll: false,
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
        nonCatchAllGroups: result.stats.diagnostics.nonCatchAllGroupCount,
      })
    );
    return result;
  }

  private calculateGroupConfidence(groupSize: number, totalMessages: number): number {
    const ratio = totalMessages > 0 ? groupSize / totalMessages : 0;
    if (ratio > 0.1) return 0.9;
    if (ratio > 0.05) return 0.7;
    if (ratio > 0.02) return 0.5;
    return 0.3;
  }

  private buildResult(groups: Group[], allMessages: Message[]): AutoGroupResult {
    const manualGroups = groups.filter((group) => group.isManual);
    const autoGroups = groups.filter((group) => !group.isManual && !group.isCatchAll);
    const catchAllGroup = groups.find((group) => group.isCatchAll);

    const totalAssignments = groups.reduce((sum, group) => sum + group.sources.length, 0);
    const uniqueAssignments = new Set(groups.flatMap((group) => group.sources));
    const assignedCount = uniqueAssignments.size;
    const unmatchedSources = Math.max(0, allMessages.length - assignedCount);
    const duplicateAssignments = Math.max(0, totalAssignments - assignedCount);
    const avgGroupSize = groups.length > 0 ? Math.round(assignedCount / groups.length) : 0;

    const topLabels = groups
      .filter((group) => !group.isCatchAll)
      .sort((a, b) => {
        if (b.sources.length !== a.sources.length) {
          return b.sources.length - a.sources.length;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map((group) => group.name);

    return {
      groups,
      stats: {
        totalGroups: groups.length,
        manualGroups: manualGroups.length,
        autoGroups: autoGroups.length,
        catchAllGroup: !!catchAllGroup,
        totalSources: allMessages.length,
        unmatchedSources,
        avgGroupSize,
        diagnostics: {
          featureModel: 'tfidf_mixed_features_v1',
          eligibleMessages: allMessages.length,
          assignedMessages: assignedCount,
          unmatchedMessages: unmatchedSources,
          duplicateAssignments,
          nonCatchAllGroupCount: groups.filter((group) => !group.isCatchAll).length,
          topLabels,
        },
      },
    };
  }

  async recomputeGroups(
    messages: Message[],
    config: AutogroupRuntimeConfig,
    newTargetCount: number
  ): Promise<AutoGroupResult> {
    const nextConfig: AutogroupRuntimeConfig = {
      ...config,
      automatic: {
        targetGroupCount: newTargetCount,
        createCatchAll: false,
        minGroupSize: config.automatic?.minGroupSize ?? 2,
        algorithm: config.automatic?.algorithm ?? 'tfidf',
      },
    };

    return this.autoGroupMessages(messages, nextConfig);
  }

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
    const usedNames = new Set<string>();

    const suggestions: Array<{ name: string; keywords: string[]; messageCount: number }> = [];
    for (const [clusterName, assignedMessages] of Array.from(assignments.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      if (assignedMessages.length < 2) {
        continue;
      }
      const clusterKeywords = (clusters.get(clusterName) || [clusterName]).slice().sort();
      suggestions.push({
        name: pickGroupName(clusterName, clusterKeywords, usedNames),
        keywords: clusterKeywords,
        messageCount: assignedMessages.length,
      });
    }

    return suggestions.sort((a, b) => {
      if (b.messageCount !== a.messageCount) {
        return b.messageCount - a.messageCount;
      }
      return a.name.localeCompare(b.name);
    });
  }
}
