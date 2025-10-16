'use client';

import { useState } from 'react';
import {
  Upload,
  PanelLeftClose,
  PanelRightClose,
  TerminalSquare,
  Grid3x3,
  Box,
  Layers3,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useShell } from '@/contexts/ShellContext';

type CanvasView = '2d' | '3d' | 'view3';

interface CanvasToolbarProps {
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
}

/**
 * Toolbar (bar_tool) — Final Behavior Spec Implementation
 *
 * Three fixed-alignment groups: Left (bars visibility), Center (canvas controls), Right (modes & actions)
 * Center group only visible in Canvas mode
 */
export function CanvasToolbar({
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
}: CanvasToolbarProps) {
  const { user } = useAuth();
  const { canvasMode, setCanvasMode, shellMode, setShellMode } = useShell();
  const [canvasView, setCanvasView] = useState<CanvasView>('2d');

  const isAdmin = user?.accountType === 'admin';
  const isClient = user?.accountType === 'client';
  const isCanvasMode = canvasMode === 'canvas';

  const handleCanvasClick = () => {
    // Switch to canvas mode
    // For admins, remain in current shell (portal or crm)
    setCanvasMode('canvas');
  };

  const handleDashboardClick = () => {
    // Dashboard button switches to CRM shell + Dashboard canvas mode
    if (isAdmin) {
      setShellMode('crm');
    }
    setCanvasMode('dashboard');
  };

  const handleSettings = () => {
    setCanvasMode('settings');
  };

  return (
    <div className="min-h-[48px] border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between px-3 gap-4">
      {/* LEFT GROUP — Bars visibility (always visible) */}
      <div className="flex items-center gap-1">
        <button
          onClick={onLeftSidebarToggle}
          className={`p-2 transition-colors ${
            leftSidebarVisible
              ? "text-slate-400 hover:text-white"
              : "text-white"
          }`}
          title="Toggle Navigator"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>

        <button
          onClick={onRightSidebarToggle}
          className={`p-2 transition-colors ${
            rightSidebarVisible
              ? "text-slate-400 hover:text-white"
              : "text-white"
          }`}
          title="Toggle Inspector"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>

        <button
          onClick={onFooterToggle}
          className={`p-2 transition-colors ${
            footerVisible ? "text-slate-400 hover:text-white" : "text-white"
          }`}
          title="Toggle Console"
        >
          <TerminalSquare className="w-4 h-4" />
        </button>
      </div>

      {/* CENTER GROUP — Canvas controls (only in Canvas mode) */}
      {isCanvasMode && (
        <div className="flex items-center gap-3">
          {/* A. View mode (mutually exclusive) - grouped toggle with depth */}
          <div className="flex items-center bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50 shadow-inner">
            <button
              onClick={() => setCanvasView("2d")}
              className={`p-2 rounded-md transition-all ${
                canvasView === "2d"
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              }`}
              title="2D View"
            >
              <Grid3x3 className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCanvasView("3d")}
              className={`p-2 rounded-md transition-all ${
                canvasView === "3d"
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              }`}
              title="3D View"
            >
              <Box className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCanvasView("view3")}
              className={`p-2 rounded-md transition-all ${
                canvasView === "view3"
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              }`}
              title="View 3"
            >
              <Layers3 className="w-4 h-4" />
            </button>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-slate-700" />

          {/* B. Camera actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={onZoomIn}
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              onClick={onZoomOut}
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={onCenterView}
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              title="Center View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Empty spacer when center group is hidden - maintains fixed alignment */}
      {!isCanvasMode && <div className="flex-1" />}

      {/* RIGHT GROUP — Modes & global actions (always visible; role-gated) */}
      <div className="flex items-center gap-2">
        {/* Mode toggle group (Canvas/Dashboard/Settings) - unified toggle with depth */}
        <div className="flex items-center bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50 shadow-inner">
          {/* For clients: Canvas + Settings (2 buttons) */}
          {/* For admin/business: Canvas + Dashboard + Settings (3 buttons) */}

          {/* Canvas button - always visible */}
          <button
            onClick={handleCanvasClick}
            className={`p-2 rounded-md transition-all ${
              canvasMode === "canvas"
                ? "bg-purple-600 text-white shadow-md"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            }`}
            title="Canvas"
          >
            <Grid3x3 className="w-4 h-4" />
          </button>

          {/* Dashboard - only visible for admin/business accounts */}
          {!isClient && (
            <button
              onClick={handleDashboardClick}
              className={`p-2 rounded-md transition-all ${
                canvasMode === "dashboard"
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              }`}
              title="Dashboard"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
          )}

          {/* Settings - always visible */}
          <button
            onClick={handleSettings}
            className={`p-2 rounded-md transition-all ${
              canvasMode === "settings"
                ? "bg-purple-600 text-white shadow-md"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            }`}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-slate-700" />
        
        {/* Upload - separate action button */}
        <button
          onClick={onUploadClick}
          className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
          title="Upload Sources"
        >
          <Upload className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
