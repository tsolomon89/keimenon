import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { normalizeImportOptions } from '@keimenon/types';
import { EnhancedImportServiceV2, type ImportConversation } from './import-enhanced-v2';

function createService(agentRuntimeEnabled: boolean) {
  const sqlite = new Database(':memory:');
  const fakeDb = {
    getDatabase: () => sqlite,
    createNode: async () => {},
    createEdge: async () => {},
  } as any;

  const service = new EnhancedImportServiceV2(fakeDb);
  const serviceAny = service as any;
  const resolveHumanPrincipal = vi.fn().mockResolvedValue({ id: 'principal_human_1' });
  const resolveAgentPrincipal = vi.fn().mockResolvedValue({ id: 'principal_agent_1' });

  serviceAny.context = {
    accountId: 'acc_1',
    userId: 'user_1',
    jobId: 'job_1',
    agentRuntimeEnabled,
  };
  serviceAny.principalService = {
    resolveHumanPrincipal,
    resolveAgentPrincipal,
  };

  return {
    service: serviceAny,
    resolveHumanPrincipal,
    resolveAgentPrincipal,
    dispose: () => sqlite.close(),
  };
}

const CONVERSATIONS: ImportConversation[] = [
  {
    id: 'conv_1',
    title: 'Conversation',
    platform: 'chatgpt',
    created_at: 1700000000000,
    messages: [],
  },
];

describe('EnhancedImportServiceV2 agent bootstrap gating', () => {
  it('does not resolve agent principal when bootstrap mode is manual', async () => {
    const harness = createService(true);

    try {
      await harness.service.resolvePrincipals(CONVERSATIONS, normalizeImportOptions());

      expect(harness.resolveHumanPrincipal).toHaveBeenCalledOnce();
      expect(harness.resolveAgentPrincipal).not.toHaveBeenCalled();
      expect(harness.service.agentPrincipal).toBeNull();
    } finally {
      harness.dispose();
    }
  });

  it('does not resolve agent principal when runtime entitlement is missing', async () => {
    const harness = createService(false);

    try {
      await harness.service.resolvePrincipals(
        CONVERSATIONS,
        normalizeImportOptions({
          agent: { bootstrap: 'auto' },
        })
      );

      expect(harness.resolveHumanPrincipal).toHaveBeenCalledOnce();
      expect(harness.resolveAgentPrincipal).not.toHaveBeenCalled();
      expect(harness.service.agentPrincipal).toBeNull();
    } finally {
      harness.dispose();
    }
  });

  it('resolves agent principal only when bootstrap is auto and runtime entitlement is enabled', async () => {
    const harness = createService(true);

    try {
      await harness.service.resolvePrincipals(
        CONVERSATIONS,
        normalizeImportOptions({
          agent: { bootstrap: 'auto' },
        })
      );

      expect(harness.resolveHumanPrincipal).toHaveBeenCalledOnce();
      expect(harness.resolveAgentPrincipal).toHaveBeenCalledOnce();
      expect(harness.service.agentPrincipal).toEqual({ id: 'principal_agent_1' });
    } finally {
      harness.dispose();
    }
  });
});
