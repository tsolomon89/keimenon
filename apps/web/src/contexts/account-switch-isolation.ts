import { useKeimenonStore } from '@/store/keimenonStore';

const WINDOW_CACHE_KEYS: Array<
  | '__operatingAccount'
  | '__operatingMode'
  | '__cachedNodes'
  | '__cachedEdges'
  | '__cachedGroups'
  | '__cachedBoards'
> = [
  '__operatingAccount',
  '__operatingMode',
  '__cachedNodes',
  '__cachedEdges',
  '__cachedGroups',
  '__cachedBoards',
];

const DEFAULT_SESSION_PRESERVE_PREFIX = '__SENSITIVE__';

export interface AccountSwitchIsolationResult {
  clearedSessionKeys: string[];
}

/**
 * Clears account-scoped client state before account switch.
 * This is deterministic and testable so isolation guarantees can be asserted.
 */
export function clearAccountScopedRuntimeState(
  preserveSessionPrefix: string = DEFAULT_SESSION_PRESERVE_PREFIX
): AccountSwitchIsolationResult {
  useKeimenonStore.getState().reset();

  if (typeof window !== 'undefined') {
    for (const key of WINDOW_CACHE_KEYS) {
      delete window[key];
    }
  }

  const clearedSessionKeys: string[] = [];
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const sessionKeys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key) {
        sessionKeys.push(key);
      }
    }

    for (const key of sessionKeys) {
      if (preserveSessionPrefix.length > 0 && key.startsWith(preserveSessionPrefix)) {
        continue;
      }
      window.sessionStorage.removeItem(key);
      clearedSessionKeys.push(key);
    }
  }

  return { clearedSessionKeys };
}
