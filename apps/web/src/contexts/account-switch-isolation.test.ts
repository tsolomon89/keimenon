import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAccountScopedRuntimeState } from './account-switch-isolation';
import { useKeimenonStore, type KeimenonNode, type KeimenonEdge } from '@/store/keimenonStore';

class MemorySessionStorage implements Storage {
  private values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
  }

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const accountANode: KeimenonNode = {
  id: 'node-account-a',
  type: 'source',
  kind: 'Source',
  position: { x: 0, y: 0 },
  data: { label: 'Account A Node' },
};

const accountBNode: KeimenonNode = {
  id: 'node-account-b',
  type: 'source',
  kind: 'Source',
  position: { x: 10, y: 20 },
  data: { label: 'Account B Node' },
};

const accountAEdge: KeimenonEdge = {
  id: 'edge-account-a',
  source: accountANode.id,
  target: accountANode.id,
  type: 'references',
  kind: 'SIMILAR_TO',
};

describe('account-switch isolation', () => {
  beforeEach(() => {
    useKeimenonStore.getState().reset();
    Object.defineProperty(window, 'sessionStorage', {
      value: new MemorySessionStorage({
        graph_cache: 'cached',
        __SENSITIVE__token_hint: 'preserve',
        account_filter: 'keep-for-clear-check',
      }),
      configurable: true,
    });
    window.__operatingAccount = 'acc_a';
    window.__cachedNodes = [{ id: 'node-account-a' }];
    window.__cachedEdges = [{ id: 'edge-account-a' }];
    window.__cachedGroups = ['group_a'];
    window.__cachedBoards = ['board_a'];
    window.__operatingMode = 'native';
  });

  it('clears keimenon store, runtime globals, and non-sensitive session keys', () => {
    useKeimenonStore.setState((state) => ({
      ...state,
      currentAccountId: 'acc_a',
      nodes: [accountANode],
      edges: [accountAEdge],
      selectedNode: accountANode,
      selectedNodeIds: new Set([accountANode.id]),
      filters: {
        ...state.filters,
        searchQuery: 'account-a',
      },
    }));

    const resetSpy = vi.spyOn(useKeimenonStore.getState(), 'reset');

    const result = clearAccountScopedRuntimeState();

    expect(resetSpy).toHaveBeenCalledTimes(1);
    const nextState = useKeimenonStore.getState();
    expect(nextState.currentAccountId).toBeNull();
    expect(nextState.nodes).toEqual([]);
    expect(nextState.edges).toEqual([]);
    expect(nextState.selectedNode).toBeNull();
    expect(nextState.selectedNodeIds.size).toBe(0);
    expect(nextState.filters.searchQuery).toBe('');

    expect(window.__operatingAccount).toBeUndefined();
    expect(window.__cachedNodes).toBeUndefined();
    expect(window.__cachedEdges).toBeUndefined();
    expect(window.__cachedGroups).toBeUndefined();
    expect(window.__cachedBoards).toBeUndefined();
    expect(window.__operatingMode).toBeUndefined();

    expect(result.clearedSessionKeys.sort()).toEqual(['account_filter', 'graph_cache']);
    expect(window.sessionStorage.getItem('graph_cache')).toBeNull();
    expect(window.sessionStorage.getItem('account_filter')).toBeNull();
    expect(window.sessionStorage.getItem('__SENSITIVE__token_hint')).toBe('preserve');
  });

  it('keeps post-switch graph state isolated to the new account after reset', () => {
    useKeimenonStore.setState((state) => ({
      ...state,
      currentAccountId: 'acc_a',
      nodes: [accountANode],
      edges: [accountAEdge],
    }));

    clearAccountScopedRuntimeState();

    useKeimenonStore.getState().setCurrentAccountId('acc_b');
    useKeimenonStore.getState().setNodes([accountBNode]);
    useKeimenonStore.getState().setEdges([]);

    const isolatedState = useKeimenonStore.getState();
    expect(isolatedState.currentAccountId).toBe('acc_b');
    expect(isolatedState.nodes).toHaveLength(1);
    expect(isolatedState.nodes[0].id).toBe(accountBNode.id);
    expect(isolatedState.nodes.some((node) => node.id === accountANode.id)).toBe(false);
    expect(isolatedState.edges).toEqual([]);
  });
});
