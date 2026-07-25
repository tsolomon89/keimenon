export interface ClearableCache {
  clear(): void;
}

const registeredCaches = new Set<ClearableCache>();

/**
 * Register a cache map or clearable object to the global registry
 */
export function registerCache(cache: ClearableCache): void {
  registeredCaches.add(cache);
}

/**
 * Deregister a cache map or clearable object
 */
export function deregisterCache(cache: ClearableCache): void {
  registeredCaches.delete(cache);
}

/**
 * Flush all registered in-memory RAM caches
 */
export function flushAllCaches(): void {
  console.log(`[CacheRegistry] 🧹 Flushing ${registeredCaches.size} registered RAM caches`);
  for (const cache of registeredCaches) {
    try {
      cache.clear();
    } catch (err) {
      console.error('[CacheRegistry] Error clearing cache:', err);
    }
  }
}
