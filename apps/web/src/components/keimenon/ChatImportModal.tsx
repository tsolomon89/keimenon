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
  analyzeFiles,
  detectPlatform,
  applyDuplicateDecisions,
  getDuplicateReviewGroups,
  getDuplicateReviewStatus,
  getMyFeatures,
  completeCoreProcessReimport,
  getCoreProcessReimportStatus,
  listImportPresets,
  createImportPreset,
  updateImportPreset,
  deleteImportPreset,
  type ImportPreset,
} from '@/lib/api-client';
import { useJobStream, type JobUpdate } from '@/hooks/useJobStream';
import { useChunkedUpload } from '@/hooks/useChunkedUpload';
import { logApiEvent, logJobEvent } from '@/lib/error-handler';
import { useAuth } from '@/contexts/AuthContext';
import { useOperating } from '@/contexts/OperatingContext';
import { DEBUG_IMPORT_SELECTOR } from '@/lib/env.config';
import { useKeimenonStore } from '@/store/keimenonStore';
import { emitImportGraphRefresh } from '@/lib/import-refresh-events';
import {
  deriveImportProgress,
  mapImportStatusToUploadStage,
  normalizeImportProgressPercent,
} from '@/lib/import-job-progress';

interface ChatImportModalProps {
  onDismiss: () => void;
}

type Stage = 'select' | 'processing' | 'config' | 'review' | 'complete';

interface MultiFileImportProgress {
  fileName: string;
  jobId?: string;
  status: 'queued' | 'submitting' | 'submitted' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  error?: string;
}

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
  const [postImportResolvedJobId, setPostImportResolvedJobId] = useState<string | null>(null);
  const [multiFileImports, setMultiFileImports] = useState<MultiFileImportProgress[]>([]);
  const [importPresets, setImportPresets] = useState<ImportPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [agentRuntimeEnabled, setAgentRuntimeEnabled] = useState(false);

  const triggerGraphRefresh = useCallback(
    (
      jobId?: string,
      reason: 'import_modal_complete' | 'duplicate_review_applied' = 'import_modal_complete'
    ) => {
      const store = useKeimenonStore.getState();
      store.setFilteredNodeIds(null);
      void store.loadGraphData();
      emitImportGraphRefresh({ jobId, reason });
    },
    []
  );

  const clearCoreProcessReimportGate = useCallback(async () => {
    try {
      const status = await getCoreProcessReimportStatus();
      if (!status.requiresReimport) {
        return;
      }

      await completeCoreProcessReimport();
      window.dispatchEvent(new CustomEvent('core-process-reimport-complete'));
      console.log('[ChatImportModal] Core process reimport marked complete');
    } catch (error) {
      console.warn('[ChatImportModal] Failed to clear core process reimport gate:', error);
    }
  }, []);

  const refreshFeatureManifest = useCallback(async () => {
    try {
      const featureManifest = await getMyFeatures();
      const runtimeEnabled = Boolean(featureManifest.features.agent_runtime);
      setAgentRuntimeEnabled(runtimeEnabled);

      // Enforce manual bootstrap when runtime entitlement is absent.
      if (!runtimeEnabled) {
        setConfig((previous) =>
          previous.agent.bootstrap === 'manual'
            ? previous
            : {
                ...previous,
                agent: {
                  ...previous.agent,
                  bootstrap: 'manual',
                },
              }
        );
      }

      return featureManifest;
    } catch (error) {
      console.warn('[ChatImportModal] Failed to fetch feature manifest:', error);
      setAgentRuntimeEnabled(false);
      return null;
    }
  }, []);

  const loadImportPresets = useCallback(
    async (preferredPresetId?: string) => {
      setPresetsLoading(true);
      setPresetError(null);

      try {
        const response = await listImportPresets();
        const presets = response.presets || [];
        setImportPresets(presets);

        const currentSelection =
          preferredPresetId && presets.some((preset) => preset.id === preferredPresetId)
            ? preferredPresetId
            : selectedPresetId && presets.some((preset) => preset.id === selectedPresetId)
              ? selectedPresetId
              : presets[0]?.id || '';

        setSelectedPresetId(currentSelection);
        const selectedPreset = presets.find((preset) => preset.id === currentSelection);
        setPresetName(selectedPreset?.name || '');
      } catch (error) {
        console.error('[ChatImportModal] Failed to load import presets:', error);
        setPresetError(error instanceof Error ? error.message : 'Failed to load presets');
      } finally {
        setPresetsLoading(false);
      }
    },
    [selectedPresetId]
  );

  useEffect(() => {
    if (stage !== 'config') {
      return;
    }
    void loadImportPresets();
    void refreshFeatureManifest();
  }, [stage, loadImportPresets, refreshFeatureManifest]);

  const applySelectedPreset = useCallback(() => {
    if (!selectedPresetId) {
      return;
    }

    const preset = importPresets.find((candidate) => candidate.id === selectedPresetId);
    if (!preset) {
      setPresetError('Selected preset no longer exists.');
      return;
    }

    const presetConfig: ChatImportConfig =
      !agentRuntimeEnabled && preset.config.agent.bootstrap === 'auto'
        ? {
            ...preset.config,
            agent: { ...preset.config.agent, bootstrap: 'manual' as const },
          }
        : preset.config;

    setConfig(presetConfig);
    setPresetName(preset.name);
    setPresetError(null);
  }, [agentRuntimeEnabled, importPresets, selectedPresetId]);

  const handleCreatePreset = useCallback(async () => {
    const trimmedName = presetName.trim();
    if (!trimmedName) {
      setPresetError('Preset name is required.');
      return;
    }

    setPresetBusy(true);
    setPresetError(null);

    try {
      const response = await createImportPreset({
        name: trimmedName,
        config,
      });
      await loadImportPresets(response.preset.id);
    } catch (error) {
      console.error('[ChatImportModal] Failed to create preset:', error);
      setPresetError(error instanceof Error ? error.message : 'Failed to create preset');
    } finally {
      setPresetBusy(false);
    }
  }, [config, loadImportPresets, presetName]);

  const handleUpdatePreset = useCallback(async () => {
    if (!selectedPresetId) {
      setPresetError('Select a preset to update.');
      return;
    }

    const trimmedName = presetName.trim();
    if (!trimmedName) {
      setPresetError('Preset name is required.');
      return;
    }

    setPresetBusy(true);
    setPresetError(null);

    try {
      await updateImportPreset(selectedPresetId, {
        name: trimmedName,
        config,
      });
      await loadImportPresets(selectedPresetId);
    } catch (error) {
      console.error('[ChatImportModal] Failed to update preset:', error);
      setPresetError(error instanceof Error ? error.message : 'Failed to update preset');
    } finally {
      setPresetBusy(false);
    }
  }, [config, loadImportPresets, presetName, selectedPresetId]);

  const handleDeletePreset = useCallback(async () => {
    if (!selectedPresetId) {
      setPresetError('Select a preset to delete.');
      return;
    }

    const preset = importPresets.find((candidate) => candidate.id === selectedPresetId);
    if (!preset) {
      setPresetError('Selected preset no longer exists.');
      return;
    }

    const shouldDelete = window.confirm(`Delete preset "${preset.name}"?`);
    if (!shouldDelete) {
      return;
    }

    setPresetBusy(true);
    setPresetError(null);

    try {
      await deleteImportPreset(selectedPresetId);
      await loadImportPresets();
    } catch (error) {
      console.error('[ChatImportModal] Failed to delete preset:', error);
      setPresetError(error instanceof Error ? error.message : 'Failed to delete preset');
    } finally {
      setPresetBusy(false);
    }
  }, [importPresets, loadImportPresets, selectedPresetId]);

  // Subscribe to job updates via SSE
  const { jobs, connected } = useJobStream();
  const activeJobUpdate = currentJobId ? jobs.get(currentJobId) : undefined;
  const runtimeProcessingStats = activeJobUpdate?.stats
    ? {
        conversationsProcessed: activeJobUpdate.stats.conversationsProcessed ?? 0,
        messagesProcessed: activeJobUpdate.stats.messagesProcessed ?? 0,
        nodesCreated: activeJobUpdate.stats.nodesCreated ?? 0,
        edgesCreated: activeJobUpdate.stats.edgesCreated ?? 0,
        sourcesCreated: activeJobUpdate.stats.sourcesCreated ?? 0,
      }
    : null;

  // Listen for job updates and update progress
  useEffect(() => {
    if (!currentJobId) return;

    const jobUpdate = jobs.get(currentJobId);
    if (!jobUpdate) return;

    console.log('[ChatImportModal] Job update received:', jobUpdate);

    const derivedProgress = deriveImportProgress({
      backendStatus: jobUpdate.status,
      jobType: jobUpdate.type,
      progress: { message: jobUpdate.progress.message, stage: jobUpdate.progress.stage },
    });

    const stage = mapImportStatusToUploadStage(derivedProgress.status);
    const message = jobUpdate.progress.message || '';

    setProgress((previousProgress) => ({
      stage,
      percent: normalizeImportProgressPercent({
        backendStatus: jobUpdate.status,
        status: derivedProgress.status,
        rawPercent: jobUpdate.progress.percent,
        previousPercent: previousProgress.percent,
        stage: jobUpdate.progress.stage,
        metadata: jobUpdate.progress.metadata,
      }),
      message,
    }));

    // Handle completion
    if (jobUpdate.status === 'succeeded') {
      if (postImportResolvedJobId === currentJobId) {
        return;
      }
      setPostImportResolvedJobId(currentJobId);
      setIsImporting(false);
      console.log('[ChatImportModal] Import job completed successfully');

      const resolvedJobId = currentJobId;
      triggerGraphRefresh(resolvedJobId, 'import_modal_complete');
      void (async () => {
        try {
          const reviewStatus = await getDuplicateReviewStatus(resolvedJobId);
          const shouldReview = reviewStatus.status.review_required;

          if (shouldReview) {
            const reviewGroups = await getDuplicateReviewGroups(resolvedJobId);
            if (reviewGroups.total_candidates > 0) {
              setDuplicateGroups(reviewGroups.groups);
              setProgress({
                stage: 'ready',
                percent: 100,
                message: `${reviewStatus.status.pending_candidates} duplicate candidates require review`,
              });
              setStage('review');
              return;
            }
          }
        } catch (reviewError) {
          console.warn('[ChatImportModal] Failed to load duplicate review status:', reviewError);
        }

        setStage('complete');
        void clearCoreProcessReimportGate();
      })();

      // Log completion event
      logJobEvent(`Import completed successfully`, 'import.jobCompleted', {
        jobId: currentJobId,
        progress: jobUpdate.progress.percent,
      });
    } else if (jobUpdate.status === 'failed') {
      setIsImporting(false);
      const failureCode = jobUpdate.error?.code || 'FAILED';
      const failureStage = jobUpdate.progress?.stage
        ? String(jobUpdate.progress.stage)
        : 'UNKNOWN_STAGE';
      const failurePercent =
        typeof jobUpdate.progress?.percent === 'number' ? jobUpdate.progress.percent : 0;
      const failureMessage =
        jobUpdate.error?.message || jobUpdate.progress.message || 'Import failed.';
      setProgress({
        stage: 'error',
        percent: Math.max(0, failurePercent),
        message: `${failureCode} at ${failureStage} (${failurePercent}%): ${failureMessage}`,
      });

      // Error is already captured by error handler, but log the failure
      logJobEvent(`Import job failed`, 'import.jobFailed', {
        jobId: currentJobId,
        message: failureMessage,
        code: failureCode,
        stage: failureStage,
        percent: failurePercent,
      });
    }
  }, [currentJobId, jobs, clearCoreProcessReimportGate, postImportResolvedJobId]);

  useEffect(() => {
    if (multiFileImports.length === 0) {
      return;
    }

    setMultiFileImports((previous) =>
      previous.map((entry) => {
        if (!entry.jobId) {
          return entry;
        }

        const jobUpdate = jobs.get(entry.jobId);
        if (!jobUpdate) {
          return entry;
        }

        const derivedProgress = deriveImportProgress({
          backendStatus: jobUpdate.status,
          jobType: jobUpdate.type,
          progress: { message: jobUpdate.progress.message, stage: jobUpdate.progress.stage },
        });

        const isError = jobUpdate.status === 'failed' || derivedProgress.status === 'error';
        const isDone = jobUpdate.status === 'succeeded' || derivedProgress.status === 'done';

        return {
          ...entry,
          status: isError ? 'error' : isDone ? 'done' : 'running',
          progress: normalizeImportProgressPercent({
            backendStatus: jobUpdate.status,
            status: derivedProgress.status,
            rawPercent: jobUpdate.progress.percent,
            previousPercent: entry.progress,
            stage: jobUpdate.progress.stage,
            metadata: jobUpdate.progress.metadata,
          }),
          message: jobUpdate.progress.message || entry.message,
          error: isError
            ? jobUpdate.error?.message || jobUpdate.progress.message || entry.error
            : undefined,
        };
      })
    );
  }, [jobs, multiFileImports.length]);

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
      let detectedPlatform: PlatformDetection | null = null;
      if (filesToProcess.length > 0) {
        const detection = await detectPlatform(filesToProcess[0]);
        detectedPlatform = {
          platform: detection.platform as any,
          conversationCount: 0, // Will be updated after analysis
          messageCount: 0,
          confidence: detection.confidence,
        };
        setPlatformDetection(detectedPlatform);
      }

      // Stage 3: Analyzing
      setProgress({ stage: 'analyzing', percent: 60, message: 'Analyzing content...' });

      // Analyze files to get statistics
      const analysisData = await analyzeFiles(filesToProcess);

      // Update platform detection with counts from analysis
      // Note: Use local variable to avoid stale closure issue with state
      if (detectedPlatform) {
        const updatedDetection: PlatformDetection = {
          ...detectedPlatform,
          conversationCount: analysisData.total_conversations,
          messageCount: analysisData.total_messages,
        };
        setPlatformDetection(updatedDetection);
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
      setMultiFileImports([]);
      setStage('processing');
      await processFiles(selectedFiles);
    },
    [processFiles]
  );

  const submitMultiFileImports = useCallback(
    async (
      filesToImport: File[],
      importConfig: ChatImportConfig,
      detectedPlatform?: 'chatgpt' | 'claude' | 'gemini' | 'generic'
    ): Promise<string[]> => {
      const submittedJobIds: string[] = [];
      const uploadConfig = {
        platform: detectedPlatform || 'generic',
        ...importConfig,
      };

      setMultiFileImports(
        filesToImport.map((file) => ({
          fileName: file.name,
          status: 'queued',
          progress: 0,
          message: 'Queued',
        }))
      );

      for (const [currentIndex, file] of filesToImport.entries()) {
        setMultiFileImports((previous) =>
          previous.map((entry, index) =>
            index === currentIndex
              ? { ...entry, status: 'submitting', message: 'Uploading via chunked rail...' }
              : entry
          )
        );

        const result = await chunkedUpload.upload(file, uploadConfig);
        if (result.success && result.jobId) {
          submittedJobIds.push(result.jobId);
          setMultiFileImports((previous) =>
            previous.map((entry, index) =>
              index === currentIndex
                ? {
                    ...entry,
                    jobId: result.jobId,
                    status: 'submitted',
                    progress: 0,
                    message: 'Job created',
                  }
                : entry
            )
          );
          continue;
        }

        const message = result.error || 'Failed to submit import';
        setMultiFileImports((previous) =>
          previous.map((entry, index) =>
            index === currentIndex
              ? {
                  ...entry,
                  status: 'error',
                  message,
                  error: message,
                }
              : entry
          )
        );
      }

      return submittedJobIds;
    },
    [chunkedUpload]
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

      let runtimeEnabled = agentRuntimeEnabled;
      const featureManifest = await refreshFeatureManifest();
      if (featureManifest && !featureManifest.features.auto_graph) {
        alert('Your current account tier does not allow automatic graph import.');
        return;
      }
      if (featureManifest) {
        runtimeEnabled = Boolean(featureManifest.features.agent_runtime);
      }

      const effectiveImportConfig: ChatImportConfig = {
        ...config,
        agent: {
          ...config.agent,
          bootstrap: runtimeEnabled ? config.agent.bootstrap : 'manual',
        },
      };

      if (!runtimeEnabled && config.agent.bootstrap === 'auto') {
        setConfig(effectiveImportConfig);
        alert(
          'Agent bootstrap was set to manual because this account does not have agent runtime entitlement.'
        );
      }

      // Set importing state and show loading
      setIsImporting(true);
      setStage('processing');
      setProgress({
        stage: 'uploading',
        percent: 0,
        message:
          files.length > 1
            ? `Submitting ${files.length} files through the chunked upload rail...`
            : 'Initiating chunked upload...',
      });

      console.log('[ChatImportModal] Using chunked upload for large file support');
      console.log('[ChatImportModal] Detected platform:', platformDetection?.platform);

      // Prepare import config to be stored with upload session
      const chunkedImportConfig = {
        platform: platformDetection?.platform || 'generic',
        ...effectiveImportConfig,
      };

      if (files.length > 1) {
        const submittedJobIds = await submitMultiFileImports(
          files,
          effectiveImportConfig,
          platformDetection?.platform as 'chatgpt' | 'claude' | 'gemini' | 'generic' | undefined
        );

        const successCount = submittedJobIds.length;
        const failCount = files.length - successCount;
        setIsImporting(false);

        if (successCount === 0) {
          setProgress({
            stage: 'error',
            percent: 0,
            message: 'Failed to submit imports for all selected files.',
          });
          return;
        }

        setCurrentJobId(submittedJobIds[0]);
        setPostImportResolvedJobId(null);
        setProgress({
          stage: 'ready',
          percent: 100,
          message:
            failCount > 0
              ? `${successCount} job(s) created, ${failCount} failed to submit`
              : `${successCount} import job(s) created successfully`,
        });
        setStage('complete');
        return;
      }

      const file = files[0];
      console.log(
        `[ChatImportModal] Uploading file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
      );

      // Upload with chunked upload hook
      const uploadResult = await chunkedUpload.upload(file, chunkedImportConfig);

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
      setPostImportResolvedJobId(null);

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
        primaryNodeId: decision.primaryNodeId,
        duplicateNodeId: decision.duplicateNodeId,
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

      if (!currentJobId) {
        throw new Error('Cannot apply duplicate decisions without an active import job ID');
      }

      // Apply decisions to backend
      const result = await applyDuplicateDecisions(decisionsArray, currentJobId);

      console.log('[ChatImportModal] Decisions applied:', result);

      // Log success event
      logApiEvent(`Applied ${result.result.applied_decisions} duplicate decisions`, {
        domain: 'import',
        operation: 'duplicateDecisionsApplied',
        metadata: {
          applied: result.result.applied_decisions,
          sequestered: result.result.nodes_sequestered,
          merged: result.result.nodes_merged,
          actionCounts: result.result.action_counts,
        },
      });

      if (result.result.pending_candidates > 0 && currentJobId) {
        const reviewGroups = await getDuplicateReviewGroups(currentJobId);
        setDuplicateGroups(reviewGroups.groups);
        setProgress({
          stage: 'ready',
          percent: 100,
          message: `${result.result.pending_candidates} duplicate candidates still pending`,
        });
        setStage('review');
        return;
      }

      await clearCoreProcessReimportGate();
      triggerGraphRefresh(currentJobId, 'duplicate_review_applied');
      setProgress({
        stage: 'ready',
        percent: 100,
        message: result.result.message,
      });
      setStage('complete');

      setTimeout(() => {
        onDismiss();
      }, 1000);
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
              <div className="space-y-4">
                <ImportStageProcessing
                  platformDetection={platformDetection}
                  progress={progress}
                  runtimeStats={runtimeProcessingStats}
                  onPause={chunkedUpload.pause}
                  onResume={chunkedUpload.resume}
                  isPaused={chunkedUpload.isPaused}
                />
                {multiFileImports.length > 0 && (
                  <div className="border border-slate-700 rounded-xl p-4 bg-slate-950/40">
                    <h4 className="text-sm font-semibold text-slate-300 mb-3">
                      Multi-file Uploads ({multiFileImports.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {multiFileImports.map((entry) => (
                        <div
                          key={entry.fileName}
                          className="text-xs border border-slate-800 rounded-lg p-2 bg-slate-900/60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-200 truncate">{entry.fileName}</span>
                            <span
                              className={
                                entry.status === 'error'
                                  ? 'text-red-400'
                                  : entry.status === 'done'
                                    ? 'text-green-400'
                                    : 'text-slate-400'
                              }
                            >
                              {entry.status}
                            </span>
                          </div>
                          <div className="mt-1 text-slate-400">{entry.message}</div>
                          {(entry.status === 'running' || entry.status === 'done') && (
                            <div className="mt-2 h-1.5 bg-slate-800 rounded">
                              <div
                                className="h-full bg-purple-500 rounded transition-all duration-300"
                                style={{ width: `${entry.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {stage === 'config' && (
              <div className="space-y-4">
                <div className="border border-slate-700 rounded-xl p-4 bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-300">Import Presets</h4>
                    {presetsLoading && <span className="text-xs text-slate-500">Loading...</span>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Saved presets</label>
                      <select
                        value={selectedPresetId}
                        onChange={(event) => {
                          const presetId = event.target.value;
                          setSelectedPresetId(presetId);
                          const preset = importPresets.find(
                            (candidate) => candidate.id === presetId
                          );
                          setPresetName(preset?.name || '');
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200"
                      >
                        <option value="">Select a preset</option>
                        {importPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">Preset name</label>
                      <input
                        type="text"
                        value={presetName}
                        onChange={(event) => setPresetName(event.target.value)}
                        placeholder="My default import"
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder-slate-500"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applySelectedPreset}
                      disabled={!selectedPresetId || presetBusy}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-sm text-slate-200 transition-colors"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={handleCreatePreset}
                      disabled={presetBusy}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-sm text-slate-200 transition-colors"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdatePreset}
                      disabled={!selectedPresetId || presetBusy}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 text-sm text-slate-200 transition-colors"
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      onClick={handleDeletePreset}
                      disabled={!selectedPresetId || presetBusy}
                      className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 disabled:bg-slate-900 disabled:text-slate-600 text-sm text-red-300 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                  {presetError && <p className="text-xs text-red-400">{presetError}</p>}
                </div>

                <ImportStageConfig
                  config={config}
                  onConfigChange={setConfig}
                  platformDetection={platformDetection}
                  analysis={analysis}
                  agentRuntimeEnabled={agentRuntimeEnabled}
                />
              </div>
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
                <span className="text-green-400">chunked uploads</span>
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
                      if (selectedPresetId) {
                        void handleUpdatePreset();
                      } else {
                        void handleCreatePreset();
                      }
                    }}
                    disabled={presetBusy || presetName.trim().length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-600 rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {selectedPresetId ? 'Update Preset' : 'Save Preset'}
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
