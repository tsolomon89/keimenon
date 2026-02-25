# Sources Mode — User Controls & Export Options (v0.3 addendum)

**Purpose:** Close the gaps you flagged: make **duplication policy**, **role selection**, **minimum length filters**, and **preserve‑chat vs stitched** outputs explicit for both **text** and **code**. This addendum extends _Base Use Case — Chat Sources Import (Colab v8 Plan)_ without changing its spine.

---

## 1) Non‑destructive guarantee

- **No AI rewriting during import.** Grouping, stitching, and dedupe are algorithmic (hash/Jaccard). Content is exported **verbatim**. Any LLM use later occurs via Archetype nodes, not here.
- Always keep a raw, per‑chat transcript export under `default/` as ground truth.

---

## 2) New user‑facing options (Import Wizard)

**Step 1 — What to include**

- **Roles**: `User only` · `Assistant only` · `Both`
- **Minimum length** (per role): sliders `min_user_chars`, `min_assistant_chars`
- **Segment unit**: `Message` (default) · `Consecutive messages` (collapse runs by same role)

**Step 2 — How to group**

- **Stitching strategy**:
  - `By title/topic` (default — the current seed/attach logic)
  - `By chat` (one source per conversation; preserve original order)
  - `By chat × role` (two sources per conversation when Both is selected)
- **Preserve chat integrity inside stitched sources**: keep messages from the same chat together when attaching; on.
- **Interleave roles when Both**: show USER/ASSISTANT chronologically with role labels; off defaults to USER then ASSISTANT sections.

**Step 3 — Duplicate policy**

- **Across‑source attach mode**:
  - `Non‑unique` (a segment may appear in multiple sources)
  - `Unique` (each segment is assigned to the single best source)
- **Within‑source dedupe**: always on (exact hash + near‑dup by Jaccard).
- **Review dupes on import**: open a panel listing candidates for human decision (approve/ignore/merge).

**Step 4 — Code export**

- **Export assistant code blocks**: on/off
- **Global code dedupe**: on (by content hash + language)
- **Keep one file per snippet** or **Append to per‑chat file**
- **Mirror duplicate policy** (unique vs non‑unique placement in keyword/code folders)

**Step 5 — Output layout**

- **Sources output mode**:
  - `Stitched sources` (topic/title buckets)
  - `Per chat`
  - `Per chat × role`
- **File format**: md · txt · json (md default for sources)

> All options persist per‑workspace and can be templated by Admin in **RuntimeManifest**.

---

## 3) Config keys (backed by UI)

```python
CONFIG.update({
  # Roles & thresholds
  "sources_role_subset": "user",     # "user" | "assistant" | "both"
  "sources_min_chars_user": 400,
  "sources_min_chars_assistant": 400,
  "sources_segment_unit": "message", # "message" | "consecutive",

  # Grouping & layout
  "sources_stitch_strategy": "by_title",  # "by_title" | "by_chat" | "by_chat_role"
  "sources_preserve_chat_integrity": True,
  "sources_interleave_roles": False,

  # Duplication policy
  "sources_attach_mode": "non-unique", # "non-unique" | "unique"
  "similarity_threshold": 0.35,         # existing (applies to attach & near-dup)
  "global_text_dedupe": True,           # prevent the same segment landing twice within a source; optional global blocklist
  "review_dupes_on_import": True,       # emit review CSV + UI panel

  # Code export
  "export_code": True,                  # existing
  "code_global_dedupe": True,           # hash-based snippet dedupe across convos
  "code_append_mode": "per_snippet",   # "per_snippet" | "per_chat"

  # Output modes
  "sources_output_mode": "stitched",    # "stitched" | "per_chat" | "per_chat_role"
  "sources_export_format": "md"         # md | txt | json
})
```

> Backwards‑compatible: defaults reproduce current v8 behavior (user‑only, by‑title stitching, non‑unique attach, md).

---

## 4) Algorithm adjustments (concise)

1. **Role filtering** in `extract_segments()`:
   - Include messages according to `sources_role_subset`.
   - Apply role‑specific minimum lengths.
   - Respect `sources_segment_unit` (collapse consecutive same‑role messages).

2. **Stitching**:
   - `by_title`: current seed→attach pipeline.
   - `by_chat`: each conversation becomes exactly one source doc.
   - `by_chat_role`: per conversation × role when Both.

3. **Attach mode**:
   - `non-unique`: a segment may attach to multiple seeds meeting `similarity_threshold`.
   - `unique`: pick the single best seed (highest score; tie‑break by title size, then timestamp).

4. **Dedup**:
   - **Within source**: exact (sha256 of normalized text) → drop; near‑dup by Jaccard (keep longer).
   - **Global (optional)**: keep a run‑cache of `content_hash` and skip re‑emitting if already written to the same output family.

5. **Rendering** (when Both):
   - If `sources_interleave_roles=True`, order by timestamp and prefix `### 👤 User` / `### 🤖 Assistant`.
   - Else, two sections: `## User` then `## Assistant`.

6. **Preserve chat integrity**:
   - When `True`, segments from a chat remain contiguous within any stitched source; provenance lists message index ranges.

---

## 5) New artifacts & review files

- `/meta/duplicates_suggested.csv`\
  Columns: `segment_id, role, char_len, source_candidates[], best_score, decision{pending|approved|rejected}, chosen_source`.
- `/meta/code_index.csv`\
  Columns: `code_hash, language, ext, first_seen_in, occurrences, files_written[]`.
- (Existing) `/meta/sources_index.csv`, `/meta/segments_index.csv` gain fields: `role_subset, stitch_strategy, attach_mode`.

**Import review panel** (RHS overlay): shows duplicate suggestions with quick actions (Approve → assign, Reject → keep separate, Merge → move to canonical).

---

## 6) Pseudocode diffs (where to touch)

- `SourcesBuilder.extract_segments`: add role filters, per‑role thresholds, segment unit, assistant handling when Both.
- `SourcesBuilder.build_sources`:
  - Branch on `sources_stitch_strategy`.
  - Enforce `sources_attach_mode` (unique vs non‑unique).
  - Track `preserve_chat_integrity` when appending.
- `SourcesBuilder._format_source_document`:
  - Role headers/interleave; unchanged content body; provenance now includes `role` and `idx_start–idx_end`.
- `ChatExporter.export_code_blocks`:
  - Honor `code_global_dedupe` using `sha256(code)`; write `code_index.csv`.
- **New** `DuplicateReviewWriter`: writes `/meta/duplicates_suggested.csv`; applies user decisions on re‑run.

---

## 7) Acceptance criteria (delta)

- Wizard exposes: role subset, per‑role min length, stitch strategy, attach mode, preserve‑chat toggle, interleave toggle, code dedupe.
- Running with defaults reproduces current outputs. Toggling `unique` changes cross‑source placement deterministically.
- `per_chat` mode emits one file per conversation (or per conversation × role) with intact chronology.
- `duplicates_suggested.csv` is produced when any candidate cross‑attach exists; applying decisions on re‑run changes assignment without content mutation.
- Code dedupe prevents identical snippets from being written twice; `code_index.csv` lists occurrences.

---

## 8) Admin presets (RuntimeManifest)

```json
{
  "import_defaults": {
    "sources_role_subset": "user",
    "sources_min_chars_user": 400,
    "sources_min_chars_assistant": 400,
    "sources_stitch_strategy": "by_title",
    "sources_attach_mode": "non-unique",
    "sources_preserve_chat_integrity": true,
    "sources_interleave_roles": false,
    "code_global_dedupe": true
  }
}
```

---

## 9) Notes on costs & tiers

- All features here are **offline/local** and safe for Free.
- Pro/Business do not change import behavior; they only add downstream Archetypes/Verifiers.

---

## 10) Open items

- Optional **per‑role** Jaccard thresholds? (e.g., higher bar for assistant text).
- Heuristic to collapse quoted replies when building segments.
- Fast path for huge chats: cap segments per chat before stitching.
