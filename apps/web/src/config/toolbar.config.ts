/**
 * Unified Toolbar Configuration
 *
 * Centralizes toolbar button definitions to ensure parity between admin and client users.
 * Both account types see the same buttons in the same order.
 *
 * @see docs/migrations/MANAGER_MODE_PARITY.md for implementation details
 */

import {
  Search,
  Filter,
  Upload,
  FolderPlus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  SlidersHorizontal,
} from 'lucide-react';
import { User } from '@/lib/api-client';

/**
 * Toolbar button definition
 */
export interface ToolbarButton {
  /** Unique identifier for the button */
  id: string;

  /** Icon component from lucide-react */
  icon: any;

  /** Display label */
  label: string;

  /** Tooltip text */
  tooltip: string;

  /** Button group (left, center, right) */
  group: 'left' | 'center' | 'right';

  /** Action to perform when clicked - injected by consumer */
  action?: () => void;

  /** Whether button is disabled */
  disabled?: boolean;
}

/**
 * Context object passed to getToolbarButtons
 * Contains user info and action handlers
 */
export interface ToolbarContext {
  user: User;

  // Action handlers (injected by KeimenonToolbar component)
  onSearch?: () => void;
  onFilter?: () => void;
  onUpload?: () => void;
  onCreateFolder?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  onToggleLayout?: () => void;
  onOpenSettings?: () => void;
}

/**
 * Get the unified toolbar button configuration
 *
 * IMPORTANT: This function returns the SAME buttons for admin and client users.
 * No conditional rendering based on account type.
 *
 * @param context - Toolbar context with user and action handlers
 * @returns Array of toolbar buttons in display order
 *
 * @example
 * const buttons = getToolbarButtons({ user, onUpload, onZoomIn, ... });
 * return buttons.map(btn => <ToolbarButton key={btn.id} {...btn} />);
 */
export function getToolbarButtons(context: ToolbarContext): ToolbarButton[] {
  const {
    user,
    onSearch,
    onFilter,
    onUpload,
    onCreateFolder,
    onZoomIn,
    onZoomOut,
    onFitView,
    onToggleLayout,
    onOpenSettings,
  } = context;

  // SAME BUTTONS FOR ALL USERS
  // No account type conditionals here
  return [
    // LEFT GROUP - Search & Filters
    {
      id: 'search',
      icon: Search,
      label: 'Search',
      tooltip: 'Search nodes and content',
      group: 'left',
      action: onSearch,
    },
    {
      id: 'filter',
      icon: Filter,
      label: 'Filter',
      tooltip: 'Filter by node type',
      group: 'left',
      action: onFilter,
    },

    // CENTER GROUP - Content Actions
    {
      id: 'upload',
      icon: Upload,
      label: 'Upload',
      tooltip: 'Import data',
      group: 'center',
      action: onUpload,
    },
    {
      id: 'create-folder',
      icon: FolderPlus,
      label: 'New Folder',
      tooltip: 'Create new folder',
      group: 'center',
      action: onCreateFolder,
    },

    // RIGHT GROUP - View Controls (SAME FOR ADMIN AND CLIENT)
    {
      id: 'zoom-in',
      icon: ZoomIn,
      label: 'Zoom In',
      tooltip: 'Zoom in',
      group: 'right',
      action: onZoomIn,
    },
    {
      id: 'zoom-out',
      icon: ZoomOut,
      label: 'Zoom Out',
      tooltip: 'Zoom out',
      group: 'right',
      action: onZoomOut,
    },
    {
      id: 'fit-view',
      icon: Maximize2,
      label: 'Fit View',
      tooltip: 'Fit all nodes in view',
      group: 'right',
      action: onFitView,
    },
    {
      id: 'toggle-layout',
      icon: LayoutGrid,
      label: 'Layout',
      tooltip: 'Change layout',
      group: 'right',
      action: onToggleLayout,
    },
    {
      id: 'settings',
      icon: SlidersHorizontal,
      label: 'Settings',
      tooltip: 'Open settings',
      group: 'right',
      action: onOpenSettings,
    },
  ];
}

/**
 * Group toolbar buttons by their group property
 *
 * @param buttons - Array of toolbar buttons
 * @returns Object with buttons grouped by left/center/right
 *
 * @example
 * const grouped = groupButtonsByPosition(buttons);
 * // { left: [...], center: [...], right: [...] }
 */
export function groupButtonsByPosition(buttons: ToolbarButton[]): {
  left: ToolbarButton[];
  center: ToolbarButton[];
  right: ToolbarButton[];
} {
  return {
    left: buttons.filter((btn) => btn.group === 'left'),
    center: buttons.filter((btn) => btn.group === 'center'),
    right: buttons.filter((btn) => btn.group === 'right'),
  };
}
