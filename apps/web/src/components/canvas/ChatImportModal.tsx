'use client';

import { useState, useCallback, useEffect } from 'react';
import { X, Upload, FileText, Save, CheckCircle2 } from 'lucide-react';
import {
  ChatImportConfig,
  DEFAULT_IMPORT_CONFIG,
  PlatformDetection,
  UploadProgress,
  AnalysisResult,
  DuplicateGroup,
  ReviewDecision,
} from '@/types/chat-import';
import { ImportStageSelect } from '../import/ImportStageSelect';
import { ImportStageProcessing } from '../import/ImportStageProcessing';
import { ImportStageConfig } from '../import/ImportStageConfig';
import { DuplicateReviewPanel } from '../import/DuplicateReviewPanel';
import {
  importChatFilesAsJob,
  analyzeFiles,
  detectPlatform,
  applyDuplicateDecisions,
} from '@/lib/api-client';
import { useJobStream, type JobUpdate } from '@/hooks/useJobStream';
import { useChunkedUpload } from '@/hooks/useChunkedUpload';
import { logApiEvent, logJobEvent } from '@/lib/error-handler';
import { useAuth } from '@/contexts/AuthContext';
import { useOperating } from '@/contexts/OperatingContext';
import { DEBUG_IMPORT_SELECTOR } from '@/lib/env.config';

interface ChatImportModalProps {
  onDismiss: () => void;
}

type Stage = 'select' | 'processing' | 'config' | 'review' | 'complete';

export function ChatImportModal({ onDismiss }: ChatImportModalProps) {
  // Auth and operating context
  const { user } = useAuth();
  const { operating } = useOperating();

  // Chunked upload hook
  const chunkedUpload = useChunkedUpload();

  // State
  const [stage, setStage] = useState<Stage>('select');
  const [config, setConfig] = useState<ChatImportConfig>(DEFAULT_IMPORT_CONFIG);
  const [files, setFiles] = useState<File[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [platformDetection, setPlatformDetection] = useState<PlatformDetection | null>(null);
  const [progress, setProgress] = useState<UploadProgress>({
    stage: 'uploading',
    percent: 0,
    message: '',
  });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Subscribe to job updates via SSE
  const { jobs, connected } = useJobStream();

  // Listen for job updates and update progress
  useEffect(() => {
    if (!currentJobId) return;

    const jobUpdate = jobs.get(currentJobId);
    if (!jobUpdate) return;

    console.log('[ChatImportModal] Job update received:', jobUpdate);

    // Map job status to upload progress
    const statusToStage: Record<string, UploadProgress['stage']> = {
      queued: 'uploading',
      running: 'analyzing',
      succeeded: 'ready',
      failed: 'error',
      canceled: 'error',
    };

    const stage = statusToStage[jobUpdate.status] || 'analyzing';
    const percent = jobUpdate.progress.percent;
    const message = jobUpdate.progress.message || '';

    setProgress({ stage, percent, message });

    // Handle completion
    if (jobUpdate.status === 'succeeded') {
      setIsImporting(false);
      setStage('complete');
      console.log('[ChatImportModal] Import job completed successfully');

      // Log completion event
      logJobEvent(`Import completed successfully`, 'import.jobCompleted', {
        jobId: currentJobId,
        progress: jobUpdate.progress.percent,
      });
    } else if (jobUpdate.status === 'failed') {
      setIsImporting(false);
      setProgress({
        stage: 'error',
        percent: 0,
        message: 'Import failed. Please try again.',
      });

      // Error is already captured by error handler, but log the failure
      logJobEvent(`Import job failed`, 'import.jobFailed', {
        jobId: currentJobId,
        message: jobUpdate.progress.message,
      });
    }
  }, [currentJobId, jobs]);

  // Track chunked upload progress
  useEffect(() => {
    const uploadProgress = chunkedUpload.progress;

    if (uploadProgress.status === 'uploading') {
      setProgress({
        stage: 'uploading',
        percent: uploadProgress.percentage,
        message: `Uploading chunks: ${uploadProgress.chunksUploaded}/${uploadProgress.totalChunks} (${uploadProgress.percentage}%)`,
      });
    } else if (uploadProgress.status === 'completed') {
      console.log('[ChatImportModal] Chunked upload completed, import job created');
    } else if (uploadProgress.status === 'failed') {
      setProgress({
        stage: 'error',
        percent: 0,
        message: uploadProgress.error || 'Upload failed',
      });
      setIsImporting(false);
    }
  }, [chunkedUpload.progress]);

  const processFiles = async (filesToProcess: File[]) => {
    try {
      // Stage 1: Uploading
      setProgress({ stage: 'uploading', percent: 10, message: 'Uploading files...' });
      await delay(300);

      // Stage 2: Detecting platform
      setProgress({ stage: 'detecting', percent: 30, message: 'Detecting platform...' });

      // Detect platform from first file
      if (filesToProcess.length > 0) {
        const detection = await detectPlatform(filesToProcess[0]);
        setPlatformDetection({
          platform: detection.platform as any,
          conversationCount: 0, // Will be calculated during analysis
          messageCount: 0,
          confidence: detection.confidence,
        });
      }

      // Stage 3: Analyzing
      setProgress({ stage: 'analyzing', percent: 60, message: 'Analyzing content...' });

      // Analyze files to get statistics
      const analysisData = await analyzeFiles(filesToProcess);

      // Update platform detection with counts
      if (platformDetection) {
        setPlatformDetection({
          ...platformDetection,
          conversationCount: analysisData.total_conversations,
          messageCount: analysisData.total_messages,
        });
      }

      // Set analysis result
      setAnalysis({
        totalMessages: analysisData.total_messages,
        userMessages: Math.floor(analysisData.total_messages * 0.5), // Estimate
        assistantMessages: Math.floor(analysisData.total_messages * 0.5), // Estimate
        codeBlocks: 0, // Will be detected during import
        averageMessageLength: 500, // Estimate
        filteredMessageCount: Math.floor(analysisData.total_messages * 0.6), // Estimate based on min length
      });

      // Stage 4: Ready
      setProgress({ stage: 'ready', percent: 100, message: 'Ready for configuration' });
      await delay(300);
      setStage('config');
    } catch (error) {
      console.error('Error processing files:', error);
      setProgress({
        stage: 'error',
        percent: 0,
        message: 'Failed to process files. Please try again.',
      });
    }
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // File selection handler
  const handleFilesSelected = useCallback(
    async (selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setStage('processing');
      await processFiles(selectedFiles);
    },
    [processFiles]
  );

  const handleImport = async () => {
    try {
      console.log('[ChatImportModal] Starting chunked upload with config:', config);
      console.log(
        '[ChatImportModal] Files to import:',
        files.map((f) => f.name)
      );

      if (files.length === 0) {
        alert('Please select files to import');
        return;
      }

      // Set importing state and show loading
      setIsImporting(true);
      setStage('processing');
      setProgress({ stage: 'uploading', percent: 0, message: 'Initiating chunked upload...' });

      console.log('[ChatImportModal] Using chunked upload for large file support');
      console.log('[ChatImportModal] Detected platform:', platformDetection?.platform);

      // Prepare import config to be stored with upload session
      const importConfig = {
        platform: platformDetection?.platform || 'generic',
        ...config,
      };

      // Upload files using chunked upload (supports multiple files)
      // For now, we handle one file at a time (most imports are single file)
      // TODO: Add support for parallel multi-file uploads if needed
      const file = files[0]; // Start with first file

      console.log(
        `[ChatImportModal] Uploading file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
      );

      // Upload with chunked upload hook
      const uploadResult = await chunkedUpload.upload(file, importConfig);

      if (!uploadResult.success || !uploadResult.jobId) {
        console.error('[ChatImportModal] Chunked upload failed:', uploadResult.error);
        setIsImporting(false);
        alert(`Failed to upload file: ${uploadResult.error || 'Unknown error'}`);
        return;
      }

      console.log(
        '[ChatImportModal] Chunked upload complete, import job created:',
        uploadResult.jobId
      );

      // Store job ID to track progress via SSE
      setCurrentJobId(uploadResult.jobId);

      // Log event for keimenon console
      logJobEvent(`Import job created via chunked upload: ${file.name}`, 'import.jobCreated', {
        jobId: uploadResult.jobId,
        fileName: file.name,
        fileSize: file.size,
        uploadMethod: 'chunked',
      });

      console.log(
        `[ChatImportModal] Import job ${uploadResult.jobId} created. Tracking progress via SSE...`
      );
      setProgress({
        stage: 'analyzing',
        percent: 10,
        message: `Chunked upload complete. Import processing started... (Job ID: ${uploadResult.jobId.substring(0, 8)}...)`,
      });

      // SSE will handle progress updates via useEffect
      // Job will appear in Background Operations table automatically
    } catch (error) {
      console.error('[ChatImportModal] Import error:', error);
      setIsImporting(false);
      setProgress({
        stage: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleReviewComplete = async (decisions: Map<string, ReviewDecision>) => {
    try {
      console.log('[ChatImportModal] Applying duplicate decisions:', decisions);

      // Convert Map to array format expected by backend
      const decisionsArray = Array.from(decisions.entries()).map(([duplicateId, decision]) => ({
        duplicateId,
        action: decision.action,
        timestamp: Date.now(),
      }));

      if (decisionsArray.length === 0) {
        console.log('[ChatImportModal] No decisions to apply, dismissing modal');
        onDismiss();
        return;
      }

      // Show progress
      setProgress({
        stage: 'uploading',
        percent: 90,
        message: `Applying ${decisionsArray.length} duplicate decisions...`,
      });

      // Apply decisions to backend
      const result = await applyDuplicateDecisions(decisionsArray, currentJobId || undefined);

      console.log('[ChatImportModal] Decisions applied:', result);

      // Log success event
      logApiEvent(`Applied ${result.result.applied_decisions} duplicate decisions`, {
        domain: 'import',
        operation: 'duplicateDecisionsApplied',
        metadata: {
          applied: result.result.applied_decisions,
          removed: result.result.nodes_removed,
          merged: result.result.nodes_merged,
          actionCounts: result.result.action_counts,
        },
      });

      // Show success message
      setProgress({
        stage: 'ready',
        percent: 100,
        message: result.result.message,
      });

      // Wait a bit to show the success message, then dismiss
      setTimeout(() => {
        onDismiss();
      }, 1500);
    } catch (error) {
      console.error('[ChatImportModal] Error applying decisions:', error);

      // Show error but still allow dismissing
      setProgress({
        stage: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : 'Failed to apply decisions',
      });

      alert(
        `Failed to apply duplicate decisions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const getStageTitle = () => {
    switch (stage) {
      case 'select':
        return 'Select chat export files to import';
      case 'processing':
        return currentJobId ? 'Import job in progress...' : 'Processing your files...';
      case 'config':
        return 'Configure import settings';
      case 'review':
        return 'Review potential duplicates';
      case 'complete':
        return 'Import completed successfully!';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-import-modal-title"
        aria-describedby="chat-import-modal-description"
        data-testid="chat-import-modal"
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 id="chat-import-modal-title" className="text-xl font-bold">
                Import AI Chat Conversations
              </h2>
              <p id="chat-import-modal-description" className="text-sm text-slate-400">
                {getStageTitle()}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close import modal"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content - Stage-based rendering */}
        {stage === 'review' ? (
          // Full-height review panel (no padding wrapper)
          <div className="flex-1 flex flex-col min-h-0">
            <DuplicateReviewPanel
              groups={duplicateGroups}
              onReviewComplete={handleReviewComplete}
              onCancel={onDismiss}
            />
          </div>
        ) : (
          <div className="p-6">
            {stage === 'select' && (
              <ImportStageSelect onFilesSelected={handleFilesSelected} files={files} />
            )}

            {stage === 'processing' && (
              <ImportStageProcessing platformDetection={platformDetection} progress={progress} />
            )}

            {stage === 'config' && (
              <ImportStageConfig
                config={config}
                onConfigChange={setConfig}
                platformDetection={platformDetection}
                analysis={analysis}
              />
            )}

            {stage === 'complete' && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-10 h-10 text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-slate-200 mb-2">
                  Import Job Created Successfully!
                </h3>
                <p className="text-slate-400 mb-4 max-w-md">
                  Your import is now processing in the background. You can track its progress in the
                  <span className="text-purple-400 font-medium"> Background Operations</span> table
                  on the dashboard.
                </p>
                {currentJobId && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
                    <p className="text-xs text-slate-500 mb-1">Job ID</p>
                    <code className="text-sm text-purple-400 font-mono">{currentJobId}</code>
                  </div>
                )}
                <button
                  onClick={onDismiss}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
                >
                  Close & View Progress
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer - hide for review and complete stages */}
        {stage !== 'review' && stage !== 'complete' && (
          <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-6">
            {/* Tenancy Debug Badge - Only visible when DEBUG_IMPORT_SELECTOR=1 */}
            {DEBUG_IMPORT_SELECTOR && (
              <div className="mb-4 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded text-xs text-slate-400 font-mono">
                <span className="text-slate-500">Import Rail:</span>{' '}
                <span className="text-green-400">job-based</span>
                {' · '}
                <span className="text-slate-500">Account:</span>{' '}
                <span className="text-purple-400">{operating?.accountId || 'N/A'}</span>
                {' · '}
                <span className="text-slate-500">Permission:</span>{' '}
                <span className="text-yellow-400">{user?.permissionLevel || 'N/A'}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={onDismiss}
                className="px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>

              {stage === 'config' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // TODO: Implement preset saving functionality
                      // Related: apps/api/src/routes/presets.ts (create presets endpoint)
                      // See: docs/features/IMPORT_PRESETS.md (needs creation)
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save Preset
                  </button>

                  <button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                  >
                    {isImporting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Import & Review
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
