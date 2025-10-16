# Plans & Tiers — Accounts, Roles, and Phased Rollout (v0.1)

**Goal:** Define profiles (Admin/Debug, Free, Pro, Business) and a build‑order that ships **Admin + Free first**, while scaffolding placeholders for Pro/Business.

---

## 1) Entities

- **User**: identity + auth.
- **Workspace**: container for boards, groups, chats, docs.
- **Role (per workspace)**: `Owner, Admin, Editor, Viewer`.
- **Plan (per workspace)**: `admin_debug | free | pro | business`.
- **Entitlement**: feature flags + quotas bound to a plan (and possibly to a role).
- **UsageMeter**: counters for costed actions (LLM tokens, verifier runs, API calls, storage minutes, emails).

### 1.1 Entitlement object (sketch)

```json
{
  "plan": "free",
  "features": {
    "ingest_files": true,
    "autogroup": true,
    "sequester": true,
    "constellations": true,
    "lenses": ["2D"],
    "chat_models": [],
    "verification_tools": [],
    "unified_doc_targets": [5000],
    "crm": false,
    "email_send": false,
    "webhooks": false
  },
  "quotas": {
    "sources": 500,
    "groups": 50,
    "nodes": 20000,
    "storage_gb": 5,
    "llm_tokens_month": 0,
    "verifier_runs_day": 0
  }
}
```

---

## 2) Feature matrix (initial)

| Capability                               | Admin/Debug           | Free (MVP)               | Pro                     | Business                      |
| ---------------------------------------- | --------------------- | ------------------------ | ----------------------- | ----------------------------- |
| Boards, Groups, Folders, Sequester       | ✅                    | ✅                       | ✅                      | ✅                            |
| Ingest (files/URLs) + **Autogroup**      | ✅                    | ✅                       | ✅ (priority queue)     | ✅ (priority + batch imports) |
| Chat threads & **scope receipts**        | ✅                    | 🔸 _local-only receipts_ | ✅                      | ✅ (cross‑workspace receipts) |
| Lenses                                   | all (2D/3D/nD/Galaxy) | 2D only                  | 2D/3D + Galaxy          | all + custom lenses           |
| Constellation nodes (zoom‑to‑reveal)     | ✅                    | ✅                       | ✅                      | ✅                            |
| ObjectiveClaims extraction               | ✅                    | 🔸 _manual trigger_      | ✅ (auto)               | ✅ (scheduled)                |
| Verifiers (HTTP, Schema, Compute, Proof) | all                   | —                        | HTTP/Schema/Compute     | all + sandboxed runners       |
| UnifiedDocs rings (L0→L3)                | ✅                    | L0 (5k)                  | L0/L1 (5k/20k/50k)      | L0–L3 (policy‑locked)         |
| Model access (chat with data)            | all models            | —                        | included models (gated) | BYO keys + pooling + SSO      |
| CRM/CMS workflows, email send            | ✅ (dev/test)         | —                        | —                       | ✅                            |
| Webhooks & automations                   | ✅                    | —                        | ✅                      | ✅ (SLA)                      |
| Multi‑seat & roles                       | ✅                    | 1 seat                   | up to N seats           | org seats + SSO/SAML          |
| Audit logs & exports                     | verbose               | basic                    | advanced                | enterprise                    |

🔸 _Free receipts_: store minimal scope info to reproduce within the same session; full receipts available in Pro+.

---

## 3) Costed actions & gates

- **LLM calls** (chat, embeddings, summarization): gated behind **Pro/Business**; Admin always allowed.
- **Verification runs** (HTTP/compute/proof): gated; Free disables; Pro caps per day; Business by policy.
- **Transcribe/speech**: gated; enabled in Pro+.
- **Email send / CRM actions**: Business only; Admin for test.

Quotas live in `UsageMeter`, decremented on action; overflow rules: **block → prompt upgrade → allow Admin bypass**.

---

## 4) Phase plan (layered build)

### Phase A — **Admin + Free** (ship first)

**Scope:**

- Core ingest → fingerprint → autogroup → sequester controls.
- 2D lens with constellations + zoom‑to‑reveal.
- Manual ObjectiveClaims extraction (no tools).
- Basic UnifiedDoc (L0 up to 5k tokens) **without model generation**; compile from sources via rule‑based stitching.
- Minimal receipts (session‑replay only).
- Entitlement framework + plan switcher + disabled‑state UI for Pro/Business features.

**Why this is enough:** satisfies the **basic use case**: _parse data and sort into groups_.

### Phase B — **Pro**

- Enable model hub (included models) for **chat with scope**; full **scope receipts**.
- Enable HTTP/Schema/Compute verifiers (quotas).
- UnifiedDocs L0/L1 with 5k/20k/50k targets.
- Galaxy lens + verification warp overlay.

### Phase C — **Business**

- Multi‑seat, roles, SSO/SAML, org workspaces.
- CRM entities (Contact, Company, Deal) linked into the graph; **email send** with templates and rate limits.
- Workflows (webhooks, scheduled verifications, auto‑consolidate), audit logs, exports.

### Phase D — **Admin/Debug extensions**

- Proof runners (Lean/Coq), notebook sandboxes, impersonation, kill‑switches, feature flag toggles, synthetic load testing.

---

## 5) UI affordances by plan

- **Disabled controls** remain visible with tooltip: “Requires Pro (chat with scope).”
- **Meter chips** in top bar: tokens left, verifier runs left.
- **Plan banner** in settings: upgrade path + what unlocks.
- **Safe fallbacks**: when features are off, UI offers _export_, _manual verify checklist_, or _Save scope_.

---

## 6) Data & safety policies by plan

- **Retention**: Free (30‑day soft cap) → Pro (90+) → Business (policy‑driven, legal holds).
- **Privacy**: Sequester reasons enforced; redacted‑execute available Pro+; Business can define custom PII rules.
- **Receipts & audit**: Free (session) → Pro (full receipts) → Business (org‑wide audit trail).

---

## 7) Stubs to scaffold now (placeholders)

- `ModelPolicy` UI with greyed model list.
- Verifier panel with disabled runs.
- CRM menu (Contacts/Deals) hidden behind Business flag.
- Email composer visible in Admin; disabled in others.

---

## 8) Minimal acceptance for Phase A

- Upload mixed files/URLs → see groups and constellations in 2D.
- Toggle sequester on any node/folder; policy reflected in retrieval preview (even if no LLM yet).
- Run manual “Extract claims” to create ObjectiveClaims linked to sources.
- Compose L0 UnifiedDoc (rule‑based stitching) with clickable citations; export.
- Entitlements enforce Free limits; Admin bypass works.

---

## 9) Open items

- Exact Free quotas (sources/nodes/storage) to tune after dogfooding.
- Number and names of included models in Pro.
- Business email provider(s) and sending limits.
- Billing events schema and overage rules.

---

## 10) Cost guardrails — Free plan (hard limits to protect hosting)

**Purpose:** Ensure the free tier cannot generate runaway API/infra costs.

**LimitsPolicy (per‑plan, per‑workspace)**

```json
{
  "max_file_size_mb": 10,
  "allowed_mime_types": [
    "application/pdf",
    "text/plain",
    "text/markdown",
    "image/png",
    "image/jpeg",
    "application/json"
  ],
  "daily_ingest_limit": 50,
  "max_sources": 500,
  "max_nodes": 20000,
  "max_groups": 50,
  "storage_gb": 5,
  "upload_rate_limit_per_min": 5,
  "chat_calls_per_day": 0,
  "embedding_calls_per_day": 0,
  "verifier_runs_per_day": 0,
  "compute_timeout_ms": 8000,
  "max_concurrency": 2,
  "retention_days": 30,
  "lenses_enabled": ["2D"],
  "doc_targets_tokens": [5000],
  "fallback_when_exceeded": "block_then_prompt_upgrade",
  "overage_circuit_breaker": {
    "storage_pct": 95,
    "node_pct": 95,
    "requests_per_min": 120
  }
}
```

**Behavior**

- Exceeding any hard cap triggers **circuit breaker** → soft freeze uploads/ingest; show upgrade panel.
- No external LLM/embedding/transcription calls; **offline-only** parsing & autogroup.
- 2D lens only; galaxy/3D disabled (keeps GPU cost down).
- UnifiedDoc = L0 only, rule‑based stitching (no model cost).

---

## 11) Admin Console — Emulation, CRUD, and governance

**Admin/Debug** gets a built‑in **Instance Emulator** and a set of CRUD forms over the **Config Registry**.

### 11.1 Instance Emulator

- Toggle UI to **emulate plan**: Free, Pro, Business (no real billing).
- Inject synthetic quotas/usage; preview disabled states; dry‑run circuit breakers.
- "Time travel" slider to test retention purges and staleness.

### 11.2 Config Registry (schema‑driven)

Collections edited via forms; each has JSON schema + audit trail.

- `EntitlementRegistry` — plan→features/quotas (the matrix in §2).
- `LimitsPolicy` — per‑plan hard limits (see JSON above).
- `ModelPolicyRegistry` — allow‑lists, cost ceilings, tool permits, PII rules.
- `ThemeTokens` — color/type/spacing; supports light (sepia) and dark modes.
- `RuntimeManifest` — **model‑driven UI**: menus, lenses, feature flags, panel layouts.
- `DataSchema` — Node/Edge type registry (labels, icons, rules).
- `RetentionPolicy` — per plan/workspace windows + legal holds.
- `LicensePolicy` — quoting/paraphrase/execute rules per license.
- `WebhookTargets` — allowed outbound endpoints (Pro/Business only).

**All edits are PR‑style**: propose → diff preview → apply → rollback receipt.

### 11.3 RuntimeManifest (sketch)

```json
{
  "navigation": [
    { "id": "boards", "icon": "grid", "visible": true },
    { "id": "galaxy", "icon": "orbit", "visible": "plan>=pro" }
  ],
  "panels": {
    "details": { "side": "right", "collapsible": true },
    "meters": { "topbar": ["tokens", "verifier_runs", "storage"] }
  },
  "lenses": [
    { "id": "2d", "default": true },
    { "id": "galaxy", "visible": "plan>=pro" }
  ]
}
```

---

## 12) Database access policy (safe surface)

- Admin may **edit only config collections** above; graph content is managed through product flows.
- Read‑only graph explorer is allowed; destructive ops (drop, raw writes) live behind **Debug mode** and require confirmation + snapshot.
- Scheduled **compaction**: archive low‑centrality, stale, or duplicate nodes to sequestered folders (policy‑driven).

---

## 13) Backpressure & graceful degradation

- When nearing limits, UI enters **Low‑Power Mode**: throttled animations, sampled edges, disabled galaxy.
- Over quota: uploads blocked; ingest queue paused; verifiers cancelled with receipt.
- Admin can set **per‑workspace caps** stricter than plan defaults.

---

## 14) Style/theming hooks (schema‑driven)

`ThemeTokens` example:

```json
{
  "mode": "sepia",
  "palette": { "paper": "#e9ddc7", "ink": "#221d16", "accent": "#6b4d2e" },
  "radii": { "sm": 6, "md": 12, "lg": 20 },
  "grid": { "spacing": 8, "show": true },
  "stars": { "density": "low", "color": "#0b0b0b" }
}
```

---

## 15) Enforcement layer (runtime guards)

- Every costed action checks: `Entitlement` → `LimitsPolicy` → `UsageMeter` before execution.
- Gate at **edge level** (e.g., sequestered secrets: tools yes / models no).
- All denials emit a **BudgetEvent** for audit.

**BudgetEvent (sketch)**

```json
{
  "ts": 1730850000,
  "workspace": "ws_123",
  "actor": "user_abc",
  "action": "chat.run",
  "reason": "plan_forbids",
  "plan": "free",
  "policy": "ModelPolicyRegistry.v3",
  "receipt": "rct_9d3..."
}
```

---

## 16) Defaults for Free (suggested)

- Max upload 10 MB/file; 5 GB total; 50/day ingest; 500 sources; 20k nodes.
- 2D lens only; no LLM/embeddings/verifiers/transcription.
- L0 UnifiedDoc up to 5k tokens; export allowed.
- Retention 30 days (rolling), extendable by Admin.

---

## 17) Admin quick‑start checklist

1. Configure **EntitlementRegistry** and **LimitsPolicy**.
2. Set **ModelPolicyRegistry** defaults (deny all for Free).
3. Choose **ThemeTokens** (dark + sepia).
4. Publish **RuntimeManifest** and test in Instance Emulator per plan.
5. Enable BudgetEvent alerts (email/webhook) for overages.

---

## v0.2 Tier & Privacy Updates (supersedes parts of §§2–3–4–10)

**Intent.** Align tiers to the latest chat: **Free = local-first graph + optional BYO key**, **Pro = models included + research**, **Business = org abstraction + workflows + PII governance**. We minimize hosting cost by defaulting to _client-side_ calls for non‑Business tiers.

### A) Tier definitions (concise)

- **Free — Local‑first.** Canvas graph nodes, ingest → autogroup → sequester. No research/automations. _Optional_ **BYO AI key** for on‑the‑spot summarize/Q&A **client‑side only** (no proxy). Hard limits on file size, count, and graph size.
- **Pro — Models included, research on.** Hosted models available **without keys** (ephemeral, no logging); **BYO key** still supported. Auto‑research and auto‑graph builds, receipts preserved. Higher limits; background verification (non‑personal data only).
- **Business — Organization OS.** Adds **BusinessNode** + multiple **UserNodes**, automation workflows (webhooks, email, CRM/CMS), schema/database, and **sensitive data handling** (contacts, PII). Oblio‑style chats live here.

### B) Privacy / Data residency contract

- **Free & Pro (default mode):** Content stays on the device/browser; we store only account metadata. API calls with **BYO keys** originate **client‑side** directly to providers; we do **not** proxy or log payloads.
- **Pro (hosted option):** If you opt‑in to included models, calls are ephemeral, not retained, not used for training. No PII processing outside Business.
- **Business:** Org‑level storage under governance (roles/SSO, audit, retention). DPA/SCCs. Optional private/edge deployments.

### C) Revised feature deltas (override of §2 rows)

| Capability                           | Free                                     | Pro                              | Business                              |
| ------------------------------------ | ---------------------------------------- | -------------------------------- | ------------------------------------- |
| **Model access**                     | **BYO key (client‑side only)**; no proxy | Included hosted models **+ BYO** | Included + pooling + SSO; BYO allowed |
| **Research / Autogather**            | —                                        | **On** (receipts, limits)        | **On** + scheduled workflows          |
| **Automations (webhooks/email/CRM)** | —                                        | —                                | **On** (rate‑limited, policy‑gated)   |
| **PII / Contacts**                   | —                                        | — (blocked)                      | **Allowed** with governance           |
| **Data residency**                   | Local‑first                              | Local‑first or ephemeral hosted  | Org storage + policies                |

### D) Costed actions & gates (clarifications to §3)

- **Hosted LLM calls** (our keys/infra): gated behind **Pro/Business**.
- **BYO client‑side calls** (your keys, direct from device): allowed in **Free/Pro**; they **do not** count toward hosting quotas but still respect UI limits (e.g., scope size) and show meters for user awareness.
- **Verifiers:** server‑side verifiers gated to Pro/Business; client‑side quick checks allowed where feasible.

### E) Phase plan edits (adds to §4)

**Phase A — Admin + Free** gains:

- Optional **BYO AI (client‑side)** for summarize/Q&A within the current scope. No research, no automations, no server proxy. Guardrails unchanged (file/graph limits).

### F) LimitsPolicy notes (addendum to §10)

- The `chat_calls_per_day: 0` refers to **hosted/proxied** calls. **Client‑side BYO** is permitted in Free; add flag:

```json
{
  "client_side_llm_allowed": true,
  "hosted_llm_allowed": false
}
```

- Keep size/count/retention caps to protect hosting. UI labels clarify when an action is client‑side vs hosted.

### G) BusinessNode hooks (new edges)

Add to model for Business tier:

- **OWNED_BY**: {Board|Group|UnifiedDoc|Action} → BusinessNode
- **INTENT_FOR**: BusinessNode → Group (project/research/app)
- **NEEDS / OFFERS / USES_API** edges for ProductGraph packs (SKUs, vendors, CAD, standards).

---

_This section will be merged into the main body in v0.3. For now it supersedes the specified sections while preserving earlier detail._
