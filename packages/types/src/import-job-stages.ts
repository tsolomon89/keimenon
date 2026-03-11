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
   * Canonical conversation reconstruction before materialization
   */
  CANONICALIZE = 'CANONICALIZE',

  /**
   * Extracting addressable spans from source/message content
   */
  SPAN_EXTRACT = 'SPAN_EXTRACT',

  /**
   * Building mandatory atomic substrate (char + trigram)
   */
  ATOMIC_EXTRACT = 'ATOMIC_EXTRACT',

  /**
   * Deriving repeated packet fragments from spans
   */
  PACKET_DERIVE = 'PACKET_DERIVE',

  /**
   * Computing deterministic packet mass scores
   */
  MASS_SCORE = 'MASS_SCORE',

  /**
   * Wiring cross-layer graph links (span ↔ packet ↔ atomic)
   */
  LAYER_LINK = 'LAYER_LINK',

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
   * Queue async objective/archetype build task
   */
  OBJECTIVE_QUEUE = 'OBJECTIVE_QUEUE',

  /**
   * Extract candidate claims for objective build
   */
  OBJECTIVE_EXTRACT = 'OBJECTIVE_EXTRACT',

  /**
   * Verify extracted claims with tool adapters
   */
  OBJECTIVE_VERIFY = 'OBJECTIVE_VERIFY',

  /**
   * Publish objective/archetype nodes
   */
  OBJECTIVE_PUBLISH = 'OBJECTIVE_PUBLISH',

  /**
   * Objective/archetype async build finished
   */
  OBJECTIVE_DONE = 'OBJECTIVE_DONE',

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
  [ImportJobStage.CANONICALIZE]: 'Reconstructing conversations',
  [ImportJobStage.SPAN_EXTRACT]: 'Extracting spans',
  [ImportJobStage.ATOMIC_EXTRACT]: 'Building atomic layer',
  [ImportJobStage.PACKET_DERIVE]: 'Deriving packets',
  [ImportJobStage.MASS_SCORE]: 'Scoring packet mass',
  [ImportJobStage.LAYER_LINK]: 'Linking graph layers',
  [ImportJobStage.DEDUPE]: 'Detecting duplicates',
  [ImportJobStage.AWAIT_DECISIONS]: 'Awaiting decisions',
  [ImportJobStage.APPLY_DECISIONS]: 'Applying decisions',
  [ImportJobStage.MATERIALIZE]: 'Saving to database',
  [ImportJobStage.INDEXING]: 'Building indexes',
  [ImportJobStage.OBJECTIVE_QUEUE]: 'Queueing objective build',
  [ImportJobStage.OBJECTIVE_EXTRACT]: 'Extracting objective claims',
  [ImportJobStage.OBJECTIVE_VERIFY]: 'Verifying objective claims',
  [ImportJobStage.OBJECTIVE_PUBLISH]: 'Publishing objective layer',
  [ImportJobStage.OBJECTIVE_DONE]: 'Objective layer complete',
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
    ImportJobStage.CANONICALIZE,
    ImportJobStage.NORMALIZE,
    ImportJobStage.SPAN_EXTRACT,
    ImportJobStage.ATOMIC_EXTRACT,
    ImportJobStage.PACKET_DERIVE,
    ImportJobStage.MASS_SCORE,
    ImportJobStage.LAYER_LINK,
    ImportJobStage.DEDUPE,
    ImportJobStage.AWAIT_DECISIONS,
    ImportJobStage.APPLY_DECISIONS,
    ImportJobStage.MATERIALIZE,
    ImportJobStage.INDEXING,
    ImportJobStage.OBJECTIVE_QUEUE,
    ImportJobStage.OBJECTIVE_EXTRACT,
    ImportJobStage.OBJECTIVE_VERIFY,
    ImportJobStage.OBJECTIVE_PUBLISH,
    ImportJobStage.OBJECTIVE_DONE,
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
