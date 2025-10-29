/**
 * Imports Table Card
 *
 * Displays a table of active/recent import jobs in the Manager Dashboard.
 * Shows real-time progress updates and allows selection to view details in Inspector Bar.
 *
 * Features:
 * - Live status updates (via polling or SSE)
 * - Row selection (single + multi-select)
 * - Status badges with colors
 * - Real-time progress bars
 * - Click row → opens Import Inspector in right sidebar
 *
 * @see docs/migrations/UNIFIED_IMPORT.md for integration details
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  TrendingUp,
  AlertTriangle,
  Eye,
  Trash2,
  RefreshCw,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import { useOperating } from '@/contexts/OperatingContext';
import { getToken } from '@/contexts/AuthContext';
import {
  useBackgroundOperations,
  type OperationType,
} from '@/contexts/BackgroundOperationsContext';
import { useJobStream, type JobUpdate } from '@/hooks/useJobStream';
import { errorCapture } from '@/services/error-capture.service';
import { cancelJob, pauseJob, resumeJob } from '@/lib/api-client';

// Import job status
export type ImportStatus =
  | 'queued' // Waiting to start
  | 'reading' // Reading file
  | 'parsing' // Parsing JSON/structure
  | 'normalizing' // Normalizing data
  | 'indexing' // Creating nodes/edges
  | 'linking' // Building relationships
  | 'processing' // Generic processing state
  | 'blocked' // Paused by user
  | 'done' // Complete
  | 'error'; // Failed

// Import job definition
export interface ImportJob {
  id: string;
  fileName: string;
  fileType: 'chat' | 'document' | 'mixed' | 'unknown';
  platform?: 'chatgpt' | 'claude' | 'gemini' | 'unknown';
  status: ImportStatus;
  progress: number; // 0-100
  startedAt: number;
  completedAt?: number;
  stats: {
    nodesCreated: number;
    edgesCreated: number;
    sourcesCreated: number;
    conversationsProcessed: number;
  };
  error?: string;
}

interface ImportsTableCardProps {
  onJobSelect?: (jobId: string, job: ImportJob) => void;
  onJobsMultiSelect?: (jobIds: string[], jobs: ImportJob[]) => void;
}

// Status badge colors
const statusColors: Record<ImportStatus, string> = {
  queued: 'bg-slate-600/20 border-slate-500/30 text-slate-300',
  reading: 'bg-blue-600/20 border-blue-500/30 text-blue-300',
  parsing: 'bg-blue-600/20 border-blue-500/30 text-blue-300',
  normalizing: 'bg-purple-600/20 border-purple-500/30 text-purple-300',
  indexing: 'bg-green-600/20 border-green-500/30 text-green-300',
  linking: 'bg-yellow-600/20 border-yellow-500/30 text-yellow-300',
  processing: 'bg-blue-600/20 border-blue-500/30 text-blue-300',
  blocked: 'bg-yellow-600/20 border-yellow-500/30 text-yellow-300',
  done: 'bg-green-600/20 border-green-500/30 text-green-300',
  error: 'bg-red-600/20 border-red-500/30 text-red-300',
};

// Status icons
const statusIcons: Record<ImportStatus, any> = {
  queued: Clock,
  reading: FileText,
  parsing: FileText,
  normalizing: TrendingUp,
  indexing: Upload,
  linking: Upload,
  processing: Loader2,
  blocked: PauseCircle,
  done: CheckCircle2,
  error: XCircle,
};

// Status labels
const statusLabels: Record<ImportStatus, string> = {
  queued: 'Queued',
  reading: 'Reading',
  parsing: 'Parsing',
  normalizing: 'Normalizing',
  indexing: 'Indexing',
  linking: 'Linking',
  processing: 'Processing',
  blocked: 'Paused',
  done: 'Complete',
  error: 'Failed',
};

export function ImportsTableCard({ onJobSelect, onJobsMultiSelect }: ImportsTableCardProps) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [activeImportIds, setActiveImportIds] = useState<string[]>([]);
  const [jobsBeingOperated, setJobsBeingOperated] = useState<Set<string>>(new Set());
  const { operating, isOperatingMode, operatingContextVersion } = useOperating();
  const { getAllOperations, getOperation, restoreOperation, removeOperationsByJobIds } =
    useBackgroundOperations();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Subscribe to real-time job updates via SSE
  const {
    jobs: sseJobs,
    connected: sseConnected,
    error: sseError,
    removeJobs: removeJobsFromStream,
  } = useJobStream();

  // ==================== BULK ACTION LOADING STATE MANAGEMENT ====================
  // Track bulkActionLoading changes for debugging
  useEffect(() => {
    console.log(`[ImportsTable] bulkActionLoading changed: ${bulkActionLoading}`);

    // Safety mechanism: Auto-reset if stuck in loading state for more than 30 seconds
    if (bulkActionLoading) {
      const timeoutId = setTimeout(() => {
        console.error('[ImportsTable] ⚠️  bulkActionLoading stuck for 30s, forcing reset!');
        setBulkActionLoading(false);
        setJobsBeingOperated(new Set());

        errorCapture.warn('Bulk action loading state was stuck and auto-reset', {
          domain: 'jobs',
          operation: 'bulkActionLoadingReset',
          metadata: {
            selectedJobIds: Array.from(selectedJobIds),
            jobsBeingOperated: Array.from(jobsBeingOperated),
          },
        });
      }, 30000);

      return () => clearTimeout(timeoutId);
    }
  }, [bulkActionLoading, selectedJobIds, jobsBeingOperated]);

  // Defensive reset on component mount to clear any stuck state
  useEffect(() => {
    console.log('[ImportsTable] Component mounted, ensuring clean state');
    setBulkActionLoading(false);
    setJobsBeingOperated(new Set());
  }, []); // Empty dependency array = runs once on mount
  // ==================== END BULK ACTION LOADING STATE MANAGEMENT ====================

  // Convert unified Job API format to ImportJob format
  const convertAPIJobToImportJob = useCallback((apiJob: any): ImportJob => {
    // Map unified job status to ImportStatus
    const statusMap: Record<string, ImportStatus> = {
      queued: 'queued',
      running: 'processing',
      succeeded: 'done',
      failed: 'error',
      canceled: 'error',
      blocked: 'blocked',
    };

    // Extract filename from job config
    const fileName = apiJob.config?.files?.[0]?.fileName || `Job ${apiJob.id.substring(0, 8)}`;
    const platform = apiJob.config?.platform;

    return {
      id: apiJob.id,
      fileName,
      fileType: apiJob.type === 'import' ? 'chat' : 'unknown',
      platform,
      status: statusMap[apiJob.status] || 'processing',
      progress: Math.round((apiJob.state_data?.progress?.percent || 0) * 100),
      startedAt: apiJob.created_at,
      completedAt: apiJob.state_data?.completedAt,
      stats: {
        nodesCreated: apiJob.state_data?.stats?.nodesCreated || 0,
        edgesCreated: apiJob.state_data?.stats?.edgesCreated || 0,
        sourcesCreated: apiJob.state_data?.stats?.sourcesCreated || 0,
        conversationsProcessed: apiJob.state_data?.stats?.conversationsProcessed || 0,
      },
      error: apiJob.state_data?.error?.message,
    };
  }, []);

  // Convert SSE JobUpdate to ImportJob format
  const convertSSEJobToImportJob = useCallback((sseJob: JobUpdate): ImportJob => {
    // Map unified job status to ImportStatus (same as convertAPIJobToImportJob)
    const statusMap: Record<string, ImportStatus> = {
      queued: 'queued',
      running: 'processing',
      succeeded: 'done',
      failed: 'error',
      canceled: 'error',
      blocked: 'blocked',
    };

    // Extract filename from config or generate label based on job type
    let fileName: string;
    if (sseJob.config?.fileName) {
      fileName = sseJob.config.fileName;
    } else if (sseJob.type === 'delete') {
      const scope = sseJob.config?.deleteScope || 'canvas';
      fileName = scope === 'canvas' ? 'Delete Canvas Data' : 'Delete All Client Data';
    } else {
      fileName = `${sseJob.type.charAt(0).toUpperCase() + sseJob.type.slice(1)} Job`;
    }

    return {
      id: sseJob.jobId,
      fileName,
      fileType: 'unknown' as const,
      platform: undefined,
      status: statusMap[sseJob.status] || 'processing',
      progress: Math.round(sseJob.progress.percent), // Backend already sends 0-100
      startedAt: sseJob.timestamp,
      completedAt:
        sseJob.status === 'succeeded' || sseJob.status === 'failed' ? sseJob.timestamp : undefined,
      stats: {
        nodesCreated: 0,
        edgesCreated: 0,
        sourcesCreated: 0,
        conversationsProcessed: 0,
      },
      error: sseJob.status === 'failed' ? 'Job failed' : undefined,
    };
  }, []);

  // Sync jobs list with SSE (SSE is source of truth for real-time updates)
  useEffect(() => {
    if (sseJobs.size > 0) {
      console.log(`[ImportsTable] SSE update received: ${sseJobs.size} jobs`);
      setJobs(() => {
        // Convert all SSE jobs to ImportJob format
        // This replaces local state completely, ensuring deleted jobs are removed
        const sseJobsArray = Array.from(sseJobs.values()).map((sseJob) => {
          console.log(`[ImportsTable] SSE job update:`, {
            jobId: sseJob.jobId,
            status: sseJob.status,
            progress: sseJob.progress.percent,
            timestamp: sseJob.timestamp,
          });
          return convertSSEJobToImportJob(sseJob);
        });

        return sseJobsArray.sort((a, b) => b.startedAt - a.startedAt);
      });
    }
  }, [sseJobs, convertSSEJobToImportJob]);

  // Update job from SSE progress event
  const updateJobFromProgress = useCallback((uploadId: string, progress: any) => {
    setJobs((prevJobs) => {
      const existingJob = prevJobs.find((j) => j.id === uploadId);
      if (!existingJob) {
        // Create new job entry
        return [
          ...prevJobs,
          {
            id: uploadId,
            fileName: 'Import in progress...', // TODO: Get from backend
            fileType: 'unknown' as const,
            status: progress.stage,
            progress: progress.progress,
            startedAt: Date.now(),
            stats: progress.stats || {
              nodesCreated: 0,
              edgesCreated: 0,
              sourcesCreated: 0,
              conversationsProcessed: 0,
            },
          },
        ];
      } else {
        // Update existing job
        return prevJobs.map((job) =>
          job.id === uploadId
            ? {
                ...job,
                status: progress.stage,
                progress: progress.progress,
                stats: progress.stats || job.stats,
                completedAt: progress.stage === 'done' ? Date.now() : job.completedAt,
                error: progress.error,
              }
            : job
        );
      }
    });
  }, []);

  // Merge backend import jobs with background operations
  const getMergedJobs = useCallback((): ImportJob[] => {
    const backgroundOps = getAllOperations();
    const merged: ImportJob[] = [...jobs];

    // Add background operations (imports, deletions) that aren't already in jobs
    for (const op of backgroundOps) {
      // Check if operation already exists in backend jobs
      const exists = jobs.some((j) => j.id === op.id);
      if (!exists) {
        // Convert Operation to ImportJob format
        merged.push({
          id: op.id,
          fileName: op.fileName || op.title,
          fileType: op.fileType || 'unknown',
          platform: op.platform,
          status: op.status as ImportStatus,
          progress: op.progress,
          startedAt: op.startedAt,
          completedAt: op.completedAt,
          stats: {
            nodesCreated: op.stats.nodesCreated || 0,
            edgesCreated: op.stats.edgesCreated || 0,
            sourcesCreated: op.stats.sourcesCreated || 0,
            conversationsProcessed: op.stats.conversationsProcessed || 0,
          },
          error: op.error,
        });
      }
    }

    // Filter out completed jobs older than 5 minutes to prevent UI clutter
    // This ensures terminal-state jobs (done/error) are shown briefly then auto-removed
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const filtered = merged.filter((job) => {
      const isTerminal = job.status === 'done' || job.status === 'error';
      const isRecent = job.completedAt && job.completedAt > fiveMinutesAgo;

      // Keep job if:
      // 1. It's not in terminal state (still active), OR
      // 2. It's terminal but completed recently (within 5 minutes)
      return !isTerminal || isRecent;
    });

    // Sort by startedAt descending (most recent first)
    return filtered.sort((a, b) => b.startedAt - a.startedAt);
  }, [jobs, getAllOperations]);

  // Fetch import jobs with operating context support
  useEffect(() => {
    const fetchJobs = async () => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setLoading(true);

        // Prepare headers with operating context
        const token = getToken();
        const headers: HeadersInit = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        };

        // Add operating context headers if in CRM/nested mode
        if (isOperatingMode && operating.accountId) {
          headers['X-Operating-Account'] = operating.accountId;
          headers['X-Operating-Mode'] = operating.mode;
        }

        // Fetch from real API endpoint with 5 second timeout
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${API_BASE_URL}/api/v1/jobs?limit=50`, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && data.jobs) {
          // Convert unified Job API format to ImportJob format
          const convertedJobs = data.jobs.map(convertAPIJobToImportJob);

          // CRITICAL FIX: Force re-render by using functional update with deep comparison
          // This ensures React detects changes even if array reference is the same
          setJobs((prev) => {
            const next = convertedJobs;

            // Deep equality check to avoid unnecessary re-renders
            // Only update if actual content changed
            if (JSON.stringify(prev) === JSON.stringify(next)) {
              return prev; // Keep same reference to prevent re-render
            }

            // Content changed, return new array to trigger re-render
            return [...next]; // Spread to ensure new array reference
          });

          // Track active imports for potential SSE subscriptions
          const active = convertedJobs.filter((j: ImportJob) =>
            ['reading', 'parsing', 'normalizing', 'indexing', 'linking', 'processing'].includes(
              j.status
            )
          );
          setActiveImportIds(active.map((j: ImportJob) => j.id));
        } else {
          console.debug('[ImportsTable] No jobs returned from API');
          setJobs([]);
        }
      } catch (error: any) {
        // Ignore abort errors (from timeout or new poll)
        if (error.name === 'AbortError') {
          console.debug('[ImportsTable] Fetch aborted');
          return;
        } else {
          console.error('[ImportsTable] Failed to fetch import jobs:', error);
        }
        // On error, show empty state rather than mock data
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch only (SSE will handle real-time updates)
    fetchJobs();

    return () => {
      // Abort any pending request when component unmounts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [operating, isOperatingMode, operatingContextVersion, convertAPIJobToImportJob]); // Re-fetch when operating context changes

  // Handle bulk delete
  const handleDeleteSelected = async () => {
    // CRITICAL FIX: Capture selectedJobIds immediately to prevent race conditions
    // React state updates can cause selectedJobIds to be cleared during async operations
    const jobIdsToDelete = new Set(selectedJobIds);

    // ENHANCED DEBUG LOGGING
    console.log('================================');
    console.log('🔴 DELETE BUTTON CLICKED - ENTRY POINT');
    console.log('================================');
    console.log('[DELETE] Function called at:', new Date().toISOString());
    console.log('[DELETE] jobIdsToDelete:', Array.from(jobIdsToDelete));
    console.log('[DELETE] jobIdsToDelete.size:', jobIdsToDelete.size);
    console.log('[DELETE] bulkActionLoading BEFORE:', bulkActionLoading);
    console.log('[DELETE] jobsBeingOperated:', Array.from(jobsBeingOperated));

    // CRITICAL CHECK: If bulkActionLoading is already true, something is wrong!
    if (bulkActionLoading) {
      console.error('[DELETE] ❌ CRITICAL: bulkActionLoading is already TRUE at function entry!');
      console.error('[DELETE] This indicates a stuck state from a previous operation.');
      console.error('[DELETE] Force-resetting bulkActionLoading to false...');
      setBulkActionLoading(false);
      setJobsBeingOperated(new Set());

      errorCapture.error(new Error('bulkActionLoading was stuck when delete was initiated'), {
        domain: 'jobs',
        operation: 'handleDeleteSelected',
        metadata: {
          bulkActionLoading,
          jobsBeingOperated: Array.from(jobsBeingOperated),
          selectedJobIds: Array.from(jobIdsToDelete),
        },
      });

      // Wait a tick to let state update
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      if (jobIdsToDelete.size === 0) {
        console.log('[DELETE] ❌ No jobs selected, returning early');
        alert('No jobs selected! This should not happen.');
        return;
      }

      console.log('[DELETE] ✅ Proceeding with deletion...');
    } catch (error) {
      console.error('[DELETE] ❌ ERROR in early validation:', error);
      alert('Error in delete handler: ' + error);
      return;
    }

    // Check if any selected jobs are currently being operated on
    const conflictingJobs = Array.from(jobIdsToDelete).filter((id) => jobsBeingOperated.has(id));
    if (conflictingJobs.length > 0) {
      console.log('[DELETE] Conflicting jobs in progress:', conflictingJobs);
      errorCapture.warn(
        `Cannot delete ${conflictingJobs.length} job${conflictingJobs.length !== 1 ? 's' : ''} - operation in progress`,
        {
          domain: 'jobs',
          operation: 'bulkDelete',
          metadata: { conflictingJobs },
        }
      );
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${jobIdsToDelete.size} job(s)? This action cannot be undone.`
    );

    console.log('[DELETE] Confirmation result:', confirmed);
    if (!confirmed) {
      console.log('[DELETE] User cancelled deletion');
      return;
    }

    console.log('[DELETE] User confirmed deletion, setting bulkActionLoading = true');

    // Mark jobs as being operated on
    setJobsBeingOperated((prev) => new Set([...prev, ...jobIdsToDelete]));
    setBulkActionLoading(true);

    console.log('[DELETE] State updated: bulkActionLoading = true, jobsBeingOperated updated');

    try {
      const token = getToken();
      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Add operating context headers if in CRM/nested mode
      if (isOperatingMode && operating.accountId) {
        headers['X-Operating-Account'] = operating.accountId;
        headers['X-Operating-Mode'] = operating.mode;
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

      // ==================== PRE-DELETE VALIDATION & DIAGNOSTICS ====================
      console.log('='.repeat(80));
      console.log('[DELETE] PRE-DELETE DIAGNOSTICS');
      console.log('='.repeat(80));
      console.log(`[DELETE] Total jobs to delete: ${jobIdsToDelete.size}`);
      console.log(`[DELETE] Selected job IDs:`, Array.from(jobIdsToDelete));

      // Check if jobs exist in local state
      const jobsInLocalState = jobs.filter((j) => jobIdsToDelete.has(j.id));
      console.log(
        `[DELETE] Jobs found in local state: ${jobsInLocalState.length}/${jobIdsToDelete.size}`
      );
      jobsInLocalState.forEach((j) => {
        console.log(`  ✓ Job ${j.id}: ${j.fileName} (status: ${j.status})`);
      });

      // Check if jobs exist in SSE stream
      const jobsInSSE = Array.from(jobIdsToDelete).filter((id) => sseJobs.has(id));
      console.log(`[DELETE] Jobs found in SSE stream: ${jobsInSSE.length}/${jobIdsToDelete.size}`);
      console.log(`[DELETE] SSE stream total size: ${sseJobs.size} jobs`);

      // Log missing jobs
      const missingFromLocal = Array.from(jobIdsToDelete).filter(
        (id) => !jobs.find((j) => j.id === id)
      );
      const missingFromSSE = Array.from(jobIdsToDelete).filter((id) => !sseJobs.has(id));
      if (missingFromLocal.length > 0) {
        console.warn(`[DELETE] ⚠️  Jobs NOT in local state:`, missingFromLocal);
      }
      if (missingFromSSE.length > 0) {
        console.warn(`[DELETE] ⚠️  Jobs NOT in SSE stream:`, missingFromSSE);
      }

      // Log auth context
      console.log(`[DELETE] Auth headers:`, {
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
        isOperatingMode,
        operatingAccountId: operating?.accountId,
        operatingMode: operating?.mode,
      });
      // ==================== END PRE-DELETE DIAGNOSTICS ====================

      // Delete each selected job
      const deletePromises = Array.from(jobIdsToDelete).map(async (jobId) => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
            method: 'DELETE',
            headers,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

            // ==================== ENHANCED ERROR DIAGNOSTICS ====================
            console.error(`❌ [DELETE] FAILED for job ${jobId}`);
            console.error(`   Status: ${response.status} ${response.statusText}`);
            console.error(`   Error data:`, errorData);
            console.error(`   Full response:`, {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              url: response.url,
            });

            // Provide specific guidance based on status code
            if (response.status === 404) {
              console.error(
                `   💡 Diagnosis: Job not found in database or belongs to different account`
              );
            } else if (response.status === 401) {
              console.error(`   💡 Diagnosis: Authentication failed - token invalid or expired`);
            } else if (response.status === 403) {
              console.error(`   💡 Diagnosis: Permission denied - insufficient access rights`);
            } else if (response.status === 500) {
              console.error(`   💡 Diagnosis: Server error - check API logs`);
            }
            console.error('='.repeat(80));
            // ==================== END ERROR DIAGNOSTICS ====================

            // Capture error with ErrorCaptureService
            errorCapture.capture(
              new Error(errorData.error || errorData.message || 'Failed to delete job'),
              {
                domain: 'jobs',
                operation: 'delete',
                metadata: {
                  jobId,
                  statusCode: response.status,
                  errorData,
                },
              },
              'error'
            );

            return { jobId, success: false, error: errorData };
          }

          return { jobId, success: true };
        } catch (error: any) {
          // Capture network/unexpected errors
          errorCapture.capture(
            error,
            {
              domain: 'jobs',
              operation: 'delete',
              metadata: { jobId, errorType: 'network' },
            },
            'error'
          );
          return { jobId, success: false, error };
        }
      });

      const results = await Promise.allSettled(deletePromises);
      const successCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success
      ).length;
      const failCount = jobIdsToDelete.size - successCount;

      // Extract successfully deleted job IDs
      const successfulJobIds = new Set(
        results
          .filter((r) => r.status === 'fulfilled' && r.value.success)
          .map((r) => (r as any).value.jobId)
      );

      // ==================== POST-DELETE ANALYSIS ====================
      console.log('='.repeat(80));
      console.log('[DELETE] POST-DELETE ANALYSIS');
      console.log('='.repeat(80));
      console.log(`[DELETE] Results summary:`);
      console.log(`   Total requested: ${jobIdsToDelete.size}`);
      console.log(`   Successful: ${successCount}`);
      console.log(`   Failed: ${failCount}`);
      console.log(`[DELETE] Successful job IDs:`, Array.from(successfulJobIds));

      // Log failed jobs with reasons
      const failedResults = results.filter((r) => r.status === 'fulfilled' && !r.value.success);
      if (failedResults.length > 0) {
        console.error(`[DELETE] Failed job details:`);
        failedResults.forEach((r) => {
          const result = (r as any).value;
          console.error(`   ❌ Job ${result.jobId}:`, result.error);
        });
      }

      // Log rejected promises (network errors, etc.)
      const rejectedResults = results.filter((r) => r.status === 'rejected');
      if (rejectedResults.length > 0) {
        console.error(`[DELETE] Rejected promises (network/unexpected errors):`);
        rejectedResults.forEach((r) => {
          console.error(`   💥`, (r as any).reason);
        });
      }

      // Critical check before calling removeJobsFromStream
      if (successfulJobIds.size === 0) {
        console.warn(`[DELETE] ⚠️  WARNING: No jobs successfully deleted!`);
        console.warn(`[DELETE] removeJobsFromStream will NOT be called (empty array)`);
        console.warn(`[DELETE] UI state will NOT be updated`);
      } else {
        console.log(
          `[DELETE] ✅ Will call removeJobsFromStream with ${successfulJobIds.size} job IDs`
        );
      }
      console.log('='.repeat(80));
      // ==================== END POST-DELETE ANALYSIS ====================

      // Log success to console
      if (successCount > 0) {
        errorCapture.info(
          `Successfully deleted ${successCount} job${successCount !== 1 ? 's' : ''}`,
          {
            domain: 'jobs',
            operation: 'bulkDelete',
            metadata: {
              totalSelected: jobIdsToDelete.size,
              successCount,
              failCount,
            },
          }
        );
      }

      // Log failures separately
      if (failCount > 0) {
        errorCapture.warn(`Failed to delete ${failCount} job${failCount !== 1 ? 's' : ''}`, {
          domain: 'jobs',
          operation: 'bulkDelete',
          metadata: {
            totalSelected: jobIdsToDelete.size,
            successCount,
            failCount,
          },
        });
      }

      // CRITICAL: Remove from both local state AND background operations AND job stream
      // This ensures UI stays in sync and deleted jobs don't reappear
      // - setJobs: removes from local ImportsTableCard state
      // - removeOperationsByJobIds: removes from BackgroundOperationsContext
      // - removeJobsFromStream: removes from useJobStream state (prevents SSE sync race condition)
      setJobs((prev) => prev.filter((j) => !successfulJobIds.has(j.id)));
      removeOperationsByJobIds(Array.from(successfulJobIds));
      removeJobsFromStream(Array.from(successfulJobIds));

      // Clear selection AFTER deletion completes
      setSelectedJobIds(new Set());
    } catch (error: any) {
      errorCapture.capture(
        error,
        {
          domain: 'jobs',
          operation: 'bulkDelete',
          metadata: { selectedCount: jobIdsToDelete.size },
        },
        'error'
      );
    } finally {
      console.log('[DELETE] Finally block executing - resetting state');
      console.log('[DELETE] Setting bulkActionLoading = false');

      // Clear jobs from being operated on
      setJobsBeingOperated((prev) => {
        const next = new Set(prev);
        selectedJobIds.forEach((id) => next.delete(id));
        return next;
      });
      setBulkActionLoading(false);

      console.log('[DELETE] Finally block complete - state should be reset');
    }
  };

  // Handle bulk retry
  const handleRetrySelected = async () => {
    if (selectedJobIds.size === 0) return;

    // Check if any selected jobs are currently being operated on
    const conflictingJobs = Array.from(selectedJobIds).filter((id) => jobsBeingOperated.has(id));
    if (conflictingJobs.length > 0) {
      errorCapture.warn(
        `Cannot retry ${conflictingJobs.length} job${conflictingJobs.length !== 1 ? 's' : ''} - operation in progress`,
        {
          domain: 'jobs',
          operation: 'bulkRetry',
          metadata: { conflictingJobs },
        }
      );
      return;
    }

    // Mark jobs as being operated on
    setJobsBeingOperated((prev) => new Set([...prev, ...selectedJobIds]));
    setBulkActionLoading(true);

    try {
      const token = getToken();
      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Add operating context headers if in CRM/nested mode
      if (isOperatingMode && operating.accountId) {
        headers['X-Operating-Account'] = operating.accountId;
        headers['X-Operating-Mode'] = operating.mode;
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

      // Retry each selected job
      const retryPromises = Array.from(selectedJobIds).map(async (jobId) => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/retry`, {
            method: 'POST',
            headers,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

            // Capture error with ErrorCaptureService
            errorCapture.capture(
              new Error(errorData.error || errorData.message || 'Failed to retry job'),
              {
                domain: 'jobs',
                operation: 'retry',
                metadata: {
                  jobId,
                  statusCode: response.status,
                  errorData,
                },
              },
              'error'
            );

            return { jobId, success: false, error: errorData };
          }

          const data = await response.json();
          return { jobId, success: true, newJob: data.newJob };
        } catch (error: any) {
          // Capture network/unexpected errors
          errorCapture.capture(
            error,
            {
              domain: 'jobs',
              operation: 'retry',
              metadata: { jobId, errorType: 'network' },
            },
            'error'
          );
          return { jobId, success: false, error };
        }
      });

      const results = await Promise.allSettled(retryPromises);
      const successCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value.success
      ).length;
      const failCount = selectedJobIds.size - successCount;

      // Extract new job IDs for success logging
      const newJobIds = results
        .filter((r) => r.status === 'fulfilled' && r.value.success)
        .map((r) => (r as any).value.newJob?.id)
        .filter(Boolean);

      // Log success to console
      if (successCount > 0) {
        errorCapture.info(
          `Successfully retried ${successCount} job${successCount !== 1 ? 's' : ''}, created ${newJobIds.length} new job${newJobIds.length !== 1 ? 's' : ''}`,
          {
            domain: 'jobs',
            operation: 'bulkRetry',
            metadata: {
              totalSelected: selectedJobIds.size,
              successCount,
              failCount,
              newJobIds,
            },
          }
        );
      }

      // Log failures separately
      if (failCount > 0) {
        errorCapture.warn(`Failed to retry ${failCount} job${failCount !== 1 ? 's' : ''}`, {
          domain: 'jobs',
          operation: 'bulkRetry',
          metadata: {
            totalSelected: selectedJobIds.size,
            successCount,
            failCount,
          },
        });
      }

      // Clear selection
      setSelectedJobIds(new Set());

      // Trigger jobs refresh (SSE will handle updates, but we can also poll once)
      // The new jobs will appear via SSE stream
    } catch (error: any) {
      errorCapture.capture(
        error,
        {
          domain: 'jobs',
          operation: 'bulkRetry',
          metadata: { selectedCount: selectedJobIds.size },
        },
        'error'
      );
    } finally {
      // Clear jobs from being operated on
      setJobsBeingOperated((prev) => {
        const next = new Set(prev);
        selectedJobIds.forEach((id) => next.delete(id));
        return next;
      });
      setBulkActionLoading(false);
    }
  };

  // Handle row click
  const handleRowClick = (job: ImportJob, event: React.MouseEvent) => {
    const jobId = job.id;

    // Multi-select with Ctrl/Cmd
    if (event.ctrlKey || event.metaKey) {
      const newSelection = new Set(selectedJobIds);
      if (newSelection.has(jobId)) {
        newSelection.delete(jobId);
      } else {
        newSelection.add(jobId);
      }
      setSelectedJobIds(newSelection);

      // Notify parent
      if (onJobsMultiSelect) {
        const selectedJobs = jobs.filter((j) => newSelection.has(j.id));
        onJobsMultiSelect(Array.from(newSelection), selectedJobs);
      }
    } else {
      // Single select
      setSelectedJobIds(new Set([jobId]));
      if (onJobSelect) {
        onJobSelect(jobId, job);
      }
    }
  };

  // Format time elapsed
  const formatTimeElapsed = (startedAt: number, completedAt?: number): string => {
    // Handle undefined/null/NaN timestamps
    if (!startedAt || isNaN(startedAt)) {
      return '—';
    }

    const endTime = completedAt || Date.now();
    const elapsed = Math.floor((endTime - startedAt) / 1000);

    // Handle negative elapsed (clock skew or bad data)
    if (elapsed < 0) return '—';

    if (elapsed < 60) return `${elapsed}s`;
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
    return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
  };

  // Get merged jobs (backend + background operations)
  const mergedJobs = getMergedJobs();

  // Force re-render every second for active jobs to update elapsed time
  useEffect(() => {
    const hasActiveJobs = mergedJobs.some((j) =>
      ['reading', 'parsing', 'normalizing', 'indexing', 'linking', 'processing'].includes(j.status)
    );

    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      // Trigger a tiny state update to force re-render
      // This updates the elapsed time displayed for running jobs
      setActiveImportIds((prev) => [...prev]);
    }, 1000);

    return () => clearInterval(interval);
  }, [mergedJobs]);

  // Helper to get operation type from job
  const getOperationType = (job: ImportJob): OperationType => {
    // Check if it's a deletion operation (job ID starts with 'del_')
    if (job.id.startsWith('del_')) return 'deletion';
    return 'import';
  };

  if (loading && mergedJobs.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-300">Background Operations</h3>
          {mergedJobs.length > 0 && (
            <span className="text-xs text-slate-500">
              (
              {
                mergedJobs.filter((j) =>
                  [
                    'reading',
                    'parsing',
                    'normalizing',
                    'indexing',
                    'linking',
                    'processing',
                  ].includes(j.status)
                ).length
              }{' '}
              active)
            </span>
          )}
        </div>

        {selectedJobIds.size > 0 && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{selectedJobIds.size} selected</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRetrySelected}
                disabled={bulkActionLoading}
                className="flex items-center gap-1 px-2 py-1 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Retry selected jobs"
              >
                {bulkActionLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Retry
              </button>
              <button
                onClick={(e) => {
                  console.log('🔴 RAW BUTTON CLICK EVENT:', {
                    timestamp: new Date().toISOString(),
                    target: e.currentTarget,
                    disabled: e.currentTarget.disabled,
                    selectedCount: selectedJobIds.size,
                    bulkActionLoading,
                  });
                  handleDeleteSelected();
                }}
                disabled={bulkActionLoading}
                className="flex items-center gap-1 px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete selected jobs"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
              <button
                onClick={() => setSelectedJobIds(new Set())}
                className="text-purple-400 hover:text-purple-300"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {mergedJobs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/50 text-xs text-slate-400 border-b border-slate-700">
                <th className="text-left p-3 font-medium">Operation</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Progress</th>
                <th className="text-left p-3 font-medium">Stats</th>
                <th className="text-left p-3 font-medium">Time</th>
                <th className="w-10 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {mergedJobs.map((job) => {
                const StatusIcon = statusIcons[job.status];
                const isSelected = selectedJobIds.has(job.id);
                const isProcessing = [
                  'reading',
                  'parsing',
                  'normalizing',
                  'indexing',
                  'linking',
                  'processing',
                ].includes(job.status);
                const operationType = getOperationType(job);
                const OperationIcon = operationType === 'deletion' ? Trash2 : FileText;

                return (
                  <tr
                    key={job.id}
                    onClick={(e) => handleRowClick(job, e)}
                    className={`border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors ${
                      isSelected ? 'bg-purple-600/10' : ''
                    }`}
                  >
                    {/* Operation */}
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <OperationIcon
                          className={`w-4 h-4 flex-shrink-0 ${
                            operationType === 'deletion' ? 'text-red-400' : 'text-slate-400'
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-200 truncate max-w-xs">
                            {job.fileName}
                          </p>
                          <p className="text-xs text-slate-500 capitalize">
                            {operationType === 'deletion'
                              ? 'Data deletion'
                              : job.platform || job.fileType}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="p-3">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${statusColors[job.status]}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusLabels[job.status]}
                      </div>
                    </td>

                    {/* Progress */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-900 rounded-full h-1.5 max-w-24">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              job.status === 'error'
                                ? 'bg-red-500'
                                : job.status === 'done'
                                  ? 'bg-green-500'
                                  : 'bg-purple-500'
                            }`}
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right">
                          {job.progress}%
                        </span>
                      </div>
                    </td>

                    {/* Stats */}
                    <td className="p-3">
                      <div className="text-xs text-slate-400 space-y-0.5">
                        <div>{job.stats.nodesCreated.toLocaleString()} nodes</div>
                        <div>{job.stats.sourcesCreated} sources</div>
                      </div>
                    </td>

                    {/* Time */}
                    <td className="p-3">
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
                        <Clock className="w-3 h-3" />
                        <span>{formatTimeElapsed(job.startedAt, job.completedAt)}</span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="p-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(job, e);
                        }}
                        className="p-1.5 hover:bg-slate-600 rounded transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center">
          <Upload className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-1">No active imports</p>
          <p className="text-xs text-slate-500">
            Import jobs will appear here when you upload data
          </p>
        </div>
      )}
    </div>
  );
}
