'use client';

import { useState, useEffect } from 'react';
import {
  Database,
  TrendingDown,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useBackgroundOperations,
  type OperationType,
  type OperationStatus,
} from '@/contexts/BackgroundOperationsContext';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';
import { errorCapture } from '@/services/error-capture.service';
import { logJobEvent } from '@/lib/error-handler';
import { API_BASE_URL } from '@/lib/env.config';

interface DeduplicationStats {
  totalNodes: number;
  uniqueContent: number;
  duplicates: number;
  spaceSaved: number;
  efficiency: number;
}

/**
 * DeduplicationCard Component
 *
 * Displays content deduplication statistics and controls for the current account.
 *
 * Features:
 * - Real-time deduplication statistics
 * - Space savings visualization
 * - Manual refresh capability
 * - Merge duplicates action
 * - Visual progress indicators
 *
 * @see docs/architecture/ARCHITECTURE_CONTRACT.md
 * @see docs/architecture/CANONICALIZATION.md
 */
export function DeduplicationCard() {
  const { user } = useAuth();
  const { addOperation, updateOperation, getOperation } = useBackgroundOperations();
  const [stats, setStats] = useState<DeduplicationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergingJobId, setMergingJobId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);

  // Fetch deduplication statistics
  const fetchStats = async () => {
    if (!user?.accountId) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('canvas_memory_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v1/deduplication/stats?accountId=${user.accountId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error('Failed to load stats:', err);

      // Capture error for structured logging
      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'database',
          operation: 'deduplication.loadStats',
          userId: user?.userId,
          accountId: user?.accountId,
          metadata: {
            component: 'DeduplicationCard',
            endpoint: '/api/v1/deduplication/stats',
          },
        },
        'error' // severity
      );

      setError(err.message || 'Failed to load deduplication stats');
    } finally {
      setLoading(false);
    }
  };

  // Load stats on mount
  useEffect(() => {
    fetchStats();
  }, [user?.accountId]);

  // Watch for merge completion and reload stats
  useEffect(() => {
    if (!mergingJobId) return;

    const checkInterval = setInterval(() => {
      const operation = getOperation(mergingJobId);

      if (operation?.status === 'done') {
        console.log('[DeduplicationCard] Merge complete, reloading stats...');
        clearInterval(checkInterval);

        // Show success message briefly before reload
        setSuccess('Duplicates merged successfully! Reloading...');

        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else if (operation?.status === 'error') {
        console.error('[DeduplicationCard] Merge failed:', operation);
        clearInterval(checkInterval);
        setError('Merge failed. Please check Background Operations for details.');
        setMerging(false);
        setMergingJobId(null);
      }
    }, 1000); // Check every second

    return () => clearInterval(checkInterval);
  }, [mergingJobId, getOperation]);

  // Trigger merge duplicates operation
  const handleMergeDuplicates = async () => {
    if (!user?.accountId) return;

    setShowMergeModal(false);

    setMerging(true);
    setError(null);
    setSuccess(null);

    // Generate operation ID
    const operationId = `dedup-merge-${Date.now()}`;
    setMergingJobId(operationId);

    // Log job start
    logJobEvent('dedup-merge', 'start', {
      accountId: user.accountId,
      userId: user.userId,
    });

    // Add to background operations
    addOperation({
      id: operationId,
      type: 'export' as OperationType, // Using 'export' as closest match for deduplication
      status: 'processing' as OperationStatus,
      title: 'Merging Duplicates',
      description: 'Merging duplicate nodes...',
      progress: 0,
      startedAt: Date.now(),
      stats: {
        duplicateCount: stats?.duplicates || 0,
      },
    });

    try {
      const token = localStorage.getItem('canvas_memory_token');
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/deduplication/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accountId: user.accountId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to merge duplicates');
      }

      const result = await response.json();

      // Log job success
      logJobEvent('dedup-merge', 'success', {
        accountId: user.accountId,
        mergedCount: result.mergedCount,
        edgesRelinked: result.edgesRelinked,
        duplicatesRemoved: result.duplicatesRemoved,
      });

      // Update background operation
      updateOperation(operationId, {
        status: 'done' as OperationStatus,
        description: `Merged ${result.mergedCount} duplicate groups`,
        progress: 100,
        completedAt: Date.now(),
        stats: {
          mergedCount: result.mergedCount,
          edgesRelinked: result.edgesRelinked,
          duplicatesRemoved: result.duplicatesRemoved,
        },
      });

      // Refresh stats after merge
      await fetchStats();
      setSuccess(`Successfully merged ${result.mergedCount} duplicate groups`);
    } catch (err: any) {
      console.error('Failed to merge duplicates:', err);

      // Log job failure
      logJobEvent('dedup-merge', 'error', {
        accountId: user.accountId,
        error: err.message,
      });

      // Capture error for structured logging
      const capturedError = errorCapture.capture(
        err,
        {
          domain: 'database',
          operation: 'deduplication.merge',
          userId: user?.userId,
          accountId: user?.accountId,
          metadata: {
            component: 'DeduplicationCard',
            endpoint: '/api/v1/deduplication/merge',
            duplicateCount: stats?.duplicates,
          },
        },
        'error' // severity
      );

      // Update background operation
      updateOperation(operationId, {
        status: 'error' as OperationStatus,
        description: `Merge failed: ${err.message}`,
        error: err.message,
        completedAt: Date.now(),
      });

      setError(err.message || 'Failed to merge duplicates');
      setMerging(false);
      setMergingJobId(null);
    }
  };

  // Format bytes to human-readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Calculate deduplication rate
  const deduplicationRate = stats
    ? stats.totalNodes > 0
      ? ((stats.duplicates / stats.totalNodes) * 100).toFixed(1)
      : '0.0'
    : '0.0';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Content Deduplication
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Automatic duplicate detection and space optimization
              </p>
            </div>
          </div>

          <button
            onClick={fetchStats}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-50"
            title="Refresh statistics"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {lastRefresh && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Success State */}
      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !stats && (
        <div className="p-12 text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading statistics...</p>
        </div>
      )}

      {/* Statistics Grid */}
      {stats && (
        <>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Nodes */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Total Nodes
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.totalNodes.toLocaleString()}
              </div>
            </div>

            {/* Unique Content */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
                Unique Content
              </div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-300">
                {stats.uniqueContent.toLocaleString()}
              </div>
            </div>

            {/* Duplicates */}
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                Duplicates
              </div>
              <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-300">
                {stats.duplicates.toLocaleString()}
                <span className="text-sm font-normal ml-2">({deduplicationRate}%)</span>
              </div>
            </div>

            {/* Space Saved */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1">
                <TrendingDown className="w-4 h-4" />
                Space Saved
              </div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-300">
                {formatBytes(stats.spaceSaved)}
              </div>
            </div>
          </div>

          {/* Visual Progress Bar */}
          <div className="px-6 pb-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Deduplication Efficiency</span>
                <span>{deduplicationRate}% duplicates detected</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, parseFloat(deduplicationRate))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowMergeModal(true)}
                disabled={merging || stats.duplicates === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {merging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Merge Duplicates ({stats.duplicates})
                  </>
                )}
              </button>

              {stats.duplicates === 0 && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">No duplicates found</span>
                </div>
              )}
            </div>

            {stats.duplicates > 0 && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Merging will consolidate duplicate nodes while preserving all relationships. This
                action cannot be undone.
              </p>
            )}
          </div>
        </>
      )}

      {/* Information Section */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/10">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">How it works</h3>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li>• Content is automatically hashed using SHA-256</li>
          <li>• Identical content is detected regardless of metadata</li>
          <li>• Duplicates are tracked but not automatically merged</li>
          <li>• Merging preserves all edges and relationships</li>
          <li>• All operations are reversible through version history</li>
        </ul>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        onConfirm={handleMergeDuplicates}
        variant="warning"
        title="Merge Duplicate Nodes?"
        message={`This will merge ${stats?.duplicates || 0} duplicate nodes into their original versions. All relationships will be preserved, but this action cannot be undone.`}
        details={
          stats
            ? `${stats.duplicates} duplicates found across ${stats.totalNodes} total nodes`
            : undefined
        }
        confirmText="Merge Duplicates"
        cancelText="Cancel"
        isProcessing={merging}
        onMinimize={merging ? () => setShowMergeModal(false) : undefined}
        minimizeText="Continue in Background"
      />
    </div>
  );
}
