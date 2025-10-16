# agents.md — Agent Architecture & Operating Rules

**Intent:** Define agent types, schedules, policies, and IO contracts for Canvas Memory. Keep it **schema‑driven**, **declarative**, and **DRY**. All referenced files live in **`ai_context/`**.

---

## 0) Principles

- **Local‑first, BYO keys** for Free/Pro by default. Hosted/pooled models are Pro+ opt‑in and ephemeral.
- **Graph‑native orchestration.** Agents read/write nodes/edges; all changes go through **graph PRs** (diffs), never silent edits.
- **Receipts everywhere.** Every run emits a `receipt` and references a `scope_id`.
- **No self‑verification.** Agents propose `VerifierRuns`; tools do the checking.

---

## 1) Agent types (registry)

Provide JSON entries in `ai_context/agents/registry.json` with `id, purpose, inputs, outputs, policies`.

1. **Gatherer** — expands scope with candidate sources (Pro/Business).
   - Inputs: `intent`, `seed_sources`, `budget`.
   - Outputs: `Source` nodes (pending + sequestered), `notes`.
   - Policies: obey `LimitsPolicy`, prefer primary/attested sources.

2. **Autogrouper** — clusters sources into Groups/Folders.
   - Inputs: `sources[]`, `hints`.
   - Outputs: `Group` nodes, `CONTAINS`, `EQUIVALENT_TO` edges.

3. **Extractor** — Subjective→claims draft.
   - Inputs: `scope_id`.
   - Outputs: `ClaimSet` (unverified), citations.

4. **Verifier** — schedules/verifies claims (Pro/Business).
   - Inputs: `ClaimSet` or `claim_ids`, `verifier_plan`.
   - Outputs: `VerifierRun` artifacts, updated claim statuses.

5. **Synthesizer** — composes **UnifiedDoc** sections (L0/L1).
   - Inputs: `scope_id`, `claims_index`.
   - Outputs: `UnifiedDoc.section`.

6. **Planner** — turns POR gaps into tasks.
   - Inputs: `open_questions`, `objectivity_deficits`.
   - Outputs: task list (agent cues), optional `Gatherer` invocations.

7. **Workflow Runner** (Business) — executes **Action** nodes.
   - Inputs: `action` with templates; `approval`.
   - Outputs: logs, artifacts; optional **ACK** ObjectiveClaim.

8. **Objectivity Monitor** — watches trust metrics over time.
   - Inputs: board graph + policies.
   - Outputs: diffs, badges, refresh proposals.

---

## 2) Common agent interface (schema)

Write entries under `ai_context/schemas/AgentRun.json`.

```json
{
  "run": {
    "agent_id": "gatherer_v1",
    "scope_id": "scp_...",
    "receipt": "rct_...",
    "budget": { "max_tokens": 6000, "max_cost_usd": 0.5, "timeout_s": 60 },
    "plan": ["step 1", "step 2"],
    "artifacts": [{ "kind": "ClaimSet", "ref": "clmset_..." }],
    "events": [{ "ts": 1730850000, "level": "info", "msg": "..." }],
    "status": "success|error|partial",
    "error": null
  }
}
```

---

## 3) Scheduling & queues

- Define recurring schedules in `ai_context/agents/schedules.json`.
- Queue semantics: FIFO per **board**; priority for **Business** workflows; concurrency caps from `LimitsPolicy`.
- Backoff jitter on failures; dead‑letter queue writes to `state/agent_errors.log`.

---

## 4) Policies & budgets

Put defaults in `ai_context/agents/policies.json`.

- `objectivity_thresholds`: badges bands (A/B/C).
- `verification_budget`: per run/day caps by tier.
- `gatherer_sources_allowlist`: domains, registries.
- `pii_guardrails`: redact rules (Business only).

---

## 5) Tier behavior (enforced by agents)

- **Free**: Autogrouper, Extractor, Synthesizer(L0) only. No Gatherer/Verifier/Workflow.
- **Pro**: All except Workflow Runner (unless user opts in to hosted actions); BYO or hosted models allowed.
- **Business**: All agents; can schedule and execute actions; requires approvals for external effects.

---

## 6) IO contracts per agent (concise)

### Gatherer

- Preconditions: `intent` present; `limits.ok`.
- Emits: pending `Source` nodes with `SEQUESTERS` edges and provenance notes.
- Never adds to **IN_SCOPE_FOR** without approval.

### Autogrouper

- Preconditions: ≥1 `Source`.
- Emits: `Group` + `CONTAINS`, `EQUIVALENT_TO`. Produces a **Dedupe Report**.

### Extractor

- Preconditions: `scope_id` valid; sequester respected.
- Emits: `ClaimSet` (unverified), linked citations. Never marks `verified`.

### Verifier

- Preconditions: claims exist; `verifier_plan` present.
- Emits: `VerifierRun` artifacts; updates claims → `verified|contested|stale`.

### Synthesizer

- Preconditions: claims index or scope provided; `doc_targets_tokens` obeyed.
- Emits: `UnifiedDoc.section` with citations and ring tag.

### Planner

- Preconditions: POR exists.
- Emits: task list with `why` and proposed agents to run.

### Workflow Runner

- Preconditions: Business plan; explicit `approval`; templates resolved.
- Emits: logs + ACK claims when external evidence is obtained.

---

## 7) Error handling & safety

- Always emit a `status` and `error` field.
- On sequester conflict: **stop** and return an `ApprovalRequest` object.
- On token/cost overrun: stop early and return partial artifacts + `BudgetEvent`.

---

## 8) Files to reference

- `schemas/*.json` — authoritative shapes.
- `agents/*.json` — registry/policies/schedules.
- `policies/*.md` — data handling, PII, verification, tiering.
- `examples/*` — sample inputs/outputs to test an agent locally.

---

## 9) Example registry entry

```json
{
  "id": "synth_l0_v1",
  "purpose": "Compose L0 POR bullets for a scope",
  "inputs": ["scope_id", "claims_index?"],
  "outputs": ["UnifiedDoc.section"],
  "policies": { "ring": "L0", "max_tokens": 2000 },
  "plans": ["extract salient facts", "map each bullet to citations", "emit L0 section"],
  "tier": ["free", "pro", "business"]
}
```

---

## 10) Local‑first & privacy

- Agents must assume **no server‑side persistence** in Free/Pro default. Write temporary artifacts to `state/` only.
- Never include raw PII in logs or artifacts outside Business. Use redaction tokens (e.g., `{{EMAIL_REDACTED}}`).

**End of file.**
