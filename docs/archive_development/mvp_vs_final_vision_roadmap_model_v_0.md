# MVP vs Final Vision — Roadmap & Model (v0.1)

**Premise.** Free/Pro operate around a **UserNode**; Business adds a **BusinessNode** abstraction (org → products/SKUs → pipelines). All tiers share the same graph; features are gated by plan and cost.

---

## 0) Roles / Plans (restate)

- **Admin/Debug:** everything, emulation, config CRUD.
- **Free (MVP):** ingest → autogroup → sequester → manual claims → L0 doc; 2D lens only; offline parsing.
- **Pro:** + Archetype nodes (models) on scopes; verifiers (HTTP/Schema/Compute); receipts; Galaxy lens; L0/L1 docs.
- **Business:** + BusinessNode (org), CRM/email/webhooks, schedules, multi‑seat/SSO; Action nodes.

---

## 1) Shared object model (minimum set)

**Nodes:** Source, Group, Folder, ObjectiveClaim, UnifiedDoc, UserNode, ChatThread (Pro+), Archetype (Pro+), Action (Biz), BusinessNode (Biz), Constellation, ScopeSet, Receipt.

**Edges (added to existing spec):**

- **OWNED_BY**: {Board|Group|UnifiedDoc|Action} → UserNode | BusinessNode
- **INTENT_FOR**: {UserNode|BusinessNode} → Group (project/research/app)
- **NEEDS**: {UserNode|BusinessNode} → {Product|SKU|API|Integration} _(Biz)_
- **OFFERS**: {Vendor} → {SKU|API}
- **USES_API**: {App|Integration} → API
- **CAD_COMPAT**: {Product|SKU} ↔ CAD_Software

---

## 2) MVP (Free) — What ships first

**Goal:** parse and sort, with minimal surface area and zero API cost.

### Capabilities

- Ingest (files/URLs/chats) → **Autogroup** → Groups/Folders/Constellations.
- Sequester controls (edge policy) with reasons.
- **Subjective→Objective lane**: manual **Extract Claims** (rule‑based), no external tools.
- **UnifiedDoc L0** (≤5k tokens): stitched bullets + citations; export.
- **2D lens** only; stable layout; zoom/lasso; selection scope (no models).
- **Header / LHS / RHS / Footer** frame as in Layout doc (RHS stacked tiles; overlay capable).
- **LimitsPolicy** enforcement (file size/count/storage/retention); circuit breakers.

### Non‑goals (deferred)

- No Archetype nodes (models), verifiers, chat, receipts persistence, Galaxy lens, CRM/email/webhooks.

### MVP acceptance

- Upload mixed sources → see them clustered; toggle sequester; extract 10–50 claims; compose L0 doc with clickable citations; export.

---

## 3) Pro — Layer on reasoning and verification

**Adds:**

- **Archetype nodes**: Summarizer, Key‑Insights, Diff‑Explainer, Schema‑Filler, Planner, Code‑Extractor, Contrarian, Critic.
- **Chat with scope**; store **scope receipts**.
- **Verifiers**: HTTP_CHECK, SCHEMA_MATCH, COMPUTE.
- **UnifiedDocs L0/L1** (5k/20k/50k); Galaxy lens with verification warp.

**Flow (Pro)**

1. Lasso Group(s) → Archetype(Summarizer) → output (bullets + citations) → add to L0/L1.
2. From output → **Derive Claims** (auto) → **Queue verifiers** → promote Verified to Objective.
3. Receipts saved for all runs; reproducible answers.

---

## 4) Business — Org abstraction + outbound actions

**Adds:** BusinessNode (org), ProductGraph, CRM entities, Action nodes (email/webhook/CRM/issue/report), schedules, SSO/roles.

### BusinessNode schema (sketch)

```json
{
  "id": "biz_acme",
  "name": "Acme Panels",
  "products": ["prod_metal_panel"],
  "markets": ["construction", "aerospace"],
  "systems": { "crm": "hubspot", "email": "ses", "erp": "netsuite" },
  "policies": { "pii": "redact", "verification": "strict" }
}
```

### ProductGraph (domain pack)

Nodes: **Product**, **SKU**, **Vendor**, **Distributor**, **CustomerSegment**, **API**, **CAD_Software**, **Standard/Regulation**. Key edges: **NEEDS**, **OFFERS**, **USES_API**, **COMPATIBLE_WITH**, **CERTIFIED_BY**, **SUPPLIES_TO**.

### Business flow (metal panels example)

1. Setup BusinessNode (**products = metal panels**).
2. **User/Business INTENT** to Board/Groups (e.g., "Sourcing & Sales").
3. **Gatherer Archetype** (Pro capability used under Business plan) expands scope: finds vendors, distributors, segments, CAD/tool APIs, standards.
4. **Objective pipeline** verifies entities:
   - HTTP ping + schema to confirm sites/APIs exist.
   - Company registries / government databases → **ObjectiveClaims**.
   - CAD API docs reachable & parseable; sample calls in **VerifierRun**.
5. **UnifiedDocs** assemble playbooks: SKUs to stock; APIs to integrate; standards to comply; contact lists.
6. **Action nodes** execute: create CRM leads, send intro emails, open Jira issues to wire APIs, schedule verifications.
7. **Objectivity/Subjectivity lenses** show where facts are solid vs metaphor/opinion from videos or blogs; counterfactual nodes identify unknowns; agent asks targeted follow‑ups.

---

## 5) "Archetype" vs "Objective" vs "Action" (final vocabulary)

- **Subjective node**: raw content (unverified source). Warm, dotted halo.
- **Objective node**: verified claim/entity. Cool, solid halo.
- **Archetype node**: **in‑between** model that reads scope and produces text/JSON/Claims; never self‑verifies.
- **Action node**: external effect (email/webhook/CRM/issue). May **ACK** with new Objective evidence (e.g., API call logs).

---

## 6) Point‑of‑Reference (POR) docs (to avoid re-reading everything)

A **POR** = the canonical, compressed reference for a topic; lives as a **UnifiedDoc** with:

- Rings L0/L1 (+ optional L2 examples) and a **claims index**.
- **Lineage** back to sources; staleness half‑life; diff history.
- **POR ScopeSet**: minimal scope to answer common questions; used by Archetypes to avoid large retrievals.

**Policy:** when POR reaches target objectivity, upstream sequestered content can be archived; POR becomes the main touchpoint.

---

## 7) User/Business edges are the context engine

- **INTENT_FOR** edges from UserNode/BusinessNode to Groups→ define _why_ material matters.
- Archetypes prefer nodes closer (by intent weight); agent prompts user only when intent ambiguity blocks progress.
- Scopes in receipts record active intent profile.

---

## 8) Lenses & evidence grading (final)

- **Trust tensor** drives distances; lenses: Semantic, Provenance, Verification, Subjectivity.
- **Evidence grades** (A/B/C): A = verified & attested; B = corroborated but untested; C = unverified/subjective. Badges show on nodes and POR sections.

---

## 9) Roadmap (high level)

- **A — MVP (Free):** ingest→autogroup→sequester→manual claims→L0 POR; 2D lens.
- **B — Pro:** archetypes + receipts + verifiers + L1 docs + Galaxy lens.
- **C — Business:** BusinessNode, ProductGraph pack, Action nodes (CRM/email/webhooks), schedules & SSO.
- **D — Hardening:** proof runners, notebook sandbox, cross‑board receipts, governance dashboards.

---

## 10) Acceptance snapshots

**Final vision (business)** proves itself when:

- Given _"Acme sells metal panels"_, the system:
  - Creates ProductGraph seed; expands vendors/distributors/segments/APIs/CAD tools.
  - Grades evidence; verifies 10+ entities with logs; composes a POR playbook.
  - Opens 3 actions: CRM list, intro email sequence (dry‑run), API integration tickets.
  - Shows a Galaxy map where verified entities cluster around Business intent.

**Pro vision** proves itself when:

- Archetype(Summarizer) + Verifiers promote 50% of extracted claims to Objective; POR L1 cites all.

**MVP** proves itself when:

- 200 mixed sources turn into 8–12 groups; 100+ claims extracted; POR L0 exported; Free guardrails hold.

---

## 11) Open questions

- Do we add a light **Entity** node class for companies/APIs/SKUs with typed properties (instead of only claims)?
- Best default half‑life policies per domain (legal, vendor lists, standards, APIs)?
- When POR supersedes sources, how aggressively do we archive to reduce cost?
