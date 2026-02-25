# Base Use Case — Chat Sources Import (Colab v8 Plan)

**Scope:** Summarize the minimal, local‑first pipeline that ingests exported AI chat JSON (ChatGPT, Claude, Gemini, etc.), normalizes it, and emits: per‑chat transcripts, assistant code blocks, keyword groups, and a new **Sources Mode** (≤150 stitched user‑text documents with provenance). This reflects the old Colab project, refined for the Keimenon MVP.

**Compatibility:** Designed to slot into **Free tier** constraints (local, no server costs). Pro/Business integrations are optional extensions (defer). No material conflicts with current plans; see **Conflicts & Notes** at the end.

---

## 1) Inputs & assumptions

- One or many JSON/JSONL export files under `/<input_root>/` (Colab: `/content/input_data/**`).
- Mixed platforms: ChatGPT
  - **Legacy** `mapping` format.
  - **New** `messages[]` format (`author.role` or `role`, `content.parts` or `text`, skip `system`).
- Claude, Gemini, and unknown/other (generic safe fallback walker).
- BOM/encoding handling; large files may require streaming.

**Identifiers captured per message:** `conversation_id`, `platform`, `role`, `timestamp`, `index`, `title`, `content`, attachments.

---

## 2) Existing outputs (keep intact)

- **Per‑chat transcripts** → `/<output_root>/default/` (both/user/assistant variants).
- **Assistant code blocks** → `/<output_root>/code_exports/` with language‑aware extensions.
- **Keyword groups** → `/<output_root>/keyword_{kw}/` (copy or aggregate; see §5).

---

## 3) New primary output — **Sources Mode** (≤150 user docs)

**Goal:** Produce at most **150** stitched Markdown sources composed of **user** messages only (assistant context optional). These become the primary artifacts for downstream grouping and POR docs.

**Directories**

- `/<output_root>/sources/` — the Markdown sources.
- `/<output_root>/meta/` — CSV indexes (`sources_index.csv`, `segments_index.csv`, optionally `review_sources.csv`, `alias_map.csv`, `review_aliases.csv`).

**Filename scheme**

- `"<canonical_title> - <YYYYMMDD_HHMMSS_if_available>.md"`.
- If no timestamp is known, omit the date; on collisions append `-<sha8>`.

**Algorithm (KISS, no ML)**

1. **Collect user segments:**
   - A segment = one user message or consecutive user messages.
   - Keep if `len(text) ≥ CONFIG["min_user_chars"]`.
   - Record provenance: `conversation_id`, `message_idx (or range)`, `timestamp(s)`, `original_title`.
2. **Title buckets:** normalize titles via `.strip().casefold()`; concatenate user segments per title; compute total characters.
3. **Seed selection:** choose up to `sources_cap` titles with highest total user characters as **seeds**.
4. **Greedy attach (non‑unique allowed):** for every remaining segment, compute **Jaccard token overlap** vs each seed’s current text; if any ≥ `similarity_threshold`, attach to that seed.
5. **Deduplicate within each source:**
   - Exact dedup by `sha256` of normalized text.
   - Near‑dup dedup via Jaccard ≥ threshold (keep longer variant).
6. **Chronological order:** sort segments in each source by earliest timestamp.
7. **Render Markdown:**
   - `# <canonical_title>`
   - Body contains stitched user segments.
   - If `include_assistant_context=True`, include 1–2 nearby assistant snippets as `> blockquotes` around segments.
   - `## Provenance` table: `conversation_id, message_idx, timestamp(s), original_title`.

**Indexes**

- `sources_index.csv`: `source_id, canonical_title, n_segments, n_chars, created_ts_min, created_ts_max, provenance_count, is_candidate(false for exported; true for overflow)`.
- `segments_index.csv`: `source_id, conversation_id, message_idx_start, message_idx_end, chars, ts_min, ts_max`.
- _(Optional advanced)_ `review_sources.csv` and `alias_map.csv` support aliasing/canonicalization of terms and manual merge/rename; see **Extended option §7**.

---

## 4) Minimal config additions (keep existing keys untouched)

```python
CONFIG.update({
  "build_sources": True,            # toggle Sources Mode
  "sources_cap": 150,               # hard cap
  "include_assistant_context": False,  # add brief assistant quotes as blockquotes
  "min_user_chars": 400,            # threshold for “extended” user segments
  "similarity_threshold": 0.35,     # Jaccard overlap for attach/near-dup
  # Optional toggles that must default OFF
  "code_only": False,               # if True, export only code blocks
  "aggregate_keyword_files": False  # also write keyword_{kw}/keyword_{kw}.md
})
```

---

## 5) Plumbing changes (surgical)

1. ``must **return**`(all*conversations, platform_counts)` \_after* it finishes current exporting and printing.
   ```python
   return all_conversations, platform_counts
   ```
2. **New cell: **``
   - Implements §3 algorithm.
   - Writes `/sources/` and `/meta/` outputs.
   - Prints a brief report: exported count, cap, candidates, average size, example titles.
3. **Check Output cell** also lists:
   - count of `/sources/` files,
   - presence/sizes of `/meta/sources_index.csv` and `/meta/segments_index.csv`.
4. **Summary print** (after build):
   ```python
   print(f"Sources exported: {num_sources}  (cap={CONFIG['sources_cap']})")
   print(f"Sources dir: {Path(CONFIG['output_root']) / 'sources'}")
   ```

---

## 6) Utilities needed in the new cell

- `tokenize(text) -> set[str]` via regex split on non‑word chars (lowercased).
- `jaccard(a_set, b_set) -> float`.
- filename sanitizer (reuse existing exporter helper if present).

---

## 7) Extended options (optional, degrade gracefully)

These are **additive** and **off by default**.

**A) Keyword single‑file aggregates**

- For each `keyword_*` folder, write a chrono‑ordered `keyword_{kw}.md` with a small provenance footer.

**B) Term maps & alias canon**

- Per‑source term maps (top terms + detected aliases) rendered in Markdown.
- Global `alias_map.csv` with columns: `alias, canonical`. If absent, write `review_aliases.csv` suggestions; on re‑run, apply accepted rows.

**C) Optional semantic boost (embeddings)**

- Config keys (default OFF):
  ```python
  CONFIG.update({
    "build_embeddings": False,
    "embed_unit": "conversation",      # or "message"
    "chunk_tokens": 0,                   # 0 = off
    "chunk_overlap": 0,
    "similarity_cutoff": 0.75,
    "duplicate_cutoff": 0.97,
    "neighbors_per_theme": 200,
    "augment_keyword_groups": False,
  })
  ```
- If enabled and deps present, use `sentence-transformers/all-MiniLM-L6-v2` + FAISS or NumPy cosine; otherwise noop.

---

## 8) Robustness & bug‑fixes to apply while here

- **ChatGPT new format fallback:** In `ChatGPTParser.parse`, if `mapping` yields no messages, parse `messages[]` (`author.role` or `role`, `content.parts` or `text`); skip `system`.
- **Large‑file streaming:** In `load_json_file`, for files ≥1GB try real streaming with ``(top‑level arrays). If import/stream fails or not an array, fall back to regular`json.load` with decoding safeguards.
- **JSONL support:** if extension `.jsonl`, read line by line and `json.loads` each line.
- **Code fence regex (non‑greedy, language tags):**
  ````python
  CODE_FENCE_RE = re.compile(r"```([a-zA-Z0-9_+\-\.]*)\n(.*?)```", re.DOTALL)
  ````
- **Language extensions:** store **without leading dot**.
- **Basename slicing bug:** in `export_code_blocks`, pass the clean basename to `_generate_unique_filename` (do not slice `[:-4]`).
- **Unknown platform default:** In `UniversalChatParser.parse`, do not always default to Claude; use detected parser or a generic safe walker; on failure, return `unknown` cleanly.

---

## 9) Acceptance criteria

1. Default run produces everything v7 did **plus**:
   - `/<output_root>/sources/` with **≤ **`` Markdown files, and
   - `/<output_root>/meta/sources_index.csv` and `segments_index.csv`.
2. Each source contains only **user** text (unless `include_assistant_context=True`) and ends with a provenance section.
3. Dedup works: repeated passages do not appear twice within a source.
4. If potential themes > cap, only `sources_cap` are written; overflow rows appear in `sources_index.csv` with `is_candidate=True`.
5. Keyword grouping remains; if `aggregate_keyword_files=True`, emit single aggregated Markdown per keyword.
6. Large files take the streaming path when possible; `.jsonl` loads line‑wise; ChatGPT `messages[]` parsed.
7. Summary/Check cells report counts for `/sources/` and `/meta/*`.

---

## 10) Non‑goals for v8

- No full semantic clustering by default (embeddings OFF).
- No model calls; runs offline unless the user provides keys explicitly for other tasks.
- No UI overhaul; keep Colab flow and file structure.

---

## 11) Example folder layout (Colab)

```
/content/
  input_data/
  chat_exports/
    default/
    code_exports/
    keyword_math/
    keyword_api/
    sources/
    meta/
```

---

## 12) Conflicts & notes relative to platform plans

- **Local‑first alignment:** This plan is exactly the Free‑tier spirit (no server costs, optional BYO keys). Outputs map directly onto the **Group** + **Source** nodes in Keimenon, and sources can feed the **Subjective→Objective lane** later.
- ``** dependency:** not stdlib. Treat as **optional**; wrap import in `try/except`and fall back to`json.load`. This preserves the “no heavy deps” rule by default.
- **Embeddings (optional):** allowed only when user opts in and deps exist. Defaults keep costs and complexity near zero.
- **Future fit:** Pro tier can replace title‑bucket seeding with archetype‑assisted clustering and receipts; Business tier is unaffected.

---

**Owner:** UserNode • **Status:** Ready to hand to a coding session as "v7 → v8 KISS" upgrade.
