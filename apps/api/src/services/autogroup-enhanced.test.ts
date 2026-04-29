import { describe, expect, test } from 'vitest';
import { EnhancedAutogroupService, type AutogroupRuntimeConfig } from './autogroup-enhanced';

const messages = [
  {
    id: 'm1',
    role: 'user',
    content:
      'manualkeyword manualkeyword planning architecture implementation details for deterministic matching',
  },
  {
    id: 'm2',
    role: 'user',
    content: 'autokeyword autokeyword clustering relevance ranking embeddings pipeline design',
  },
  {
    id: 'm3',
    role: 'assistant',
    content: 'autokeyword retrieval ranking pipeline metrics evaluation synthesis',
  },
];

describe('EnhancedAutogroupService processing mode semantics', () => {
  test('mode=automatic ignores manual definitions', async () => {
    const service = new EnhancedAutogroupService();
    const config: AutogroupRuntimeConfig = {
      mode: 'automatic',
      automatic: {
        targetGroupCount: 4,
        createCatchAll: true,
        minGroupSize: 1,
        algorithm: 'tfidf',
      },
      manual: [{ name: 'Manual Keyword Group', keywords: ['manualkeyword'] }],
    };

    const result = await service.autoGroupMessages(messages, config);

    expect(result.stats.manualGroups).toBe(0);
    expect(result.groups.some((group) => group.name === 'Manual Keyword Group')).toBe(false);
  });

  test('mode=manual applies manual groups first with auto fallback', async () => {
    const service = new EnhancedAutogroupService();
    const config: AutogroupRuntimeConfig = {
      mode: 'manual',
      automatic: {
        targetGroupCount: 4,
        createCatchAll: true,
        minGroupSize: 1,
        algorithm: 'tfidf',
      },
      manual: [{ name: 'Manual Keyword Group', keywords: ['manualkeyword'] }],
    };

    const result = await service.autoGroupMessages(messages, config);
    const manualGroup = result.groups.find((group) => group.name === 'Manual Keyword Group');

    expect(result.stats.manualGroups).toBeGreaterThanOrEqual(1);
    expect(manualGroup?.sources.includes('m1')).toBe(true);
    expect(result.stats.totalGroups).toBeGreaterThanOrEqual(result.stats.manualGroups);
  });

  test('mode=hybrid aliases to manual-first behavior', async () => {
    const service = new EnhancedAutogroupService();
    const config: AutogroupRuntimeConfig = {
      mode: 'hybrid',
      automatic: {
        targetGroupCount: 4,
        createCatchAll: true,
        minGroupSize: 1,
        algorithm: 'tfidf',
      },
      manual: [{ name: 'Manual Keyword Group', keywords: ['manualkeyword'] }],
    };

    const result = await service.autoGroupMessages(messages, config);

    expect(result.stats.manualGroups).toBeGreaterThanOrEqual(1);
    expect(result.groups.some((group) => group.name === 'Manual Keyword Group')).toBe(true);
  });

  test('produces deterministic group ids and diagnostics for identical input', async () => {
    const service = new EnhancedAutogroupService();
    const config: AutogroupRuntimeConfig = {
      mode: 'automatic',
      automatic: {
        targetGroupCount: 4,
        createCatchAll: true,
        minGroupSize: 1,
        algorithm: 'tfidf',
      },
    };

    const first = await service.autoGroupMessages(messages, config);
    const second = await service.autoGroupMessages(messages, config);

    expect(first.groups.map((group) => group.id)).toEqual(second.groups.map((group) => group.id));
    expect(first.stats.diagnostics.featureModel).toBe('tfidf_mixed_features_v1');
    expect(first.stats.diagnostics.eligibleMessages).toBe(messages.length);
    expect(
      first.stats.diagnostics.assignedMessages + first.stats.diagnostics.unmatchedMessages
    ).toBe(messages.length);
    expect(first.stats.catchAllGroup).toBe(false);
    expect(first.groups.some((group) => group.isCatchAll)).toBe(false);
  });

  test('extracts phrase/ngram signals for clustering labels', async () => {
    const service = new EnhancedAutogroupService();
    const phraseMessages = [
      { id: 'p1', role: 'user', content: 'Project Moonlight roadmap phase planning milestone' },
      {
        id: 'p2',
        role: 'assistant',
        content: 'Project Moonlight release notes and milestone risk',
      },
      {
        id: 'p3',
        role: 'user',
        content: 'system architecture migration sequence and deployment plan',
      },
    ];

    const result = await service.autoGroupMessages(phraseMessages, {
      mode: 'automatic',
      automatic: {
        targetGroupCount: 3,
        createCatchAll: true,
        minGroupSize: 1,
      },
    });

    const joinedKeywords = result.groups.flatMap((group) => group.keywords).join(' ');
    expect(
      joinedKeywords.includes('bi:') ||
        joinedKeywords.includes('tri:') ||
        joinedKeywords.includes('phrase:')
    ).toBe(true);
  });
});
