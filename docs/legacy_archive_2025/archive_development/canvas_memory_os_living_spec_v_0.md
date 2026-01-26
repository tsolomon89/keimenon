# Canvas Memory OS — Living Spec (v0.1)

**Status:** living draft • **Owner:** UserNode (you) • **Last updated:** 2025‑10‑06

## TL;DR

A graph‑native, canvas‑first **memory OS** for research and building. Everything is a **node**; relationships are **typed edges** with policy. Chats, sources, code, summaries, even _you_ live on the same board. Context for any answer is a **scope set** (algebra over nodes) with a **receipt** for reproducibility. Truth is pursued with **ObjectiveClaims** and **tool‑based verifiers**. Visualization uses **lenses** (2D/3D/nD/Galaxy) to reveal different geometries of “nearness.”

---

# 1) Product thesis

- Replace linear chats with a **versioned knowledge graph** you can see and control.
- **Edges are policy**: include/exclude (sequester), derive, verify, in‑scope, duplicate, supports/refutes.
- A **UserAgent** helps ingest, group, verify, and consolidate into **UnifiedDocs** (structured, cited docs of 5k–50k tokens).

# 2) Core principles (“canon”)

1. **Identity is sacred**: content‑addressed sources; bitemporal IDs (event‑time vs system‑time).
2. **Scopes, not vibes**: every model run references a concrete scope set; store a **scope receipt**.
3. **Verification is tool‑only**: LLMs orchestrate; tools produce evidence.
4. **Sequester is an edge policy**: hide from models/tools/UI independently without losing placement.
5. **Lenses morph space**: different metrics (semantic, provenance, verification) curve the canvas.

# 3) Object model (nodes)

- **Source**: url/file/code/audio/video with immutable fingerprint + provenance.
- **Message**: single utterance (user/assistant/system); anchors to extracted code/spans.
- **ChatThread**: conversation container with system preamble and participants.
- **Group**: named collection view over nodes (e.g., “API Docs”, “Repos”).
- **Folder**: a Group with stronger containment semantics; may be **sequestered**.
- **UserNode**: preferences, policies, goals; owns agents and approvals.
- **ObjectiveClaim**: normalized, testable statement with supports/refutes and **VerifierRuns**.
- **UnifiedDoc**: consolidated, machine‑parseable doc; rings L0→L3; citations required.
- **Agent**: autonomous worker with capabilities and budgets; submits graph diffs (PRs).
- **ScopeSet**: first‑class object representing the exact nodes/edges/policies used.
- **Receipt (Snapshot)**: serializable record to reproduce an answer or view.

# 4) Edge model (semantics)

- **CONTAINS**: Group→{Source|Message|ObjectiveClaim|UnifiedDoc|Folder}.
- **SEQUESTERS**: {Group|Folder}→Node with flags `{hidden_from_llm, hidden_from_tools, ui_only, reason, until}`.
- **DERIVES_FROM**: {Message|ObjectiveClaim|UnifiedDoc.section}→{Source|Message|ObjectiveClaim} (+ byte/line spans).
- **IN_SCOPE_FOR**: {Group|Folder|Source}→ChatThread (rank + policy chips).
- **EQUIVALENT_TO / DUP_OF**: symmetric, with score and canonical.
- **SUPPORTS / REFUTES**: claim↔claim argument edges.
- **VERIFIED_BY**: claim→VerifierRun (pass/fail/inconclusive + artifacts + expiry).
- **ASSOCIATED_WITH_USER**: anything→UserNode (intent/tags/permissions).
- **PROMOTES_TO_GROUP / FOLDS_INTO_FOLDER**: lineage when restructuring.

**Invariants**

- Sources dedup by fingerprint + canonical URL rules.
- UnifiedDocs cannot exist without DERIVES_FROM citations.
- Sequester is **edge‑level**; same node can be visible in one scope and hidden in another.

# 5) Ingest & autogroup (with AI‑chat JSON parser)

**Input**: exports from ChatGPT/Claude/others, plus files/URLs.

**Pipeline**

1. **Fingerprint**: content hash; URL canonicalization; mime sniffing.
2. **Parse chats**: messages → Message nodes; preserve role, time, attachments; extract **code blocks** as Source(Code) with AST hashes.
3. **Topic cluster**: embeddings + rules → provisional Groups (e.g., “Stripe API”, “Benchmarks”).
4. **Duplicate map**: EQUIVALENT_TO across messages/sources; choose canonical by provenance/authority.
5. **Code extraction**: collect repeated snippets into a **Code Snippets** Group; link DERIVES_FROM back to messages and docs.
6. **Policy proposal**: mark noisy/low‑trust nodes **sequestered** by default; queue for approval.
7. **Chat scope wiring**: propose IN_SCOPE_FOR edges to each ChatThread; user approves.

# 6) Sequestering

- Reasons: `secret`, `noisy`, `untrusted`, `license`, `work‑in‑progress`.
- Permissions: `{model_permit, tool_permit}`; optional **redacted‑execute** (tools can act on sealed artifacts).
- UI: sequestered items show as **nebulae**; content masked; toggles per node/folder.

# 7) Scope algebra & receipts

- Operators: `∪` union, `∩` intersection, `\` difference, `⊕` symmetric difference.
- Selection kernel: lasso → temporary ScopeSet with stored ranker + lens.
- **Receipt** schema:

```json
{
  "board": "id",
  "scope_nodes": ["n1", "n2", "..."],
  "policy": { "exclude_sequestered": true },
  "lens": { "metric": "provenance", "seed": 113 },
  "ranker": { "order": ["policy", "citation", "freshness", "authority", "embedding"] },
  "model": "gpt-4.x | claude-x",
  "timestamp": 1730833200
}
```

# 8) Lenses & modes (views)

- **2D**: sources + groups; low‑detail; clean lines.
- **3D**: adds top‑level ObjectiveClaims.
- **nD**: collapses by definitional kernels (e.g., tokens like “τ”, “:=”, “the”) to reveal reuse.
- **Galaxy**: space warped by the **trust tensor** (verifiability, provenance depth, consensus, recency, stability, authority). Brightness = centrality×trust; halo = staleness.
- **Sepia light mode**: paper texture; dark “stars”; minimal particles until zoom.

# 9) ObjectiveClaims & verification

**Claim** fields: `claim_text, type, supports[], contradicts[], verifications[], status{unverified|verified|contested|stale}, confidence[0..1]`.

**VerifierRun kinds**: `HTTP_CHECK, SCHEMA_MATCH, EXAMPLE_CALL, COMPUTATION, UNIT_TEST, REPRO_NOTEBOOK, PROOF_ASSISTANT`.

**Rules**

- LLM outputs never mark a claim verified.
- Claims have **half‑life**; stale claims surface in UI and galaxy halos.

# 10) UnifiedDocs (consolidations)

- Rings: **L0** bullet ledger of atomic facts; **L1** stitched exposition; **L2** examples/tests; **L3** narrative.
- Every paragraph in L1–L3 locks to a subset of claims; changes stripe the paragraph until reconciled.
- Push‑update respects sequester and records a diff in the doc’s **change log**.

# 11) UserAgent (autonomy)

- Capabilities: gather (propose sources), link (propose edges), verify (schedule verifiers), consolidate (refresh docs), refactor (promote/demote groups/folders).
- Objective score per group: `evidence_density, provenance_depth, reproducibility, consensus, recency` → single badge.
- Governance: quotas; PR‑style graph diffs; no silent edits.

# 12) UI/UX behaviors

- **Board** center with nodes; **left** minimal nav (Boards, Groups); **right** details panel (collapsible).
- Scope chips show token estimate, include/exclude toggles.
- Context menus: Open • Preview • Copy hash • Sequester • Add to Scope • Derive claim.
- Galaxy controls: Lens selector, Warp overlay (Provenance / Verification / Semantic), Causal cones on hover.
- Mobile: card stacks; tap to expand node; long‑press to toggle sequester.

# 13) Performance & stability

- Stable layout seeds; nodes morph across lenses instead of jumping.
- WebGL LOD; edge sampling; incremental community detection.
- CRDT/commit log for collaborative edits; deterministic downsampling prioritizing high‑trust, high‑centrality nodes.

# 14) Security & privacy

- Sequester edges with explicit reason and expiry.
- Redacted‑execute for secrets; tools attest capability without revealing content.
- Audit trail on every verify/run/scope change.

# 15) API outline (sketch)

- `GET /boards` • `GET /chats?board_id=` • `POST /conversation` (with `scope_id` or inline receipt) • `POST /ingest` • `POST /autogroup` • `POST /claims/extract` • `POST /verify/run` • `POST /docs/compose` • `POST /scope` (build algebraically) • `POST /sequester` • `POST /graph/diff` (agent PR).

# 16) Example thin slice: “Stripe refunds”

1. Ingest docs (API refs, blog posts), repo, 2 chats, transcript.
2. Autogroup → Groups: API Docs, Repos, Chats, Code Snippets, Benchmarks.
3. Extract 20 claims; verify 8 via mocked HTTP + schema checks; 4 stale.
4. Compose **UnifiedDoc** (L0/L1 ~7k tokens) with citations; store receipt.
5. Galaxy lens: verification warp; watch halos shrink after refresh.

# 17) Glossary

- **Kernel**: irreducible definitional node (e.g., symbol “τ”, operator “:=”).
- **ScopeSet**: concrete, reproducible context for a run.
- **Receipt**: serialized scope + lens + ranker used by a run.
- **Sequester**: edge policy hiding content from model/tools/UI as configured.

# 18) Open questions

- How to assign default half‑life per claim type across domains?
- Minimum artifact standard for proof‑assistant verifiers?
- Multi‑board cross‑scope receipts—portable or pinned to board IDs?
- License handling for proprietary docs inside UnifiedDocs (quote vs paraphrase).

# 19) Changelog

- **v0.1 (2025‑10‑06):** initial living spec from canvas conversation; integrated AI‑chat‑JSON parser assumptions (message→node, code extraction, dedupe, autogroup).
