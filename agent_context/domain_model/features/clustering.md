# Feature: Clustering Engine

> **Invariant**: Clustering is **non-destructive**. Duplicate instances are treated as **evidence** that reinforces a cluster, rather than trash to be deleted.

## The J+MD Surface
The engine operates on a dual-surface representation of content:
- **`raw_text`**: The verbatim original (for display/provenance).
- **`md`**: Normalized Markdown (for similarity computation).
    - Whitespace normalized.
    - HTML entities decoded.
    - "Islands" (Code/Math) extracted for modality-specific matching.

## Policy-Driven Logic
No hard-coded constants. All behavior is defined in `policy.yaml`.
- **Thresholds**: `attach` (auto-merge) vs `review` (human queue) vs `reject`.
- **Weights**: Balance `frequency`, `diversity`, `role`, `modality`, and `coherence`.

## Data Flow
1.  **Candidate Generation**: LSH (Locality Sensitive Hashing) finds potential matches in O(1).
2.  **Scoring**: Compute Jaccard/Cosine similarity against candidates.
3.  **Decision**:
    - **Score >= Attach**: Create `NEAR_DUP` edge.
    - **Review <= Score < Attach**: Send to Review Queue.
    - **Score < Review**: Create new Singleton Cluster.

## Gray-Band Decisions
The system explicitly handles ambiguity via the **Review Queue**.
- **Gray Band**: The score range where the machine is uncertain.
- **Action**: Human operator confirms or rejects the cluster attachment.
