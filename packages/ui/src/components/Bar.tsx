import React, { useState } from 'react';
import { Text } from './Text';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';
import { PolymorphicComponentPropsWithRef, PolymorphicForwardRef } from '../utils/polymorphic';

/**
 * Bar Mode - Determines content and behavior
 */
export type BarMode = 'navigation' | 'inspector' | 'toolbar';

/**
 * Bar Position
 */
export type BarPosition = 'left' | 'right' | 'top' | 'bottom';

export interface BarOwnProps {
  /** Bar mode (navigation, inspector, toolbar) */
  mode: BarMode;

  /** Position on screen */
  position?: BarPosition;

  /** Bar title */
  title?: string;

  /** Initial collapsed state */
  defaultCollapsed?: boolean;

  /** Collapsible */
  collapsible?: boolean;

  /** Width (for left/right bars) */
  width?: string;

  /** Additional CSS classes */
  className?: string;

  /** Header actions */
  headerActions?: React.ReactNode;
}

export type BarProps<C extends React.ElementType = 'aside'> = PolymorphicComponentPropsWithRef<
  C,
  BarOwnProps
>;

const positionStyles: Record<BarPosition, { container: string; border: string }> = {
  left: {
    container: 'flex-shrink-0',
    border: 'border-r border-slate-800',
  },
  right: {
    container: 'flex-shrink-0',
    border: 'border-l border-slate-800',
  },
  top: {
    container: '',
    border: 'border-b border-slate-800',
  },
  bottom: {
    container: '',
    border: 'border-t border-slate-800',
  },
};

/**
 * Bar Primitive - Universal sidebar/toolbar
 */
export const Bar: PolymorphicForwardRef<'aside', BarOwnProps> = React.forwardRef(
  (
    {
      mode,
      position = mode === 'navigation' ? 'left' : mode === 'inspector' ? 'right' : 'top',
      title,
      children,
      defaultCollapsed = false,
      collapsible = true,
      width = mode === 'toolbar' ? 'auto' : '320px',
      className = '',
      headerActions,
      as,
      ...props
    }: any,
    ref: any
  ) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const Component = as || 'aside';

    const { container, border } = positionStyles[position as BarPosition];

    // Toolbar mode uses flex layout
    if (mode === 'toolbar') {
      return (
        <Component
          className={cn('flex items-center gap-2 px-4 py-2 bg-slate-950/50', border, className)}
          ref={ref}
          {...props}
        >
          {title && (
            <Text role="label" className="mr-2">
              {title}
            </Text>
          )}
          <div className="flex items-center gap-2 flex-1">{children}</div>
          {headerActions}
        </Component>
      );
    }

    // Sidebar mode (navigation/inspector)
    const widthStyle = collapsed ? '0px' : width;

    return (
      <Component
        className={cn(
          'bg-slate-950/50 transition-all duration-300 overflow-hidden',
          container,
          border,
          className
        )}
        style={{ width: widthStyle }}
        ref={ref}
        {...props}
      >
        {!collapsed && (
          <>
            {/* Header */}
            {(title || headerActions || collapsible) && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                {title && (
                  <Text role="title" className="text-base">
                    {title}
                  </Text>
                )}
                <div className="flex items-center gap-2">
                  {headerActions}
                  {collapsible && (
                    <button
                      onClick={() => setCollapsed(true)}
                      className="p-1 hover:bg-slate-800 rounded transition-colors"
                      title="Collapse sidebar"
                    >
                      {position === 'left' ? (
                        <ChevronLeft className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Content */}
            <div className="h-full overflow-y-auto">{children}</div>
          </>
        )}

        {/* Collapsed state toggle */}
        {collapsed && collapsible && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute top-1/2 -translate-y-1/2 p-2 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
            style={{
              [position === 'left' ? 'right' : 'left']: '-12px',
            }}
            title="Expand sidebar"
          >
            {position === 'left' ? (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>
        )}
      </Component>
    );
  }
) as any;

Bar.displayName = 'Bar';
