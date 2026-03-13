# Vision Gap Analysis (AGENTS-Aligned, Rebased)

Date: March 13, 2026
Scope: current branch code against canonical `AGENTS.md`.
This analysis is scoped against canonical `AGENTS.md` at repository root.

## Canonical Source

- `AGENTS.md` is authoritative.
- `GEMINI.md`, `docs/specs/vision-contract-v1.md`, and `docs/specs/vision-traceability-matrix.md` are derived.

## Current Alignment Snapshot

1. Similarity-first + objective-layer baseline behavior remains aligned to AGENTS contract.
2. Unified agent runtime lane remains in place for verification/analysis (`/api/v1/agent/*`).
3. Legacy `/api/v1/ai/*` and `/api/v1/verification/*` runtime surface remains removed.
4. Auth/session lifecycle hardening has been implemented for rotating, hashed session/reset tokens.
5. Dedupe/worker closeout items are implemented: shared similarity utility, explicit strategies, parser selection matrix, checkpoint API cleanup.
6. Legacy board/preview edge rendering parity and scope-builder wiring now exist in runtime UI paths.
7. Runtime mock/debt static gate has been strengthened and currently passes.

## Remaining Delta

1. Execute and capture complete regression gate evidence on this branch:
   - `e2e:smoke`
   - full Chromium E2E
   - `perf:lod:burnin`
   - `ops:rollout-rollback:drill`
   - `ops:gate-e:signoff`
2. Re-run and capture `ops:branch-protection:verify` with valid GitHub auth context.
3. Re-run `ops:vision-doc-sync:check` and keep derived artifacts in sync with AGENTS.
4. Run staging dry-run and rollback rehearsal for migrations `034` and `035`, including backfill scripts.

## Notes

- Full `npm run lint` currently fails due pre-existing unrelated lint violations outside this delta.
- Targeted lint/type/test checks for modified closeout files pass.

## Evidence Targets

1. `test-results/ops/gate-e-nightly-streak-latest.json`
2. `test-results/ops/gate-e-completion-signoff-latest.json`
3. `test-results/ops/gate-e-nightly-validation-latest.json`
4. `test-results/ops/gate-e-evidence-latest.json`
5. `test-results/perf/lod-burnin-latest.json`
