/**
 * Canonical Service
 * 
 * Implements "Evidence-Based Canonicalization" logic.
 * Calculates an "Evidence Score" to determine the canonical node among duplicates.
 * 
 * Formula:
 * Score = 0.5 * log(freq) 
 *       + 0.3 * log(blob_diversity) 
 *       + 0.1 * (role_variety / 3) 
 *       + 0.05 * log(temporal_span)
 *       + 0.05 * log(modality_count)
 */

export interface EvidenceMetrics {
  frequency: number;          // How often it appears across all imports
  blobDiversity: number;      // Number of distinct source blobs (files)
  roleVariety: number;        // Count of roles (user, assistant, system)
  temporalSpan: number;       // Time (ms) between first and last occurrence
  modalityCount: number;      // Types of content (text, code, image, etc.)
}

export class CanonicalService {
  /**
   * Calculate Evidence Score
   * Returns a score between 0 and ~Infinity (though realistically < 10)
   */
  calculateEvidenceScore(metrics: EvidenceMetrics): number {
    // Avoid log(0)
    const freqScore = 0.5 * Math.log(Math.max(1, metrics.frequency));
    const diversityScore = 0.3 * Math.log(Math.max(1, metrics.blobDiversity));
    
    // Normalize role variety (max usually 3: user, assistant, system)
    const roleScore = 0.1 * (Math.min(3, metrics.roleVariety) / 3);
    
    // Log of temporal span in hours? Let's use hours to keep scale reasonable
    // temporalSpan is in ms. 1 hour = 3600000 ms
    const hours = Math.max(1, metrics.temporalSpan / 3600000);
    const timeScore = 0.05 * Math.log(hours);
    
    const modalityScore = 0.05 * Math.log(Math.max(1, metrics.modalityCount));
    
    return freqScore + diversityScore + roleScore + timeScore + modalityScore;
  }

  /**
   * Determine the Canonical Node from a set of candidates
   * @param nodes Array of nodes with their metrics
   * @returns The node ID of the winner, or null if empty
   */
  pickCanonical(nodes: { id: string; metrics: EvidenceMetrics }[]): string | null {
    if (nodes.length === 0) return null;
    if (nodes.length === 1) return nodes[0].id;

    let bestNode = nodes[0];
    let maxScore = -1;

    for (const node of nodes) {
      const score = this.calculateEvidenceScore(node.metrics);
      
      // Tie-breaking: Prefer smaller NodeKey (lexicographically) for stability
      if (score > maxScore) {
        maxScore = score;
        bestNode = node;
      } else if (score === maxScore) {
        if (node.id < bestNode.id) {
          bestNode = node;
        }
      }
    }

    return bestNode.id;
  }
}
