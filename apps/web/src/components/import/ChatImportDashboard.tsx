'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  Save,
  CheckCircle2,
  ChevronRight,
  Settings,
  Database,
  RefreshCw,
  AlertCircle,
  Play,
  Pause,
  Trash2,
  Cpu,
} from 'lucide-react';
import {
  ChatImportConfig,
  DEFAULT_IMPORT_CONFIG,
  PlatformDetection,
  UploadProgress,
  DuplicateGroup,
  ReviewDecision,
  AnalysisResult,
} from '@/types/chat-import';
import { ImportStageSelect } from './ImportStageSelect';
import { ImportStageConfig } from './ImportStageConfig';
import { DuplicateReviewPanel } from './DuplicateReviewPanel';
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
  cancelJob,
  pauseJob,
  resumeJob,
} from '@/lib/api-client';
import { useJobStream } from '@/hooks/useJobStream';
import { useChunkedUpload } from '@/hooks/useChunkedUpload';
import { logApiEvent, logJobEvent } from '@/lib/error-handler';
import { useAuth } from '@/contexts/AuthContext';
import { useOperating } from '@/contexts/OperatingContext';
import { useKeimenonStore } from '@/store/keimenonStore';
import { useShell } from '@/contexts/ShellContext';
import { emitImportGraphRefresh } from '@/lib/import-refresh-events';
import {
  deriveImportProgress,
  mapImportStatusToUploadStage,
  normalizeImportProgressPercent,
  type ImportUiStatus,
} from '@/lib/import-job-progress';
import { ImportPipelineProgress } from './ImportPipelineProgress';
import { ImportMiniGraph } from './ImportMiniGraph';

type Stage = 'select' | 'processing' | 'config' | 'review' | 'duplicate' | 'complete';

interface MultiFileImportProgress {
  fileName: string;
  jobId?: string;
  status: 'queued' | 'submitting' | 'submitted' | 'running' | 'done' | 'error';
  progress: number;
  message: string;
  error?: string;
}

export function ChatImportDashboard() {
  const { user } = useAuth();
  const { operating } = useOperating();
  const { setKeimenonMode } = useShell();
  const chunkedUpload = useChunkedUpload();

  // Component stages and selections
  const [stage, setStage] = useState<Stage>('select');
  const [config, setConfig] = useState<ChatImportConfig>(DEFAULT_IMPORT_CONFIG);
  const [files, setFiles] = useState<File[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [platformDetection, setPlatformDetection] = useState<PlatformDetection | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Duplicate / stats upgrades
  const [duplicateJobInfo, setDuplicateJobInfo] = useState<{
    activeJobId: string;
    activeJobStatus: string;
  } | null>(null);
  const [completedJobStats, setCompletedJobStats] = useState<any | null>(null);

  // Real-time progress and tracking
  const [progress, setProgress] = useState<UploadProgress>({
    stage: 'uploading',
    percent: 0,
    message: '',
  });
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [postImportResolvedJobId, setPostImportResolvedJobId] = useState<string | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [multiFileImports, setMultiFileImports] = useState<MultiFileImportProgress[]>([]);

  // Presets and Entitlements
  const [importPresets, setImportPresets] = useState<ImportPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [agentRuntimeEnabled, setAgentRuntimeEnabled] = useState(false);

  // Store & Emitter actions
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
      if (!status.requiresReimport) return;
      await completeCoreProcessReimport();
      window.dispatchEvent(new CustomEvent('core-process-reimport-complete'));
    } catch (error) {
      console.warn('[ChatImportDashboard] Failed to clear core process reimport gate:', error);
    }
  }, []);

  const refreshFeatureManifest = useCallback(async () => {
    try {
      const featureManifest = await getMyFeatures();
      const runtimeEnabled = Boolean(featureManifest.features.agent_runtime);
      setAgentRuntimeEnabled(runtimeEnabled);

      if (!runtimeEnabled) {
        setConfig((prev) =>
          prev.agent.bootstrap === 'manual'
            ? prev
            : {
                ...prev,
                agent: { ...prev.agent, bootstrap: 'manual' },
              }
        );
      }
      return featureManifest;
    } catch (error) {
      console.warn('[ChatImportDashboard] Failed to fetch feature manifest:', error);
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
          preferredPresetId && presets.some((p) => p.id === preferredPresetId)
            ? preferredPresetId
            : selectedPresetId && presets.some((p) => p.id === selectedPresetId)
              ? selectedPresetId
              : presets[0]?.id || '';

        setSelectedPresetId(currentSelection);
        const selectedPreset = presets.find((p) => p.id === currentSelection);
        setPresetName(selectedPreset?.name || '');
      } catch (error) {
        console.error('[ChatImportDashboard] Failed to load import presets:', error);
        setPresetError(error instanceof Error ? error.message : 'Failed to load presets');
      } finally {
        setPresetsLoading(false);
      }
    },
    [selectedPresetId]
  );

  useEffect(() => {
    if (stage !== 'config') return;
    void loadImportPresets();
    void refreshFeatureManifest();
  }, [stage, loadImportPresets, refreshFeatureManifest]);

  const applySelectedPreset = useCallback(() => {
    if (!selectedPresetId) return;
    const preset = importPresets.find((p) => p.id === selectedPresetId);
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
      console.error('[ChatImportDashboard] Failed to create preset:', error);
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
      console.error('[ChatImportDashboard] Failed to update preset:', error);
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
    const preset = importPresets.find((p) => p.id === selectedPresetId);
    if (!preset) {
      setPresetError('Selected preset no longer exists.');
      return;
    }
    const shouldDelete = window.confirm(`Delete preset "${preset.name}"?`);
    if (!shouldDelete) return;

    setPresetBusy(true);
    setPresetError(null);
    try {
      await deleteImportPreset(selectedPresetId);
      await loadImportPresets();
    } catch (error) {
      console.error('[ChatImportDashboard] Failed to delete preset:', error);
      setPresetError(error instanceof Error ? error.message : 'Failed to delete preset');
    } finally {
      setPresetBusy(false);
    }
  }, [importPresets, loadImportPresets, selectedPresetId]);

  // Subscribe to job updates via SSE
  const { jobs, graphUpdates, connected } = useJobStream();
  const activeJobUpdate = currentJobId ? jobs.get(currentJobId) : undefined;
  const recentNodes =
    graphUpdates.length > 0 ? (graphUpdates[graphUpdates.length - 1]?.recentNodes ?? []) : [];

  // Listen for job updates and update progress
  useEffect(() => {
    if (!currentJobId) return;

    const jobUpdate = jobs.get(currentJobId);
    if (!jobUpdate) return;

    console.log('[ChatImportDashboard] Job update received:', jobUpdate);

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
      if (postImportResolvedJobId === currentJobId) return;
      setPostImportResolvedJobId(currentJobId);
      setIsImporting(false);
      console.log('[ChatImportDashboard] Import job completed successfully');

      if (jobUpdate.stats) {
        setCompletedJobStats(jobUpdate.stats);
      }

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
          console.warn(
            '[ChatImportDashboard] Failed to load duplicate review status:',
            reviewError
          );
        }

        setStage('complete');
        void clearCoreProcessReimportGate();
      })();

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

      logJobEvent(`Import job failed`, 'import.jobFailed', {
        jobId: currentJobId,
        message: failureMessage,
        code: failureCode,
        stage: failureStage,
        percent: failurePercent,
      });
    }
  }, [
    currentJobId,
    jobs,
    clearCoreProcessReimportGate,
    postImportResolvedJobId,
    triggerGraphRefresh,
  ]);

  // Track chunked upload progress
  useEffect(() => {
    const uploadProgress = chunkedUpload.progress;

    if (uploadProgress.status === 'hashing') {
      setProgress({
        stage: 'hashing',
        percent: uploadProgress.percentage,
        message: 'Calculating file signature (SHA-256) for duplicate checking...',
      });
    } else if (uploadProgress.status === 'initiating') {
      setProgress({
        stage: 'initiating',
        percent: uploadProgress.percentage,
        message: 'Initiating upload session and checking for duplicate jobs...',
      });
    } else if (uploadProgress.status === 'uploading') {
      setProgress({
        stage: 'uploading',
        percent: uploadProgress.percentage,
        message: `Uploading chunks: ${uploadProgress.chunksUploaded}/${uploadProgress.totalChunks} (${uploadProgress.percentage}%)`,
      });
    } else if (uploadProgress.status === 'completed') {
      console.log('[ChatImportDashboard] Chunked upload completed, import job created');
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
      setProgress({ stage: 'uploading', percent: 10, message: 'Uploading files...' });
      await new Promise((resolve) => setTimeout(resolve, 300));

      setProgress({ stage: 'detecting', percent: 30, message: 'Detecting platform...' });
      let detectedPlatform: PlatformDetection | null = null;
      if (filesToProcess.length > 0) {
        const detection = await detectPlatform(filesToProcess[0]);
        detectedPlatform = {
          platform: detection.platform as any,
          conversationCount: 0,
          messageCount: 0,
          confidence: detection.confidence,
        };
        setPlatformDetection(detectedPlatform);
      }

      setProgress({ stage: 'analyzing', percent: 60, message: 'Analyzing content...' });
      const analysisData = await analyzeFiles(filesToProcess);

      if (detectedPlatform) {
        const updatedDetection: PlatformDetection = {
          ...detectedPlatform,
          conversationCount: analysisData.total_conversations,
          messageCount: analysisData.total_messages,
        };
        setPlatformDetection(updatedDetection);
      }

      setAnalysis({
        totalMessages: analysisData.total_messages,
        userMessages: Math.floor(analysisData.total_messages * 0.5),
        assistantMessages: Math.floor(analysisData.total_messages * 0.5),
        codeBlocks: 0,
        averageMessageLength: 500,
        filteredMessageCount: Math.floor(analysisData.total_messages * 0.6),
      });

      setProgress({ stage: 'ready', percent: 100, message: 'Ready for configuration' });
      await new Promise((resolve) => setTimeout(resolve, 300));
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

  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setMultiFileImports([]);
    setStage('processing');
    await processFiles(selectedFiles);
  }, []);

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
        setMultiFileImports((prev) =>
          prev.map((entry, index) =>
            index === currentIndex
              ? { ...entry, status: 'submitting', message: 'Uploading via chunked rail...' }
              : entry
          )
        );

        const result = await chunkedUpload.upload(file, uploadConfig);
        if (result.success && result.jobId) {
          submittedJobIds.push(result.jobId);
          setMultiFileImports((prev) =>
            prev.map((entry, index) =>
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
        setMultiFileImports((prev) =>
          prev.map((entry, index) =>
            index === currentIndex ? { ...entry, status: 'error', message, error: message } : entry
          )
        );
      }

      return submittedJobIds;
    },
    [chunkedUpload]
  );

  const handleImport = async () => {
    try {
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
      const chunkedImportConfig = {
        platform: platformDetection?.platform || 'generic',
        ...effectiveImportConfig,
      };

      const uploadResult = await chunkedUpload.upload(file, chunkedImportConfig);
      if (!uploadResult.success) {
        setIsImporting(false);
        if (uploadResult.code === 'DUPLICATE_IMPORT') {
          setDuplicateJobInfo({
            activeJobId: uploadResult.details?.activeJobId || '',
            activeJobStatus: uploadResult.details?.activeJobStatus || 'unknown',
          });
          setStage('duplicate');
          return;
        }
        alert(`Failed to upload file: ${uploadResult.error || 'Unknown error'}`);
        return;
      }

      const jobId = uploadResult.jobId;
      if (!jobId) {
        throw new Error(
          'Upload completed successfully but no Job ID was returned from the server.'
        );
      }

      setCurrentJobId(jobId);
      setPostImportResolvedJobId(null);

      logJobEvent(`Import job created via chunked upload: ${file.name}`, 'import.jobCreated', {
        jobId,
        fileName: file.name,
        fileSize: file.size,
        uploadMethod: 'chunked',
      });

      setProgress({
        stage: 'analyzing',
        percent: 10,
        message: `Chunked upload complete. Import processing started... (Job ID: ${jobId.substring(0, 8)}...)`,
      });
    } catch (error) {
      console.error('[ChatImportDashboard] Import error:', error);
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
      const decisionsArray = Array.from(decisions.entries()).map(([duplicateId, decision]) => ({
        duplicateId,
        action: decision.action,
        timestamp: Date.now(),
        primaryNodeId: decision.primaryNodeId,
        duplicateNodeId: decision.duplicateNodeId,
      }));

      if (decisionsArray.length === 0) {
        setStage('complete');
        return;
      }

      setProgress({
        stage: 'uploading',
        percent: 90,
        message: `Applying ${decisionsArray.length} duplicate decisions...`,
      });

      if (!currentJobId) throw new Error('No active job ID');
      await applyDuplicateDecisions(decisionsArray, currentJobId);

      triggerGraphRefresh(currentJobId, 'duplicate_review_applied');
      setStage('complete');
      void clearCoreProcessReimportGate();
    } catch (error) {
      console.error('[ChatImportDashboard] Failed to apply decisions:', error);
      alert('Failed to apply duplicate review decisions');
    }
  };

  // Job operations controls
  const handleCancelJob = async () => {
    if (!currentJobId) return;
    const confirmed = window.confirm('Cancel this active import job?');
    if (!confirmed) return;
    try {
      await cancelJob(currentJobId);
    } catch (e) {
      console.error('Failed to cancel job:', e);
    }
  };

  const handlePauseJob = async () => {
    if (!currentJobId) return;
    try {
      await pauseJob(currentJobId);
    } catch (e) {
      console.error('Failed to pause job:', e);
    }
  };

  const handleResumeJob = async () => {
    if (!currentJobId) return;
    try {
      await resumeJob(currentJobId);
    } catch (e) {
      console.error('Failed to resume job:', e);
    }
  };

  // Render variables
  const isJobRunning =
    currentJobId && activeJobUpdate && ['queued', 'running'].includes(activeJobUpdate.status);
  const derivedPercent = progress.percent;

  return (
    <div className="import-dashboard-container relative w-full h-full min-h-[500px] overflow-auto flex flex-col p-6 text-slate-100 bg-slate-900/40 rounded-2xl border border-slate-800 backdrop-blur-xl">
      <style jsx global>{`
        .import-dashboard-container {
          background:
            radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.08) 0%, transparent 70%),
            rgba(15, 23, 42, 0.6);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        .glow-accent {
          box-shadow: 0 0 15px rgba(139, 92, 246, 0.2);
          border-color: rgba(139, 92, 246, 0.4);
        }
        .glass-card {
          background: rgba(30, 41, 59, 0.45);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px border rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .glass-card:hover {
          background: rgba(30, 41, 59, 0.55);
          border-color: rgba(139, 92, 246, 0.2);
          box-shadow:
            0 10px 25px -5px rgba(0, 0, 0, 0.1),
            0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }
      `}</style>

      {/* Header Area */}
      <header className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-400" />
            <span>Chat Ingestion & Graph Birth</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Standardized chunked uploads with integrated similarity extraction, local-first safety,
            and zero C++ dependencies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
          />
          <span className="text-xs text-slate-400 font-mono">
            {connected ? 'SSE LINKED' : 'SSE OFFLINE'}
          </span>
        </div>
      </header>

      {/* Viewport Blocking Overlay when job is actively running/processing */}
      {isJobRunning && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md rounded-2xl p-8 transition-all duration-500">
          <div className="max-w-3xl w-full flex flex-col gap-6 p-8 rounded-2xl bg-slate-900/90 border border-slate-800/80 glow-accent shadow-2xl relative overflow-hidden">
            {/* Absolute accent background blur */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 relative z-10">
              <div>
                <p className="text-xs text-purple-400 uppercase tracking-widest font-bold">
                  Import in progress
                </p>
                <h3 className="text-lg font-bold text-white mt-1 truncate max-w-lg">
                  {files[0]?.name || 'Ingesting Chat Export'}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono font-bold text-purple-400">
                  {derivedPercent}%
                </span>
              </div>
            </div>

            {/* Stage Pipeline Ingest Indicator */}
            <div className="relative z-10">
              <ImportPipelineProgress
                currentStage={
                  deriveImportProgress({
                    backendStatus: activeJobUpdate.status,
                    jobType: 'import',
                    progress: {
                      message: activeJobUpdate.progress.message,
                      stage: activeJobUpdate.progress.stage,
                    },
                  }).stage
                }
                progress={derivedPercent}
              />
            </div>

            {/* Metrics Panel */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2 relative z-10">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-500 block">Nodes Created</span>
                <span className="text-lg font-bold font-mono text-purple-400 mt-1 block">
                  {activeJobUpdate.stats?.nodesCreated ?? 0}
                </span>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-500 block">Edges Created</span>
                <span className="text-lg font-bold font-mono text-purple-400 mt-1 block">
                  {activeJobUpdate.stats?.edgesCreated ?? 0}
                </span>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-500 block">Sources Created</span>
                <span className="text-lg font-bold font-mono text-purple-400 mt-1 block">
                  {activeJobUpdate.stats?.sourcesCreated ?? 0}
                </span>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-500 block">Conversations</span>
                <span className="text-lg font-bold font-mono text-purple-400 mt-1 block">
                  {activeJobUpdate.stats?.conversationsProcessed ?? 0}
                </span>
              </div>
            </div>

            {/* Interactive Control Panel */}
            <div className="flex items-center justify-between mt-4 border-t border-slate-800/80 pt-4 relative z-10">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 rounded-full border border-slate-700">
                  <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                  <span className="text-xs font-medium text-slate-300 capitalize">
                    {activeJobUpdate.status}
                  </span>
                </div>
                <span className="text-xs text-slate-500 max-w-sm truncate">
                  {activeJobUpdate.progress?.message || 'Processing dataset chunks...'}
                </span>
              </div>
              <div className="flex gap-2">
                {activeJobUpdate.status === 'running' ? (
                  <button
                    onClick={handlePauseJob}
                    className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-600/20 rounded-lg transition-colors text-xs font-semibold"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                ) : activeJobUpdate.status === 'blocked' ? (
                  <button
                    onClick={handleResumeJob}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600/10 text-green-400 border border-green-500/20 hover:bg-green-600/20 rounded-lg transition-colors text-xs font-semibold"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                ) : null}
                <button
                  onClick={handleCancelJob}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600/10 text-red-400 border border-red-500/20 hover:bg-red-600/20 rounded-lg transition-colors text-xs font-semibold"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel Job</span>
                </button>
              </div>
            </div>

            {/* Live Graph Visualizer */}
            {recentNodes.length > 0 && (
              <div className="mt-4 p-4 rounded-xl border border-slate-800 bg-slate-950/50 flex flex-col gap-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-purple-400 animate-spin" /> Live Node
                    Materialization
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">FORCE-DIRECTED LOD</span>
                </div>
                <div className="h-40 rounded-lg bg-slate-950/80 border border-slate-800/80 overflow-hidden">
                  <ImportMiniGraph
                    recentNodes={recentNodes.map((n) => ({
                      ...n,
                      label: n.label || n.kind || 'Node',
                    }))}
                    width={700}
                    height={160}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage Layout Pages */}
      <div className="flex-1 flex flex-col gap-6">
        {stage === 'select' && (
          <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full py-8">
            <div className="glass-card p-8 text-center flex flex-col items-center gap-6">
              <div className="h-16 w-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-inner glow-accent">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Ingest New Conversations</h3>
                <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
                  Drag and drop your raw exports. The platform uses specialized streaming processors
                  to normalize content without intermediate backend writes.
                </p>
              </div>
              <div className="w-full">
                <ImportStageSelect onFilesSelected={handleFilesSelected} files={files} />
              </div>
            </div>
          </div>
        )}

        {stage === 'processing' && (
          <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full py-12">
            <div className="glass-card p-8 text-center flex flex-col items-center gap-6">
              <div className="h-12 w-12 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <div>
                <h3 className="text-md font-semibold text-white">Analyzing & Compiling Corpus</h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {progress.message || 'Extracting parameters...'}
                </p>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {stage === 'config' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
            {/* Presets and Controls Column */}
            <div className="flex flex-col gap-6 lg:col-span-1">
              <div className="glass-card p-6 flex flex-col gap-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Settings className="w-4 h-4 text-purple-400" /> Settings Presets
                </h3>

                {presetsLoading ? (
                  <div className="text-xs text-slate-400">Loading presets...</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <select
                      value={selectedPresetId}
                      onChange={(e) => setSelectedPresetId(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="">-- Choose Preset --</option>
                      {importPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-2">
                      <button
                        onClick={applySelectedPreset}
                        disabled={!selectedPresetId}
                        className="flex-1 bg-purple-600 hover:bg-purple-500 text-slate-900 text-xs font-semibold py-1 px-2 rounded disabled:opacity-50 transition-colors"
                      >
                        Apply
                      </button>
                      <button
                        onClick={handleDeletePreset}
                        disabled={!selectedPresetId || presetBusy}
                        className="p-1 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-red-400 rounded disabled:opacity-50 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-3">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="New preset name..."
                    className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreatePreset}
                      disabled={presetBusy || !presetName.trim()}
                      className="flex-1 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold py-1 px-2 rounded disabled:opacity-50 transition-colors"
                    >
                      Save As New
                    </button>
                    <button
                      onClick={handleUpdatePreset}
                      disabled={presetBusy || !selectedPresetId || !presetName.trim()}
                      className="flex-1 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold py-1 px-2 rounded disabled:opacity-50 transition-colors"
                    >
                      Overwrite Active
                    </button>
                  </div>
                </div>

                {presetError && (
                  <span className="text-[10px] text-red-400 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" /> {presetError}
                  </span>
                )}
              </div>

              {/* Dataset metrics summary */}
              {platformDetection && (
                <div className="glass-card p-6 flex flex-col gap-3 font-mono">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 pb-2">
                    Ingested Package Details
                  </h3>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-slate-400">Platform:</span>
                    <span className="text-purple-400 font-bold uppercase">
                      {platformDetection.platform}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-t border-slate-900">
                    <span className="text-slate-400">Conversations:</span>
                    <span className="text-slate-200 font-semibold">
                      {platformDetection.conversationCount}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-t border-slate-900">
                    <span className="text-slate-400">Total Messages:</span>
                    <span className="text-slate-200 font-semibold">
                      {platformDetection.messageCount}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-t border-slate-900">
                    <span className="text-slate-400">Confidence:</span>
                    <span className="text-green-400 font-semibold">
                      {(platformDetection.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Form configuration column */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="glass-card p-6">
                <ImportStageConfig
                  config={config}
                  onConfigChange={setConfig}
                  platformDetection={platformDetection}
                  analysis={analysis}
                  agentRuntimeEnabled={agentRuntimeEnabled}
                />

                <div className="flex justify-end gap-3 mt-8 border-t border-slate-800 pt-6">
                  <button
                    onClick={() => setStage('select')}
                    className="px-4 py-2 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleImport}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-slate-900 text-xs font-semibold rounded-lg shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition-all glow-accent"
                  >
                    Initiate Graph Birth
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 'review' && (
          <div className="flex-1 flex flex-col gap-4">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-6">
                <AlertCircle className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Duplicate Resolution Queue</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Duplicate identifiers detected in import session. Please select merge/keep
                    behaviors.
                  </p>
                </div>
              </div>
              <DuplicateReviewPanel
                groups={duplicateGroups}
                onReviewComplete={handleReviewComplete}
                onCancel={() => {
                  setStage('config');
                  void clearCoreProcessReimportGate();
                }}
              />
            </div>
          </div>
        )}

        {stage === 'duplicate' && duplicateJobInfo && (
          <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full py-12">
            <div className="glass-card p-8 text-center flex flex-col items-center gap-6 border border-amber-500/30">
              <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                <AlertCircle className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Duplicate Import Job Blocked</h3>
                <p className="text-sm text-slate-400 mt-2">
                  An identical export file has already been uploaded and registered.
                </p>
                <div className="mt-4 p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 text-left w-full max-w-md">
                  <div className="flex justify-between text-xs py-1.5 font-mono">
                    <span className="text-slate-500">Job ID:</span>
                    <span className="text-slate-300 font-semibold">
                      {duplicateJobInfo.activeJobId}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs py-1.5 border-t border-slate-900 font-mono">
                    <span className="text-slate-500">Current Status:</span>
                    <span className="text-amber-400 font-bold uppercase">
                      {duplicateJobInfo.activeJobStatus}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 w-full mt-2 max-w-md">
                {['queued', 'running'].includes(duplicateJobInfo.activeJobStatus) ? (
                  <button
                    onClick={() => {
                      setCurrentJobId(duplicateJobInfo.activeJobId);
                      setIsImporting(true);
                      setStage('processing');
                    }}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-slate-900 text-xs font-semibold rounded-lg shadow-lg hover:shadow-purple-500/30 transition-all uppercase tracking-wider"
                  >
                    Monitor In-Progress Job
                  </button>
                ) : duplicateJobInfo.activeJobStatus === 'succeeded' ? (
                  <button
                    onClick={() => {
                      triggerGraphRefresh(duplicateJobInfo.activeJobId);
                      setStage('complete');
                    }}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg shadow-lg hover:shadow-green-500/30 transition-all uppercase tracking-wider"
                  >
                    View Ingested Graph
                  </button>
                ) : null}
                <button
                  onClick={() => {
                    setStage('select');
                    setFiles([]);
                    setDuplicateJobInfo(null);
                  }}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-all"
                >
                  Cancel and Go Back
                </button>
              </div>
            </div>
          </div>
        )}

        {stage === 'complete' && (
          <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto py-8 text-center gap-6">
            <div
              className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 glow-accent animate-bounce"
              style={{ borderColor: 'rgba(34, 197, 94, 0.4)' }}
            >
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Graph Birth Complete</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
                Your conversations have been fully transformed and materialized into the
                similarity-weighted knowledge graph.
              </p>
            </div>

            {/* Premium success metrics grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl mt-4">
              <div className="glass-card p-4 bg-slate-900 border border-slate-800 rounded-xl text-center hover:scale-[1.02] transition-transform duration-300">
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold">
                  Nodes Created
                </span>
                <span className="text-2xl font-bold font-mono text-purple-400 mt-2 block">
                  {completedJobStats?.nodesCreated ?? 0}
                </span>
              </div>
              <div className="glass-card p-4 bg-slate-900 border border-slate-800 rounded-xl text-center hover:scale-[1.02] transition-transform duration-300">
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold">
                  Edges Created
                </span>
                <span className="text-2xl font-bold font-mono text-purple-400 mt-2 block">
                  {completedJobStats?.edgesCreated ?? 0}
                </span>
              </div>
              <div className="glass-card p-4 bg-slate-900 border border-slate-800 rounded-xl text-center hover:scale-[1.02] transition-transform duration-300">
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold">
                  Sources Created
                </span>
                <span className="text-2xl font-bold font-mono text-purple-400 mt-2 block">
                  {completedJobStats?.sourcesCreated ?? 0}
                </span>
              </div>
              <div className="glass-card p-4 bg-slate-900 border border-slate-800 rounded-xl text-center hover:scale-[1.02] transition-transform duration-300">
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold">
                  Spans Created
                </span>
                <span className="text-2xl font-bold font-mono text-purple-400 mt-2 block">
                  {completedJobStats?.spansCreated ?? 0}
                </span>
              </div>
              <div className="glass-card p-4 bg-slate-900 border border-slate-800 rounded-xl text-center hover:scale-[1.02] transition-transform duration-300">
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold">
                  Packets Created
                </span>
                <span className="text-2xl font-bold font-mono text-purple-400 mt-2 block">
                  {completedJobStats?.packetsCreated ?? 0}
                </span>
              </div>
              <div className="glass-card p-4 bg-slate-900 border border-slate-800 rounded-xl text-center hover:scale-[1.02] transition-transform duration-300">
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold">
                  Atomic Units
                </span>
                <span className="text-2xl font-bold font-mono text-purple-400 mt-2 block">
                  {completedJobStats?.atomicUnitsCreated ?? 0}
                </span>
              </div>
            </div>

            {/* Post-Ingestion Quick Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full max-w-xl">
              <button
                onClick={() => setKeimenonMode('keimenon')}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-slate-900 text-xs font-bold rounded-lg shadow-lg hover:shadow-purple-500/30 transition-all uppercase tracking-wider"
              >
                Open Canvas
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('navigate-to-dashboard-view', {
                      detail: { view: 'workspaces' },
                    })
                  );
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all uppercase tracking-wider"
              >
                View Ingested Groups
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('navigate-to-dashboard-view', {
                      detail: { view: 'conversations' },
                    })
                  );
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-all uppercase tracking-wider"
              >
                Start Conversation
              </button>
            </div>

            <button
              onClick={() => {
                setStage('select');
                setFiles([]);
                setPlatformDetection(null);
                setAnalysis(null);
                setCurrentJobId(null);
                setCompletedJobStats(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-300 mt-4 transition-colors font-medium"
            >
              Start Another Import
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
