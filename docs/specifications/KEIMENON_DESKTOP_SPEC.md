# Keimenon Desktop App Tech Spec

## 1) Elevator pitch

**Keimenon is a desktop knowledge workspace for turning AI exports and AI-generated “data request” dumps into a navigable personal graph.** It’s installed once as a desktop app with a web-grade interface (React/WebGL), but all heavy work runs locally: parsing, chunking, indexing, graph building, and agent workflows (BYOK or local models). The cloud is only for login, licensing, billing, and account entitlements—no cloud compute required.

---

## 2) Goals and non-goals

### Goals

- **Single install = full product**: the EXE contains UI + engine + local storage.
- **Local compute by default**: imports, parsing, jobs, search/indexing, graph transforms run on-device.
- **Thin cloud**: authentication, account records, licensing/plan entitlements, billing, update delivery metadata.
- **BYOK AI**: user supplies their own provider keys (or uses local models); Keimenon is not a token middleman.
- **Robust ingestion**: “AI JSON combo parser” handles messy, mixed-format exports and AI “data request” responses.
- **Auditability + safety**: automation/agents propose changes; the app commits changes deterministically with an audit trail.
- **Future-ready tenancy**: even personal accounts behave like single-tenant; business org/workspace scaffolding exists without requiring realtime collaboration now.

### Non-goals (initial)

- No realtime collaboration / websockets.
- No mandatory cloud sync of user content.
- No server-side parsing or embedding pipelines.
- No promise that “teams share boards live” in v1 (only entitlement + structure groundwork).

---

## 3) Product shape and user workflow

### 3.1 Acquisition and activation

1. User visits `keimenon.com` → **Download App**.
2. Installs and launches Keimenon.
3. App prompts **Create account / Log in**.
4. Auth flow happens via a browser-based provider flow; on success user returns to app.
5. App stores session + entitlements locally (offline-tolerant).

### 3.2 Core value workflow

6. User imports data via:
   - AI platform exports (ChatGPT, Claude, etc.)
   - AI “data request” responses (structured dumps produced by asking the model for JSON + attachments)

7. Import runs as staged jobs: ingest → parse → normalize → graphify → index → verify.
8. User explores:
   - timeline/thread views
   - graph view (concepts, entities, links)
   - boards/collections (curated subgraphs)
   - search across messages/materials/entities

### 3.3 Optional AI workflows (BYOK/local)

9. User configures AI provider key(s) or selects local model.
10. Agents operate on local graph/materials to:

- summarize
- tag/classify
- extract entities/relationships
- propose merges/dedup links
- generate boards/views

11. Agent actions produce **proposals**; user can review/apply; app commits with audit trail.

---

## 4) Architecture overview

### 4.1 Components

- **Desktop App Shell**
  - Chromium-based window hosting the UI
  - Bundled local engine runtime

- **UI (React/WebGL)**
  - graph visualization, boards, timelines
  - job status + logs
  - settings (account, BYOK keys, import)

- **Local Engine**
  - storage layer (local DBs)
  - ingestion pipeline (AI JSON combo parser)
  - job runner + scheduler
  - search/indexing
  - agent orchestration + governance (proposal/commit)

- **Cloud Control Plane (thin)**
  - auth + account
  - licensing/entitlements + billing
  - update metadata (and download hosting)

### 4.2 Data residency contract

- **Default**: user content stays local.
- **Cloud stores**: identity + billing + entitlement flags + minimal telemetry (opt-in).
- **AI providers**: only receive data when user explicitly runs AI features; keys are user-supplied.

---

## 5) Local data layer

### 5.1 Storage partitioning (conceptual)

Use separate local stores to avoid lock contention and keep UI responsive:

- **Content Store**: canonical graph state (nodes/edges/materials)
- **Search Store**: full-text indices + derived indices (and optional embeddings)
- **Ops Store**: jobs, job events, proposals, commits, audit log

### 5.2 Core schema (conceptual)

#### Node

Represents any entity: message, thread, person, concept, board, tag, file, project.

- `id` (stable)
- `kind` (enum)
- `title` (optional)
- `data` (structured payload)
- `created_at`, `updated_at`
- `source` (provenance pointer)

#### Edge

Typed relationship between nodes.

- `id`
- `type` (enum)
- `src_id`, `dst_id`
- `props` (optional: confidence, role, timestamps)
- `source` (provenance pointer)

#### Material

Large content blobs and artifacts.

- `id`
- `mime/type`
- `uri/path` (local)
- `text` (optional extracted)
- `meta` (hash, size, export source, timestamps)
- `source`

#### Job

Long-running operation with stages.

- `id`
- `kind` (import, parse, index, agent_run, etc.)
- `status` (queued/running/paused/failed/done)
- `stage` (string)
- `progress` (0–1 + counters)
- `payload` (input refs)
- `error` (if any)
- `started_at`, `finished_at`

#### Proposal

A suggested change set (typically from agents/automation).

- `id`
- `author` (user/agent)
- `targets` (node/edge/material refs)
- `patch` (structured change description)
- `status` (open/applied/rejected)
- `created_at`

#### Commit / Audit Event

An applied change record.

- `id`
- `actor`
- `applied_proposals[]`
- `diff summary`
- `timestamp`

**Invariant:** agents do not directly mutate canonical graph; they produce proposals; app applies commits deterministically.

---

## 6) AI JSON Combo Parser subsystem (ingestion core)

### 6.1 Purpose

Turn messy real-world exports and AI-generated “data request” outputs into a clean intermediate representation, preserving provenance, and feeding the graph builder.

### 6.2 Inputs supported (initial set)

- Platform exports (JSON/HTML/MD variations)
- “AI data request” responses that may include:
  - JSON blocks embedded in markdown
  - multiple JSON objects/arrays in one file
  - partial/truncated JSON
  - mixed content: text + code fences + tables
  - referenced attachments

### 6.3 Output (Normalized Intermediate Representation, “NIR”)

A canonical format used by graphify/index steps:

- `conversations[]`
  - `conversation_id`
  - `messages[]` with:
    - `message_id` (stable derived key)
    - `author` (user/assistant/system)
    - `timestamp`
    - `content_blocks[]` (text/code/image refs)
    - `citations/links[]`
    - `metadata` (model, tool calls, etc. if available)

- `materials[]` (attachments, raw files, extracted text)
- `provenance` (file hashes, source type, parse warnings, offsets)

### 6.4 Parser pipeline stages

1. **Detect format(s)**: recognize export type(s) and mixed content markers.
2. **Extract JSON candidates**: scan for JSON blocks, code fences, inline objects.
3. **Recover/repair** (best-effort): handle trailing commas, truncated arrays, concatenated objects.
4. **Validate + normalize**: map to NIR; emit structured warnings.
5. **Chunking strategy**:
   - stable chunk IDs based on provenance + offsets
   - chunk boundaries by message/turn/section
   - preserve original ordering + cross refs

6. **Provenance tagging**:
   - every normalized item links back to source file + offset + hash

### 6.5 Failure modes (must be productized)

- Partial imports still usable (show “parse warnings” panel)
- Unparsed segments stored as Materials for later re-parse
- Deterministic re-run: same input yields same IDs and structure

---

## 7) Jobs, orchestration, and performance requirements

### 7.1 Job system requirements

- Staged execution with checkpoints
- Pause/resume/cancel
- UI-visible progress and logs
- Crash-safe: recover on relaunch and continue or roll back cleanly

### 7.2 Performance targets (initial)

- UI remains interactive during imports/indexing
- Large imports handled without single giant transaction
- Incremental indexing rather than full rebuild where possible

---

## 8) Cloud control plane spec (thin)

### 8.1 Responsibilities

- User accounts + auth provider integration
- Plans/billing
- License entitlements returned to app
- Download/update metadata
- Org/workspace records (for business accounts), even if collaboration isn’t live

### 8.2 Offline tolerance

- App caches entitlements + session for a grace period
- If license can’t be checked temporarily, user can still access local data

---

## 9) Security and privacy requirements

- Local user content never uploaded by default.
- BYOK keys stored locally with OS-level secure storage where possible.
- Explicit disclosure: what leaves the machine and when (AI calls only on user action).
- Redaction controls for sending subsets to AI providers.

---

## 10) Release slices

### v0 (internal)

- App shell + local stores
- Basic import with parser warnings
- Basic graphify + search
- Basic boards/views

### v1 (paid personal)

- Auth/licensing/billing
- AI JSON combo parser hardened + deterministic IDs
- Job system: pause/resume
- BYOK AI: summarize/tag/extract entities (proposal → commit)

### v1.x (business scaffolding)

- Org/workspaces + memberships + entitlements in cloud
- Local policy enforcement (who can see what)
- “Shared spaces” as a concept (without realtime sync)

---

If you want this to be immediately usable by an implementation agent/team, the next step is turning sections **5–7** into an “Acceptance Criteria” checklist (exact job stages, exact NIR fields, exact UI screens/states). This spec is the correct top-layer contract; the checklist is the thing that prevents “we built a UI demo” from masquerading as “we built Keimenon.”

[1]: https://chatgpt.com/c/6971f34f-9edc-838d-92f6-d091e2888dfe 'Chrome Extension for AI Chats'
[2]: https://chatgpt.com/c/69777afa-ca84-8330-8e49-fad8b11c1bf0 'Elevator Pitch Request'
[3]: https://chatgpt.com/c/68f1ed29-d294-8327-aace-9868128d35a8 'Local-first app explanation'
[4]: https://chatgpt.com/c/6964dac5-57cc-832d-a8dd-d5db71ef79a5 'Graph DB Tool Naming'
[5]: https://chatgpt.com/c/68c500c1-b4c8-8330-89d0-406361011981 'Export chat data'
[6]: https://chatgpt.com/c/68ffc626-af50-832e-aaaa-20903d3ce7ab 'Project overview and goals'
[7]: https://chatgpt.com/c/68ea9c03-9d9c-8327-8634-da1d4d64191e 'Project overview summary'
[8]: https://chatgpt.com/c/68cd1360-18ac-832d-8bf2-a4aba9ca1d21 'Script evaluation and features'
[9]: https://chatgpt.com/c/68e2b64f-b838-8326-840f-fa897c772dbd 'Poppy AI features overview'
