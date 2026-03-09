import { describe, expect, test } from 'vitest';
import { EnhancedAutogroupService } from './autogroup-enhanced';
import type { GroupingConfig } from '@keimenon/types';

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
  test('mode=auto ignores manual definitions', async () => {
    const service = new EnhancedAutogroupService();
    const config: GroupingConfig = {
      mode: 'auto',
      auto: {
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
    const config: GroupingConfig = {
      mode: 'manual',
      auto: {
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
    const config: GroupingConfig = {
      mode: 'hybrid',
      auto: {
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
});
