'use client';

import { useState, useCallback, useRef } from 'react';
import { X, Upload, FileText, Settings, CheckCircle2, AlertCircle } from 'lucide-react';
import { EnhancedImportConfig, DEFAULT_ENHANCED_CONFIG } from '@/types/enhanced-import';

interface StreamingUploadModalProps {
  onDismiss: () => void;
}

type Stage = 'select' | 'uploading' | 'processing' | 'complete' | 'error';

interface ProcessingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  progress?: number;
  message?: string;
}

interface UploadResult {
  uploadId: string;
  fileName: string;
  conversations: number;
  sources: number;
  codeBlocks: number;
  duplicates: number;
}

export function StreamingUploadModal({ onDismiss }: StreamingUploadModalProps) {
  const [stage, setStage] = useState<Stage>('select');
  const [config, setConfig] = useState<EnhancedImportConfig>(DEFAULT_ENHANCED_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { id: 'upload', label: 'Uploading file', status: 'pending' },
    { id: 'parse', label: 'Parsing conversations', status: 'pending' },
    { id: 'sources', label: 'Building source documents', status: 'pending' },
    { id: 'code', label: 'Extracting code blocks', status: 'pending' },
    { id: 'duplicates', label: 'Detecting duplicates', status: 'pending' },
    { id: 'save', label: 'Saving to database', status: 'pending' },
  ]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateStep = (stepId: string, updates: Partial<ProcessingStep>) => {
    setProcessingSteps(prev =>
      prev.map(step => (step.id === stepId ? { ...step, ...updates } : step))
    );
  };

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

  const handleUpload = async () => {
    if (files.length === 0) return;

    try {
      setStage('uploading');
      abortControllerRef.current = new AbortController();

      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('config', JSON.stringify(config));

      // Update upload step
      updateStep('upload', { status: 'active', progress: 0 });

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/import/enhanced`, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      // Complete upload
      updateStep('upload', { status: 'complete', progress: 100 });

      // Start processing steps
      setStage('processing');
      updateStep('parse', { status: 'active', message: 'Reading conversations...' });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Import failed');
      }

      // Simulate step progression (in real implementation, use SSE/WebSocket)
      await simulateProcessing();

      // Set results
      setResults(data.results || []);
      setStage('complete');

    } catch (error: any) {
      if (error.name === 'AbortError') {
        setErrorMessage('Upload cancelled');
      } else {
        setErrorMessage(error.message || 'Upload failed');
      }
      setStage('error');
      updateStep('upload', { status: 'error' });
    }
  };

  const simulateProcessing = async () => {
    const steps = ['parse', 'sources', 'code', 'duplicates', 'save'];

    for (const stepId of steps) {
      updateStep(stepId, { status: 'active', progress: 0 });

      // Simulate progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        updateStep(stepId, { progress: i });
      }

      updateStep(stepId, { status: 'complete', progress: 100 });
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onDismiss();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <Upload className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Enhanced Chat Import</h2>
              <p className="text-sm text-slate-400">
                {stage === 'select' && 'Upload large chat export files'}
                {stage === 'uploading' && 'Uploading files...'}
                {stage === 'processing' && 'Processing conversations...'}
                {stage === 'complete' && 'Import complete!'}
                {stage === 'error' && 'Import failed'}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* File Selection Stage */}
          {stage === 'select' && (
            <div className="space-y-6">
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center hover:border-purple-500/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-16 h-16 mx-auto mb-4 text-slate-500" />
                <p className="text-lg font-semibold mb-2">
                  Drop chat export files here
                </p>
                <p className="text-sm text-slate-400 mb-4">
                  or click to browse
                </p>
                <p className="text-xs text-slate-500">
                  Supports files up to 2GB • JSON format
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {/* Selected Files */}
              {files.length > 0 && (
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold mb-3">Selected Files</h3>
                  <div className="space-y-2">
                    {files.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-slate-900 p-3 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-purple-400" />
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-slate-500">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setFiles(files.filter((_, i) => i !== idx))
                          }
                          className="p-1 hover:bg-slate-800 rounded transition-colors"
                        >
                          <X className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Configuration Toggle */}
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                <Settings className="w-4 h-4" />
                {showConfig ? 'Hide' : 'Show'} advanced configuration
              </button>

              {/* Configuration Panel */}
              {showConfig && (
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold">Import Configuration</h3>

                  {/* Sources Config */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.sources?.enabled ?? true}
                        onChange={e =>
                          setConfig({
                            ...config,
                            sources: { ...config.sources, enabled: e.target.checked },
                          })
                        }
                        className="rounded bg-slate-900 border-slate-700"
                      />
                      <span className="text-sm">Build source documents</span>
                    </label>

                    {config.sources?.enabled && (
                      <div className="ml-6 space-y-2">
                        <div>
                          <label className="text-xs text-slate-400">
                            Stitch strategy
                          </label>
                          <select
                            value={config.sources?.stitchStrategy ?? 'by_chat'}
                            onChange={e =>
                              setConfig({
                                ...config,
                                sources: {
                                  ...config.sources,
                                  stitchStrategy: e.target.value as any,
                                },
                              })
                            }
                            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm"
                          >
                            <option value="by_chat">By Chat</option>
                            <option value="by_title">By Title</option>
                            <option value="by_topic">By Topic</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Code Config */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.code?.enabled ?? true}
                        onChange={e =>
                          setConfig({
                            ...config,
                            code: { ...config.code, enabled: e.target.checked },
                          })
                        }
                        className="rounded bg-slate-900 border-slate-700"
                      />
                      <span className="text-sm">Extract code blocks</span>
                    </label>

                    {config.code?.enabled && (
                      <div className="ml-6">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.code?.deduplicate ?? true}
                            onChange={e =>
                              setConfig({
                                ...config,
                                code: {
                                  ...config.code,
                                  deduplicate: e.target.checked,
                                },
                              })
                            }
                            className="rounded bg-slate-900 border-slate-700"
                          />
                          <span className="text-xs text-slate-400">
                            Deduplicate code
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Duplicates Config */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.duplicates?.enabled ?? true}
                        onChange={e =>
                          setConfig({
                            ...config,
                            duplicates: {
                              ...config.duplicates,
                              enabled: e.target.checked,
                            },
                          })
                        }
                        className="rounded bg-slate-900 border-slate-700"
                      />
                      <span className="text-sm">Detect duplicates</span>
                    </label>

                    {config.duplicates?.enabled && (
                      <div className="ml-6 space-y-2">
                        <div>
                          <label className="text-xs text-slate-400">
                            Algorithm
                          </label>
                          <select
                            value={config.duplicates?.algorithm ?? 'jaccard'}
                            onChange={e =>
                              setConfig({
                                ...config,
                                duplicates: {
                                  ...config.duplicates,
                                  algorithm: e.target.value as any,
                                },
                              })
                            }
                            className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm"
                          >
                            <option value="jaccard">Jaccard (fast)</option>
                            <option value="levenshtein">Levenshtein (precise)</option>
                            <option value="cosine">Cosine (semantic)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Processing Stage */}
          {(stage === 'uploading' || stage === 'processing') && (
            <div className="space-y-6">
              {/* Overall Progress */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">Processing</span>
                  <span className="text-sm text-slate-400">
                    {processingSteps.filter(s => s.status === 'complete').length} /{' '}
                    {processingSteps.length} steps
                  </span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        (processingSteps.filter(s => s.status === 'complete')
                          .length /
                          processingSteps.length) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Step Details */}
              <div className="space-y-3">
                {processingSteps.map(step => (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      step.status === 'active'
                        ? 'bg-purple-600/20 border border-purple-600/30'
                        : step.status === 'complete'
                        ? 'bg-emerald-600/20 border border-emerald-600/30'
                        : step.status === 'error'
                        ? 'bg-red-600/20 border border-red-600/30'
                        : 'bg-slate-800/50'
                    }`}
                  >
                    {step.status === 'complete' && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    )}
                    {step.status === 'active' && (
                      <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    {step.status === 'error' && (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                    {step.status === 'pending' && (
                      <div className="w-5 h-5 rounded-full bg-slate-700" />
                    )}

                    <div className="flex-1">
                      <p className="text-sm font-medium">{step.label}</p>
                      {step.message && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {step.message}
                        </p>
                      )}
                    </div>

                    {step.progress !== undefined && step.status === 'active' && (
                      <span className="text-sm text-slate-400">
                        {step.progress}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complete Stage */}
          {stage === 'complete' && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">Import Complete!</h3>
                <p className="text-slate-400">
                  Successfully processed {results.length} file(s)
                </p>
              </div>

              {/* Results */}
              <div className="bg-slate-800/50 rounded-lg p-4 space-y-4">
                {results.map((result, idx) => (
                  <div key={idx} className="bg-slate-900 rounded-lg p-4">
                    <h4 className="font-semibold mb-3">{result.fileName}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-400">Conversations</p>
                        <p className="text-2xl font-bold">{result.conversations}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Sources</p>
                        <p className="text-2xl font-bold">{result.sources}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Code Blocks</p>
                        <p className="text-2xl font-bold">{result.codeBlocks}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Duplicates</p>
                        <p className="text-2xl font-bold">{result.duplicates}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Stage */}
          {stage === 'error' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">Import Failed</h3>
              <p className="text-slate-400">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-6 flex items-center justify-between">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors"
          >
            {stage === 'complete' ? 'Close' : 'Cancel'}
          </button>

          {stage === 'select' && files.length > 0 && (
            <button
              onClick={handleUpload}
              className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
            >
              <Upload className="w-4 h-4" />
              Start Import
            </button>
          )}

          {stage === 'complete' && (
            <button
              onClick={() => {
                setFiles([]);
                setStage('select');
                setProcessingSteps(
                  processingSteps.map(s => ({ ...s, status: 'pending', progress: undefined }))
                );
                setResults([]);
              }}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
            >
              Import More
            </button>
          )}

          {stage === 'error' && (
            <button
              onClick={() => {
                setStage('select');
                setErrorMessage('');
                setProcessingSteps(
                  processingSteps.map(s => ({ ...s, status: 'pending', progress: undefined }))
                );
              }}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
