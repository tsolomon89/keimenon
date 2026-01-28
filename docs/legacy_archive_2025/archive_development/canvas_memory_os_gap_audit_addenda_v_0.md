# Keimenon — Gap Audit & Addenda (v0.2)

**Purpose:** Fill omissions from chat + extend the v0.1 spec without changing its spine.

---

## A) What was missing (from our chat)

1. **Composite/constellation nodes** (“a point is many”): aggregated, zoom‑to‑reveal bundles.
2. **Chat↔Chat linking** and chat personas, plus **board‑level vs chat‑level memory**.
3. **Subjectivity index** alongside objectivity, with agent behavior driven by both.
4. **Model hub & gating**: per‑scope/edge model allow‑lists and cost budgets.
5. **Provenance‑of‑provenance** (“source has sources”) and chain attestation.
6. **Consolidation + garbage collection**: ephemeral/scratch nodes, compaction rules.
7. **Cross‑board references** (graph‑of‑graphs) and receipts that travel across boards.
8. **Scope query language** (algebra + query ops) for deterministic scoping.
9. **Import adapters** for the AI‑chat JSON parser (tool‑specific quirks).
10. **License/rights policies** as first‑class constraints on sequester/citations.
11. **Token budgeting knobs** for UnifiedDocs and retrieval.
12. **Proof/verification deep‑hooks** (Lean/Coq) and reproducible compute artifacts.
13. **UI: Mass‑Effect‑style star nav (sepia/light)** with LOD and minimal particles.

---

## B) Addenda to the model

### B1) Composite / Constellation Nodes

- **Constellation**: `{kind:'Constellation', id, members:[NodeID], centroid, metric, collapsed:true}`
- Behaviors: shows as a single star with count; expands on zoom or tap; inherits dominant type color; carries min/max trust metrics of members.
- **Aggregation rules**: stable by `(cluster_id, metric, seed)`; never merge across sequester boundaries.

### B2) Chat Linking & Memory Tiers

- **Edges**: `LINKS_TO_CHAT: ChatThread↔ChatThread` (purpose: handoff, cite, co‑author).
- **Persona** on ChatThread: `{name, system_preamble, tools, model, memory_policy}`.
- **Memory tiers**: `board_memory` (global), `chat_memory` (local), `turn_memory` (ephemeral); scope receipts pin which tier was active.
- **Chat‑scope union**: live selection ∪ default IN_SCOPE_FOR; user can “freeze” a chat to a fixed receipt for reproducibility.

### B3) Subjectivity Index

- Per node and group:
  - `subjectivity = f(opinion_ratio, unsupported_ratio, ambiguity, author_bias, narrative_density)` in [0,1].
  - Display as cool/warm hue overlay; agents prioritize lowering subjectivity when objectivity is below threshold.

### B4) Model Hub & Gating

- **ModelPolicy** object: `{allow:['claude‑3.7','gpt‑4.2‑mini'], deny:[], max_tokens, max_cost, tool_permit:['http','python','proof'], pii_rules}`.
- Bound to **ScopeSet** and/or **edge** (secrets may allow tools but deny models).

### B5) Provenance‑of‑Provenance

- `CITES_SOURCE: Source→Source` with `reach: primary|secondary|tertiary`, `attestation: {signature?, sha256, retrieved_at}`.
- Trust tensor now includes `provenance_depth` and `attested` boolean facilitating chain audits.

### B6) Consolidation & Garbage Collection

- **Scratch** nodes: `{ttl, purpose:'intermediate'}` auto‑collapse into UnifiedDoc lineage.
- **Compaction policies**:
  - `collapse_equivalents` (keep canonical),
  - `archive_low_centrality` (move to sequestered folder),
  - `strip_inert_messages` (no citations/derivations).

### B7) Cross‑Board Graphs

- **CROSS_REF**: `Node↔Node` across boards with immutable `origin_board` and access guard.
- **Portable receipts** include `{origin_board_ids[]}` and a `compat_version`.

### B8) Scope Query Language (SQLish)

- Example:

```
SCOPE my_refunds AS
  SELECT nodes
  FROM Groups g
  WHERE g.name ~ 'refund'
UNION
  SELECT s FROM Sources s WHERE s.domain='stripe.com' AND NOT s.sequestered;
```

- Queries compile to ScopeSets; receipts store both query and resolved IDs.

### B9) Chat JSON Import Adapters

- **Adapters**: `{openai_v3, openai_jsonl, claude_chat, poe_export, slack_threads}`.
- Field normalization: role mapping, timestamp repair, attachment extraction, code‑block AST hashing, thread reconstruction.

### B10) License/Rights Policies

- **RIGHTS** edge: `Source→License` with
  - fields: `{license_id, allows_quote, allows_paraphrase, allows_execute, attribution_required}`.
- Sequester reasons include `license_restricted`; UnifiedDocs enforce citation style/quotas.

### B11) Token Budgeting

- **BudgetProfile**: `{retrieval_tokens, context_ceiling, doc_targets:[5k, 20k, 50k], overflow_strategy:'compress|prune|recluster'}`.
- UI shows live token estimate per scope chip; agents respect budgets during consolidation.

### B12) Deep Verification Hooks

- **Proof edges**: `ObjectiveClaim→ProofArtifact` (Lean/Coq file, status, goal count, tactic hash).
- **Computation artifacts**: notebooks with `env_spec` and `seed`; determinism required.

### B13) Galaxy Light‑Mode UX

- Paper/sepia background; black‑star minimal clusters;
- LOD: particle count ∝ zoom; constellations collapse by default.
- Hover cone shows causal eligibility; tap opens capsule card; sidebar stays hidden unless expanded.

---

## C) Operational Policies (new)

- **Layout invariants**: positions keyed by `(cluster_id, rank, seed)` across lenses.
- **Objectivity/Subjectivity governance**: boards declare target bands; agents propose actions to move clusters into band.
- **Update‑All orchestration**: batch refresh of claims + UnifiedDocs with diff summary and rollback receipt.

---

## D) Examples / Snippets

### D1) Policy‑typed edge sample

```json
{
  "kind": "SEQUESTERS",
  "from": "folder:Secrets",
  "to": "source:api_keys",
  "hidden_from_llm": true,
  "hidden_from_tools": false,
  "reason": "license_restricted",
  "until": "2026-01-01"
}
```

### D2) Chat link with handoff

```json
{
  "kind": "LINKS_TO_CHAT",
  "from": "chat:Planning",
  "to": "chat:Build",
  "purpose": "handoff",
  "receipt": "rct_7b2…"
}
```

### D3) Constellation example

```json
{
  "kind": "Constellation",
  "id": "const:docs_stripe",
  "members": ["src:stripe1", "src:stripe2", "src:blogA"],
  "metric": "provenance",
  "collapsed": true
}
```

---

## E) Open Questions (extended)

- Default priors for **subjectivity index** across domains?
- Portable receipts: how to handle missing cross‑board permissions gracefully?
- Constellation determinism under rapid ingest (batching vs streaming)?
- Proof artifact minimality: what checksum/goal stats guarantee reproducibility?

---

**End v0.2 addenda.**
