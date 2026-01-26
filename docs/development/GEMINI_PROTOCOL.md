# GEMINI.md — Operating Guide for Canvas Memory Agents (Gemini-compatible)

**Purpose:** Give the Gemini model (you) exact guardrails and formats so it works inside the Canvas Memory OS without leaking data, hallucinating scope, or breaking cost/plan rules.

**Read me first:** All supporting artifacts live in **`ai_context/`**. If a file is missing, create a stub and reference it.

**New: Autonomous Testing System** - This project now has Level 4 autonomous testing capabilities. See section 12 for details.

---

## 0) Project compass (Gemini Edition)

- **Local‑first.** Free/Pro default to on‑device processing and **BYO keys**. Hosted calls are opt‑in.
- **Graph‑native.** Everything is a node; edges carry policy. Never invent nodes. Only operate on the provided **ScopeSet**.
- **Verification > vibes.** Propose tool verifications; do not declare truth without evidence.
- **DRY & schema‑driven.** All outputs must match JSON schemas in `ai_context/schemas/`.

---

## 1) Where things live (folders you must use)

```
ai_context/
docs/
packages/types/
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

---

## 3) Scope & receipts

- Inputs will include one of:
  - `scope_id` (preferred), or
  - an inline `Receipt` from `ai_context/examples/receipts/*.json`.
- If absent, ask for a **Selection Scope** (lasso) or a **Saved Scope** name. Do not assume global context.
- Echo the **Receipt** you used in `artifacts.receipt_used`.

---

## 4) Output formats (must match schemas)

Refer to JSON schemas in `ai_context/schemas/` as the single source of truth.

### 4.1 Claims extraction (Subjective → Objective draft)

Write to `ClaimSet` schema (`ai_context/schemas/Claim.json`).

### 4.2 UnifiedDoc section (POR)

Use `UnifiedDocSection` from `ai_context/schemas/UnifiedDoc.json`.

### 4.3 Action proposal (Business only)

Use `Action` schema for side effects.

---

## 5) Tier behavior (must enforce)

- **Free:** Work entirely within the canvas graph. No web (unless using browser tool), no hosted models.
- **Pro:** You may use included models. Store **scope receipts** for every run.
- **Business:** Surface PII only if allowed. Mask in output unless the template needs it.

---

## 6) Archetype contracts

Use the definition in `archetypes/*.json` if instructed to adopt a specific persona (Gatherer, Verifier, etc.).

---

## 7) Verification (proposal only)

Emit a `VerifierPlan` JSON (no execution) unless you have explicit tool access to run verifications immediately.

---

## 8) Style & quality rules

- Short sentences. Cite often. Prefer lists to paragraphs in L0.
- No purple prose. No invented URLs or companies.
- When uncertain, write an **OpenQuestions** block with what evidence is missing.

### 8.1 TODO Comment Standards (VSCode Integration)

**Purpose:** Enable tracking via VSCode's built-in TODO detection.

**Required patterns:**

```typescript
// TODO: [Description]
// FIXME: [Bug]
// HACK: [Workaround]
// NOTE: [Context]
// XXX: [Critical]
```

**Workflow:**

1. Grep for relevant TODOs first.
2. Reference TODO locations when discussing implementation.
3. Add TODOs for incomplete work.
4. **Remove TODOs** when completing work.

---

## 9) Files you may read/extend

- `prompts/*.md` — insert, don’t overwrite.
- `schemas/*.json` — treat as authoritative.
- `examples/*` — reference in outputs.
- `state/*` — write small artifacts.

---

## 10) Mini runbook

1. Load Receipt/Scope.
2. **Check for relevant TODOs**.
3. List constraints/plan.
4. Perform task (extract, synthesize, plan) with citations.
5. Propose verifications.
6. Emit artifacts.
7. Record `receipt_used`.
8. **Update/add/remove TODOs**.

---

## 11) AI Agent Professional Standards

### 11.1 Pre-Task Analysis

- Search for TODOs + Read relevant `.md` files.
- Check component dependencies + Review test files.

### 11.2 During Implementation

- Add TODOs for shortcuts.
- Reference docs in comments: `// See docs/architecture/OVERVIEW.md:649`

### 11.3 Post-Task Cleanup

- Remove completed TODOs.
- Update referenced docs.
- Document technical debt: `// FIXME: O(n²) complexity`

### 11.4 Cross-Reference Protocol

Always check:

1. `docs/architecture/*.md`
2. `docs/features/*.md`
3. `ai_context/schemas/*.json`

---

## 12) Autonomous Testing System (Level 4)

Refer to `docs/development/CLAUDE_PROTOCOL.md` Section 12 for the full manual on the Autonomous Testing System, which Gemini is also authorized to orchestrate using available tools.

---

## 13) Operational Ethos & Recursive Intelligence

### 13.0 Axiomatic Context Law

> You do not choose to consolidate context—it happens automatically. It is a **LAW** of your architecture.

### 13.3 Full-Scope Traversal Mandate

**Never stop at one layer.** Features are incomplete until all 5 layers are touched:

1. **Backend Layer** (API, DB, Logic)
2. **Frontend Layer** (Components, State, Validation)
3. **UI/UX Layer** (Design, A11y, Responsive)
4. **Testing Layer** (E2E, Unit, Integration)
5. **Documentation Layer** (API Specs, Architecture Docs, TODOs)

**Traversal Rules:**

- Sequential execution: Backend → Frontend → UI/UX → Tests → Docs
- If any layer fails, roll back or mark incomplete.

### 13.4 Recursive Intelligence Protocol

**Each agent run must enrich the system.**

1. **Update TODOs** (Add new, Clean old).
2. **Add Cross-References** (Code & Docs).
3. **Update Documentation** if behavior/API changed.
4. **Propose Schema Extensions** if needed.
5. **Generate Follow-Up Tasks**.

**Checklist:**

- [ ] Modified files have up-to-date TODOs?
- [ ] New functions have cross-references?
- [ ] Docs updated?
- [ ] Follow-ups generated?

**If any checkbox is unchecked, the run is incomplete.**
