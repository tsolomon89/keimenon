'use client';

import { useState, useEffect, useRef } from 'react';
import { CanvasHeader } from './CanvasHeader';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasSidebar } from './CanvasSidebar';
import { CanvasFooter } from './CanvasFooter';
import { CanvasViewport, CanvasViewportHandle } from './CanvasViewport';
import { CRMDashboard } from './CRMDashboard';
import { PortalWrapper } from './PortalWrapper';
import { SettingsPage } from '../settings/SettingsPage';
import { UploadModal } from './UploadModal';
import { ChatImportModal } from './ChatImportModal';
import { NodeDetailPanel } from './NodeDetailPanel';
import { useShell } from '@/contexts/ShellContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOperating } from '@/contexts/OperatingContext';

interface CanvasLayoutProps {
  showUploadModal: boolean;
  onShowUploadModal: (show: boolean) => void;
  onOpenUpload: () => void;
  showChatImportModal: boolean;
  onShowChatImportModal: (show: boolean) => void;
  onOpenChatImport: () => void;
}

export function CanvasLayout({
  showUploadModal,
  onShowUploadModal,
  onOpenUpload,
  showChatImportModal,
  onShowChatImportModal,
  onOpenChatImport,
}: CanvasLayoutProps) {
  const { user } = useAuth();
  const { shellMode, canvasMode } = useShell();
  const { operating } = useOperating();
  const canvasViewportRef = useRef<CanvasViewportHandle>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [footerOpen, setFooterOpen] = useState(false);
  const [selectedSettingsSectionId, setSelectedSettingsSectionId] = useState<string | undefined>(
    undefined
  );
  const [selectedSettingsControlId, setSelectedSettingsControlId] = useState<string | null>(null);

  const isAdmin = user?.accountType === 'admin';
  const isPortalMode = shellMode === 'portal';
  const isNativeMode = operating.mode === 'native';
  const hasAccountSelected = operating.accountId && operating.mode !== 'native';

  // Set default settings section when entering settings mode
  useEffect(() => {
    if (canvasMode === 'settings' && !selectedSettingsSectionId) {
      setSelectedSettingsSectionId('section_general_language');
    }
  }, [canvasMode, selectedSettingsSectionId]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Header */}
      <CanvasHeader />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <CanvasSidebar
          side="left"
          isOpen={leftSidebarOpen}
          onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
          onSettingsSectionSelect={setSelectedSettingsSectionId}
        />

        {/* Main viewport + toolbar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <CanvasToolbar
            onUploadClick={onOpenUpload}
            onLeftSidebarToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
            onRightSidebarToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
            onFooterToggle={() => setFooterOpen(!footerOpen)}
            leftSidebarVisible={leftSidebarOpen}
            rightSidebarVisible={rightSidebarOpen}
            footerVisible={footerOpen}
            onZoomIn={() => canvasViewportRef.current?.zoomIn()}
            onZoomOut={() => canvasViewportRef.current?.zoomOut()}
            onCenterView={() => canvasViewportRef.current?.centerView()}
          />

          {/* Viewport - conditional based on canvas mode and shell */}
          {isPortalMode && !hasAccountSelected && !isNativeMode ? (
            // Portal mode with no account selected - show message
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <h2 className="text-xl font-bold mb-2">Select an Account</h2>
                <p className="text-sm text-slate-400 mb-4">
                  Switch to CRM mode and select a client account to enter Portal mode.
                </p>
                <button
                  onClick={() => {}}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium transition-colors"
                  disabled
                >
                  No Account Selected
                </button>
              </div>
            </div>
          ) : (
            // Wrap content with PortalWrapper if in Portal mode
            <PortalWrapper>
              {canvasMode === 'canvas' && (
                <CanvasViewport
                  ref={canvasViewportRef}
                  onOpenUpload={onOpenUpload}
                  onOpenChatImport={onOpenChatImport}
                />
              )}

              {canvasMode === 'dashboard' && (
                <>
                  {shellMode === 'crm' && isAdmin ? (
                    <CRMDashboard />
                  ) : (
                    <div className="flex-1 overflow-auto p-6">
                      <div className="max-w-7xl mx-auto">
                        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {/* Client dashboard placeholder */}
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                            <h3 className="text-sm font-semibold text-slate-400 mb-2">Total Sources</h3>
                            <p className="text-3xl font-bold">0</p>
                          </div>
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                            <h3 className="text-sm font-semibold text-slate-400 mb-2">Total Nodes</h3>
                            <p className="text-3xl font-bold">0</p>
                          </div>
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                            <h3 className="text-sm font-semibold text-slate-400 mb-2">Total Edges</h3>
                            <p className="text-3xl font-bold">0</p>
                          </div>
                        </div>
                        <p className="text-slate-500 text-sm mt-8">Client dashboard coming soon...</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {canvasMode === 'settings' && (
                <SettingsPage
                  selectedSectionId={selectedSettingsSectionId}
                  onControlSelect={setSelectedSettingsControlId}
                />
              )}
            </PortalWrapper>
          )}
        </div>

        {/* Right Sidebar */}
        <CanvasSidebar
          side="right"
          isOpen={rightSidebarOpen}
          onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
          selectedSettingsControlId={selectedSettingsControlId}
        />
      </div>

      {/* Footer */}
      <CanvasFooter isOpen={footerOpen} />

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal onClose={() => onShowUploadModal(false)} />
      )}

      {/* Chat Import Modal */}
      {showChatImportModal && (
        <ChatImportModal onDismiss={() => onShowChatImportModal(false)} />
      )}

      {/* Node Detail Panel (Modal Overlay) */}
      <NodeDetailPanel />
    </div>
  );
}
