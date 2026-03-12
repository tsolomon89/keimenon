# Gate E Rollout/Rollback Playbook

This playbook defines the automated drill path for Gate E hardening.

## Goals

1. Verify rollout safety for schema + runtime checks.
2. Verify rollback safety through deterministic restore from backup snapshot.
3. Verify Gate-E kill-switch behavior for objective enqueue and semantic stage rollback.
4. Keep proofs machine-readable for CI/nightly artifacts.

## Commands

Baseline lock (includes required-check sync, preflight battery, evidence generation, and archive):

```bash
npm run ops:gate-e:baseline-lock
```

Nightly artifact validation:

```bash
npm run ops:gate-e:nightly:validate -- --require-streak
```

Nightly tracker entry generation:

```bash
npm run ops:gate-e:nightly:tracker -- --run-url "<workflow-run-url>"
```

Completion signoff:

```bash
npm run ops:gate-e:signoff
```

Final handoff bundle generation:

```bash
npm run ops:gate-e:handoff
```

CI quick drill:

```bash
npm run ops:rollout-rollback:drill:quick
```

Nightly strict drill:

```bash
npm run ops:rollout-rollback:drill
```

LOD burn-in quick:

```bash
npm run perf:lod:burnin:quick
```

LOD burn-in strict:

```bash
npm run perf:lod:burnin
```

## Drill Artifacts

- Rollout/rollback drill report:
  - `test-results/ops/rollout-rollback-drill-latest.json`
- LOD performance burn-in report:
  - `test-results/perf/lod-burnin-latest.json`
- Nightly streak report (nightly only):
  - `test-results/ops/gate-e-nightly-streak-latest.json`

Nightly runs upload both report directories as workflow artifacts.

## What The Drill Covers

1. Schema rollout via SQL migration runner on isolated temp database.
2. Backup creation of migrated database.
3. Rollout mutation simulation (`rollout_v1 -> rollout_v2` marker).
4. Rollback restoration from backup.
5. Post-rollback invariants (`rollout_v1` restored, rollout-only row removed).
6. Raw-local policy and verification audit regression tests.
7. Objective bridge + import route regression tests in strict mode.
8. Kill-switch contract tests:
   - `KILL_SWITCH_OBJECTIVE_ENQUEUE`
   - `KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE`

## Kill-Switch Toggles

Use these for controlled rollback drills:

- `KILL_SWITCH_OBJECTIVE_ENQUEUE=1`
  - Import completes, objective task dispatch is skipped.
- `KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE=1`
  - Similarity engine runs with lexical/structural/flow only (deterministically reweighted).
- `NEXT_PUBLIC_ENABLE_3D_RENDERER=false`
  - Forces 2D-only renderer path in web.

## CI/Nightly Workflow

Workflow file:

- `.github/workflows/gate-e-hardening.yml`
- `.github/workflows/e2e.yml` (smoke-only companion workflow)

Jobs:

1. Full E2E suite (Chromium) on push/PR/nightly.
2. LOD burn-in (quick on CI, strict on nightly).
3. Rollout/rollback drill (quick on CI, strict on nightly).
4. Evidence bundle aggregation and Gate-E summary.
5. Nightly streak computation (`14` target) with machine-readable streak artifact.
6. Auto-close nightly failure tracker when streak target is reached.

## Required Checks

Use the required check set from:

- `docs/ops/branch-protection-required-checks.md`

For `main`, require at minimum:

1. `Full E2E (Chromium)`
2. `LOD Burn-in (10k/50k)`
3. `Rollout/Rollback Drill`

## Evidence Bundle

Aggregated release evidence artifact:

- `test-results/ops/gate-e-evidence-latest.json`
- `test-results/ops/gate-e-nightly-streak-latest.json` (nightly streak tracking)
- `test-results/ops/gate-e-baseline-lock-latest.json` (baseline lock and archive report)
- `test-results/ops/gate-e-completion-signoff-latest.json` (completion criteria evaluation)
- `test-results/ops/gate-e-handoff-bundle-latest.json` (final handoff pointer package)

Contract:

1. Includes `e2e`, `lod`, `drill`, `timestamp`, and top-level `pass`.
2. Fails generation if required sub-reports are missing.
3. Uploaded as workflow artifact (`gate-e-evidence`).

## Operational Hardening Complete Criteria

1. 14 consecutive nightly Gate-E runs are green.
2. No unresolved critical drill regressions.
3. Required checks are enforced on `main` branch protection.

## Failure Handling

If drill fails:

1. Download workflow artifacts (`test-results/ops/`, `test-results/perf/`).
2. Re-run locally with `--keep-temp` to inspect temporary database state.
3. Fix failing invariant first (schema restore mismatch, gate regression, or lifecycle regression).
4. Re-run strict drill before merge.
