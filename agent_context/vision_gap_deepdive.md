# Keimenon Vision Gap Deep Dive (Rebaselined)

Date: March 13, 2026
Branch: release/final-vision-bigbang

## Rebaseline Summary

This file now tracks only real remaining closeout items after the latest implementation pass.
Stale gaps from earlier snapshots (topic clustering, double-click focus, graph retry/backoff, import presets, sparkline backend series, analytics persistence) are removed.

## Closed in This Pass

1. Auth/session hardening shipped:
   - `034_auth_session_hardening.sql` added.
   - Session + reset tokens moved to hashed persistence semantics.
   - Refresh now rotates sessions and revokes predecessor token.
   - Session revocation enforced on logout, password reset, and password change.
   - Strict session-binding behavior is production-default, with explicit test-only relaxation gate.
2. Auth API/security completion shipped:
   - Added `POST /api/v1/auth/password/change`.
   - Enforced HIBP checks for password change.
   - Password reset email dispatch failures now emit deterministic error codes in logs.
3. Dedupe/worker hardening shipped:
   - Shared similarity utility extracted and reused across duplicate services.
   - Explicit strategy support now includes `lsh` and `embeddings` (flagged by `DEDUP_EMBEDDINGS_ENABLED`).
   - Real edit-distance metrics now emitted.
   - Added `035_dedupe_role_tracking.sql` and `dedupe_evidence` schema.
   - Added `Job.updateState(...)` domain API and removed private `_state` mutation hack in checkpointing.
   - Import worker parser selection now handles JSON array, JSON object, and JSONL.
4. Canvas/import legacy-path fidelity improvements shipped:
   - Scope builder wiring added in `KeimenonSidebar` with node-add/remove/apply flows.
   - Legacy board preview and board page now load/render edges from `/api/v1/edges`.
   - `BoardViewContainer` now consumes board graph edges and persists node move metadata updates.
5. Dead/mock runtime purge and gate hardening shipped:
   - Removed dead `ai-analysis-service.ts` runtime mock service.
   - Removed unused web PoC adapters under `apps/web/src/components/adapters/*`.
   - Expanded static runtime marker gate with allowlist support for test-only adapter imports.
6. Provider backbone operational hardening shipped:
   - Added production startup validation for LiteLLM + SearXNG env/availability.
   - Added operator runbook: `docs/ops/provider-backbone-runbook.md`.

## Remaining Gaps (Current)

### P0

1. Full branch regression gate execution and evidence refresh still pending in this pass:
   - smoke E2E
   - full Chromium E2E
   - LOD burn-in
   - rollout/rollback drill
   - Gate-E signoff bundle refresh
2. `ops:branch-protection:verify` has not been re-run in this pass with confirmed valid GitHub auth.

### P1

1. Staging dry-run + rollback rehearsal for new migrations/backfill scripts still pending execution evidence.
2. End-to-end AGENTS evidence sync check (`ops:vision-doc-sync:check`) must be rerun after doc updates.

### P2

1. Repo-wide lint remains blocked by pre-existing unrelated issues outside this delta.

## Current Read

Product-contract/runtime gaps are substantially narrowed.
Primary remaining work is operational gate completion + evidence capture.
