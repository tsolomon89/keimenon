/**
 * Background Operations Context
 *
 * Manages minimized operations (imports, deletions, exports) that continue
 * running in the background after user minimizes their modal.
 *
 * Features:
 * - Global operation registry (Map<operationId, Operation>)
 * - Add/update/remove operations
 * - Restore operation panels in Inspector Bar
 * - Real-time progress updates via polling or SSE
 *
 * Integration:
 * - ImportFlowPanel minimizes → adds import operation
 * - DataManagementCard minimizes → adds deletion operation
 * - OperationsTableCard displays all operations
 * - Click row → restoreOperation() → re-opens panel
 */

'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useJobStream, type JobUpdate } from '@/hooks/useJobStream';

// Operation types
export type OperationType = 'import' | 'deletion' | 'export' | 'migration';

// Operation status (aligned with ImportStatus from ImportsTableCard)
export type OperationStatus =
  | 'queued'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'indexing'
  | 'linking'
  | 'processing' // Generic status for deletions/exports
  | 'done'
  | 'error';

// Operation definition
export interface Operation {
  id: string; // Unique operation ID (e.g., upload_123, del_456)
  type: OperationType;

  // Display info
  title: string; // e.g., "Importing conversations.json"
  description?: string;

  // File info (for imports)
  fileName?: string;
  fileType?: 'chat' | 'document' | 'mixed' | 'unknown';
  platform?: 'chatgpt' | 'claude' | 'gemini' | 'unknown';

  // Progress
  status: OperationStatus;
  progress: number; // 0-100

  // Timestamps
  startedAt: number;
  completedAt?: number;

  // Stats
  stats: Record<string, number>; // { nodesCreated, edgesCreated, sourcesCreated, etc. }

  // Error info
  error?: string;

  // State snapshot (for restore)
  state?: any; // Operation-specific state (e.g., ImportFlowPanel state)
}

// Context value
interface BackgroundOperationsContextValue {
  operations: Map<string, Operation>;

  // Add new operation
  addOperation: (operation: Operation) => void;

  // Update existing operation
  updateOperation: (id: string, updates: Partial<Operation>) => void;

  // Remove operation (when user dismisses or auto-cleanup after completion)
  removeOperation: (id: string) => void;

  // Remove multiple operations at once (for bulk delete)
  removeOperationsByJobIds: (jobIds: string[]) => void;

  // Restore operation panel in Inspector Bar
  restoreOperation: (id: string) => void;

  // Get operation by ID
  getOperation: (id: string) => Operation | undefined;

  // Get all operations as array
  getAllOperations: () => Operation[];

  // Get active operations (not done/error)
  getActiveOperations: () => Operation[];
}

const BackgroundOperationsContext = createContext<BackgroundOperationsContextValue | undefined>(
  undefined
);

const JOB_STATUS_TO_OPERATION_STATUS: Record<JobUpdate['status'], OperationStatus> = {
  queued: 'queued',
  running: 'processing',
  blocked: 'queued',
  succeeded: 'done',
  failed: 'error',
  canceled: 'error',
  deleted: 'done',
};

function jobTypeToOperationType(jobType: JobUpdate['type']): OperationType {
  switch (jobType) {
    case 'import':
      return 'import';
    case 'delete':
      return 'deletion';
    case 'export':
      return 'export';
    default:
      return 'migration';
  }
}

function deriveTitle(job: JobUpdate, existing?: Operation): string {
  if (existing?.title) return existing.title;
  if (job.type === 'import') {
    return job.config?.fileName ? `Importing ${job.config.fileName}` : 'Import job';
  }
  if (job.type === 'delete') {
    return job.config?.deleteScope === 'all-clients'
      ? 'Clearing all client data'
      : 'Clearing canvas data';
  }
  if (job.type === 'export') {
    return 'Export job';
  }
  return `Job ${job.jobId}`;
}

function deriveDescription(job: JobUpdate, existing?: Operation): string | undefined {
  if (existing?.description) return existing.description;
  if (job.type === 'import' && job.config?.fileName) {
    return job.config.fileName;
  }
  if (job.type === 'delete') {
    return job.config?.deleteScope === 'all-clients'
      ? 'Deleting canvas data for all client accounts'
      : 'Deleting canvas data for this account';
  }
  return existing?.description;
}

function operationsEqual(a: Operation, b: Operation): boolean {
  return (
    a.status === b.status &&
    a.progress === b.progress &&
    a.error === b.error &&
    a.completedAt === b.completedAt &&
    a.title === b.title &&
    a.description === b.description &&
    a.fileName === b.fileName &&
    a.startedAt === b.startedAt
  );
}

function mergeJobIntoOperation(job: JobUpdate, existing?: Operation): Operation {
  const status = JOB_STATUS_TO_OPERATION_STATUS[job.status] ?? 'processing';
  const progressPercent = Number.isFinite(job.progress?.percent)
    ? Math.max(0, Math.min(100, Math.round(job.progress.percent)))
    : (existing?.progress ?? 0);

  const completedAt =
    status === 'done' || status === 'error'
      ? (existing?.completedAt ?? Date.now())
      : existing?.completedAt;

  const errorMessage =
    status === 'error'
      ? job.progress?.message ||
        existing?.error ||
        (job.status === 'canceled' ? 'Job canceled' : 'Job failed')
      : undefined;

  return {
    id: job.jobId,
    type: existing?.type ?? jobTypeToOperationType(job.type),
    title: deriveTitle(job, existing),
    description: deriveDescription(job, existing),
    fileName: existing?.fileName ?? job.config?.fileName,
    fileType: existing?.fileType,
    platform: existing?.platform,
    status,
    progress: progressPercent,
    startedAt: existing?.startedAt ?? Date.now(),
    completedAt,
    stats: existing?.stats ?? {},
    error: errorMessage,
    state: existing?.state,
  };
}

interface BackgroundOperationsProviderProps {
  children: ReactNode;
  onRestoreOperation?: (operation: Operation) => void; // Callback to parent to re-open panel
}

export function BackgroundOperationsProvider({
  children,
  onRestoreOperation,
}: BackgroundOperationsProviderProps) {
  const [operations, setOperations] = useState<Map<string, Operation>>(new Map());
  const { jobs } = useJobStream();

  useEffect(() => {
    if (jobs.size === 0) {
      return;
    }

    setOperations((prev) => {
      let changed = false;
      const next = new Map(prev);

      jobs.forEach((job) => {
        const existing = next.get(job.jobId);
        const merged = mergeJobIntoOperation(job, existing);

        if (!existing || !operationsEqual(existing, merged)) {
          next.set(job.jobId, merged);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [jobs]);

  // Add new operation
  const addOperation = useCallback((operation: Operation) => {
    setOperations((prev) => {
      const next = new Map(prev);
      next.set(operation.id, operation);
      console.log('[BackgroundOperations] Added operation:', operation.id, operation.title);
      return next;
    });
  }, []);

  // Update existing operation
  const updateOperation = useCallback((id: string, updates: Partial<Operation>) => {
    setOperations((prev) => {
      const existing = prev.get(id);
      if (!existing) {
        console.warn('[BackgroundOperations] Operation not found:', id);
        return prev;
      }

      const next = new Map(prev);
      next.set(id, { ...existing, ...updates });
      return next;
    });
  }, []);

  // Remove operation
  const removeOperation = useCallback((id: string) => {
    setOperations((prev) => {
      const next = new Map(prev);
      next.delete(id);
      console.log('[BackgroundOperations] Removed operation:', id);
      return next;
    });
  }, []);

  // Remove multiple operations at once (for bulk delete)
  const removeOperationsByJobIds = useCallback((jobIds: string[]) => {
    setOperations((prev) => {
      const next = new Map(prev);
      let removed = 0;
      jobIds.forEach((jobId) => {
        if (next.delete(jobId)) {
          removed++;
        }
      });
      if (removed > 0) {
        console.log(`[BackgroundOperations] Removed ${removed} operation(s):`, jobIds);
      }
      return removed > 0 ? next : prev;
    });
  }, []);

  // Restore operation panel
  const restoreOperation = useCallback(
    (id: string) => {
      const operation = operations.get(id);
      if (!operation) {
        console.warn('[BackgroundOperations] Cannot restore - operation not found:', id);
        return;
      }

      console.log('[BackgroundOperations] Restoring operation:', id, operation.title);

      // Call parent callback to re-open panel
      if (onRestoreOperation) {
        onRestoreOperation(operation);
      }
    },
    [operations, onRestoreOperation]
  );

  // Get operation by ID
  const getOperation = useCallback(
    (id: string) => {
      return operations.get(id);
    },
    [operations]
  );

  // Get all operations as array
  const getAllOperations = useCallback(() => {
    return Array.from(operations.values());
  }, [operations]);

  // Get active operations
  const getActiveOperations = useCallback(() => {
    return Array.from(operations.values()).filter((op) => !['done', 'error'].includes(op.status));
  }, [operations]);

  // Auto-cleanup completed operations after 15 seconds (faster than before)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setOperations((prev) => {
        const next = new Map(prev);
        let removed = 0;

        for (const [id, operation] of next.entries()) {
          // Remove completed operations older than 15 seconds (reduced from 30s)
          if (
            operation.status === 'done' &&
            operation.completedAt &&
            now - operation.completedAt > 15000
          ) {
            next.delete(id);
            removed++;
          }
        }

        if (removed > 0) {
          console.log('[BackgroundOperations] Auto-cleaned', removed, 'completed operations');
        }

        return removed > 0 ? next : prev;
      });
    }, 3000); // Check every 3 seconds (faster polling)

    return () => clearInterval(interval);
  }, []);

  const value: BackgroundOperationsContextValue = {
    operations,
    addOperation,
    updateOperation,
    removeOperation,
    removeOperationsByJobIds,
    restoreOperation,
    getOperation,
    getAllOperations,
    getActiveOperations,
  };

  return (
    <BackgroundOperationsContext.Provider value={value}>
      {children}
    </BackgroundOperationsContext.Provider>
  );
}

/**
 * Hook to access background operations context
 */
export function useBackgroundOperations() {
  const context = useContext(BackgroundOperationsContext);
  if (!context) {
    throw new Error('useBackgroundOperations must be used within BackgroundOperationsProvider');
  }
  return context;
}

/**
 * Hook to get a specific operation by ID
 */
export function useOperation(id: string | null) {
  const { getOperation } = useBackgroundOperations();
  return id ? getOperation(id) : undefined;
}

/**
 * Hook to get all active operations
 */
export function useActiveOperations() {
  const { getActiveOperations } = useBackgroundOperations();
  return getActiveOperations();
}

/**
 * Hook to get SSE connection status for debugging
 *
 * Returns the real-time connection status from useJobStream.
 * Useful for showing connection health indicators in the UI.
 *
 * @returns {Object} { connected: boolean, error: Error | null }
 * @example
 * const { connected, error } = useSSEConnectionStatus();
 * if (!connected) {
 *   return <div>⚠️ Real-time updates disconnected. Reconnecting...</div>
 * }
 */
export function useSSEConnectionStatus() {
  const { connected, error } = useJobStream();
  return { connected, error };
}
