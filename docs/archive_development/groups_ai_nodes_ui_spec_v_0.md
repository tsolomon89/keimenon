# Groups & AI Nodes — UI Spec (v0.1)

**Scope:** Visual + interaction spec for (a) **Groups** (clusters of sources) and (b) **AI nodes in‑between** (assistants/actions/objective aggregators). Targets the 2D lens first; extends cleanly to Galaxy/nD. Plan‑aware (Free vs Pro vs Business).

---

## 1) Design goals

- **Graph‑first, touchable**: drag‑to‑connect; lasso to scope; hover reveals policy chips.
- **Low cognitive overhead**: groups look like containers; AI nodes like operators; objective nodes like facts.
- **Plan‑aware**: AI runs are clearly gated; Free shows stubs without surprise costs.

---

## 2) Object types (UI)

- **Group**: container of Sources/Messages/Claims/Folders.
- **Constellation**: collapsed view of many nodes → single star/bubble; zoom/tap to expand.
- **AI Node** _(in‑between)_: operator capsule that acts on one or more inputs to produce outputs.
  - **Chat Node**: conversational assistant scoped to connected groups.
  - **Action Node**: single‑shot task (Summarize, Extract claims, Normalize code, Compose L0 doc, etc.).
  - **Objective Hub**: aggregator of ObjectiveClaims; surfaces verification status.

---

## 3) Group — Anatomy

```
┌──────────────────────────────────────────────┐
│  [icon] Group Name            • 18 items     │  Header
│  chips:  Sequestered  •  In Scope  •  Stale │
├──────────────────────────────────────────────┤
│  Thumbnails: sources / code / chats (4–12)  │  Body (paged)
│  +counter  [+8 more]                         │
├──────────────────────────────────────────────┤
│  Footer:  Open ▸  •  Add to Scope  •  ⋯     │  Actions
└──────────────────────────────────────────────┘
    • portL       • portR
```

**Ports:** left/right dot ports for connecting edges. Dotted edge = proposed; solid = applied; striped = sequestered.

**States**

- **Normal** (solid border) • **Selected** (accent ring) • **Pinned** (pin icon) • **Sequestered** (hollow fill + lock chip) • **Stale** (halo) • **Disabled** (plan gating).

**Micro‑interactions**

- Hover shows chips (Sequester, Scope, Verify) as tappable toggles.
- Drag from port to create edge; drop on AI node or another group.
- Drop file on card to ingest directly into group (Free obeys LimitsPolicy).

---

## 4) AI Node — Anatomy (in‑between)

```
       dashed in‑edges →  [  AI Operator  ]  → out‑edges
                         ┌────────────────┐
                         │  Title         │
                         │  model/tool ▾  │
                         │  scope:  G1,G2 │
                         │  action:       │
                         │   • Summarize  │   capsule buttons
                         │   • Extract    │
                         └────────────────┘
```

**Variants**

- **Chat Node**: windowed panel when opened; shows threads; scope chips (read‑only for Free).
- **Action Node**: compact capsule with primary action; shows queue state.
- **Objective Hub**: ring meter (Verified/Contested/Stale) + “Open claims” button.

**States**

- **Idle** • **Queued** (spinner) • **Running** (progress pill with tokens/time) • **Done** (pill with outputs count) • **Gated** (padlock + tooltip “Pro: costs tokens”).

**Outputs**

- Links to: **ObjectiveClaims**, **UnifiedDoc (L0/L1)**, **Code Snippets**, **Notes**. Output nodes spawn adjacent; edges are **DERIVES_FROM**.

**Context menu** (right‑click or long‑press)

- Run • Add/Remove input group • Change action • Change model/tool • Open in RHS • Copy receipt • View cost (Pro/Business)

---

## 5) Objective Hub — Visual

- **Donut meter** with segments: Verified (solid), Contested (striped), Stale (halo). Center shows count.
- Hover → tooltip with: `verified n / contested m / stale k • last checked T`.
- Click → RHS tile “ObjectiveClaims (scope)” with table: claim, status, last check, evidence link.

---

## 6) RHS Sidebar — Stacked tiles (selection inspector)

- **Selection Stack**: multiple selected nodes appear as collapsible tiles in order of selection.
- **Tile: Group** → meta, thumbnails, chips, sequester toggle, **Add to scope**.
- **Tile: AI Node** → action picker, scope list, run button, model selector, cost meter (Pro+).
- **Tile: ObjectiveClaim** → supports/refutes, run verification, open artifacts (Pro/Business).
- **Tile: UnifiedDoc** → ring selector (L0/L1), citations preview, compose/push (Pro+).
- **Overlay mode**: RHS can cover viewport (70–80%); LHS remains.

---

## 7) Pointer‑only flows

**Connect & run (Free‑safe)**

1. Drag from Group A port → drop on **Objective Hub** (creates association only).
2. RHS shows “Extract claims (manual)” button (no model cost).
3. Outputs appear; Hub meter updates.

**Chat with scope (Pro)**

1. Select Group A + Group B (multi‑select) → click **Create Chat** (header tool).
2. New **Chat Node** appears, pre‑linked to A,B.
3. Open chat panel; scope chips show A,B; run.

**Summarize to UnifiedDoc (Pro)**

1. Select groups → drop onto **Action Node: Summarize**.
2. Capsule shows running; output **UnifiedDoc L0/L1** spawns with citations.

---

## 8) Plan‑aware UI (guardrails)

- Free: AI Node capsules show **Gated** state with tooltip; objective extraction offers **manual** (rule‑based) path.
- Pro/Business: cost meter pill on node (tokens/time); BudgetEvent bubble on overage.
- Admin: node badges show **receipt IDs** and **policy chips** for debugging.

---

## 9) Keyboard & accessibility

- `Enter` on selected AI Node → run last action.
- `Shift+Enter` → open in RHS overlay.
- `Tab` cycles tiles in RHS; `Space` toggles sequester on focused chip.
- ARIA: groups are **region** with label; AI nodes are **button groups** with roles.

---

## 10) Visual language

- **Groups**: rounded cards; subtle grid background; left/right ports.
- **AI Nodes**: pill/capsule with soft shadow; dashed in‑edges (proposed), solid out‑edges (materialized).
- **Objective Hub**: donut ring + small starfield fill; contested uses diagonal stripes; stale adds outer halo.
- **Sequester**: lock chip; edges shown as semi‑transparent/hatched.

---

## 11) Error/empty states

- Running action fails → capsule turns amber with retry ▸; tooltip includes short error and link to logs (Footer Console).
- Group empty → “Drop files/URLs to ingest.”
- Objective Hub empty → “Run an extraction to populate claims.”

---

## 12) Telemetry hooks (for learning)

- Node CTR, connect‑attempts, run success/fail, average time, average tokens (Pro+), most common actions.
- Privacy label per event (PII‑free).

---

## 13) Open questions

- Should the Objective Hub be per‑board or per‑selection (i.e., multiple hubs)?
- Do Action Nodes persist (like tools on canvas) or are they transient each time?
- Where to surface **scope receipts** in UI outside Admin mode?
