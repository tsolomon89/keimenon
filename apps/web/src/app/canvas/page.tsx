'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CanvasLayout } from '@/components/canvas/CanvasLayout';
import { FirstTimeUploadModal } from '@/components/canvas/FirstTimeUploadModal';
// LEGACY (quarantined): import { ImportModule } from '@/components/canvas/ImportModule.old';
// Using ChatImportModal as primary import rail
import { useCanvasStore } from '@/store/canvasStore';
import { useAuth } from '@/contexts/AuthContext';
import { ImportProgressProvider } from '@/contexts/ImportProgressContext';
import { ConsoleProvider } from '@/contexts/ConsoleContext';
import {
  BackgroundOperationsProvider,
  type Operation,
} from '@/contexts/BackgroundOperationsContext';
import { E2E_TESTING } from '@/lib/env.config';

export default function CanvasPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showChatImportModal, setShowChatImportModal] = useState(false);
  const [showImportModule, setShowImportModule] = useState(false);
  const [restoredOperation, setRestoredOperation] = useState<Operation | null>(null);
  const loadGraphData = useCanvasStore((state) => state.loadGraphData);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Check if E2E testing mode is enabled (disables welcome modal)
    const hasSeenWelcome = localStorage.getItem('canvas_memory_welcome_shown');
    if (!hasSeenWelcome && !E2E_TESTING) {
      setIsFirstTime(true);
    }

    loadGraphData();
  }, [isAuthenticated, isLoading, router, loadGraphData]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleDismissWelcome = () => {
    localStorage.setItem('canvas_memory_welcome_shown', 'true');
    setIsFirstTime(false);
  };

  const handleOpenUpload = () => {
    // Temporarily default to new local-first modal
    // Hold shift to use old modal for comparison
    // TODO(agent:canvas): Replace window.event with proper React event handling
    // Related: apps/web/src/components/canvas/CanvasViewport.tsx (keyboard event handling)
    // See: docs/features/CANVAS_KEYBOARD_SHORTCUTS.md (needs creation)
    // Use: React synthetic events or window.addEventListener for keyboard shortcuts
    if (typeof window !== 'undefined' && window.event?.shiftKey) {
      setShowUploadModal(true);
    } else {
      setShowImportModule(true);
    }
  };

  const handleOpenChatImport = () => {
    setShowChatImportModal(true);
  };

  return (
    <ConsoleProvider>
      <BackgroundOperationsProvider onRestoreOperation={setRestoredOperation}>
        <ImportProgressProvider>
          <CanvasLayout
            showUploadModal={showUploadModal}
            onShowUploadModal={setShowUploadModal}
            onOpenUpload={handleOpenUpload}
            showChatImportModal={showChatImportModal}
            onShowChatImportModal={setShowChatImportModal}
            onOpenChatImport={handleOpenChatImport}
            restoredOperation={restoredOperation}
            onClearRestoredOperation={() => setRestoredOperation(null)}
          />
          {isFirstTime && (
            <FirstTimeUploadModal
              onDismiss={handleDismissWelcome}
              onOpenUpload={handleOpenUpload}
              onOpenChatImport={handleOpenChatImport}
            />
          )}
          {/* LEGACY (quarantined): showImportModule pathway removed
              Import Module quarantined to ImportModule.old.tsx
              Use ChatImportModal via CanvasSidebar or FirstTimeUploadModal instead */}
        </ImportProgressProvider>
      </BackgroundOperationsProvider>
    </ConsoleProvider>
  );
}
