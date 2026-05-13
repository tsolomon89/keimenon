/**
 * Position Persistence Store
 *
 * Persists user-dragged node positions to localStorage so graph layouts
 * survive page reloads. Positions are scoped by account ID to prevent
 * cross-account position leakage.
 *
 * Storage format:
 *   Key: `keimenon:positions:${accountId}`
 *   Value: JSON-serialized Map entries: [[nodeId, [x, y, z]], ...]
 *
 * Design constraints:
 *   - Maximum 5,000 persisted positions per account (LRU eviction)
 *   - Debounced writes (500ms) to avoid localStorage thrashing during drags
 *   - Graceful degradation: if localStorage is unavailable, positions are
 *     still maintained in memory for the session
 *   - Pure read path: `loadPositions` is synchronous
 *
 * @module position-store
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'keimenon:positions:';
const MAX_PERSISTED_POSITIONS = 5000;
const DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PositionTuple = [number, number, number];
export type PositionMap = Map<string, PositionTuple>;

export interface PositionStoreSnapshot {
  accountId: string;
  positions: PositionMap;
  count: number;
  persistedAt: number | null;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

function storageKey(accountId: string): string {
  return `${STORAGE_KEY_PREFIX}${accountId}`;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializePositions(positions: PositionMap): string {
  const entries: [string, PositionTuple][] = [];
  for (const [nodeId, pos] of positions.entries()) {
    entries.push([nodeId, pos]);
  }

  // If over limit, keep only the most recently added (last N entries)
  const trimmed =
    entries.length > MAX_PERSISTED_POSITIONS
      ? entries.slice(entries.length - MAX_PERSISTED_POSITIONS)
      : entries;

  return JSON.stringify(trimmed);
}

function deserializePositions(raw: string): PositionMap {
  try {
    const entries: [string, PositionTuple][] = JSON.parse(raw);
    if (!Array.isArray(entries)) {
      return new Map();
    }

    const map = new Map<string, PositionTuple>();
    for (const entry of entries) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        !Array.isArray(entry[1]) ||
        entry[1].length !== 3
      ) {
        continue;
      }

      const [nodeId, pos] = entry;
      const [x, y, z] = pos;
      if (
        typeof x === 'number' &&
        typeof y === 'number' &&
        typeof z === 'number' &&
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(z)
      ) {
        map.set(nodeId, [x, y, z]);
      }
    }

    return map;
  } catch {
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// localStorage helpers (graceful degradation)
// ---------------------------------------------------------------------------

function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__keimenon_ls_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function readFromStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeToStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently ignore
  }
}

// ---------------------------------------------------------------------------
// PositionStore class
// ---------------------------------------------------------------------------

/**
 * Manages persisted node positions for a single account.
 *
 * Usage:
 * ```ts
 * const store = new PositionStore('account-id-123');
 * store.load(); // Load from localStorage
 * store.set('node-1', [100, 200, 0]); // Set position (auto-saves with debounce)
 * store.get('node-1'); // [100, 200, 0]
 * store.clear(); // Clear all positions
 * ```
 */
export class PositionStore {
  private readonly _accountId: string;
  private _positions: PositionMap;
  private _persistedAt: number | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _storageAvailable: boolean;

  constructor(accountId: string) {
    this._accountId = accountId;
    this._positions = new Map();
    this._storageAvailable = isLocalStorageAvailable();
  }

  /** Account ID this store is scoped to */
  get accountId(): string {
    return this._accountId;
  }

  /** Number of stored positions */
  get count(): number {
    return this._positions.size;
  }

  /** Whether localStorage is available */
  get persistent(): boolean {
    return this._storageAvailable;
  }

  /**
   * Load positions from localStorage.
   * Safe to call multiple times — will overwrite in-memory state.
   */
  load(): void {
    if (!this._storageAvailable) return;

    const raw = readFromStorage(storageKey(this._accountId));
    if (raw) {
      this._positions = deserializePositions(raw);
    }
  }

  /**
   * Get a stored position for a node.
   * Returns undefined if no position is stored.
   */
  get(nodeId: string): PositionTuple | undefined {
    return this._positions.get(nodeId);
  }

  /**
   * Get all stored positions as a new Map.
   */
  getAll(): PositionMap {
    return new Map(this._positions);
  }

  /**
   * Set a node position. Triggers debounced persistence.
   */
  set(nodeId: string, position: PositionTuple): void {
    this._positions.set(nodeId, position);
    this._scheduleSave();
  }

  /**
   * Set multiple positions at once. Triggers a single debounced save.
   */
  setBatch(entries: Iterable<[string, PositionTuple]>): void {
    for (const [nodeId, position] of entries) {
      this._positions.set(nodeId, position);
    }
    this._scheduleSave();
  }

  /**
   * Remove a specific node's position.
   */
  delete(nodeId: string): boolean {
    const deleted = this._positions.delete(nodeId);
    if (deleted) {
      this._scheduleSave();
    }
    return deleted;
  }

  /**
   * Check if a position exists for a node.
   */
  has(nodeId: string): boolean {
    return this._positions.has(nodeId);
  }

  /**
   * Clear all stored positions (both in-memory and localStorage).
   */
  clear(): void {
    this._positions.clear();
    this._cancelPendingSave();
    removeFromStorage(storageKey(this._accountId));
    this._persistedAt = null;
  }

  /**
   * Force an immediate save (bypasses debounce).
   * Useful before page unload.
   */
  flush(): void {
    this._cancelPendingSave();
    this._persist();
  }

  /**
   * Get a snapshot of the current state.
   */
  snapshot(): PositionStoreSnapshot {
    return {
      accountId: this._accountId,
      positions: new Map(this._positions),
      count: this._positions.size,
      persistedAt: this._persistedAt,
    };
  }

  /**
   * Dispose the store, cancelling any pending saves.
   */
  dispose(): void {
    this._cancelPendingSave();
  }

  // ── Private ──

  private _scheduleSave(): void {
    if (!this._storageAvailable) return;

    this._cancelPendingSave();
    this._debounceTimer = setTimeout(() => {
      this._persist();
    }, DEBOUNCE_MS);
  }

  private _cancelPendingSave(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  private _persist(): void {
    if (!this._storageAvailable) return;

    const serialized = serializePositions(this._positions);
    const success = writeToStorage(storageKey(this._accountId), serialized);
    if (success) {
      this._persistedAt = Date.now();
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level convenience (for singleton usage patterns)
// ---------------------------------------------------------------------------

let _activeStore: PositionStore | null = null;

/**
 * Get or create the position store for the given account.
 * If the account changes, the previous store is disposed and a new one
 * is created and loaded from localStorage.
 */
export function getPositionStore(accountId: string): PositionStore {
  if (_activeStore && _activeStore.accountId === accountId) {
    return _activeStore;
  }

  // Flush and dispose previous store
  if (_activeStore) {
    _activeStore.flush();
    _activeStore.dispose();
  }

  _activeStore = new PositionStore(accountId);
  _activeStore.load();
  return _activeStore;
}

/**
 * Clear the active position store singleton (e.g., on logout).
 */
export function clearActivePositionStore(): void {
  if (_activeStore) {
    _activeStore.dispose();
    _activeStore = null;
  }
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export {
  serializePositions,
  deserializePositions,
  STORAGE_KEY_PREFIX,
  MAX_PERSISTED_POSITIONS,
  DEBOUNCE_MS,
};
