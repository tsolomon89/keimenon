'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Minimize2,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import {
  LocalImportService,
  LocalImportConfig,
  LocalImportProgress,
  LocalImportResult,
  DEFAULT_LOCAL_CONFIG,
} from '@/lib/local-import';
import { useImportProgress, type ImportStage } from '@/contexts/ImportProgressContext';

type Stage = 'select' | 'processing' | 'complete' | 'error';

type ProcessingStatus = 'pending' | 'active' | 'complete' | 'error';

interface ProcessingStep {
  id: LocalImportProgress['stage'] | 'complete';
  label: string;
  status: ProcessingStatus;
  message?: string;
  progress?: number;
}

interface ImportModuleProps {
  onClose: () => void;
  onSuccess?: (results: LocalImportResult[]) => void;
  variant?: 'modal' | 'panel';
}

const STEP_ORDER: Array<ProcessingStep['id']> = [
  'reading',
  'parsing',
  'extracting',
  'deduping',
  'stitching',
  'saving',
  'complete',
];

const STEP_LABELS: Record<ProcessingStep['id'], string> = {
  reading: 'Reading files',
  parsing: 'Parsing conversations',
  extracting: 'Extracting code blocks',
  deduping: 'Deduplicating code',
  stitching: 'Building source documents',
  saving: 'Saving locally',
  complete: 'Completed',
  error: 'Error',
};

const INITIAL_STEPS: ProcessingStep[] = STEP_ORDER.map((id) => ({
  id,
  label: STEP_LABELS[id],
  status: 'pending',
}));

export function ImportModule({ onClose, onSuccess, variant = 'panel' }: ImportModuleProps) {
  const {
    progress: globalProgress,
    startImport,
    updateProgress,
    completeImport,
    failImport,
    minimizeModal,
  } = useImportProgress();

  const isPanelVariant = variant === 'panel';

  const [stage, setStage] = useState<Stage>('select');
  const [config, setConfig] = useState<LocalImportConfig>(DEFAULT_LOCAL_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>(INITIAL_STEPS);
  const [progress, setProgress] = useState<LocalImportProgress | null>(null);
  const [results, setResults] = useState<LocalImportResult[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importServiceRef = useRef<LocalImportService | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const resetSteps = useCallback(() => {
    setProcessingSteps(INITIAL_STEPS);
  }, []);

  const updateStepsForProgress = useCallback((info: LocalImportProgress) => {
    setProcessingSteps((prev) =>
      prev.map((step) => {
        const stepIndex = STEP_ORDER.indexOf(step.id);
        const currentIndex = STEP_ORDER.indexOf(info.stage === 'error' ? 'saving' : info.stage);

        if (info.stage === 'error') {
          if (step.id === STEP_ORDER[Math.max(currentIndex, 0)]) {
            return {
              ...step,
              status: 'error',
              message: info.message,
              progress: undefined,
            };
          }
          return step;
        }

        if (step.id === info.stage) {
          return {
            ...step,
            status: 'active',
            progress: info.progress,
            message: info.detail || info.message,
          };
        }

        if (stepIndex < currentIndex) {
          return {
            ...step,
            status: 'complete',
            progress: 100,
          };
        }

        if (step.id === 'complete' && info.stage === 'complete') {
          return {
            ...step,
            status: 'complete',
            progress: 100,
            message: info.message,
          };
        }

        return {
          ...step,
          status: step.status === 'error' ? 'error' : 'pending',
          progress: undefined,
          message: undefined,
        };
      })
    );
  }, []);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    failImport('Import cancelled by user');
    setStage('error');
    setErrorMessage('Import cancelled');
    setProcessingSteps((prev) =>
      prev.map((step) =>
        step.status === 'active' ? { ...step, status: 'error', message: 'Cancelled by user' } : step
      )
    );
  }, [failImport]);

  const handleImport = async () => {
    if (files.length === 0) return;

    try {
      setStage('processing');
      setProgress(null);
      setErrorMessage('');
      resetSteps();

      startImport(files[0].name);

      abortControllerRef.current = new AbortController();

      const service = new LocalImportService((prog) => {
        setProgress(prog);

        // Map LocalImportProgress stages to ImportStage (from ImportProgressContext)
        const stageMap: Record<string, ImportStage> = {
          reading: 'parsing',
          parsing: 'parsing',
          extracting: 'extracting-code',
          stitching: 'building-sources',
          deduping: 'phase1-3',
          saving: 'creating-folders',
          complete: 'complete',
          error: 'error',
        };
        const mappedStage = stageMap[prog.stage] || 'parsing';

        updateProgress({
          stage: mappedStage,
          progress: prog.progress,
          message: prog.message,
          detail: prog.detail,
          canMinimize: prog.progress > 15,
        });
        updateStepsForProgress(prog);
      });
      importServiceRef.current = service;

      const importResults = await service.importFiles(files, config);

      const successful = importResults.filter((result) => result.success);
      if (successful.length === 0) {
        throw new Error(importResults[0]?.error || 'Import failed');
      }

      setResults(importResults);
      setStage('complete');
      completeImport();

      if (onSuccess) {
        onSuccess(importResults);
      }

      updateStepsForProgress({
        stage: 'complete',
        progress: 100,
        message: 'Import complete!',
        detail: `Processed ${successful.length} file(s)`,
      });
    } catch (error: any) {
      const message = error.message || 'Import failed';
      setErrorMessage(message);
      setStage('error');
      failImport(message);
      updateStepsForProgress({
        stage: 'error',
        progress: 0,
        message,
      });
    }
  };

  const totalStats = useMemo(() => {
    return results.reduce(
      (acc, result) => {
        if (!result.success) {
          return acc;
        }
        return {
          conversations: acc.conversations + result.stats.totalConversations,
          messages: acc.messages + result.stats.totalMessages,
          sources: acc.sources + result.stats.totalSources,
          codeBlocks: acc.codeBlocks + result.stats.totalCodeBlocks,
        };
      },
      { conversations: 0, messages: 0, sources: 0, codeBlocks: 0 }
    );
  }, [results]);

  const sparklineData = useMemo(() => {
    return results
      .filter((result) => result.success)
      .map((result) => result.stats.totalMessages || 0)
      .filter((value) => value >= 0);
  }, [results]);

  const outerWrapperClass = isPanelVariant
    ? 'flex h-full flex-col bg-slate-900 overflow-hidden'
    : 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4';

  const containerClass = isPanelVariant
    ? 'flex h-full flex-col overflow-y-auto'
    : 'bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col';

  return (
    <div className={outerWrapperClass}>
      <div className={containerClass}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-slate-300 transition-colors hover:border-slate-700 hover:bg-slate-800 hover:text-white"
              title="Back to inspector"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="rounded-lg bg-purple-600/20 p-2">
              <Upload className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                Import Module
                {stage === 'processing' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Processing
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Local-first ingestion with enhanced processing timeline
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stage === 'processing' && globalProgress.canMinimize && (
              <button
                type="button"
                onClick={minimizeModal}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                title="Minimize (continue in background)"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="space-y-6">
            {/* Stage indicator */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-slate-800/70 p-2">
                    <Activity className="h-4 w-4 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Current stage</p>
                    <p className="text-sm font-semibold text-white capitalize">
                      {stage === 'processing' ? (progress?.stage ?? 'Processing') : stage}
                    </p>
                  </div>
                </div>
                {progress && (
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Progress</p>
                    <p className="text-sm font-semibold text-white">
                      {Math.round(progress.progress)}%
                    </p>
                  </div>
                )}
              </div>
              <div className="mt-4 grid gap-3">
                {processingSteps.map((step) => (
                  <div
                    key={step.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex h-2.5 w-2.5 rounded-full ${
                            step.status === 'complete'
                              ? 'bg-emerald-400'
                              : step.status === 'active'
                                ? 'bg-purple-400 animate-pulse'
                                : step.status === 'error'
                                  ? 'bg-red-400'
                                  : 'bg-slate-600'
                          }`}
                        />
                        <p className="text-sm font-medium text-slate-200">{step.label}</p>
                      </div>
                      {step.progress !== undefined && (
                        <span className="text-xs text-slate-400">{step.progress}%</span>
                      )}
                    </div>
                    {step.message && (
                      <p className="ml-4 mt-1 text-xs text-slate-400">{step.message}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Selection / Configuration */}
            {stage === 'select' && (
              <div className="space-y-6">
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-slate-700 p-12 text-center transition-colors hover:border-purple-500/50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mx-auto mb-4 h-12 w-12 text-slate-500" />
                  <p className="mb-2 text-lg font-semibold">Drop chat export files here</p>
                  <p className="text-sm text-slate-400">or click to browse</p>
                  <p className="mt-3 text-xs text-slate-500">
                    Supports ChatGPT, Claude, Gemini • JSON / JSONL • Up to 2GB per file
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".json,.jsonl"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {files.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-200">
                        Selected Files ({files.length})
                      </h3>
                      <button
                        className="text-xs text-slate-400 transition-colors hover:text-white"
                        onClick={() => setFiles([])}
                      >
                        Clear all
                      </button>
                    </div>

                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-purple-400" />
                            <div>
                              <p className="text-sm font-medium text-slate-200">{file.name}</p>
                              <p className="text-xs text-slate-500">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <button
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                            onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowConfig((prev) => !prev)}
                  className="flex items-center gap-2 text-sm text-purple-400 transition-colors hover:text-purple-300"
                >
                  <Settings className="h-4 w-4" />
                  {showConfig ? 'Hide' : 'Show'} advanced configuration
                </button>

                {showConfig && (
                  <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <h3 className="text-sm font-semibold text-slate-200">Import Configuration</h3>

                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Include Roles
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.includeUser}
                            onChange={(e) =>
                              setConfig((prev) => ({ ...prev, includeUser: e.target.checked }))
                            }
                            className="rounded border-slate-700 bg-slate-900"
                          />
                          <span className="text-sm text-slate-300">User messages</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.includeAssistant}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                includeAssistant: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-700 bg-slate-900"
                          />
                          <span className="text-sm text-slate-300">Assistant messages</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Processing Mode
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="processingMode"
                            value="auto"
                            checked={config.processingMode === 'auto'}
                            onChange={() =>
                              setConfig((prev) => ({ ...prev, processingMode: 'auto' }))
                            }
                            className="text-purple-500"
                          />
                          <span className="text-sm text-slate-300">Auto stitch conversations</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="processingMode"
                            value="manual"
                            checked={config.processingMode === 'manual'}
                            onChange={() =>
                              setConfig((prev) => ({ ...prev, processingMode: 'manual' }))
                            }
                            className="text-purple-500"
                          />
                          <span className="text-sm text-slate-300">Manual per-chat processing</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Code Extraction
                      </p>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.extractCode}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, extractCode: e.target.checked }))
                          }
                          className="rounded border-slate-700 bg-slate-900"
                        />
                        <span className="text-sm text-slate-300">Extract code blocks</span>
                      </label>
                      {config.extractCode && (
                        <label className="ml-6 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.codeDeduplicate}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                codeDeduplicate: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-700 bg-slate-900"
                          />
                          <span className="text-xs text-slate-400">Deduplicate code blocks</span>
                        </label>
                      )}
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Duplicate Detection
                      </p>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.duplicateDetection.enabled}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              duplicateDetection: {
                                ...prev.duplicateDetection,
                                enabled: e.target.checked,
                              },
                            }))
                          }
                          className="rounded border-slate-700 bg-slate-900"
                        />
                        <span className="text-sm text-slate-300">Enable duplicate detection</span>
                      </label>
                      {config.duplicateDetection.enabled && (
                        <div className="ml-6 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs text-slate-400">Similarity threshold</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={config.duplicateDetection.similarityThreshold}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  duplicateDetection: {
                                    ...prev.duplicateDetection,
                                    similarityThreshold: Number(e.target.value),
                                  },
                                }))
                              }
                              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
                            />
                          </div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={config.duplicateDetection.crossConversation}
                              onChange={(e) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  duplicateDetection: {
                                    ...prev.duplicateDetection,
                                    crossConversation: e.target.checked,
                                  },
                                }))
                              }
                              className="rounded border-slate-700 bg-slate-900"
                            />
                            <span className="text-xs text-slate-400">
                              Compare across conversations
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Processing stage details */}
            {stage === 'processing' && progress && (
              <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                <div className="flex items-center gap-2 text-slate-200">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progress.message}
                </div>
                {progress.detail && <p className="text-xs text-slate-400">{progress.detail}</p>}
              </div>
            )}
            {/* Completion Summary */}
            {stage === 'complete' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white">Import Complete!</h3>
                  <p className="mt-2 text-sm text-emerald-200">
                    Processed {results.length} file{results.length === 1 ? '' : 's'} locally
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryCard label="Conversations" value={totalStats.conversations} />
                  <SummaryCard label="Messages" value={totalStats.messages} />
                  <SummaryCard label="Sources" value={totalStats.sources} />
                  <SummaryCard label="Code Blocks" value={totalStats.codeBlocks} />
                </div>

                {sparklineData.length > 1 && <Sparkline data={sparklineData} />}

                {results.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-200">File Results</h4>
                    <div className="space-y-2">
                      {results.map((result, idx) => (
                        <div
                          key={`${result.stats.totalConversations}-${idx}`}
                          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-200">
                              {files[idx]?.name ?? `File ${idx + 1}`}
                            </p>
                            <span className="text-xs text-slate-400">
                              {result.stats.processingTimeMs
                                ? `${(result.stats.processingTimeMs / 1000).toFixed(1)}s`
                                : ''}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <ResultStat
                              label="Conversations"
                              value={result.stats.totalConversations}
                            />
                            <ResultStat label="Messages" value={result.stats.totalMessages} />
                            <ResultStat label="Sources" value={result.stats.totalSources} />
                            <ResultStat label="Code Blocks" value={result.stats.totalCodeBlocks} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error State */}
            {stage === 'error' && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                  <AlertCircle className="h-10 w-10 text-red-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">Import Failed</h3>
                <p className="mt-2 text-sm text-red-200">{errorMessage}</p>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-800 bg-slate-900/90 px-4 py-3">
          <button
            onClick={stage === 'complete' ? onClose : handleCancel}
            className="rounded-lg px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {stage === 'complete' ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-3">
            {stage === 'select' && (
              <button
                onClick={handleImport}
                disabled={files.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <Upload className="h-4 w-4" />
                Start Import
              </button>
            )}

            {stage === 'processing' && (
              <button
                disabled
                className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-5 py-2 text-sm font-semibold text-slate-300"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </button>
            )}

            {stage === 'complete' && (
              <button
                onClick={() => {
                  setFiles([]);
                  setResults([]);
                  setStage('select');
                  setProgress(null);
                  resetSteps();
                }}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-purple-200 transition-colors hover:bg-purple-600/20"
              >
                Import More
              </button>
            )}

            {stage === 'error' && (
              <button
                onClick={() => {
                  setStage('select');
                  setErrorMessage('');
                  resetSteps();
                  setProgress(null);
                  setResults([]);
                }}
                className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
}

function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

interface ResultStatProps {
  label: string;
  value: number;
}

function ResultStat({ label, value }: ResultStatProps) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-slate-100">{value.toLocaleString()}</p>
    </div>
  );
}

interface SparklineProps {
  data: number[];
}

function Sparkline({ data }: SparklineProps) {
  const max = Math.max(...data, 1);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">Message volume per file</p>
      <div className="mt-3 flex h-16 items-end gap-1">
        {data.map((value, idx) => {
          const height = (value / max) * 100;
          return (
            <div
              key={idx}
              className="flex-1 rounded-t bg-gradient-to-t from-purple-600/30 via-purple-500/40 to-purple-400/60"
              style={{ height: `${height || 4}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
