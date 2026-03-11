# Vision Gap Analysis (AGENTS-Aligned)

Date: March 11, 2026
Scope: active codebase against canonical `AGENTS.md` at repository root.

## Baseline

- Root `AGENTS.md` is canonical truth.
- `GEMINI.md` is a mirror.
- `agent_context/AGENTS.md` is a pointer stub to prevent drift.
- `docs/specs/*` are derived implementation artifacts.

## Contract Snapshot

- Core similarity-first import and graph materialization are implemented.
- Tiered entitlements are implemented and server-enforced.
- Free now includes objective layer baseline; agent runtime remains disabled.
- Import-time agent bootstrap is manual-by-default via `agent.bootstrap`.
- Objective queueing requires entitlements + kill switch off + `agent.bootstrap=auto`.
- Agent principal creation is entitlement-gated.

## What Was Cleaned Up

- Removed transcript-style narrative drift from canonical AGENTS docs.
- Rebased derived spec and traceability docs to AGENTS semantics.
- Added bootstrap-aware worker gating and skip reasons.
- Added tests for:
  - entitlement manifest behavior,
  - import contract bootstrap defaults,
  - objective queue decision matrix,
  - import service agent bootstrap gating,
  - principals route entitlement enforcement.

## Remaining Work (Operational, Not Product-Contract Gaps)

1. Apply required branch protection checks to `main` via GitHub admin/API.
   - Required checks policy is documented.
   - Automation script exists, but apply/verify requires repo-admin token in the execution environment.
2. Complete 14 consecutive green nightly Gate-E runs.
   - Time-based completion dependent on scheduled CI history.
3. Maintain zero unresolved critical rollout/rollback drill regressions through the streak window.

## Hardening Complete Criteria

1. 14 consecutive nightly Gate-E runs are green.
2. No unresolved critical rollout/rollback drill regressions.
3. Required checks are enforced on `main` branch protection.

## Evidence Sources

1. `.github/workflows/gate-e-hardening.yml`
2. `docs/ops/gate-e-rollout-rollback-playbook.md`
3. `docs/ops/branch-protection-required-checks.md`
4. `test-results/ops/rollout-rollback-drill-latest.json`
5. `test-results/perf/lod-burnin-latest.json`
6. `test-results/ops/gate-e-evidence-latest.json`
7. `test-results/ops/gate-e-nightly-streak-latest.json`
8. `scripts/ops/apply-branch-protection.js`

## Current Assessment

Vision-to-implementation alignment is materially closed against `AGENTS.md`.
Remaining items are external operational controls and time-based CI streak completion.
