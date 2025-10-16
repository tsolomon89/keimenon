# claude.md — Operating Guide for Canvas Memory Agents (Claude-compatible)

**Purpose:** Give the model exact guardrails and formats so it works inside the Canvas Memory OS without leaking data, hallucinating scope, or breaking cost/plan rules.

**Read me first:** All supporting artifacts live in **`ai_context/`**. If a file is missing, create a stub and reference it.

---

## 0) Project compass

- **Local‑first.** Free/Pro default to on‑device processing and **BYO keys**. Hosted calls are opt‑in (Pro) and ephemeral. Business may store org data under governance.
- **Graph‑native.** Everything is a node; edges carry policy. Never invent nodes. Only operate on the provided **ScopeSet**.
- **Verification > vibes.** Propose tool verifications; do not declare truth without evidence.
- **DRY & schema‑driven.** All outputs must match JSON schemas in `ai_context/schemas/`.

---

## 1) Where things live (folders you must use)

```
ai_context/
```

---

## 2) Message contract (how you should talk)

Always structure outputs with **two sections**:

1. `plan`: bullet list of steps you will take, constraints, and budgets.
2. `artifacts`: JSON objects conforming to schemas (claims, doc sections, actions).
   No free‑form analysis outside `plan`. No hidden content.

**System rules (you must comply):**

- Respect **Sequester** flags: `hidden_from_llm`, `hidden_from_tools`.
- Never fetch outside the provided **ScopeSet** unless explicitly told via `gather` archetype.
- Cite using `{node_id, span}` for every factual statement.
- For Free tier without BYO key: decline model‑costing actions, suggest manual steps.

---

## 3) Scope & receipts

- Inputs will include one of:
  - `scope_id` (preferred), or
  - an inline `Receipt` from `ai_context/examples/receipts/*.json`.
- If absent, ask for a **Selection Scope** (lasso) or a **Saved Scope** name. Do not assume global context.
- Echo the **Receipt** you used in `artifacts.receipt_used`.

---

## 4) Output formats (must match schemas)

### 4.1 Claims extraction (Subjective → Objective draft)

Write to `ClaimSet` schema (`ai_context/schemas/Claim.json`). Minimal shape:

```json
{
  "claims": [
    {
      "id": "clm_...",
      "claim_text": "...",
      "type": "fact|endpoint|parameter|definition|metric|config",
      "supports": [],
      "contradicts": [],
      "citations": [{ "node_id": "src_...", "span": "p3:s12-34" }],
      "status": "unverified",
      "confidence": 0.4
    }
  ]
}
```

### 4.2 UnifiedDoc section (POR)

Use `UnifiedDocSection` from `ai_context/schemas/UnifiedDoc.json`:

```json
{
  "section": {
    "id": "sec_...",
    "ring": "L0|L1|L2|L3",
    "title": "...",
    "content_markdown": "...",
    "citations": [{ "node_id": "src_...", "span": "..." }],
    "claims_index": ["clm_..."]
  }
}
```

### 4.3 Action proposal (Business only)

```json
{
  "action": {
    "type": "email_send|webhook|crm_upsert|issue_create|report_export",
    "provider": "ses|webhook|hubspot|github|gdrive",
    "template": { "subject": "...", "to": "...", "body_md": "..." },
    "requires_approval": true
  }
}
```

---

## 5) Tier behavior (must enforce)

- **Free:**
  - Work entirely within the canvas graph. No web, no hosted models.
  - If `client_side_llm_allowed=false`, return instructions but do not call a model.
  - Produce only **L0** doc sections; never exceed token ceilings in `LimitsPolicy`.
- **Pro:**
  - You may use included models. Store **scope receipts** for every run.
  - Propose **VerifierRuns** (HTTP_CHECK/SCHEMA_MATCH/COMPUTE); never mark verified yourself.
- **Business:**
  - You may surface PII only if `policies/Tiering.md` allows for the workspace. Mask in output unless the template needs it. Use **Action** schemas and mark `requires_approval`.

---

## 6) Archetype contracts (when acting as an archetype)

Use the definition in `archetypes/*.json`. Honor:

- `model`, `tools_allowed`, `output_schema`, `policy.max_tokens`, `policy.cost_cap_usd`.
- Return **exactly** the `output_schema` plus `receipt_used`.

**Default library:** Summarizer, Key‑Insights, Diff‑Explainer, Schema‑Filler, Planner, Code‑Extractor, Contrarian, Critic.

---

## 7) Verification (proposal only)

Emit a `VerifierPlan` JSON (no execution):

```json
{
  "verifier_plan": {
    "targets": ["clm_1", "clm_2"],
    "runs": [
      { "kind": "HTTP_CHECK", "url": "https://api.vendor.com/ping", "expect_status": 200 },
      { "kind": "SCHEMA_MATCH", "doc": "src_api_docs", "schema": "openapi" }
    ]
  }
}
```

---

## 8) Style & quality rules

- Short sentences. Cite often. Prefer lists to paragraphs in L0.
- No purple prose. No invented URLs or companies.
- When uncertain, write an **OpenQuestions** block with what evidence is missing.

---

## 9) Files you may read/extend

- `prompts/*.md` — insert, don’t overwrite.
- `schemas/*.json` — treat as authoritative.
- `examples/*` — reference in outputs to demonstrate format.
- `state/*` — write small artifacts (receipts, plan notes) without PII.

---

## 10) Mini runbook

1. Load Receipt/Scope.
2. List constraints (tier, limits) in `plan`.
3. Perform task (extract, synthesize, plan) with citations.
4. Propose verifications.
5. Emit artifacts matching schemas.
6. Record `receipt_used`.

**End of file.**
