'use client';

import React, { useState } from 'react';
import { Text } from './Text';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Bar Mode - Determines content and behavior
 */
export type BarMode =
  | 'navigation' // Left sidebar with tree/list navigation
  | 'inspector' // Right sidebar with selection details
  | 'toolbar'; // Top/bottom action bar

/**
 * Bar Position
 */
export type BarPosition = 'left' | 'right' | 'top' | 'bottom';

export interface BarProps {
  /** Bar mode (navigation, inspector, toolbar) */
  mode: BarMode;

  /** Position on screen */
  position?: BarPosition;

  /** Bar title */
  title?: string;

  /** Child content */
  children: React.ReactNode;

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

/**
 * Position-based styling
 * Extracted from CanvasSidebar.tsx and AccountInspector.tsx
 */
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
 *
 * Extracted from:
 * - CanvasSidebar.tsx (navigation bar)
 * - AccountInspector.tsx (inspector bar)
 * - CanvasToolbar.tsx (toolbar)
 *
 * Modes:
 * - navigation: Tree views, lists, filters (left side)
 * - inspector: Detail panels, forms, metadata (right side)
 * - toolbar: Action buttons, controls (top/bottom)
 *
 * Features:
 * - Collapsible
 * - Configurable width
 * - Header with actions
 * - Consistent styling
 *
 * Usage:
 * ```tsx
 * // Navigation bar (left)
 * <Bar mode="navigation" position="left" title="Groups">
 *   <List
 *     items={groups}
 *     renderItem={(group) => <TreeNode {...group} />}
 *   />
 * </Bar>
 *
 * // Inspector bar (right)
 * <Bar mode="inspector" position="right" title="User Details">
 *   <Card>
 *     <Field type="string" label="Name" value={user.name} mode="read" />
 *     <Field type="string" label="Email" value={user.email} mode="read" />
 *   </Card>
 * </Bar>
 *
 * // Toolbar
 * <Bar mode="toolbar" position="top">
 *   <Button>Save</Button>
 *   <Button variant="secondary">Cancel</Button>
 * </Bar>
 * ```
 */
export function Bar({
  mode,
  position = mode === 'navigation' ? 'left' : mode === 'inspector' ? 'right' : 'top',
  title,
  children,
  defaultCollapsed = false,
  collapsible = true,
  width = mode === 'toolbar' ? 'auto' : '320px',
  className = '',
  headerActions,
}: BarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const { container, border } = positionStyles[position];

  // Toolbar mode uses flex layout
  if (mode === 'toolbar') {
    return (
      <div
        className={`flex items-center gap-2 px-4 py-2 ${border} bg-slate-950/50 ${className}`.trim()}
      >
        {title && (
          <Text role="label" className="mr-2">
            {title}
          </Text>
        )}
        <div className="flex items-center gap-2 flex-1">{children}</div>
        {headerActions}
      </div>
    );
  }

  // Sidebar mode (navigation/inspector)
  const widthStyle = collapsed ? '0px' : width;

  return (
    <div
      className={`${container} ${border} bg-slate-950/50 transition-all duration-300 overflow-hidden ${className}`.trim()}
      style={{ width: widthStyle }}
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
    </div>
  );
}
