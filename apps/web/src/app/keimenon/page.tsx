'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeimenonLayout } from '@/components/keimenon/KeimenonLayout';
import { FirstTimeUploadModal } from '@/components/keimenon/FirstTimeUploadModal';
// LEGACY (quarantined): import { ImportModule } from '@/components/keimenon/ImportModule.old';
// Using ChatImportModal as primary import rail
import { useKeimenonStore } from '@/store/keimenonStore';
import { useAuth } from '@/contexts/AuthContext';
import { ImportProgressProvider } from '@/contexts/ImportProgressContext';
import { ConsoleProvider } from '@/contexts/ConsoleContext';
import {
  BackgroundOperationsProvider,
  type Operation,
} from '@/contexts/BackgroundOperationsContext';
import { E2E_TESTING } from '@/lib/env.config';

export default function KeimenonPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showChatImportModal, setShowChatImportModal] = useState(false);
  const [showImportModule, setShowImportModule] = useState(false);
  const [restoredOperation, setRestoredOperation] = useState<Operation | null>(null);
  const shiftPressedRef = useRef(false);
  const loadGraphData = useKeimenonStore((state) => state.loadGraphData);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Check if E2E testing mode is enabled (disables welcome modal)
    const hasSeenWelcome = localStorage.getItem('keimenon_welcome_shown');
    if (!hasSeenWelcome && !E2E_TESTING) {
      setIsFirstTime(true);
    }

    loadGraphData();
  }, [isAuthenticated, isLoading, router, loadGraphData]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        shiftPressedRef.current = true;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        shiftPressedRef.current = false;
      }
    };
    const resetShift = () => {
      shiftPressedRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', resetShift);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', resetShift);
    };
  }, []);

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
    localStorage.setItem('keimenon_welcome_shown', 'true');
    setIsFirstTime(false);
  };

  const handleOpenUpload = () => {
    // Temporarily default to new local-first modal
    // Hold shift to use old modal for comparison
    if (shiftPressedRef.current) {
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
          <KeimenonLayout
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
              Use ChatImportModal via KeimenonSidebar or FirstTimeUploadModal instead */}
        </ImportProgressProvider>
      </BackgroundOperationsProvider>
    </ConsoleProvider>
  );
}
