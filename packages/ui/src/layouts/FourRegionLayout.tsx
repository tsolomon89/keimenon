import * as React from 'react';
import { cn } from '../utils/cn';

interface FourRegionLayoutProps {
  header?: React.ReactNode;
  leftSidebar?: React.ReactNode;
  rightSidebar?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Four-region layout as specified in ui_screens_layout_view_map_v_0.md
 * - Header (top)
 * - LHS sidebar (collapsible nav)
 * - Main viewport (keimenon)
 * - RHS sidebar (inspector/selection stack)
 * - Footer (console/logs)
 */
export function FourRegionLayout({
  header,
  leftSidebar,
  rightSidebar,
  footer,
  children,
  className,
}: FourRegionLayoutProps) {
  const [lhsCollapsed, _setLhsCollapsed] = React.useState(false);
  const [rhsCollapsed, _setRhsCollapsed] = React.useState(false);
  const [footerCollapsed, _setFooterCollapsed] = React.useState(true);

  return (
    <div className={cn('h-screen flex flex-col bg-slate-950', className)}>
      {/* Header */}
      {header && (
        <header className="h-16 border-b border-slate-800 flex-shrink-0 z-50">{header}</header>
      )}

      {/* Main content area with sidebars */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        {leftSidebar && (
          <aside
            className={cn(
              'border-r border-slate-800 bg-slate-900 transition-all duration-300 flex-shrink-0',
              lhsCollapsed ? 'w-0' : 'w-64'
            )}
          >
            {!lhsCollapsed && <div className="h-full overflow-y-auto p-4">{leftSidebar}</div>}
          </aside>
        )}

        {/* Main Viewport */}
        <main className="flex-1 overflow-hidden relative">{children}</main>

        {/* Right Sidebar */}
        {rightSidebar && (
          <aside
            className={cn(
              'border-l border-slate-800 bg-slate-900 transition-all duration-300 flex-shrink-0',
              rhsCollapsed ? 'w-0' : 'w-96'
            )}
          >
            {!rhsCollapsed && <div className="h-full overflow-y-auto p-4">{rightSidebar}</div>}
          </aside>
        )}
      </div>

      {/* Footer / Console */}
      {footer && (
        <footer
          className={cn(
            'border-t border-slate-800 bg-slate-900 transition-all duration-300 flex-shrink-0',
            footerCollapsed ? 'h-8' : 'h-48'
          )}
        >
          <div className="h-full overflow-y-auto">{footer}</div>
        </footer>
      )}
    </div>
  );
}
