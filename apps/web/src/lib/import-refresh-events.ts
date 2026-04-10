export const IMPORT_GRAPH_REFRESH_EVENT = 'keimenon:import-graph-refresh';

export interface ImportGraphRefreshDetail {
  jobId?: string;
  reason?: 'sse_import_complete' | 'import_modal_complete' | 'duplicate_review_applied';
}

export function emitImportGraphRefresh(detail: ImportGraphRefreshDetail = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ImportGraphRefreshDetail>(IMPORT_GRAPH_REFRESH_EVENT, {
      detail,
    })
  );
}
