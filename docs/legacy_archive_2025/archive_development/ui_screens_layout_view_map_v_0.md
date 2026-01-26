# UI Screens & Layout — View Map (v0.1)

**Goal:** Enumerate screens/views and specify the four collapsible regions (Header, LHS, RHS, Footer/Console) + the main viewport for the Board and lenses. Designed to protect Free‑tier costs and scaffold Pro/Business features.

---

## 1) Global frame & Z‑order

**Regions:**

1. **Header / Top Tools** (Z‑top)
2. **Sidebars:** **LHS** (nav/filters) and **RHS** (inspector/selection stack)
3. **Footer / Console Bar** (logs/REPL/queues)
4. **Main Viewport** (Board & lenses)

**Z‑order precedence:** Header → Sidebars → Footer → Main Viewport.

**Resize rules:**

- **LHS**: min 240px, max `lhs.max_pct` of width (default 28%, admin‑tunable).
- **RHS**: min 360px; overlay mode can occupy **70–80%** (admin default `rhs.overlay_pct = 0.76`).
- **Footer**: min 24px collapsed, 32–320px expanded; auto‑hide in overlay.
- **Main**: takes remaining space; hides when RHS overlay is full.

**Collapse/expand:** All four regions are collapsible. Keyboard: `⌘\` LHS, `⌘/` RHS, `` ` `` Console, `⌘⇧K` Header tools.

---

## 2) Main Viewport — Board & Lenses (core views)

**A. Board: 2D (MVP)**

- Sources, Groups, Folders, Constellations (zoom‑to‑reveal).
- Pan/zoom (trackpad/mousewheel); lasso to create **Selection Scope**.
- Edge labels as policy chips (Sequester/Scope/Verify).

**B. Board: 3D**

- Adds top‑level ObjectiveClaims nodes; depth slider; focus+blur to reduce clutter.

**C. Board: nD / Galaxy**

- Curved‑space layout using trust tensor; particle density throttled by zoom and plan.
- Constellations as single stars; open on tap/zoom.

**D. Matrix / Adjacency**

- Bipartite or full adjacency heatmap for Sources↔Claims or Groups↔Chats. Great for audits.

**E. Timeline / Staleness**

- Time‑scrub to see ingest/verify cadence, claim half‑life decay.

**F. Diff / Receipt Replay**

- Load a scope receipt to reproduce an answer; show graph and doc diffs across receipts.

_(MVP enables A; Pro adds B/C; Admin can access all for testing.)_

---

## 3) Header / Top Tools

- **Breadcrumbs:** Workspace › Board › (Lens)
- **Lens selector:** 2D / 3D / nD / Galaxy / Matrix / Timeline / Diff
- **Scope chips:** count, token estimate (Pro+), sequester badge
- **Meters:** tokens left, verifier runs left (plan aware)
- **Global search/command:** `⌘K`
- **Plan banner** (Free vs Pro/Business) and **Low‑Power Mode** indicator

---

## 4) LHS Sidebar (Nav / Filters)

- **Boards** list (with star/favorite)
- **Groups & Folders** tree (drag to rearrange, promote/demote, sequester toggles)
- **Filters:** type (Source/Claim/Doc/Chat), sequester state, verification status, staleness
- **Saved Scopes** (receipt pins)

**Behavior:**

- Expands independently of RHS. When RHS overlay is active, LHS remains accessible; its max width is capped by `lhs.max_pct`.

---

## 5) RHS Sidebar (Inspector / Selection Stack)

**Purpose:** Show details for the current selection; support **multi‑select** by stacking **tiles** (collapsible).

**Tiles (examples):**

- **Node Details** (meta, provenance, sequester toggles)
- **Selection Stack** (N selected items; collapse each)
- **ObjectiveClaim Editor** (supports/refutes, verifications)
- **UnifiedDoc Preview** (L0/L1 snippets; citations clickable)
- **Scope Builder** (include/exclude + rank order)
- **Verification Panel** (queue runs, view artifacts) _(Pro/Business)_

**Overlay mode:**

- Toggle `RHS → overlay` to **cover the main viewport** (70–80% width). Footer auto‑hides; LHS stays visible.
- Mobile: overlay becomes full‑screen panel, dismissed with swipe‑right.

---

## 6) Footer / Console Bar

- **Tabs:** Logs • Tasks/Queue • REPL • Budget Events • Shortcuts
- **Collapsed** count badges (errors, running tasks)
- **Pin height** and **auto‑scroll** options

**Console REPL:** receipt‑aware commands (e.g., `scope add group:"API Docs"`, `verify run 12`, `doc compose L0`).

---

## 7) Pointer‑only tooling (no keystrokes needed)

- **Context ring** on selection with radial menu: Add to Scope • Sequester • Derive Claim • Open in RHS • Pin
- **Edge sculpting:** drag to reroute; click edge to toggle policy chips
- **Zoom HUD:** slider + +/- + fit‑to‑selection
- **Lens dial:** on‑canvas control to morph metrics (semantic↔provenance↔verification)

---

## 8) Multi‑selection & Stacked Inspector

- Shift‑click to add; lasso to batch.
- RHS lists items as collapsible tiles: each tile has Quick Actions (Sequester, Add to Scope, Open Source, Cite).
- "Pin tile" keeps it visible when selection changes.

---

## 9) Overlay precedence & region interlock

- **RHS overlay ON** → Main and Footer hide; LHS remains; Header stays.
- **LHS expanded to max** → RHS overlay width reduces to preserve min 20% off‑canvas gutter.
- **Footer expanded** → RHS cannot overlay; prompt to collapse Footer.

---

## 10) Admin‑tunable layout params (RuntimeManifest)

```json
{
  "layout": {
    "lhs": { "min_px": 240, "max_pct": 0.28 },
    "rhs": { "min_px": 360, "overlay_pct": 0.76 },
    "footer": { "min_px": 24, "max_px": 320 },
    "breakpoints": { "sm": 640, "md": 960, "lg": 1280, "xl": 1600 }
  },
  "overlays": {
    "rhs_over_main": true,
    "footer_auto_hide_on_rhs_overlay": true
  },
  "behaviors": {
    "low_power_mode_thresholds": { "node_count": 15000, "edge_count": 75000 },
    "particle_density": { "free": "low", "pro": "med", "business": "high" }
  }
}
```

---

## 11) Screens / Routes (thin set)

1. **/board/\*\***:id\*\* — Main canvas with lenses (all regions present)
2. **/ingest** — Dropzone + ingest queue + autogroup log (RHS shows latest items)
3. **/claims** — Claims table & filters; click to center on canvas
4. **/docs/\*\***:docId\*\* — UnifiedDoc full view, ring selector, diff mode
5. **/verify** — Verifier runs, artifacts, schedules (Pro/Business)
6. **/admin** — Instance Emulator + Config Registry CRUD (schemas from spec)
7. **/settings** — Profile, workspace, plan & quotas, theme tokens

_(Free exposes /board and /ingest; others visible but disabled with tooltips.)_

---

## 12) Responsiveness

- **Mobile:** LHS collapses to bottom sheet; RHS opens full; canvas gestures prioritized.
- **Tablet:** split view allowed (LHS 25%, canvas 50%, RHS 25%).
- **Desktop:** defaults per RuntimeManifest; remembers per‑board layout.

---

## 13) Accessibility & input

- Full keyboard parity for all pointer actions; focus rings; ARIA roles for regions.
- Reduced motion preference respected; line weight instead of particle density when motion off.

---

## 14) Empty & error states

- Board empty → guided cards: Ingest Files • Import Chats • Create Group.
- RHS empty selection → tips on multi‑select & scope building.
- Circuit breaker → dedicated banner with link to meters & plan.

---

## 15) Guardrails for Free tier (UI)

- 2D only, particle density low; token meters hidden; RHS Verification/Doc tiles grayed.
- Upload size & count shown inline; progress stops at circuit breaker with precise reason.

---

## 16) Open questions

- Should Matrix/Adjacency be Pro‑only or available to Free for audits?
- Minimum gutter when both sidebars are expanded? (current 20% off‑canvas)
- Do we allow RHS overlay + Header tool drawer simultaneously?
