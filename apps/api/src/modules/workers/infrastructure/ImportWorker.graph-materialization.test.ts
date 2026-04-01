import { describe, expect, it } from 'vitest';
import type { GraphMaterializationSummary } from '@keimenon/types';
import { evaluateGraphMaterializationInvariant } from './ImportWorker';

function buildSummary(
  overrides?: Partial<GraphMaterializationSummary>
): GraphMaterializationSummary {
  return {
    accountId: 'acc_graph_materialization',
    uploadHash: 'upload_test_hash',
    counts: {
      accountNodes: 1,
      principals: 1,
      sources: 2,
      groups: 1,
    },
    links: {
      accountPrincipal: 1,
      sourcePrincipal: 2,
      sourceGroup: 2,
    },
    createdInJob: {
      sources: 2,
      groups: 1,
    },
    passed: true,
    missing: [],
    ...(overrides || {}),
  };
}

describe('ImportWorker graph materialization invariant', () => {
  it('passes when hierarchy counts and links are present', () => {
    const result = evaluateGraphMaterializationInvariant(buildSummary());
    expect(result.passed).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('fails when source/group materialization is missing for this job', () => {
    const result = evaluateGraphMaterializationInvariant(
      buildSummary({
        createdInJob: {
          sources: 0,
          groups: 0,
        },
      })
    );

    expect(result.passed).toBe(false);
    expect(result.missing).toContain('sources_created_in_job');
    expect(result.missing).toContain('groups_created_in_job');
  });

  it('fails when account/principal/source/group hierarchy links are missing', () => {
    const result = evaluateGraphMaterializationInvariant(
      buildSummary({
        links: {
          accountPrincipal: 0,
          sourcePrincipal: 0,
          sourceGroup: 0,
        },
      })
    );

    expect(result.passed).toBe(false);
    expect(result.missing).toContain('account_principal_links');
    expect(result.missing).toContain('source_principal_links');
    expect(result.missing).toContain('source_group_links');
  });
});
