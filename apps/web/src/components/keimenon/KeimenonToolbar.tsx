'use client';

import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import {
  Upload,
  PanelLeftClose,
  PanelRightClose,
  TerminalSquare,
  Grid3x3,
  Layers3,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutDashboard,
  Settings,
  Database,
  Activity,
  Briefcase,
  Filter,
  Link2,
  MessageSquare,
  Pin,
  Target,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useShell } from '@/contexts/ShellContext';
import { useKeimenonStore } from '@/store/keimenonStore';
import { SourceRoleFilterDropdown } from './SourceRoleFilter';
import type { NdProjectionConfig, RenderLens } from '@/lib/nd-projection';

interface KeimenonToolbarProps {
  onUploadClick: () => void;
  onLeftSidebarToggle: () => void;
  onRightSidebarToggle: () => void;
  onFooterToggle: () => void;
  leftSidebarVisible: boolean;
  rightSidebarVisible: boolean;
  footerVisible: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenterView: () => void;
  keimenonSurface: 'keimenon' | 'legacy' | 'processing' | 'boards';
  onKeimenonSurfaceChange: (surface: 'keimenon' | 'legacy' | 'processing' | 'boards') => void;
  dashboardView: 'analytics' | 'storage' | 'workspaces' | 'conversations';
  onDashboardViewChange: (view: 'analytics' | 'storage' | 'workspaces' | 'conversations') => void;
  processingAvailable?: boolean;
  autoSwitchToProcessingEnabled: boolean;
  onAutoSwitchToProcessingChange: (enabled: boolean) => void;
  focusModeEnabled: boolean;
  onFocusModeToggle: () => void;
  includeConnectorNodes: boolean;
  onConnectorVisibilityToggle: () => void;
  pinnedNodeCount: number;
  onClearPinnedNodes: () => void;
  renderLens: RenderLens;
  onRenderLensChange: (lens: RenderLens) => void;
  ndConfig: NdProjectionConfig;
  onNdConfigChange: (config: NdProjectionConfig) => void;
}

export function KeimenonToolbar({
  onUploadClick,
  onLeftSidebarToggle,
  onRightSidebarToggle,
  onFooterToggle,
  leftSidebarVisible,
  rightSidebarVisible,
  footerVisible,
  onZoomIn,
  onZoomOut,
  onCenterView,
  keimenonSurface,
  onKeimenonSurfaceChange,
  dashboardView,
  onDashboardViewChange,
  processingAvailable = false,
  autoSwitchToProcessingEnabled,
  onAutoSwitchToProcessingChange,
  focusModeEnabled,
  onFocusModeToggle,
  includeConnectorNodes,
  onConnectorVisibilityToggle,
  pinnedNodeCount,
  onClearPinnedNodes,
  renderLens,
  onRenderLensChange,
  ndConfig,
  onNdConfigChange,
}: KeimenonToolbarProps) {
  const { user } = useAuth();
  const { keimenonMode, setKeimenonMode } = useShell();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const sourceRoleFilter = useKeimenonStore((state) => state.filters.sourceRoleFilter);
  const isAdminAccount = user?.accountType === 'admin';

  const isKeimenonMode = keimenonMode === 'keimenon';
  const isDashboardMode = isAdminAccount && keimenonMode === 'dashboard';
  const isFiltering = sourceRoleFilter.size > 0;

  // Close filter dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [filterOpen]);

  const handleKeimenonMode = () => {
    setKeimenonMode('keimenon');
    onKeimenonSurfaceChange('keimenon');
  };

  const handleDashboardMode = () => {
    if (!isAdminAccount) {
      return;
    }
    setKeimenonMode('dashboard');
    onDashboardViewChange('analytics');
  };

  const handleSettingsMode = () => {
    setKeimenonMode('settings');
  };

  const sidebarButtonClass = (isActive: boolean, extra?: string) =>
    clsx(
      'p-1.5 sm:p-2 rounded transition-colors text-slate-400 hover:text-white hover:bg-slate-800',
      isActive && 'bg-slate-800 text-white shadow-inner',
      extra
    );

  const surfaceButtonClass = (isActive: boolean, disabled?: boolean) =>
    clsx(
      'p-2 rounded-md transition-all text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed',
      isActive && 'bg-slate-800 text-white shadow-inner border border-slate-700/60',
      disabled && 'opacity-40 cursor-not-allowed hover:text-slate-400 hover:bg-slate-800'
    );
  const modeButtonClass = (isActive: boolean) =>
    clsx(
      'p-2 rounded-md transition-all text-slate-400 hover:text-white hover:bg-slate-800',
      isActive && 'bg-slate-800 text-white shadow-inner border border-slate-700/60'
    );

  return (
    <div
      data-testid="keimenon-toolbar"
      className="min-h-[48px] border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between px-2 sm:px-3 gap-2 sm:gap-4"
    >
      <div className="flex items-center gap-0.5 sm:gap-1">
        <button
          onClick={onLeftSidebarToggle}
          type="button"
          data-testid="toolbar-toggle-navigator"
          className={sidebarButtonClass(leftSidebarVisible)}
          title="Toggle Navigator"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>

        <button
          onClick={onRightSidebarToggle}
          type="button"
          data-testid="toolbar-toggle-inspector"
          className={sidebarButtonClass(rightSidebarVisible)}
          title="Toggle Inspector"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>

        <button
          onClick={onFooterToggle}
          type="button"
          data-testid="toolbar-toggle-console"
          className={sidebarButtonClass(footerVisible, 'hidden sm:flex')}
          title="Toggle Console"
        >
          <TerminalSquare className="w-4 h-4" />
        </button>
      </div>

      {isKeimenonMode && (
        <div className="hidden lg:flex items-center gap-2 lg:gap-3">
          <div className="flex items-center bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50 shadow-inner">
            <button
              onClick={() => onKeimenonSurfaceChange('keimenon')}
              type="button"
              className={surfaceButtonClass(keimenonSurface === 'keimenon')}
              title="Keimenon View"
            >
              <Grid3x3 className="w-4 h-4" />
            </button>

            <button
              onClick={() => onKeimenonSurfaceChange('legacy')}
              type="button"
              className={surfaceButtonClass(keimenonSurface === 'legacy')}
              title="Legacy Board View"
            >
              <Layers3 className="w-4 h-4" />
            </button>

            <button
              onClick={() => onKeimenonSurfaceChange('processing')}
              type="button"
              disabled={!processingAvailable}
              className={surfaceButtonClass(keimenonSurface === 'processing', !processingAvailable)}
              title="Processing View"
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              onClick={() => onKeimenonSurfaceChange('boards')}
              type="button"
              className={surfaceButtonClass(keimenonSurface === 'boards')}
              title="Boards View"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-6 bg-slate-700" />

          <div className="flex items-center gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 px-1">Lens</span>
            <button
              onClick={() => onRenderLensChange('2d')}
              type="button"
              data-testid="toolbar-lens-2d-desktop"
              className={clsx(
                'px-2 py-1 rounded text-xs border transition-colors',
                renderLens === '2d'
                  ? 'bg-slate-700 text-white border-slate-600'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
              )}
              title="Lens: 2D"
            >
              2D
            </button>
            <button
              onClick={() => onRenderLensChange('3d')}
              type="button"
              data-testid="toolbar-lens-3d-desktop"
              className={clsx(
                'px-2 py-1 rounded text-xs border transition-colors',
                renderLens === '3d'
                  ? 'bg-slate-700 text-white border-slate-600'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
              )}
              title="Lens: 3D"
            >
              3D
            </button>
            <button
              onClick={() => onRenderLensChange('nd')}
              type="button"
              data-testid="toolbar-lens-nd-desktop"
              className={clsx(
                'px-2 py-1 rounded text-xs border transition-colors',
                renderLens === 'nd'
                  ? 'bg-slate-700 text-white border-slate-600'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
              )}
              title="Lens: ND"
            >
              ND
            </button>
          </div>

          {renderLens === 'nd' && (
            <>
              <div className="w-px h-6 bg-slate-700" />
              <div className="flex items-center gap-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 px-1">
                  Slice
                </span>
                <button
                  type="button"
                  className="px-1.5 py-1 rounded text-xs bg-slate-800 text-slate-300 hover:text-white"
                  title="ND Slice Center Down"
                  onClick={() =>
                    onNdConfigChange({ ...ndConfig, sliceCenter: ndConfig.sliceCenter - 0.05 })
                  }
                >
                  -
                </button>
                <span className="text-[11px] text-slate-400 min-w-[42px] text-center">
                  {ndConfig.sliceCenter.toFixed(2)}
                </span>
                <button
                  type="button"
                  className="px-1.5 py-1 rounded text-xs bg-slate-800 text-slate-300 hover:text-white"
                  title="ND Slice Center Up"
                  onClick={() =>
                    onNdConfigChange({ ...ndConfig, sliceCenter: ndConfig.sliceCenter + 0.05 })
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  className="px-1.5 py-1 rounded text-xs bg-slate-800 text-slate-300 hover:text-white"
                  title="ND Slice Width Narrower"
                  onClick={() =>
                    onNdConfigChange({
                      ...ndConfig,
                      sliceWidth: Math.max(0.05, ndConfig.sliceWidth - 0.05),
                    })
                  }
                >
                  w-
                </button>
                <button
                  type="button"
                  className="px-1.5 py-1 rounded text-xs bg-slate-800 text-slate-300 hover:text-white"
                  title="ND Slice Width Wider"
                  onClick={() =>
                    onNdConfigChange({
                      ...ndConfig,
                      sliceWidth: Math.min(2.0, ndConfig.sliceWidth + 0.05),
                    })
                  }
                >
                  w+
                </button>
              </div>
            </>
          )}

          <div className="w-px h-6 bg-slate-700" />

          <div className="flex items-center gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 px-1">Camera</span>
            <button
              onClick={onZoomIn}
              type="button"
              data-testid="toolbar-camera-zoom-in-desktop"
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Camera: Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              onClick={onZoomOut}
              type="button"
              data-testid="toolbar-camera-zoom-out-desktop"
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Camera: Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={onCenterView}
              type="button"
              data-testid="toolbar-camera-center-desktop"
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Camera: Center View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-6 bg-slate-700" />

          <div className="flex items-center gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 px-1">LOD</span>
            <button
              onClick={onFocusModeToggle}
              type="button"
              data-testid="toolbar-lod-focus-desktop"
              className={clsx(
                'p-2 rounded transition-colors',
                focusModeEnabled
                  ? 'bg-emerald-600/20 text-emerald-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
              title="LOD: Focus mode keeps focused neighborhoods visible"
            >
              <Target className="w-4 h-4" />
            </button>
            <button
              onClick={onConnectorVisibilityToggle}
              type="button"
              data-testid="toolbar-lod-connectors-desktop"
              className={clsx(
                'p-2 rounded transition-colors',
                includeConnectorNodes
                  ? 'bg-emerald-600/20 text-emerald-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
              title="LOD: Toggle connector lexemes/phrases"
            >
              <Link2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClearPinnedNodes}
              type="button"
              data-testid="toolbar-lod-clear-pins-desktop"
              className="p-2 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="LOD: Clear pinned subgraph nodes"
            >
              <Pin className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-slate-500 min-w-[40px]">pins {pinnedNodeCount}</span>
          </div>

          <div className="w-px h-6 bg-slate-700" />

          <button
            onClick={() => onAutoSwitchToProcessingChange(!autoSwitchToProcessingEnabled)}
            type="button"
            className={clsx(
              'px-2.5 py-1.5 rounded text-xs font-medium border transition-colors',
              autoSwitchToProcessingEnabled
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            )}
            title="Automatically switch to Processing view when imports start"
          >
            Auto-Processing {autoSwitchToProcessingEnabled ? 'On' : 'Off'}
          </button>

          {/* Source Role Filter */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              type="button"
              className={clsx(
                'p-2 rounded transition-colors relative',
                filterOpen || isFiltering
                  ? 'bg-slate-800 text-purple-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
              title="Filter by Source Role"
            >
              <Filter className="w-4 h-4" />
              {isFiltering && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full" />
              )}
            </button>
            {filterOpen && (
              <div className="absolute top-full mt-1 right-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50">
                <SourceRoleFilterDropdown />
              </div>
            )}
          </div>
        </div>
      )}

      {isKeimenonMode && (
        <div className="flex lg:hidden items-center gap-1.5 px-1">
          <button
            onClick={() => onRenderLensChange('2d')}
            type="button"
            data-testid="toolbar-lens-2d-mobile"
            className={clsx(
              'px-2 py-1 rounded text-[11px] border transition-colors',
              renderLens === '2d'
                ? 'bg-slate-700 text-white border-slate-600'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            )}
            title="Lens: 2D"
          >
            2D
          </button>
          <button
            onClick={() => onRenderLensChange('3d')}
            type="button"
            data-testid="toolbar-lens-3d-mobile"
            className={clsx(
              'px-2 py-1 rounded text-[11px] border transition-colors',
              renderLens === '3d'
                ? 'bg-slate-700 text-white border-slate-600'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            )}
            title="Lens: 3D"
          >
            3D
          </button>
          <button
            onClick={() => onRenderLensChange('nd')}
            type="button"
            data-testid="toolbar-lens-nd-mobile"
            className={clsx(
              'px-2 py-1 rounded text-[11px] border transition-colors',
              renderLens === 'nd'
                ? 'bg-slate-700 text-white border-slate-600'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            )}
            title="Lens: ND"
          >
            ND
          </button>
          <button
            onClick={onZoomIn}
            type="button"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            title="Camera: Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onCenterView}
            type="button"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            title="Camera: Center View"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isDashboardMode && (
        <div className="hidden md:flex items-center gap-2 lg:gap-3">
          <div className="flex items-center bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50 shadow-inner">
            <button
              onClick={() => onDashboardViewChange('analytics')}
              type="button"
              className={surfaceButtonClass(dashboardView === 'analytics')}
              title="Analytics Overview"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDashboardViewChange('storage')}
              type="button"
              className={surfaceButtonClass(dashboardView === 'storage')}
              title="Storage Statistics"
            >
              <Database className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDashboardViewChange('workspaces')}
              type="button"
              className={surfaceButtonClass(dashboardView === 'workspaces')}
              title="Workspace Browser"
            >
              <Briefcase className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDashboardViewChange('conversations')}
              type="button"
              className={surfaceButtonClass(dashboardView === 'conversations')}
              title="Conversation Browser"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!isKeimenonMode && !isDashboardMode && <div className="flex-1" />}

      <div className="flex items-center gap-2">
        <div className="flex items-center bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50 shadow-inner">
          <button
            onClick={handleKeimenonMode}
            type="button"
            className={modeButtonClass(keimenonMode === 'keimenon')}
            title="Keimenon"
          >
            <Grid3x3 className="w-4 h-4" />
          </button>

          {isAdminAccount && (
            <button
              onClick={handleDashboardMode}
              type="button"
              className={modeButtonClass(keimenonMode === 'dashboard')}
              title="Dashboard"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleSettingsMode}
            type="button"
            className={modeButtonClass(keimenonMode === 'settings')}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-6 bg-slate-700" />

        <button
          onClick={onUploadClick}
          type="button"
          className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
          title="Upload Sources"
        >
          <Upload className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
