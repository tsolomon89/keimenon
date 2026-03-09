import { describe, expect, it } from 'vitest';
import { mergeJobIntoOperation, type Operation } from './BackgroundOperationsContext';
import type { JobUpdate } from '@/hooks/useJobStream';

function createBaseOperation(): Operation {
  return {
    id: 'job_stats_merge',
    type: 'import',
    title: 'Import job',
    status: 'parsing',
    progress: 25,
    startedAt: Date.now(),
    stats: {
      nodesCreated: 4,
      edgesCreated: 2,
      sourcesCreated: 1,
      conversationsProcessed: 3,
    },
  };
}

function createJobUpdate(partial?: Partial<JobUpdate>): JobUpdate {
  return {
    jobId: 'job_stats_merge',
    type: 'import',
    status: 'running',
    progress: {
      current: 50,
      total: 100,
      percent: 50,
      message: 'Parsing content',
    },
    timestamp: Date.now(),
    ...partial,
  };
}

describe('BackgroundOperationsContext stat merging', () => {
  it('merges incoming job stats into existing operation stats without dropping previous values', () => {
    const existing = createBaseOperation();
    const update = createJobUpdate({
      stats: {
        conversationsProcessed: 12,
      },
    });

    const merged = mergeJobIntoOperation(update, existing);

    expect(merged.stats.nodesCreated).toBe(4);
    expect(merged.stats.edgesCreated).toBe(2);
    expect(merged.stats.sourcesCreated).toBe(1);
    expect(merged.stats.conversationsProcessed).toBe(12);
  });

  it('retains existing stats when an update has no stats payload', () => {
    const existing = createBaseOperation();
    const update = createJobUpdate({ stats: undefined });

    const merged = mergeJobIntoOperation(update, existing);

    expect(merged.stats).toEqual(existing.stats);
  });
});
