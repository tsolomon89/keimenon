import React from 'react';
import { Text } from './Text';
import { Button } from './Button';
import { cn } from '../utils/cn';
import { PolymorphicComponentPropsWithRef } from '../utils/polymorphic';

/**
 * List Layout - How items are displayed
 */
export type ListLayout = 'vertical' | 'grid-2' | 'grid-3' | 'grid-4';

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

export interface ListOwnProps<T = any> {
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

export type ListProps<
  T = any,
  C extends React.ElementType = 'div',
> = PolymorphicComponentPropsWithRef<C, ListOwnProps<T>>;

export interface ListComponent {
  <T = any, C extends React.ElementType = 'div'>(props: ListProps<T, C>): React.ReactNode;
  displayName?: string;
}

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
 */
export const List: ListComponent = React.forwardRef(
  (
    {
      items,
      renderItem,
      layout = 'vertical',
      emptyState,
      loading = false,
      loadingMessage = 'Loading...',
      gap = 'md',
      className = '',
      keyExtractor,
      as,
      ...props
    }: any,
    ref: any
  ) => {
    const Component = as || 'div';

    if (loading) {
      return (
        <div className="p-8 text-center">
          <Text role="hint" mode="muted">
            {loadingMessage}
          </Text>
        </div>
      );
    }

    if (!items || items.length === 0) {
      if (emptyState) {
        return (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg">
            {emptyState.icon && <div className="mb-2 flex justify-center">{emptyState.icon}</div>}
            <Text role="hint" mode="muted" className="mb-4">
              {emptyState.message}
            </Text>
            {emptyState.action && (
              <Button size="sm" variant="default" onClick={emptyState.action.onClick}>
                {emptyState.action.label}
              </Button>
            )}
          </div>
        );
      }
      return null;
    }

    const layoutClasses = layoutStyles[layout as ListLayout] || layoutStyles.vertical;
    const gapClasses = gapStyles[gap as keyof typeof gapStyles] || gapStyles.md;

    return (
      <Component className={cn(layoutClasses, gapClasses, className)} ref={ref} {...props}>
        {items.map((item: any, index: number) => {
          const key = keyExtractor ? keyExtractor(item, index) : index;
          return <div key={key}>{renderItem(item, index)}</div>;
        })}
      </Component>
    );
  }
) as any;

List.displayName = 'List';
