/**
 * Import Job Stages Enum
 *
 * Shared enum used by both API and UI to represent granular stages
 * within an import job lifecycle. This ensures consistency between
 * backend processing stages and frontend progress display.
 *
 * Usage:
 * - Backend: Worker emits stage updates via SSE
 * - Frontend: UI displays current stage in progress indicator
 *
 * Related:
 * - apps/api/src/modules/workers/infrastructure/ImportWorker.ts
 * - apps/web/src/components/keimenon/ChatImportModal.tsx
 */

export enum ImportJobStage {
  /**
   * Parsing raw chat export files into structured data
   */
  PARSE = 'PARSE',

  /**
   * Normalizing data (timestamps, formats, etc.)
   */
  NORMALIZE = 'NORMALIZE',

  /**
   * Detecting duplicate conversations and messages
   */
  DEDUPE = 'DEDUPE',

  /**
   * Waiting for user decisions on duplicates/conflicts
   */
  AWAIT_DECISIONS = 'AWAIT_DECISIONS',

  /**
   * Applying user decisions (merge, skip, keep all)
   */
  APPLY_DECISIONS = 'APPLY_DECISIONS',

  /**
   * Writing data to database (materialization)
   */
  MATERIALIZE = 'MATERIALIZE',

  /**
   * Building search indexes and graph structures
   */
  INDEXING = 'INDEXING',

  /**
   * Import completed successfully
   */
  SUCCEEDED = 'SUCCEEDED',

  /**
   * Import failed with errors
   */
  FAILED = 'FAILED',

  /**
   * Import canceled by user
   */
  CANCELED = 'CANCELED',
}

/**
 * Map stage to human-readable label
 */
export const IMPORT_STAGE_LABELS: Record<ImportJobStage, string> = {
  [ImportJobStage.PARSE]: 'Parsing files',
  [ImportJobStage.NORMALIZE]: 'Normalizing data',
  [ImportJobStage.DEDUPE]: 'Detecting duplicates',
  [ImportJobStage.AWAIT_DECISIONS]: 'Awaiting decisions',
  [ImportJobStage.APPLY_DECISIONS]: 'Applying decisions',
  [ImportJobStage.MATERIALIZE]: 'Saving to database',
  [ImportJobStage.INDEXING]: 'Building indexes',
  [ImportJobStage.SUCCEEDED]: 'Completed',
  [ImportJobStage.FAILED]: 'Failed',
  [ImportJobStage.CANCELED]: 'Canceled',
};

/**
 * Get progress percentage for a given stage (0-100)
 * Used for visual progress indicators
 */
export function getStageProgress(stage: ImportJobStage): number {
  const stageOrder = [
    ImportJobStage.PARSE,
    ImportJobStage.NORMALIZE,
    ImportJobStage.DEDUPE,
    ImportJobStage.AWAIT_DECISIONS,
    ImportJobStage.APPLY_DECISIONS,
    ImportJobStage.MATERIALIZE,
    ImportJobStage.INDEXING,
    ImportJobStage.SUCCEEDED,
  ];

  const index = stageOrder.indexOf(stage);
  if (index === -1) return 0; // Failed/Canceled

  return Math.round(((index + 1) / stageOrder.length) * 100);
}

/**
 * Check if stage is terminal (no further stages expected)
 */
export function isTerminalStage(stage: ImportJobStage): boolean {
  return [ImportJobStage.SUCCEEDED, ImportJobStage.FAILED, ImportJobStage.CANCELED].includes(stage);
}
