# Import & No‑AI‑Mutate Spec (v0.1)

**Purpose.** Lift the **Colab v8** behavior into the new platform while preserving the core invariant: **imports never modify content with AI**. Grouping, sorting, deduping, and code extraction are **deterministic** and auditible. LLMs may **suggest** potential duplicates/clusters but cannot alter text or execute merges without explicit user approval.

---

## 1) Contract: “Real data in, same data out”

- **No AI transforms at import.** No paraphrase, rewrite, autoclean, or formatting changes to user/assistant text.
- **Verbatim storage.** We store raw message text, timestamps, indices, and a `content_hash` (sha256 of normalized text) for integrity.
- **Deterministic grouping.** Default grouping uses heuristics (title normalization, Jaccard overlap, keyword hits). Results are reversible.
- **LLM role (optional, Pro+):** _Suggest_ duplicates/aliases/merges; write a **SuggestionSet** artifact. The graph remains unchanged until the user approves a **Graph PR**.

---

## 2) Mapping Colab v8 → Platform

| v8 Feature                               | Platform Node/Edge/Flow                                    | Notes                                                                   |
| ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Per‑chat transcripts → `/default/`       | `Source` nodes with `HAS_MESSAGE` edges to `Message` nodes | Renderers produce md/txt/json on demand; no mutation.                   |
| Assistant code blocks → `/code_exports/` | `CodeAsset` nodes; `DERIVED_FROM` → `Message`              | Language ext preserved; filename collision logic carried over.          |
| Keyword groups                           | `Group` nodes; `CONTAINS` edges (non‑unique by default)    | UI toggles **unique vs non‑unique**.                                    |
| Sources Mode (≤150 user docs)            | `SourceDoc` (stitched) nodes; `COMPILED_FROM` → `Message`  | User‑only segments; chronology; optional `assistant_context` as quotes. |
| Title buckets + Jaccard attach           | `GroupHeuristicRun` artifact (deterministic)               | Params recorded: `min_user_chars`, `similarity_threshold`.              |
| Dedup within source                      | `DEDUPE_RUN` artifact; keeps longer of near‑dups           | Exact hash + Jaccard ≥ θ.                                               |
| JSON/JSONL, BOM, streaming               | `ImportJob` runner with same fallbacks                     | `ijson` optional; graceful fallback retained.                           |

---

## 3) Import pipeline (deterministic, no AI)

1. **Read**: JSON/JSONL; detect encoding; stream when ≥1GB (if `ijson` available).
2. **Parse**: platform‑specific fallbacks (ChatGPT `mapping`/`messages[]`, Claude, Gemini, generic safe walker). Skip `system`.
3. **Normalize**: `Message{role, content, timestamp, index}`, `Conversation{platform, title, created_at}`.
4. **Heuristic grouping**:
   - **Title buckets** (`.strip().casefold()` + mild de‑noising).
   - **Seed selection** by total user chars per normalized title (cap = `sources_cap`).
   - **Greedy attach** leftover segments by **Jaccard** ≥ `similarity_threshold` (non‑unique allowed).
5. **Dedup**: exact hash + near‑dup Jaccard; keep longer; record a `DedupeReport`.
6. **Stitch**: build **SourceDoc** (user‑only). Sort by earliest timestamp; append **Provenance** table.
7. **Indexes**: write `sources_index` and `segments_index` equivalents in graph and (optionally) export CSV.

---

## 4) Review‑on‑Import UI (user control)

- **Triage table** (RHS drawer or full‑width overlay):
  - Rows = proposed **SourceDocs** (seeds) + **candidates** (overflow beyond cap).
  - Columns: `title`, `n_segments`, `n_chars`, `provenance_count`, preview, badges (hash dedup %, overlap %, collisions).
  - Actions per row: **Open**, **Merge into…**, **Split**, **Exclude**, **Sequester**.
- **Segment view**: side‑by‑side with raw messages; checkbox include/exclude; provenance hover shows `conversation_id`, `msg_idx`, `timestamp`.
- **Commit**: creates a **Graph PR** with adds/merges; user can **Apply** or **Discard**.
- **Policy toggles**: `min_user_chars`, `similarity_threshold`, cap slider, **unique vs non‑unique** group membership.

---

## 5) LLM Suggestions (off by default; Pro+)

- **When enabled**: run an **Archetype(dedupe_suggester)** over the _metadata only_ (titles, hashes, term sets) **or** over hashed, truncated previews—never full content for Free.
- **Artifacts**: `SuggestionSet{ type: duplicate|alias|merge|rename, confidence, evidence }` attached to Groups/SourceDocs.
- **UX**: suggestions render as chips; clicking turns them into proposed edits within the Graph PR; nothing applies automatically.

---

## 6) Config → UI mapping

| Colab `CONFIG` key          | Platform control                              | Default (Free) |
| --------------------------- | --------------------------------------------- | -------------- |
| `subset`                    | Export format picker for per‑chat transcripts | `both`         |
| `format`                    | Transcript renderer (md/txt/json)             | `md`           |
| `export_code`               | “Extract assistant code” switch               | `On`           |
| `keywords`                  | LHS quick‑filter; bulk add/remove keywords    | `[]`           |
| `groups`                    | Unique vs non‑unique membership               | `non‑unique`   |
| `build_sources`             | “Build Sources” action in Import Review       | `On`           |
| `sources_cap`               | Cap slider                                    | `150`          |
| `include_assistant_context` | “Quote nearby assistant” toggle               | `Off`          |
| `min_user_chars`            | Numeric field                                 | `400`          |
| `similarity_threshold`      | Slider (0–1)                                  | `0.35`         |
| `code_only`                 | “Code‑only run” action                        | `Off`          |
| `aggregate_keyword_files`   | “Write keyword aggregates”                    | `Off`          |

Admin can pin workspace defaults; Pro/Business can raise caps.

---

## 7) Data model additions

```json
// Message (verbatim)
{"id":"msg_*","role":"user|assistant","content":"…","timestamp":"…","index":12,
 "hash":"sha256:…","conversation_id":"conv_*"}

// SourceDoc (stitched user text)
{"id":"srcdoc_*","title":"…","n_segments":13,"n_chars":4210,
 "compiled_from":["msg_*"],"provenance":[{"conversation_id":"…","msg_idx":[3,7],"ts_min":"…","ts_max":"…"}]}

// CodeAsset
{"id":"code_*","language":"python","ext":"py","derived_from":"msg_*","hash":"sha256:…"}

// Reports (audit)
{"id":"run_*","kind":"GroupHeuristicRun|DedupeReport","params":{…},"stats":{…}}
```

---

## 8) Integrity, provenance, idempotency

- All text nodes carry a `hash`; stitching never edits segment content.
- Re‑imports are **idempotent**: dedup by `conversation_id + message_index + hash`.
- Provenance tables are regenerated; graph keeps lineage edges.

---

## 9) Extended sorting options (still deterministic)

- **Keyword groups** remain (unique/non‑unique) with optional **single‑file aggregates**.
- **Alias map** (optional): `alias → canonical` applied to labels only; does **not** touch stored text.
- **Title normalization** remains mild (whitespace, case, date/number stripping); raw titles preserved.

---

## 10) Tiering & privacy fit

- **Free:** deterministic pipeline only; all local; LLM suggestions **off**; content stays on device.
- **Pro:** optional LLM suggestions with receipts; still suggestion‑only; approvals required.
- **Business:** same + batch automations post‑import (e.g., file issues for missing provenance); still no auto‑mutation of content.

---

## 11) Open items / decisions

- Should we expose **segment chunking** for very long user messages (default OFF)?
- Per‑workspace **default cap** for Sources (150 vs configurable hard ceiling)?
- Add a **review‑on‑import zip** (like Colab) for quick export of the proposed Sources before committing?

---

**Status:** Ready to merge into the main spec. Aligns with the current canvas (Free/Pro/Business), preserves the no‑AI‑mutate invariant, and cleanly lifts every v8 capability into nodes/edges and UI flows.
