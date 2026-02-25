# Chat Import & Export — Spec (v0.2)

**Purpose.** Define the user‑configurable import/export surface for AI‑chat JSON (ChatGPT/Claude/Gemini/etc.) as it enters **Keimenon**. This extends the old Colab v8 pipeline from "export‑only" to **import‑into‑graph**, while preserving offline/Free‑tier guarantees and the “no AI edits to user content” rule.

**Non‑goals.** No LLM rewriting, summarizing, or semantic clustering during import by default. Models may **suggest** duplicates/aliases only when the user opts in; content written to Sources remains verbatim.

---

## 0) Vocabulary (aligns with Living Spec)

- **Source** (file/url/code), **Message**, **ChatThread**, **Group**, **Folder**, **Constellation** (collapsed cluster), **ObjectiveClaim**, **UnifiedDoc**.
- **Edges**: `CONTAINS`, `DERIVES_FROM`, `EQUIVALENT_TO|DUP_OF`, `IN_SCOPE_FOR`, `SEQUESTERS`.

---

## 1) Inputs

- Paths: `/<input_root>/**` JSON/JSONL (optionally zipped outside the app).
- Mixed platforms; BOM/encoding handled; large files stream when possible.
- Optional sidecars: `alias_map.csv`, `review_sources.csv` (if present from prior runs).

---

## 2) Pipeline (deterministic, offline by default)

1. **Autodetect → Parse → Normalize**
   - Parsers: `chatgpt(mapping|messages)`, `claude`, `gemini`, `unknown(generic walker)`.
   - Preserve `role, content, timestamp, index, attachments`.
2. **Fingerprint**
   - Message hash, code‑block AST hash, content‑address for Sources; URL canonicalization.
3. **Export (optional)**
   - Per‑chat transcripts, code blocks, keyword groups.
4. **Import → Graph**
   - Create nodes (Source/Message/ChatThread). Link with edges.
   - Autogroup (rule‑based) and build **Constellations** for dense clusters.
5. **Sources Mode (optional)**
   - Stitch long user (or assistant) segments into ≤ `sources_cap` Markdown files with provenance.
6. **Review stage (user‑driven)**
   - Dedupe suggestions, alias suggestions, merge/rename proposals (**no changes applied without approval**).

---

## 3) Config surface (user‑visible)

> Defaults are **Free‑tier safe**; Admin may publish workspace defaults via RuntimeManifest.

### 3.1 General

```json
{
  "input_root": "/content/input_data",
  "output_root": "/content/chat_exports",
  "dry_run": false,
  "verbose": true,
  "import_mode": "both" // "import_only" | "export_only" | "both"
}
```

### 3.2 Export modes

```json
{
  "subset": "both", // "both" | "user" | "assistant"
  "format": "md", // "md" | "txt" | "json"
  "export_code": true,
  "code_only": false,
  "keyword_grouping": {
    "keywords": [], // ["python","api",...]
    "groups": "non-unique", // "non-unique" | "unique"
    "aggregate_files": false // write keyword_{kw}.md
  }
}
```

**Code export options**

```json
{
  "code_min_chars": 50, // ignore tiny inlines
  "infer_extensions": true, // map language tags → ext
  "group_code_by_lang": false
}
```

### 3.3 Sources Mode (stitching)

```json
{
  "build_sources": true,
  "sources_cap": 150,
  "sources_subset": "user", // NEW: "user" | "assistant" | "both"
  "min_segment_chars": 400, // previously min_user_chars
  "include_assistant_context": false,
  "similarity_threshold": 0.35, // Jaccard attach/near-dup
  "segment_consecutive": true, // merge consecutive same-role msgs
  "chunk_long_messages": 0, // 0 = off; else max chars per chunk
  "unique_across_sources": false, // NEW: if true, a segment can belong to only one source
  "preserve_chat_cohesion": false // NEW: keep thread segments together in one file when possible
}
```

### 3.4 Dedupe & review (applies to export + import)

```json
{
  "dedupe": {
    "exact_on_hash": true,
    "near_dup_jaccard": 0.9,
    "review_dupes_on_import": true, // surface a Review panel
    "apply_changes_automatically": false
  },
  "aliases": {
    "alias_map_path": "meta/alias_map.csv",
    "suggest_aliases": true, // write review_aliases.csv
    "require_user_approval": true
  }
}
```

### 3.5 Privacy / Plan guards (summary)

```json
{
  "client_side_llm_allowed": true, // BYO only; Free/Pro default true
  "hosted_llm_allowed": false, // Pro/Business enable
  "limits": { "max_file_mb": 10, "max_sources": 500 }
}
```

---

## 4) Behavior details & invariants

- **No AI rewriting** during import/export. Any model usage for duplicate **identification** is suggestion‑only and gated by plan/policy.
- **Unique vs Non‑unique in Sources Mode**
  - `unique_across_sources=false` (default): segments may attach to multiple stitched sources (useful for overlapping themes).
  - `unique_across_sources=true`: first match wins; later matches skipped → listed in `segments_index.csv` with `skipped_due_to_uniqueness=true`.
- **Subset control** everywhere
  - Transcripts, keyword groups, and Sources Mode all respect `subset`/`sources_subset` and thresholds (`min_segment_chars`).
- **Cohesion**
  - If `preserve_chat_cohesion=true`, keep a conversation’s segments together unless the similarity score to another seed exceeds `similarity_threshold+δ` (δ=0.1), then prompt in Review.
- **Determinism**
  - Given the same inputs and config, the import/export is reproducible; hashes and seeds written to meta for audits.

---

## 5) Import → Graph mapping (what gets created)

**Nodes**

- `ChatThread{id,title,platform,created_at}`
- `Message{thread_id,role,content,timestamp,index,hash}`
- `Source{kind:'ChatExport'|'Code'|'Doc', path/hash, mime, title}`
- Optional `Constellation{members[], metric, collapsed:true}` when cluster density is high.

**Edges**

- `CONTAINS` ChatThread→Message; Group→{Source|Message|Folder}
- `DERIVES_FROM` Source(Code)→Message (span hints)
- `EQUIVALENT_TO|DUP_OF` between Messages/Sources (score, canonical flag)
- `IN_SCOPE_FOR` {Group|Source}→ChatThread (proposed; user approves)
- `SEQUESTERS` Folder/Group→Node (policy chips)

**Grouping rules (MVP)**

- Heuristics: title shards + token overlap + file path / URL domain; never call models by default.
- Constellations: stable cluster IDs from `(metric, seed)`; expand on zoom/tap.

---

## 6) UI flows (pointer‑first)

**/ingest (Import)**

1. Drop files → parse log in Console.
2. Autogroup proposal appears (LHS tree + Board tiles).
3. **Review Duplicates** drawer (RHS):
   - Tabs: _Exact_, _Near‑dup_, _Aliases_. Actions: Merge, Canonicalize, Ignore, Defer.
   - "AI assist" toggle (Pro+): rank candidates only; never auto‑merge.
4. Apply → graph updates (PR‑style diff); receipts stored.

**Board (2D lens)**

- Groups as stack‑tiles; constellations collapse; selection stacks in RHS.
- Sources Mode outputs visible as **UnifiedDoc[L0 seed]** candidates or plain Source docs (per setting).

**Export**

- Toolbar: Transcripts • Code • Keyword • Sources. Each respects `subset` and dedupe rules. Download ZIP or save to Drive.

---

## 7) Files & metadata (for audits)

```
/<output_root>/
  default/                   # transcripts
  code_exports/              # code blocks
  keyword_{kw}/              # grouped copies (+ optional aggregate)
  sources/                   # stitched sources (MD)
  meta/
    sources_index.csv
    segments_index.csv
    alias_map.csv?           # optional
    review_aliases.csv?      # suggestions
    run_receipt.json         # seed, thresholds, versions, plan gates
```

---

## 8) Acceptance checklist (this feature)

- User can set **unique vs non‑unique** policy for Sources Mode.
- User can pick **subset** (`user|assistant|both`) for transcripts **and** Sources Mode, with a **min length** threshold.
- User can choose to **preserve chat cohesion** in stitched sources.
- Import writes verbatim content to graph; any AI is **suggestion‑only** and opt‑in.
- Review drawer exists; no merges/aliases applied without approval.
- Deterministic re‑runs (same config → same outputs); provenance CSVs present.

---

## 9) Plan gating (quick view)

- **Free**: offline parser, 2D lens, autogroup heuristics, Sources Mode, dedupe review (manual). BYO key allowed client‑side for later use, but **not** used during import by default.
- **Pro**: enables AI‑assisted ranking in Review, Galaxy lens; higher caps.
- **Business**: adds org nodes, workflows, email/CRM; import can tag to BusinessNode.

---

## 10) Open items

- Exact defaults for `min_segment_chars` per plan.
- Whether Sources Mode outputs should optionally materialize as **UnifiedDoc L0** immediately.
- JSONL attachment extraction patterns per platform (Slack/Teams adapters).

**Status:** Ready to wire into the existing Colab v8 codebase and the platform’s Ingest & Board screens.
