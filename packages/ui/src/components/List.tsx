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
 * Features:
 * - Multiple layout modes (vertical, grid-2/3/4)
 * - Empty state handling
 * - Loading state
 * - Flexible rendering via render prop
 */
import { cn } from '../utils/cn';

// ... (imports)

// ... (ListProps definition)

/**
 * List Primitive - Array renderer with layouts
 *
 * ...
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
  // ... (loading and empty state)

  // Render items
  const layoutClasses = layoutStyles[layout];
  const gapClasses = gapStyles[gap];

  return (
    <div className={cn(layoutClasses, gapClasses, className)}>
      {items.map((item, index) => {
        const key = keyExtractor ? keyExtractor(item, index) : index;
        return <div key={key}>{renderItem(item, index)}</div>;
      })}
    </div>
  );
}
