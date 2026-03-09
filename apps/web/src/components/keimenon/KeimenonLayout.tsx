'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { KeimenonHeader } from './KeimenonHeader';
import { KeimenonToolbar } from './KeimenonToolbar';
import { KeimenonSidebar, type InspectorPanel } from './KeimenonSidebar';
import { KeimenonFooter } from './KeimenonFooter';
import { KeimenonViewport, KeimenonViewportHandle } from './KeimenonViewport';
import { CRMDashboard } from './CRMDashboard';
import { StorageStatsDashboard } from './StorageStatsDashboard';
import { LegacyBoardPreview } from './LegacyBoardPreview';
import { ProcessingKeimenonView } from './ProcessingKeimenonView';
import { BoardViewContainer } from '../organization/BoardViewContainer';
import { PortalWrapper } from './PortalWrapper';
import { SettingsPage } from '../settings/SettingsPage';
import { UploadModal } from './UploadModal';
import { ChatImportModal } from './ChatImportModal';
import { NodeDetailPanel } from './NodeDetailPanel';
import { PrimitivesBody } from '../primitives/PrimitivesBody';
import { useShell } from '@/contexts/ShellContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOperating } from '@/contexts/OperatingContext';
import { useUIVersion } from '@/contexts/UIVersionContext';
import { useBackgroundOperations, type Operation } from '@/contexts/BackgroundOperationsContext';
import { useConsole } from '@/contexts/ConsoleContext';
import type { ImportJob } from './ImportsTableCard';
import type { ImportUiStatus } from '@/lib/import-job-progress';
import { getCoreProcessReimportStatus, type CoreProcessReimportStatus } from '@/lib/api-client';

interface KeimenonLayoutProps {
  showUploadModal: boolean;
  onShowUploadModal: (show: boolean) => void;
  onOpenUpload: () => void;
  showChatImportModal: boolean;
  onShowChatImportModal: (show: boolean) => void;
  onOpenChatImport: () => void;
  restoredOperation?: Operation | null;
  onClearRestoredOperation?: () => void;
}

export function KeimenonLayout({
  showUploadModal,
  onShowUploadModal,
  onOpenUpload,
  showChatImportModal,
  onShowChatImportModal,
  onOpenChatImport,
  restoredOperation,
  onClearRestoredOperation,
}: KeimenonLayoutProps) {
  const { user } = useAuth();
  const { shellMode, keimenonMode } = useShell();
  const { operating } = useOperating();
  const { uiVersion } = useUIVersion();
  const { operations, getOperation, getActiveOperations, addOperation, updateOperation } =
    useBackgroundOperations();
  const { isOpen: footerOpen, setIsOpen: setFooterOpen } = useConsole();
  const keimenonViewportRef = useRef<KeimenonViewportHandle>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [keimenonSurface, setKeimenonSurface] = useState<
    'keimenon' | 'legacy' | 'processing' | 'boards'
  >('keimenon');
  const [dashboardView, setDashboardView] = useState<'analytics' | 'storage'>('analytics');
  const [selectedSettingsSectionId, setSelectedSettingsSectionId] = useState<string | undefined>(
    undefined
  );
  const [selectedSettingsControlId, setSelectedSettingsControlId] = useState<string | null>(null);
  const [inspectorPanel, setInspectorPanel] = useState<InspectorPanel | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState<any>(null); // User selected from Settings > Users
  const [activeOperation, setActiveOperation] = useState<Operation | null>(null);
  const [coreProcessReimport, setCoreProcessReimport] = useState<CoreProcessReimportStatus | null>(
    null
  );
  const previousRunningImportCountRef = useRef(0);

  // Keep active operation in sync with restored operations from background queue
  useEffect(() => {
    if (restoredOperation) {
      setActiveOperation(restoredOperation);
      setInspectorPanel('import-flow');
      setRightSidebarOpen(true);
      onClearRestoredOperation?.();
    }
  }, [restoredOperation, onClearRestoredOperation]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setCoreProcessReimport(null);
      return;
    }

    getCoreProcessReimportStatus()
      .then((status) => {
        if (!cancelled) {
          setCoreProcessReimport(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCoreProcessReimport(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.accountId]);

  useEffect(() => {
    const onCoreProcessReimportComplete = () => {
      setCoreProcessReimport((previous) =>
        previous ? { ...previous, requiresReimport: false } : previous
      );
    };

    window.addEventListener('core-process-reimport-complete', onCoreProcessReimportComplete);
    return () => {
      window.removeEventListener('core-process-reimport-complete', onCoreProcessReimportComplete);
    };
  }, []);

  // Refresh active operation when background context updates
  useEffect(() => {
    if (activeOperation) {
      const latest = getOperation(activeOperation.id);
      if (latest) {
        setActiveOperation(latest);
      }
    }
  }, [operations, activeOperation, getOperation]);

  // When no active operation is selected, fall back to the first running job
  useEffect(() => {
    if (!activeOperation) {
      const running = getActiveOperations();
      if (running.length > 0) {
        setActiveOperation(running[0]);
      }
    }
  }, [activeOperation, getActiveOperations]);

  // Auto-switch to processing view when import job starts
  // TODO: Add user preference to disable auto-switch (see docs/features/IMPORT_PREFERENCES.md)
  useEffect(() => {
    const runningImports = Array.from(operations.values()).filter(
      (op) =>
        op.type === 'import' &&
        [
          'queued',
          'reading',
          'parsing',
          'normalizing',
          'indexing',
          'linking',
          'processing',
          'blocked',
        ].includes(op.status)
    );
    const runningImportCount = runningImports.length;
    const hadRunningImports = previousRunningImportCountRef.current > 0;
    const hasNewRunningImport = !hadRunningImports && runningImportCount > 0;

    // Auto-switch only when imports transition from "none running" to "running".
    // This avoids trapping users/tests in processing view due to stale background operations.
    // Shows minigraph visualization and real-time pipeline progress
    if (keimenonMode === 'keimenon' && hasNewRunningImport && keimenonSurface !== 'processing') {
      console.debug('[KeimenonLayout] Auto-switching to processing view for import job');
      setKeimenonSurface('processing');

      // Set the first running import as active if none is selected
      if (
        !activeOperation ||
        activeOperation.status === 'done' ||
        activeOperation.status === 'error'
      ) {
        setActiveOperation(runningImports[0]);
      }
    }

    previousRunningImportCountRef.current = runningImportCount;
  }, [operations, keimenonMode, keimenonSurface, activeOperation]);

  // Reset processing surface when there is no active operation
  useEffect(() => {
    if (keimenonSurface === 'processing' && !activeOperation) {
      setKeimenonSurface('keimenon');
    }
  }, [keimenonSurface, activeOperation]);

  const hasProcessingOperations = useMemo(
    () =>
      Array.from(operations.values()).some((op) =>
        [
          'queued',
          'reading',
          'parsing',
          'normalizing',
          'indexing',
          'linking',
          'processing',
          'blocked',
        ].includes(op.status)
      ),
    [operations]
  );

  const processingAvailable = hasProcessingOperations || !!activeOperation;
  // Handler to open import flow in Inspector Bar
  // NOTE(import-flow): ChatImportModal is the primary job-based import rail, rendered via KeimenonSidebar.
  const handleOpenImportFlow = () => {
    // Open import flow in Inspector Bar (no modals)
    setInspectorPanel('import-flow');
    setRightSidebarOpen(true); // Auto-expand Inspector Bar if collapsed
  };

  const handleStartGuidedReimport = async () => {
    handleOpenImportFlow();
  };

  // Handler for when user is selected from Settings > Users
  const handleUserSelect = (user: any) => {
    setSelectedUser(user);
    setInspectorPanel('user-detail');
    setRightSidebarOpen(true); // Auto-expand Inspector Bar if collapsed
  };

  // Handler for when user is updated in inspector
  const handleUserUpdate = (updatedUser: any) => {
    setSelectedUser(updatedUser);
    // ✅ UsersListCard already handles refresh via onSuccess callback (line 371)
    // The update is reflected immediately in the inspector
  };

  const mapImportStatusToOperationStatus = (status: string): Operation['status'] => {
    const importStatus = status as ImportUiStatus;
    const allowed: ImportUiStatus[] = [
      'queued',
      'reading',
      'parsing',
      'normalizing',
      'indexing',
      'linking',
      'processing',
      'blocked',
      'done',
      'error',
    ];

    return allowed.includes(importStatus) ? (importStatus as Operation['status']) : 'processing';
  };

  const focusOperationFromJob = (job: ImportJob) => {
    const status = mapImportStatusToOperationStatus(job.status);
    const baseStats = {
      nodesCreated: job.stats.nodesCreated,
      edgesCreated: job.stats.edgesCreated,
      sourcesCreated: job.stats.sourcesCreated,
      conversationsProcessed: job.stats.conversationsProcessed,
      messagesProcessed: job.stats.messagesProcessed ?? 0,
      spansCreated: job.stats.spansCreated ?? 0,
      packetsCreated: job.stats.packetsCreated ?? 0,
      atomicUnitsCreated: job.stats.atomicUnitsCreated ?? 0,
      packetMassLinksCreated: job.stats.packetMassLinksCreated ?? 0,
    };

    const existing = getOperation(job.id);

    if (existing) {
      const mergedOperation: Operation = {
        ...existing,
        title: job.fileName,
        description: job.fileType,
        fileName: job.fileName,
        fileType: job.fileType,
        platform: job.platform,
        status,
        progress: job.progress,
        startedAt: job.startedAt ?? existing.startedAt,
        completedAt: job.completedAt ?? existing.completedAt,
        stats: { ...existing.stats, ...baseStats },
        state: { ...existing.state, job },
      };

      updateOperation(job.id, mergedOperation);
      setActiveOperation(mergedOperation);
    } else {
      const newOperation: Operation = {
        id: job.id,
        type: job.id.startsWith('del_') ? 'deletion' : 'import',
        title: job.fileName,
        description: job.fileType,
        fileName: job.fileName,
        fileType: job.fileType,
        platform: job.platform,
        status,
        progress: job.progress,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        stats: baseStats,
        state: { job },
      };

      addOperation(newOperation);
      setActiveOperation(newOperation);
    }

    setInspectorPanel('import-flow');
    setRightSidebarOpen(true);
  };

  const isAdmin = user?.accountType === 'admin';
  const isNativeMode = operating.mode === 'native';
  const hasAccountSelected = operating.accountId && operating.mode !== 'native';
  // Admin operating mode: Admin user viewing another account's context
  const isAdminOperatingMode = isAdmin && !isNativeMode;

  // Detect mobile/tablet screen size (debounced)
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024; // lg breakpoint
      setIsMobile(mobile);
      // Auto-close sidebars on mobile
      if (mobile) {
        setLeftSidebarOpen(false);
        setRightSidebarOpen(false);
      }
    };

    let resizeTimer: ReturnType<typeof setTimeout>;
    const debouncedCheck = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkMobile, 150);
    };

    checkMobile();
    window.addEventListener('resize', debouncedCheck);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedCheck);
    };
  }, []);

  // Set default settings section when entering settings mode
  useEffect(() => {
    if (keimenonMode === 'settings' && !selectedSettingsSectionId) {
      setSelectedSettingsSectionId('section_general_language');
    }
  }, [keimenonMode, selectedSettingsSectionId]);

  // Reset dashboard view when leaving dashboard mode
  useEffect(() => {
    if (keimenonMode !== 'dashboard' && dashboardView !== 'analytics') {
      setDashboardView('analytics');
    }
  }, [keimenonMode, dashboardView]);

  // Reset legacy view when switching away from keimenon mode
  useEffect(() => {
    if (keimenonMode !== 'keimenon' && keimenonSurface !== 'keimenon') {
      setKeimenonSurface('keimenon');
    }
  }, [keimenonMode, keimenonSurface]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Header */}
      <KeimenonHeader />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conditional rendering based on UI version */}
        {uiVersion === 'primitives' ? (
          /* New Primitives UI */
          <PrimitivesBody />
        ) : (
          /* Legacy UI */
          <>
            {/* Left Sidebar */}
            <KeimenonSidebar
              side="left"
              isOpen={leftSidebarOpen}
              onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
              onSettingsSectionSelect={setSelectedSettingsSectionId}
            />

            {/* Main viewport + toolbar */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {coreProcessReimport?.requiresReimport && (
                <div className="px-4 py-2 border-b border-amber-500/30 bg-amber-500/10">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-amber-100">
                      Core process upgrade reset prior import artifacts. Start guided reimport to
                      rebuild your workspace.
                    </p>
                    <button
                      onClick={handleStartGuidedReimport}
                      className="px-3 py-1.5 rounded bg-amber-500 text-slate-900 text-sm font-semibold hover:bg-amber-400 transition-colors"
                    >
                      Start Reimport
                    </button>
                  </div>
                </div>
              )}

              {/* Toolbar */}
              <KeimenonToolbar
                onUploadClick={handleOpenImportFlow}
                onLeftSidebarToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
                onRightSidebarToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
                onFooterToggle={() => setFooterOpen(!footerOpen)}
                leftSidebarVisible={leftSidebarOpen}
                rightSidebarVisible={rightSidebarOpen}
                footerVisible={footerOpen}
                keimenonSurface={keimenonSurface}
                onKeimenonSurfaceChange={setKeimenonSurface}
                dashboardView={dashboardView}
                onDashboardViewChange={setDashboardView}
                processingAvailable={processingAvailable}
                onZoomIn={() => keimenonViewportRef.current?.zoomIn()}
                onZoomOut={() => keimenonViewportRef.current?.zoomOut()}
                onCenterView={() => keimenonViewportRef.current?.centerView()}
              />

              {/* Viewport - conditional based on keimenon mode and operating context */}
              {isAdminOperatingMode && !hasAccountSelected && !isNativeMode ? (
                // Admin in operating mode but no account selected - show message
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="text-center max-w-md">
                    <h2 className="text-xl font-bold mb-2">Select an Account</h2>
                    <p className="text-sm text-slate-400 mb-4">
                      Select a client account from the Accounts Tree to view their keimenon.
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
                // Wrap content with PortalWrapper if admin is operating on an account
                <PortalWrapper>
                  {keimenonMode === 'keimenon' &&
                    (keimenonSurface === 'keimenon' ? (
                      <KeimenonViewport
                        ref={keimenonViewportRef}
                        onOpenUpload={handleOpenImportFlow}
                        onOpenChatImport={handleOpenImportFlow}
                      />
                    ) : keimenonSurface === 'legacy' ? (
                      <LegacyBoardPreview />
                    ) : keimenonSurface === 'processing' ? (
                      <ProcessingKeimenonView operation={activeOperation} />
                    ) : (
                      <BoardViewContainer />
                    ))}

                  {keimenonMode === 'dashboard' &&
                    (dashboardView === 'analytics' ? (
                      <CRMDashboard onJobSelect={focusOperationFromJob} />
                    ) : (
                      <StorageStatsDashboard />
                    ))}

                  {keimenonMode === 'settings' && (
                    <SettingsPage
                      selectedSectionId={selectedSettingsSectionId}
                      onControlSelect={setSelectedSettingsControlId}
                      onUserSelect={handleUserSelect}
                    />
                  )}
                </PortalWrapper>
              )}
            </div>

            {/* Right Sidebar */}
            <KeimenonSidebar
              side="right"
              isOpen={rightSidebarOpen}
              onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
              selectedSettingsControlId={selectedSettingsControlId}
              inspectorPanel={inspectorPanel}
              onInspectorPanelChange={setInspectorPanel}
              selectedUser={selectedUser}
              onUserUpdate={handleUserUpdate}
              activeOperation={activeOperation}
              onViewProcessing={() => setKeimenonSurface('processing')}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <KeimenonFooter isOpen={footerOpen} />

      {/* Upload Modal */}
      {showUploadModal && <UploadModal onClose={() => onShowUploadModal(false)} />}

      {/* Chat Import Modal */}
      {showChatImportModal && <ChatImportModal onDismiss={() => onShowChatImportModal(false)} />}

      {/* Node Detail Panel (Modal Overlay) */}
      <NodeDetailPanel />
    </div>
  );
}
