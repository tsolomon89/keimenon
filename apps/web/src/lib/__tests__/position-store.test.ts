import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  PositionStore,
  getPositionStore,
  clearActivePositionStore,
  serializePositions,
  deserializePositions,
  STORAGE_KEY_PREFIX,
  MAX_PERSISTED_POSITIONS,
  type PositionTuple,
  type PositionMap,
} from '../position-store';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const mockStorage = new Map<string, string>();

beforeEach(() => {
  mockStorage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mockStorage.get(key) ?? null,
    setItem: (key: string, value: string) => mockStorage.set(key, value),
    removeItem: (key: string) => mockStorage.delete(key),
  });
  clearActivePositionStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe('serialization', () => {
  it('round-trips positions through serialize/deserialize', () => {
    const positions: PositionMap = new Map([
      ['node-1', [10, 20, 0]],
      ['node-2', [30.5, -40.2, 5]],
    ]);

    const serialized = serializePositions(positions);
    const deserialized = deserializePositions(serialized);

    expect(deserialized.size).toBe(2);
    expect(deserialized.get('node-1')).toEqual([10, 20, 0]);
    expect(deserialized.get('node-2')).toEqual([30.5, -40.2, 5]);
  });

  it('trims to MAX_PERSISTED_POSITIONS', () => {
    const positions: PositionMap = new Map();
    for (let i = 0; i < MAX_PERSISTED_POSITIONS + 100; i++) {
      positions.set(`node-${i}`, [i, i, 0]);
    }

    const serialized = serializePositions(positions);
    const deserialized = deserializePositions(serialized);

    expect(deserialized.size).toBe(MAX_PERSISTED_POSITIONS);
  });

  it('handles malformed JSON gracefully', () => {
    expect(deserializePositions('not json')).toEqual(new Map());
    expect(deserializePositions('[]')).toEqual(new Map());
    expect(deserializePositions('[["node-1"]]')).toEqual(new Map()); // missing position
    expect(deserializePositions('[["node-1", [1, 2]]]')).toEqual(new Map()); // wrong length
    expect(deserializePositions('[["node-1", [1, 2, "x"]]]')).toEqual(new Map()); // non-numeric
  });

  it('filters out NaN and Infinity values', () => {
    const raw = JSON.stringify([
      ['node-1', [1, 2, 3]],
      ['node-2', [NaN, 0, 0]],
      ['node-3', [0, Infinity, 0]],
    ]);
    const result = deserializePositions(raw);
    expect(result.size).toBe(1);
    expect(result.has('node-1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PositionStore
// ---------------------------------------------------------------------------

describe('PositionStore', () => {
  it('starts with empty positions', () => {
    const store = new PositionStore('acct-1');
    expect(store.count).toBe(0);
    expect(store.accountId).toBe('acct-1');
  });

  it('sets and gets positions', () => {
    const store = new PositionStore('acct-1');
    store.set('node-1', [100, 200, 0]);
    expect(store.get('node-1')).toEqual([100, 200, 0]);
    expect(store.has('node-1')).toBe(true);
    expect(store.count).toBe(1);
  });

  it('overwrites existing positions', () => {
    const store = new PositionStore('acct-1');
    store.set('node-1', [100, 200, 0]);
    store.set('node-1', [300, 400, 0]);
    expect(store.get('node-1')).toEqual([300, 400, 0]);
    expect(store.count).toBe(1);
  });

  it('deletes positions', () => {
    const store = new PositionStore('acct-1');
    store.set('node-1', [100, 200, 0]);
    expect(store.delete('node-1')).toBe(true);
    expect(store.has('node-1')).toBe(false);
    expect(store.count).toBe(0);
  });

  it('returns false when deleting non-existent position', () => {
    const store = new PositionStore('acct-1');
    expect(store.delete('node-999')).toBe(false);
  });

  it('sets batch positions', () => {
    const store = new PositionStore('acct-1');
    store.setBatch([
      ['node-1', [10, 20, 0]],
      ['node-2', [30, 40, 0]],
      ['node-3', [50, 60, 0]],
    ]);
    expect(store.count).toBe(3);
    expect(store.get('node-2')).toEqual([30, 40, 0]);
  });

  it('clears all positions and removes from localStorage', () => {
    const store = new PositionStore('acct-1');
    store.set('node-1', [100, 200, 0]);
    store.flush();

    expect(mockStorage.has(`${STORAGE_KEY_PREFIX}acct-1`)).toBe(true);

    store.clear();
    expect(store.count).toBe(0);
    expect(mockStorage.has(`${STORAGE_KEY_PREFIX}acct-1`)).toBe(false);
  });

  it('persists to localStorage on flush', () => {
    const store = new PositionStore('acct-1');
    store.set('node-1', [100, 200, 0]);
    store.set('node-2', [300, 400, 5]);
    store.flush();

    const raw = mockStorage.get(`${STORAGE_KEY_PREFIX}acct-1`);
    expect(raw).toBeDefined();

    const restored = deserializePositions(raw!);
    expect(restored.size).toBe(2);
    expect(restored.get('node-1')).toEqual([100, 200, 0]);
  });

  it('loads positions from localStorage', () => {
    // Pre-populate localStorage
    const entries: [string, PositionTuple][] = [
      ['node-a', [10, 20, 0]],
      ['node-b', [30, 40, 0]],
    ];
    mockStorage.set(`${STORAGE_KEY_PREFIX}acct-1`, JSON.stringify(entries));

    const store = new PositionStore('acct-1');
    store.load();

    expect(store.count).toBe(2);
    expect(store.get('node-a')).toEqual([10, 20, 0]);
    expect(store.get('node-b')).toEqual([30, 40, 0]);
  });

  it('returns a snapshot of current state', () => {
    const store = new PositionStore('acct-1');
    store.set('node-1', [10, 20, 0]);
    store.flush();

    const snapshot = store.snapshot();
    expect(snapshot.accountId).toBe('acct-1');
    expect(snapshot.count).toBe(1);
    expect(snapshot.positions.get('node-1')).toEqual([10, 20, 0]);
    expect(snapshot.persistedAt).toBeGreaterThan(0);
  });

  it('debounces writes to localStorage', () => {
    vi.useFakeTimers();
    const store = new PositionStore('acct-1');

    store.set('node-1', [10, 20, 0]);
    store.set('node-2', [30, 40, 0]);
    store.set('node-3', [50, 60, 0]);

    // Should not have written yet (debounce window)
    expect(mockStorage.has(`${STORAGE_KEY_PREFIX}acct-1`)).toBe(false);

    // Advance past debounce
    vi.advanceTimersByTime(600);

    expect(mockStorage.has(`${STORAGE_KEY_PREFIX}acct-1`)).toBe(true);
    const restored = deserializePositions(mockStorage.get(`${STORAGE_KEY_PREFIX}acct-1`)!);
    expect(restored.size).toBe(3);

    store.dispose();
  });

  it('getAll returns a new Map (not the internal reference)', () => {
    const store = new PositionStore('acct-1');
    store.set('node-1', [10, 20, 0]);

    const all = store.getAll();
    all.delete('node-1');

    // Internal state should be unaffected
    expect(store.has('node-1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Singleton management
// ---------------------------------------------------------------------------

describe('getPositionStore', () => {
  it('creates a new store for a given account', () => {
    const store = getPositionStore('acct-1');
    expect(store.accountId).toBe('acct-1');
  });

  it('returns the same store for the same account', () => {
    const store1 = getPositionStore('acct-1');
    const store2 = getPositionStore('acct-1');
    expect(store1).toBe(store2);
  });

  it('creates a new store when account changes', () => {
    const store1 = getPositionStore('acct-1');
    store1.set('node-1', [10, 20, 0]);

    const store2 = getPositionStore('acct-2');
    expect(store2.accountId).toBe('acct-2');
    expect(store2).not.toBe(store1);
    expect(store2.count).toBe(0);
  });

  it('flushes previous store when switching accounts', () => {
    const store1 = getPositionStore('acct-1');
    store1.set('node-1', [10, 20, 0]);

    // Switch accounts — should flush store1
    getPositionStore('acct-2');

    // Verify store1 was flushed to localStorage
    const raw = mockStorage.get(`${STORAGE_KEY_PREFIX}acct-1`);
    expect(raw).toBeDefined();
    const restored = deserializePositions(raw!);
    expect(restored.get('node-1')).toEqual([10, 20, 0]);
  });

  it('loads from localStorage when creating store for existing account', () => {
    // Pre-populate
    const entries: [string, PositionTuple][] = [['node-x', [99, 88, 0]]];
    mockStorage.set(`${STORAGE_KEY_PREFIX}acct-1`, JSON.stringify(entries));

    const store = getPositionStore('acct-1');
    expect(store.get('node-x')).toEqual([99, 88, 0]);
  });
});
