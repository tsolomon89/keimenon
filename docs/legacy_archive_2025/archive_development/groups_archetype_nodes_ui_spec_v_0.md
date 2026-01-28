# Groups & Archetype Nodes — UI Spec (v0.1)

**Scope:** Visual/interactive spec for **Groups** and the **in‑between AI nodes**. We distinguish:

- **Subjective nodes** = raw sources (unverified).
- **Objective nodes** = verified claims/facts.
- **Archetype nodes** = model‑driven operators that _speak, summarize, transform_.
- **Action nodes** = integrations (webhooks, email, CRM) that _do_ things.

Plans: Free shows Groups + Subjective→Objective basics (no models). Pro unlocks Archetype + Action nodes. Admin sees all.

---

## 1) Groups UI (keimenon tiles)

A **Group** is a stack‑tile on the board. It contains **Sources**, **Folders**, **Constellations**, and optionally **ObjectiveClaims**.

**Tile anatomy**

- **Header**: name, purpose tag, count (members), sequester toggle, overflow (…)
- **Body** (collapsed): constellation thumbnail (n stars), trust badge (objectivity meter), last update time.
- **Body** (expanded): list of recent members; drag targets for **archetype/action** edges.
- **Footer chips**: In‑scope (for chat), Policies (model/tool), License badge.

**States**

- Normal • **Sequestered** (masked content) • **Stale** (halo) • **Read‑only** (license)

**Context menu**

- Open • Preview • **Add to Scope** • **Derive Claims** • **Promote Folder→Group** • **Sequester** • Export

**LHS tree** mirrors groups; drag‑drop between groups creates **PROMOTES_TO_GROUP / FOLDS_INTO_FOLDER** lineage edges.

---

## 2) Subjective → Objective lane

A light **lane** appears when a Group is selected:

- **Left**: Subjective constellation (dotted outline)
- **Middle**: **Claims panel** (extracted statements with checkboxes)
- **Right**: Objective constellation (solid outline)

**Buttons**: _Extract_, _Queue Verifiers_, _Promote Verified_. Free: _Extract_ only (manual rules). Pro+: verifiers enabled.

---

## 3) Archetype nodes (in‑between AI)

An **Archetype** is a reusable, parameterized AI persona/tool runner that operates on scopes.

**Card anatomy (keimenon)**

- **Header**: title + icon (e.g., "Summarizer", "Contrarian", "Planner", "Synthesizer")
- **Model chip** (Pro+): model name, token ceiling, cost meter.
- **Scope picker**: lasso selection chips or Saved Scopes.
- **Actions**: Run • Dry‑run • Add output to → (UnifiedDoc / New Chat / New Group)
- **Output tabstrip**: Transcript • Structured (JSON) • Claims derived • Citations
- **Receipts**: last N runs with reproducible scope receipts.

**Archetype library (RHS)**

- Summarizer • Key‑Insights • Diff‑Explainer • Classification • Code‑Extractor • Planner • Contrarian • Critic • Q&A • Schema‑Filler
- Each archetype = `{prompt, tools_allowed, output_schema?, ranker?, policy}`.

**Edge semantics**

- **OPERATES_ON**: Archetype → {Group|ScopeSet}
- **PRODUCES**: Archetype → {UnifiedDoc|Message|ObjectiveClaim}
- **COSTED**: Run emits BudgetEvents.

**States**

- Idle • Running • Blocked (quota/policy) • Completed • Stale (model changed)

---

## 4) Action nodes (Pro/Business)

Nodes that perform external effects; usually created from an Archetype output.

**Types**

- **Webhook** (generic POST with templating)
- **Email Send** (provider‑bound, rate‑limited)
- **CRM Create/Update** (Contact/Company/Deal)
- **Issue Create** (GitHub/Jira)
- **Report/Export** (GDrive/Notion)

**Card anatomy**

- **Header**: action + provider + status
- **Input mapping**: template editor (JSON/markdown) with tokens from scope/outputs
- **Dry‑run / Execute** toggle; **Approval required** (policy)
- **Logs**: request/response; **Artifacts**; **Retry**; **Schedule** (Business)

**Edges**

- **TRIGGERS**: Archetype/UnifiedDoc → Action
- **ACKS**: Action → ObjectiveClaim (if it returns verifiable evidence, e.g., HTTP_CHECK)

---

## 5) RHS Inspector — Stacked tiles (multi‑select)

Selecting multiple nodes stacks tiles in RHS. Order is user‑controlled.

**Tile types**

- **Source**: meta, provenance, license, sequester toggles
- **Group**: members, sequester policy, scope include
- **Claim**: text, supports/refutes, verification runs
- **Archetype**: parameters, receipts, output preview
- **Action**: provider config, dry‑run logs
- **UnifiedDoc**: ring selector, citations

**Overlay**: RHS can overlay 70–80% of viewport; LHS remains accessible.

---

## 6) Pointer‑only flows (no keyboard)

1. **Summarize a group** (Pro): drag **Group → Archetype(Summarizer)**; click **Run**; in output, click **Add to UnifiedDoc(L0)**.
2. **Verify a claim** (Pro): select Claim tiles → RHS **Queue verifiers** → watch **Artifacts**; successful runs promote to Objective.
3. **Send email from synthesis** (Business): Archetype(Planner) → output selects audience → Action(Email Send) with mapped template → **Dry‑run** → **Execute**.

---

## 7) Visual language

- **Subjective**: dotted halos, warm hue.
- **Objective**: solid halos, cool hue; checkmark badge.
- **Archetype**: purple chip + model icon; cost meter.
- **Action**: dark outline + provider glyph; play/pause badge.
- **Sequestered**: blurred content; lock glyph; hover reveals reason + expiry.

---

## 8) Plan gating (at a glance)

- **Free**: Groups, Subjective lane, manual Extract; no Archetypes/Actions; 2D lens only.
- **Pro**: Archetypes on scopes; verifiers (HTTP/Schema/Compute); UnifiedDocs L0/L1; Galaxy lens.
- **Business**: Action nodes, CRM/email/webhooks; schedules & org audit.
- **Admin**: all + emulation + config CRUD.

---

## 9) Minimal component inventory

- GroupTile, ConstellationThumb, ClaimsPanel, ArchetypeCard, ActionCard, TileStack, ScopeChip, CostMeter, ReceiptPill, ArtifactLog, LicenseBadge, SequesterSwitch.

---

## 10) JSON sketches

**Archetype definition**

```json
{
  "id": "arch_summarizer_v1",
  "name": "Summarizer",
  "model": "gpt-4.x",
  "tools_allowed": ["retrieval"],
  "output_schema": {
    "type": "object",
    "properties": { "bullets": { "type": "array", "items": { "type": "string" } } }
  },
  "policy": { "max_tokens": 2000, "cost_cap_usd": 0.25 },
  "prompt": "Summarize the scope into 5–10 bullets with citations."
}
```

**Action mapping (email)**

```json
{
  "type": "email_send",
  "provider": "ses",
  "template": {
    "subject": "{{unified_doc.title}}",
    "to": "{{contact.email}}",
    "body_md": "{{arch_output.transcript}}\n\n— Sent by Keimenon"
  },
  "policy": { "dry_run_default": true, "rate_limit_per_min": 20 }
}
```

---

## 11) Open questions

- Do Archetypes write directly to ObjectiveClaims, or always via ClaimsPanel? (safer via panel.)
- Should Actions be allowed in Free as **webhook dry‑runs** with redacted payloads?
- Template language: mustache vs JSONata vs custom; escaping & PII rules.
