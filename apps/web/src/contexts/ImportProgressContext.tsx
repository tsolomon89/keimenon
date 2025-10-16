'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ImportStage =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'building-sources'
  | 'extracting-code'
  | 'phase1-3'
  | 'creating-folders'
  | 'complete'
  | 'error';

export interface ImportProgress {
  isProcessing: boolean;
  fileName: string | null;
  stage: ImportStage;
  progress: number; // 0-100
  message: string;
  detail: string;
  canMinimize: boolean;
  error: string | null;
}

interface ImportProgressContextType {
  progress: ImportProgress;
  startImport: (fileName: string) => void;
  updateProgress: (updates: Partial<Omit<ImportProgress, 'isProcessing'>>) => void;
  completeImport: () => void;
  failImport: (error: string) => void;
  resetImport: () => void;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  minimizeModal: () => void;
}

const ImportProgressContext = createContext<ImportProgressContextType | undefined>(undefined);

const INITIAL_PROGRESS: ImportProgress = {
  isProcessing: false,
  fileName: null,
  stage: 'idle',
  progress: 0,
  message: '',
  detail: '',
  canMinimize: false,
  error: null,
};

export function ImportProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<ImportProgress>(INITIAL_PROGRESS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const startImport = useCallback((fileName: string) => {
    setProgress({
      isProcessing: true,
      fileName,
      stage: 'uploading',
      progress: 0,
      message: 'Starting import...',
      detail: 'Preparing to upload file',
      canMinimize: false, // Can't minimize during initial upload
      error: null,
    });
    setIsModalOpen(true);
  }, []);

  const updateProgress = useCallback((updates: Partial<Omit<ImportProgress, 'isProcessing'>>) => {
    setProgress((prev) => ({
      ...prev,
      ...updates,
      isProcessing: true,
    }));
  }, []);

  const completeImport = useCallback(() => {
    setProgress((prev) => ({
      ...prev,
      isProcessing: false,
      stage: 'complete',
      progress: 100,
      message: 'Import complete!',
      detail: 'Successfully imported data',
      canMinimize: false,
      error: null,
    }));
  }, []);

  const failImport = useCallback((error: string) => {
    setProgress((prev) => ({
      ...prev,
      isProcessing: false,
      stage: 'error',
      message: 'Import failed',
      detail: error,
      canMinimize: false,
      error,
    }));
  }, []);

  const resetImport = useCallback(() => {
    setProgress(INITIAL_PROGRESS);
    setIsModalOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    // Only allow closing if not processing or if minimizable
    if (!progress.isProcessing || progress.canMinimize) {
      setIsModalOpen(false);
    }
  }, [progress.isProcessing, progress.canMinimize]);

  const minimizeModal = useCallback(() => {
    if (progress.canMinimize) {
      setIsModalOpen(false);
    }
  }, [progress.canMinimize]);

  return (
    <ImportProgressContext.Provider
      value={{
        progress,
        startImport,
        updateProgress,
        completeImport,
        failImport,
        resetImport,
        isModalOpen,
        openModal,
        closeModal,
        minimizeModal,
      }}
    >
      {children}
    </ImportProgressContext.Provider>
  );
}

export function useImportProgress() {
  const context = useContext(ImportProgressContext);
  if (!context) {
    throw new Error('useImportProgress must be used within ImportProgressProvider');
  }
  return context;
}
