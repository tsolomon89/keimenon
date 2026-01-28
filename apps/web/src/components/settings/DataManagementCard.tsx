/**
 * Data Management Card Component
 *
 * Special card for data clearing operations with confirmation modals
 */

'use client';

import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';
import { useAuth } from '@/contexts/AuthContext';
import { errorCapture } from '@/services/error-capture.service';
import {
  useBackgroundOperations,
  type OperationStatus,
} from '@/contexts/BackgroundOperationsContext';
import { logJobEvent } from '@/lib/error-handler';
import { API_BASE_URL } from '@/lib/env.config';
import { useJobStream } from '@/hooks/useJobStream';
import { useKeimenonStore } from '@/store/keimenonStore';

interface DataStats {
  nodes: Array<{ kind: string; count: number }>;
  edges: number;
}

export function DataManagementCard() {
  const { user } = useAuth();
  const { addOperation, updateOperation, getOperation } = useBackgroundOperations();
  const { jobs: sseJobs } = useJobStream();
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [deletionJobId, setDeletionJobId] = useState<string | null>(null);
  const [stats, setStats] = useState<DataStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Watch for deletion job completion via direct SSE subscription (no polling)
  // FIXED: Subscribe directly to useJobStream instead of polling BackgroundOperationsContext
  // This eliminates 1-3 second race conditions and reduces latency from 1s to ~500ms
  useEffect(() => {
    if (!deletionJobId) return undefined;

    const job = sseJobs.get(deletionJobId);

    // Job completed successfully
    if (job?.status === 'succeeded') {
      console.log('[DataManagementCard] Deletion complete via SSE');
      console.log('[DataManagementCard] Job details:', job);

      // CRITICAL: Refresh keimenon data immediately so stale nodes disappear
      // Without this, keimenon shows old cached nodes until page refresh
      console.log('[DataManagementCard] Calling loadGraphData() to refresh keimenon...');
      useKeimenonStore.getState().loadGraphData();
      console.log('[DataManagementCard] loadGraphData() called successfully');

      setSuccess('Data cleared successfully! Keimenon is now empty.');

      // Clear deletion state after showing success
      setTimeout(() => {
        setDeletionJobId(null);
        setIsClearing(false);
        setSuccess(null);
      }, 3000);
      return undefined;
    }
    // Job failed
    else if (job?.status === 'failed') {
      console.error('[DataManagementCard] Deletion failed via SSE:', job);
      setError('Deletion failed. Please check Background Operations for details.');
      setDeletionJobId(null);
      setIsClearing(false);
      return undefined;
    }
    // Job not yet in SSE stream - add timeout for connection issues
    else if (!job) {
      const timeout = setTimeout(() => {
        // Only show error if job STILL not in SSE after 10 seconds (true disconnect)
        const latestJob = sseJobs.get(deletionJobId);
        if (!latestJob) {
          console.error('[DataManagementCard] Job not received via SSE after 10s');
          setError('Lost connection to server. Please refresh the page.');
          setIsClearing(false);
        }
      }, 10000); // 10 second timeout for SSE delivery

      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [sseJobs, deletionJobId]);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      setError(null);

      const token = localStorage.getItem('keimenon_token');

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/data/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load stats');
      }

      const data = await response.json();
      setStats(data.stats);
    } catch (err: any) {
      console.error('Failed to load stats:', err);

      // Capture error for console display
      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'database',
          operation: 'dataManagement.loadStats',
          userId: user?.userId,
          accountId: user?.accountId,
          metadata: {
            component: 'DataManagementCard',
            endpoint: '/api/v1/data/stats',
          },
        },
        'warn' // Non-fatal - user can still proceed with deletion
      );

      setError(capturedError.userMessage || err.message);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleClearClick = async () => {
    // FIXED: Reset stuck state before proceeding
    // This allows recovery if previous delete job got stuck
    if (isClearing && !deletionJobId) {
      console.warn('[DataManagementCard] Resetting stuck isClearing state');
      setIsClearing(false);
      setError(null);
    }

    // Try to load stats, but show modal even if it fails
    try {
      await loadStats();
    } catch (err) {
      console.warn(
        '[DataManagementCard] Failed to load stats before deletion, continuing anyway:',
        err
      );
      // Stats will show as unknown in modal, but user can still proceed
    }

    setShowClearModal(true);
  };

  // Minimize deletion - send to background
  const handleMinimizeDeletion = (
    jobIdOverride?: string,
    totals?: { nodeCount: number; edgeCount: number }
  ) => {
    const operationId = jobIdOverride || deletionJobId;
    if (!operationId) {
      console.warn('[DataManagementCard] Cannot minimize - no deletion job id available');
      return;
    }

    const nodeCount = totals?.nodeCount ?? stats?.nodes?.reduce((sum, n) => sum + n.count, 0) ?? 0;
    const edgeCount = totals?.edgeCount ?? stats?.edges ?? 0;

    const title = 'Clearing keimenon data';
    const description = `Deleting ${nodeCount} nodes and ${edgeCount} edges`;

    const existing = getOperation(operationId);
    const operationUpdate = {
      title,
      description,
      status: 'processing' as OperationStatus,
      progress: existing?.progress ?? 50,
      stats: {
        nodesToDelete: nodeCount,
        edgesToDelete: edgeCount,
      },
    };

    if (existing) {
      updateOperation(operationId, operationUpdate);
    } else {
      addOperation({
        id: operationId,
        type: 'deletion',
        title,
        description,
        status: 'processing',
        progress: 50,
        startedAt: Date.now(),
        stats: {
          nodesToDelete: nodeCount,
          edgesToDelete: edgeCount,
        },
      });
    }

    setDeletionJobId(operationId);
    console.log('[DataManagementCard] Minimized deletion:', operationId);

    // Close modal - operation continues in background
    setShowClearModal(false);
    // Note: We do NOT setIsClearing(false) here - the deletion continues in background
    // The finally block in handleConfirmClear will handle cleanup when API call completes
  };

  const handleConfirmClear = async () => {
    try {
      setIsClearing(true);
      setError(null);

      const token = localStorage.getItem('keimenon_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Calculate totals for error context
      const nodeCount = stats?.nodes?.reduce((sum, n) => sum + n.count, 0) ?? 0;
      const edgeCount = stats?.edges ?? 0;

      // Create delete job (async background operation)
      const response = await fetch(`${API_BASE_URL}/api/v1/jobs/delete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: 'keimenon', // Delete keimenon data for current account
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Capture HTTP error for console display
        const capturedError = errorCapture.capture(
          new Error(errorData.error || 'Failed to clear data'),
          {
            domain: 'database',
            operation: 'dataManagement.clearKeimenon',
            userId: user?.userId,
            accountId: user?.accountId,
            metadata: {
              component: 'DataManagementCard',
              endpoint: '/api/v1/jobs/delete',
              statusCode: response.status,
              nodeCount,
              edgeCount,
              errorDetails: errorData,
            },
          },
          'error'
        );

        throw new Error(capturedError.userMessage || errorData.error || 'Failed to clear data');
      }

      const result = await response.json();
      console.log('[DataManagementCard] Delete job created:', result);

      const serverJobId: string | undefined = result.jobId;
      const resolvedJobId = serverJobId ?? `del_${Date.now()}`;

      if (!serverJobId) {
        console.warn('[DataManagementCard] Delete job created without jobId in response');
      }

      setDeletionJobId(resolvedJobId);
      handleMinimizeDeletion(resolvedJobId, { nodeCount, edgeCount });

      // Log delete job creation event
      logJobEvent(
        `Delete job created: ${nodeCount} nodes, ${edgeCount} edges`,
        'delete.jobCreated',
        {
          jobId: resolvedJobId,
          nodeCount,
          edgeCount,
          scope: 'keimenon',
        }
      );

      setSuccess(`Delete job created! Monitor progress in Background Operations.`);
      setShowClearModal(false);
      setStats(null);
    } catch (err: any) {
      console.error('Failed to clear data:', err);

      // Capture generic error for console display
      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'database',
          operation: 'dataManagement.clearKeimenon',
          userId: user?.userId,
          accountId: user?.accountId,
          metadata: {
            component: 'DataManagementCard',
            endpoint: '/api/v1/jobs/delete',
            nodeCount: stats?.nodes?.reduce((sum, n) => sum + n.count, 0) ?? 0,
            edgeCount: stats?.edges ?? 0,
            errorName: err.name,
            errorStack: err.stack,
          },
        },
        'error'
      );

      // Handle specific error cases with user-friendly messages
      let errorMessage = capturedError.userMessage || err.message;

      if (err.message?.includes('SQLITE_BUSY') || err.message?.includes('database is locked')) {
        errorMessage = 'Database is currently busy. Please try again in a moment.';
      } else if (err.message?.includes('FOREIGN KEY constraint failed')) {
        errorMessage =
          'Unable to delete data due to database integrity constraints. Please contact support.';
      } else if (err.message?.includes('Not authenticated')) {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }

      setError(errorMessage);
    } finally {
      setIsClearing(false);
    }
  };

  const getStatsMessage = () => {
    if (!stats) return '';

    const nodeCount = stats.nodes.reduce((sum, n) => sum + n.count, 0);
    const details = stats.nodes.map((n) => `${n.count} ${n.kind}`).join(', ');

    return `You have ${nodeCount} nodes (${details}) and ${stats.edges} edges that will be deleted.`;
  };

  return (
    <>
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 bg-red-500/20 rounded-lg p-3">
            <Trash2 className="w-6 h-6 text-red-400" />
          </div>

          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Clear Keimenon Data</h3>
            <p className="text-xs text-slate-400">
              Delete all imported conversations, sources, code blocks, folders, and groups. Your
              account and settings will NOT be affected.
            </p>
          </div>
        </div>

        {/* Success message */}
        {success && (
          <div className="mb-4 px-3 py-2 bg-green-600/10 border border-green-500/30 rounded text-xs text-green-300">
            {success}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-600/10 border border-red-500/30 rounded text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={handleClearClick}
          disabled={isClearing && !!deletionJobId}
          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
          title={
            isClearing && deletionJobId ? 'Deletion in progress, check Background Operations' : ''
          }
        >
          {isClearing && <Loader2 className="w-4 h-4 animate-spin" />}
          {isClearing ? 'Clearing Data...' : 'Clear Keimenon Data'}
        </button>

        {/* Warning footer */}
        <div className="mt-4 flex items-start gap-2 px-3 py-2 bg-yellow-600/10 border border-yellow-500/30 rounded text-xs text-yellow-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">This action cannot be undone</p>
            <p className="text-yellow-400/80">
              All your keimenon data will be permanently deleted. Your user account, settings, and
              preferences will remain intact.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleConfirmClear}
        variant="warning"
        title="Clear All Keimenon Data?"
        message="This will permanently delete all your imported data from the keimenon. Your account and settings will not be affected."
        details={loadingStats ? 'Loading statistics...' : getStatsMessage()}
        confirmText="Clear Data"
        cancelText="Cancel"
        isProcessing={isClearing}
        onMinimize={isClearing && deletionJobId ? () => handleMinimizeDeletion() : undefined}
        minimizeText="Minimize"
      />
    </>
  );
}

export function AdminDataManagementCard() {
  const { user } = useAuth();
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Permission check
  if (user?.accountType !== 'admin') {
    return null;
  }

  const handleConfirmClear = async () => {
    try {
      setIsClearing(true);
      setError(null);

      const token = localStorage.getItem('keimenon_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/data/all-clients`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Capture HTTP error for console display
        const capturedError = errorCapture.capture(
          new Error(errorData.error || 'Failed to clear all client data'),
          {
            domain: 'database',
            operation: 'dataManagement.clearAllClients',
            userId: user?.userId,
            accountId: user?.accountId,
            metadata: {
              component: 'AdminDataManagementCard',
              endpoint: '/api/v1/data/all-clients',
              statusCode: response.status,
              errorDetails: errorData,
            },
          },
          'error'
        );

        throw new Error(capturedError.userMessage || errorData.error || 'Failed to clear data');
      }

      const result = await response.json();
      console.log('Clear all client data result:', result);

      setSuccess(`Successfully cleared data for ${result.cleared_accounts} client account(s)`);
      setShowClearModal(false);

      // Clear success message after delay (no reload needed - UI updates via SSE)
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err: any) {
      console.error('Failed to clear all client data:', err);

      // Capture generic error for console display
      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'database',
          operation: 'dataManagement.clearAllClients',
          userId: user?.userId,
          accountId: user?.accountId,
          metadata: {
            component: 'AdminDataManagementCard',
            endpoint: '/api/v1/data/all-clients',
            errorName: err.name,
            errorStack: err.stack,
          },
        },
        'error'
      );

      // Handle specific error cases with user-friendly messages
      let errorMessage = capturedError.userMessage || err.message;

      if (err.message?.includes('SQLITE_BUSY') || err.message?.includes('database is locked')) {
        errorMessage = 'Database is currently busy. Please try again in a moment.';
      } else if (err.message?.includes('FOREIGN KEY constraint failed')) {
        errorMessage =
          'Unable to delete data due to database integrity constraints. Please contact support.';
      } else if (err.message?.includes('Not authenticated')) {
        errorMessage = 'Your session has expired. Please log in again.';
      } else if (err.message?.includes('Forbidden') || err.message?.includes('403')) {
        errorMessage =
          'You do not have permission to perform this action. Admin privileges required.';
      } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }

      setError(errorMessage);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <div className="bg-slate-800 border border-red-500/50 rounded-lg p-6 hover:border-red-500/70 transition-colors">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 bg-red-500/30 rounded-lg p-3">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>

          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-300 mb-1">
              Clear All Client Data (Admin Only)
            </h3>
            <p className="text-xs text-red-400/80">
              Delete keimenon data for ALL client accounts. Admin data, user accounts, and settings
              will NOT be affected. Use with extreme caution!
            </p>
          </div>
        </div>

        {/* Success message */}
        {success && (
          <div className="mb-4 px-3 py-2 bg-green-600/10 border border-green-500/30 rounded text-xs text-green-300">
            {success}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-600/10 border border-red-500/30 rounded text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={() => setShowClearModal(true)}
          disabled={isClearing}
          className="w-full px-4 py-2.5 bg-red-700 hover:bg-red-800 disabled:bg-red-700/50 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isClearing && <Loader2 className="w-4 h-4 animate-spin" />}
          {isClearing ? 'Clearing All Client Data...' : 'Clear All Client Data'}
        </button>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleConfirmClear}
        variant="error"
        title="Clear ALL Client Keimenon Data?"
        message="This will permanently delete keimenon data for ALL client accounts. This action affects multiple users and cannot be undone. Admin data, user accounts, and all settings will remain intact."
        confirmText="Clear All Client Data"
        cancelText="Cancel"
        isProcessing={isClearing}
      />
    </>
  );
}
