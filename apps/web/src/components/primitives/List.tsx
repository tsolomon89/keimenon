'use client';

import React from 'react';
import { Text } from './Text';

/**
 * List Layout - How items are displayed
 */
export type ListLayout =
  | 'vertical' // Stacked list (default)
  | 'grid-2' // 2-column grid
  | 'grid-3' // 3-column grid
  | 'grid-4'; // 4-column grid

/**
 * Empty State Configuration
 */
export interface EmptyStateConfig {
  message: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ListProps<T = any> {
  /** Array of items to render */
  items: T[];

  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;

  /** Layout configuration */
  layout?: ListLayout;

  /** Empty state configuration */
  emptyState?: EmptyStateConfig;

  /** Loading state */
  loading?: boolean;

  /** Loading message */
  loadingMessage?: string;

  /** Gap between items */
  gap?: 'sm' | 'md' | 'lg';

  /** Additional CSS classes */
  className?: string;

  /** Optional key extractor */
  keyExtractor?: (item: T, index: number) => string | number;
}

/**
 * Layout CSS mappings
 */
const layoutStyles: Record<ListLayout, string> = {
  vertical: 'flex flex-col',
  'grid-2': 'grid grid-cols-1 md:grid-cols-2',
  'grid-3': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  'grid-4': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
};

const gapStyles = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

/**
 * List Primitive - Array renderer with layouts
 *
 * Extracted from:
 * - UsersListCard.tsx:208 (vertical list)
 * - CRMDashboard.tsx:171 (grid layout)
 * - CRMDashboard.tsx:336-354 (activity list)
 *
 * Features:
 * - Multiple layout modes (vertical, grid-2/3/4)
 * - Empty state handling
 * - Loading state
 * - Flexible rendering via render prop
 * - Future: Virtual scrolling for large lists
 *
 * Usage:
 * ```tsx
 * // Vertical list
 * <List
 *   items={users}
 *   renderItem={(user) => (
 *     <Tile
 *       title={user.name}
 *       subtitle={user.email}
 *       onClick={() => selectUser(user)}
 *     />
 *   )}
 *   emptyState={{
 *     message: 'No users found',
 *     action: { label: 'Add User', onClick: () => openModal() }
 *   }}
 * />
 *
 * // Grid layout
 * <List
 *   items={accounts}
 *   layout="grid-3"
 *   gap="lg"
 *   renderItem={(account) => (
 *     <Card title={account.name}>
 *       {account.metrics}
 *     </Card>
 *   )}
 * />
 * ```
 */
export function List<T = any>({
  items,
  renderItem,
  layout = 'vertical',
  emptyState,
  loading = false,
  loadingMessage = 'Loading...',
  gap = 'md',
  className = '',
  keyExtractor,
}: ListProps<T>) {
  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
          <Text role="hint" mode="muted">
            {loadingMessage}
          </Text>
        </div>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    if (emptyState) {
      return (
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center max-w-md">
            {emptyState.icon && <div className="mb-4 text-slate-600">{emptyState.icon}</div>}
            <Text role="hint" mode="muted" className="mb-4">
              {emptyState.message}
            </Text>
            {emptyState.action && (
              <button
                onClick={emptyState.action.onClick}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {emptyState.action.label}
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <Text role="hint" mode="muted">
          No items
        </Text>
      </div>
    );
  }

  // Render items
  const layoutClasses = layoutStyles[layout];
  const gapClasses = gapStyles[gap];

  return (
    <div className={`${layoutClasses} ${gapClasses} ${className}`.trim()}>
      {items.map((item, index) => {
        const key = keyExtractor ? keyExtractor(item, index) : index;
        return <div key={key}>{renderItem(item, index)}</div>;
      })}
    </div>
  );
}
