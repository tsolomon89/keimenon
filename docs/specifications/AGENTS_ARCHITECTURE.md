# agents.md — Agent Architecture & Operating Rules

**Intent:** Define agent types, schedules, policies, and IO contracts for Keimenon. Keep it **schema‑driven**, **declarative**, and **DRY**. All referenced files live in **`ai_context/`**.

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
- **Log TODO markers** for unhandled edge cases or deferred error scenarios.

### 7.1 TODO Standards for Agent Code

All agent implementations must use standard TODO patterns for VSCode/Todo Tree integration:

```typescript
// TODO: [Action needed]
// FIXME: [Bug to fix]
// HACK: [Temporary solution - include replacement plan]
// NOTE: [Critical context]
// XXX: [Requires immediate attention]
```

**Agent-specific patterns:**

- `// TODO(verification): Add HTTP_CHECK for this endpoint claim`
- `// FIXME(gatherer): Rate limiting fails on >100 requests/min`
- `// HACK(synthesizer): Using regex until NLP library is added`
- `// NOTE(planner): This assumes single-board scope - multi-board needs refactor`

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

---

## 11) AI Agent Operational Protocol

### 11.1 Task Initialization Checklist

Before executing any agent run:

1. **Search for TODOs** in target area:

   ```bash
   grep -r "TODO|FIXME|HACK" <target_directory>
   ```

2. **Review referenced documentation**:
   - Check `ai_context/schemas/*.json` for data contracts
   - Read `policies/*.md` for tier/privacy rules
   - Review `agents/registry.json` for dependencies

3. **Verify scope boundaries**:
   - Confirm `scope_id` validity
   - Check sequester flags
   - Validate budget constraints

4. **Check for related work**:
   - Search for similar agent runs in `state/`
   - Review recent receipts for context
   - Check for open `ApprovalRequest` objects

### 11.2 During Execution

**Required comment patterns:**

```typescript
// TODO(agent:gatherer): Fetch additional sources from arxiv.org
// FIXME(agent:verifier): HTTP_CHECK timeout too aggressive (5s -> 30s)
// HACK(agent:synthesizer): Skipping L2 ring until schema updated
// NOTE(agent:extractor): This claim requires manual verification
```

**Documentation references:**

```typescript
// See: ai_context/schemas/Claim.json:65-72
// Related: policies/Verification.md#http-checks
// Depends on: agents/registry.json:gatherer_v1
```

### 11.3 Post-Execution

1. **Update TODOs**:
   - Remove completed items
   - Add new TODOs for discovered work
   - Update estimates if scope changed

2. **Document decisions**:

   ```typescript
   // NOTE: Chose HTTP_CHECK over SCHEMA_MATCH due to cost limits
   // TODO: Revisit when Pro tier budget increases
   ```

3. **Cross-reference artifacts**:
   - Link receipt to claims: `// Receipt: rct_abc123 -> claims: clm_1, clm_2`
   - Reference sources: `// Source nodes: src_arxiv_2024_001, src_github_repo_xyz`

### 11.4 File Reference Standards

When working across the codebase:

| File Type | TODO Pattern       | Example                                                          |
| --------- | ------------------ | ---------------------------------------------------------------- |
| Schema    | `TODO(schema)`     | `// TODO(schema): Add 'confidence_interval' field to Claim.json` |
| Policy    | `TODO(policy)`     | `// TODO(policy): Update when PII rules change in Tiering.md`    |
| Agent     | `TODO(agent:type)` | `// TODO(agent:gatherer): Expand to academic sources`            |
| Workflow  | `TODO(workflow)`   | `// TODO(workflow): Add approval step for CRM writes`            |

### 11.5 Cross-Agent Communication

Leave breadcrumbs for downstream agents:

```typescript
// TODO(for:verifier): Claims clm_45-49 need HTTP_CHECK against api.example.com
// TODO(for:synthesizer): Group these claims under "API Endpoints" section
// TODO(for:planner): Gap detected - missing authentication flow documentation
```

**End of file.**
