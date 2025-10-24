/**
 * DataAdapter Interface - Separation of data and UI
 *
 * This interface separates data fetching logic from UI components,
 * enabling primitives to work with any data source without being
 * coupled to specific API implementations.
 *
 * Key Principles:
 * - Adapters handle all data fetching
 * - Adapters return BoundObjects with metadata
 * - UI components never fetch directly
 * - Consistent interface across all data types
 */

import { BoundObject } from '../primitives/Viewer';

/**
 * Core DataAdapter interface
 * All data sources implement this interface
 */
export interface DataAdapter<T = any> {
  /**
   * Fetch multiple items
   * @param filter Optional filter criteria
   * @returns Array of bound objects
   */
  fetchAll(filter?: Record<string, any>): Promise<BoundObject[]>;

  /**
   * Fetch a single item by ID
   * @param id Item identifier
   * @returns Single bound object
   */
  fetchOne(id: string): Promise<BoundObject>;

  /**
   * Create a new item
   * @param data Item data
   * @returns Created bound object
   */
  create(data: Partial<T>): Promise<BoundObject>;

  /**
   * Update an existing item
   * @param id Item identifier
   * @param data Updated data
   * @returns Updated bound object
   */
  update(id: string, data: Partial<T>): Promise<BoundObject>;

  /**
   * Delete an item
   * @param id Item identifier
   */
  delete(id: string): Promise<void>;

  /**
   * Optional: Search items
   * @param query Search query
   * @returns Array of matching bound objects
   */
  search?(query: string): Promise<BoundObject[]>;

  /**
   * Optional: Get item count
   * @param filter Optional filter criteria
   * @returns Total count
   */
  count?(filter?: Record<string, any>): Promise<number>;
}

/**
 * Helper: Bind raw data to a BoundObject
 *
 * Usage:
 * ```ts
 * const boundUser = bindObject(
 *   userData,
 *   'user',
 *   { canEdit: true, canDelete: false },
 *   [
 *     { id: 'edit', label: 'Edit', handler: () => editUser() },
 *     { id: 'resetPassword', label: 'Reset Password', handler: () => resetPassword() }
 *   ]
 * );
 * ```
 */
export function bindObject<T = any>(
  data: T,
  type: string,
  capabilities?: BoundObject['_capabilities'],
  actions?: BoundObject['_actions']
): BoundObject {
  return {
    data,
    type,
    _capabilities: capabilities,
    _actions: actions,
  };
}

/**
 * Helper: Create a mock adapter for testing
 * Returns an adapter with pre-defined data
 */
export function createMockAdapter<T = any>(items: T[], type: string): DataAdapter<T> {
  return {
    async fetchAll() {
      return items.map((item) => bindObject(item, type));
    },
    async fetchOne(id: string) {
      const item = items.find((i: any) => i.id === id);
      if (!item) throw new Error(`${type} not found: ${id}`);
      return bindObject(item, type);
    },
    async create(data: Partial<T>) {
      const newItem = { ...data, id: `${type}_${Date.now()}` } as T;
      items.push(newItem);
      return bindObject(newItem, type);
    },
    async update(id: string, data: Partial<T>) {
      const index = items.findIndex((i: any) => i.id === id);
      if (index === -1) throw new Error(`${type} not found: ${id}`);
      items[index] = { ...items[index], ...data };
      return bindObject(items[index], type);
    },
    async delete(id: string) {
      const index = items.findIndex((i: any) => i.id === id);
      if (index === -1) throw new Error(`${type} not found: ${id}`);
      items.splice(index, 1);
    },
    async search(query: string) {
      const filtered = items.filter((item: any) =>
        JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
      );
      return filtered.map((item) => bindObject(item, type));
    },
    async count() {
      return items.length;
    },
  };
}
