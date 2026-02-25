/**
 * Import Review Service
 * 
 * Manages the "Graph PR" workflow:
 * 1. Tracks "proposed" changes (Candidates) from SourcesService/DuplicateDetection.
 * 2. Serves the "Triage Table" to the UI.
 * 3. Applies user decisions (Merge/Split/Exclude) to commit changes to the Graph.
 */

export interface CandidateSource {
  id: string;
  title: string;
  stats: {
    segmentCount: number;
    charCount: number;
    dupPercent: number;
  };
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  decision?: string; // Reason or target ID
}

export class ImportReviewService {
  private candidates: Map<string, CandidateSource> = new Map();

  /**
   * Add a candidate source for review
   */
  addCandidate(candidate: CandidateSource) {
    this.candidates.set(candidate.id, candidate);
  }

  /**
   * Get all candidates for the Triage Table
   */
  getCandidates(): CandidateSource[] {
    return Array.from(this.candidates.values());
  }

  /**
   * Apply a user decision
   */
  reviewCandidate(id: string, action: 'approve' | 'reject' | 'merge', targetId?: string) {
    const candidate = this.candidates.get(id);
    if (!candidate) return;

    candidate.status = action === 'merge' ? 'merged' : (action === 'approve' ? 'approved' : 'rejected');
    if (targetId) candidate.decision = targetId;
  }

  /**
   * Commit approved candidates to the Graph (Mock)
   */
  async commitToGraph() {
    const approved = this.getCandidates().filter(c => c.status === 'approved' || c.status === 'merged');
    console.log(`[ImportReview] Committing ${approved.length} sources to GraphDB...`);
    // In a real impl, this would call graphService.createNode(...)
    return approved.length;
  }

  /**
   * Clear review state
   */
  clear() {
    this.candidates.clear();
  }
}
