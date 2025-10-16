'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CanvasLayout } from '@/components/canvas/CanvasLayout';
import { FirstTimeUploadModal } from '@/components/canvas/FirstTimeUploadModal';
import { LocalFirstImportModal } from '@/components/canvas/LocalFirstImportModal';
import { useCanvasStore } from '@/store/canvasStore';
import { useAuth } from '@/contexts/AuthContext';
import { ImportProgressProvider } from '@/contexts/ImportProgressContext';

export default function CanvasPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showChatImportModal, setShowChatImportModal] = useState(false);
  const [showLocalFirstImportModal, setShowLocalFirstImportModal] = useState(false);

  const loadGraphData = useCanvasStore((state) => state.loadGraphData);

  useEffect(() => {
    // Wait for auth to load
    if (isLoading) return;

    // Check auth
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Check if first time user
    const hasSeenWelcome = localStorage.getItem('canvas_memory_welcome_shown');
    if (!hasSeenWelcome) {
      setIsFirstTime(true);
    }

    // Load graph data from API
    loadGraphData();
  }, [isAuthenticated, isLoading, router, loadGraphData]);

  // Show loading state while checking auth
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

  // Don't render if not authenticated (will redirect)
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
    if (typeof window !== 'undefined' && (window as any).event?.shiftKey) {
      setShowUploadModal(true);
    } else {
      setShowLocalFirstImportModal(true);
    }
  };

  const handleOpenChatImport = () => {
    setShowChatImportModal(true);
  };

  return (
    <ImportProgressProvider>
      <CanvasLayout
        showUploadModal={showUploadModal}
        onShowUploadModal={setShowUploadModal}
        onOpenUpload={handleOpenUpload}
        showChatImportModal={showChatImportModal}
        onShowChatImportModal={setShowChatImportModal}
        onOpenChatImport={handleOpenChatImport}
      />
      {isFirstTime && (
        <FirstTimeUploadModal
          onDismiss={handleDismissWelcome}
          onOpenUpload={handleOpenUpload}
          onOpenChatImport={handleOpenChatImport}
        />
      )}
      {showLocalFirstImportModal && (
        <LocalFirstImportModal
          onClose={() => setShowLocalFirstImportModal(false)}
          onSuccess={(results) => {
            console.log('Import success:', results);
            // TODO: Refresh canvas with new data
            loadGraphData();
          }}
        />
      )}
    </ImportProgressProvider>
  );
}
