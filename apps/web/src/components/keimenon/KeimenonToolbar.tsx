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
  Filter,
} from 'lucide-react';
import { useShell } from '@/contexts/ShellContext';
import { useKeimenonStore } from '@/store/keimenonStore';
import { SourceRoleFilterDropdown } from './SourceRoleFilter';

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
  dashboardView: 'analytics' | 'storage';
  onDashboardViewChange: (view: 'analytics' | 'storage') => void;
  processingAvailable?: boolean;
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
}: KeimenonToolbarProps) {
  const { keimenonMode, setKeimenonMode } = useShell();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const sourceRoleFilter = useKeimenonStore((state) => state.filters.sourceRoleFilter);

  const isKeimenonMode = keimenonMode === 'keimenon';
  const isDashboardMode = keimenonMode === 'dashboard';
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
    <div className="min-h-[48px] border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between px-2 sm:px-3 gap-2 sm:gap-4">
      <div className="flex items-center gap-0.5 sm:gap-1">
        <button
          onClick={onLeftSidebarToggle}
          type="button"
          className={sidebarButtonClass(leftSidebarVisible)}
          title="Toggle Navigator"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>

        <button
          onClick={onRightSidebarToggle}
          type="button"
          className={sidebarButtonClass(rightSidebarVisible)}
          title="Toggle Inspector"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>

        <button
          onClick={onFooterToggle}
          type="button"
          className={sidebarButtonClass(footerVisible, 'hidden sm:flex')}
          title="Toggle Console"
        >
          <TerminalSquare className="w-4 h-4" />
        </button>
      </div>

      {isKeimenonMode && (
        <div className="hidden md:flex items-center gap-2 lg:gap-3">
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
            <button
              onClick={onZoomIn}
              type="button"
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              onClick={onZoomOut}
              type="button"
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={onCenterView}
              type="button"
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Center View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-6 bg-slate-700" />

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

          <button
            onClick={handleDashboardMode}
            type="button"
            className={modeButtonClass(keimenonMode === 'dashboard')}
            title="Dashboard"
          >
            <LayoutDashboard className="w-4 h-4" />
          </button>

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
