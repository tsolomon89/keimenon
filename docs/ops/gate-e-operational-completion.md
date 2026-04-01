# Gate-E Operational Completion Runbook

Last updated: March 12, 2026.

This runbook implements the finish sequence for contract + Gate-E operational completion.

## Scope

1. Complete operational hardening with 14 consecutive green nightly Gate-E runs.
2. Keep required checks enforced on `main`.
3. Keep evidence artifacts machine-verifiable and handoff-ready.

Out of scope: broad TODO/FIXME backlog burn-down.

## Commands

M0 baseline lock:

```bash
npm run ops:gate-e:baseline-lock
```

Validate required-check policy sync only:

```bash
npm run ops:gate-e:required-checks:sync
```

Validate nightly artifacts after downloading workflow artifacts:

```bash
npm run ops:gate-e:nightly:validate -- --require-streak
```

Generate a nightly tracking entry for the tracker issue:

```bash
npm run ops:gate-e:nightly:tracker -- --run-url "<workflow-run-url>"
```

Completion signoff:

```bash
npm run ops:gate-e:signoff
```

Generate signoff report without failing the command while streak is still in progress:

```bash
npm run ops:gate-e:signoff -- --allow-incomplete --skip-branch-protection-verify
```

Capture branch-protection verification evidence:

```bash
npm run ops:branch-protection:verify:evidence
```

Clean legacy `packages/agents` artifact residue:

```bash
npm run clean:legacy-artifacts
```

Clean local repo residue (safe mode):

```bash
npm run clean:repo-local
```

Refresh tracked desktop static bundle:

```bash
npm run desktop:web-dist:refresh
```

Verify tracked desktop static bundle + manifest sync:

```bash
npm run desktop:web-dist:verify
```

Run repo hygiene guard checks:

```bash
npm run ci:hygiene:check
```

Generate final handoff bundle pointers:

```bash
npm run ops:gate-e:handoff
```

## Milestone Checklist

### M0: Baseline lock

1. Run `npm run ops:gate-e:baseline-lock`.
2. Confirm success report:
   - `test-results/ops/gate-e-baseline-lock-latest.json`
3. Confirm timestamped archive directory under:
   - `test-results/ops/baselines/<timestamp>/`
4. Confirm archived baseline artifacts:
   - `gate-e-evidence-latest.json`
   - `gate-e-summary-latest.md`
   - `rollout-rollback-drill-latest.json`
   - `lod-burnin-latest.json`
   - `required-checks-sync-latest.json`

### M1: Nightly streak runbook

1. Treat `.github/workflows/gate-e-hardening.yml` scheduled run as source of truth.
2. Download `gate-e-evidence` artifact from the nightly run.
3. Run `npm run ops:gate-e:nightly:validate -- --require-streak`.
4. Confirm nightly pass conditions:
   - Full E2E (Chromium) success
   - LOD Burn-in (10k/50k) success
   - Rollout/Rollback Drill success
   - Gate-E Evidence + Summary success
5. Track progress from `gate-e-nightly-streak-latest.json`.
6. Generate and post tracker entry:
   - `npm run ops:gate-e:nightly:tracker -- --run-url "<workflow-run-url>" --append-to docs/ops/gate-e-nightly-completion-tracker.md`

### M2: Failure response loop

1. Triage nightly failures within 24h using workflow artifacts.
2. Reproduce from the mapping:
   - E2E: `npm run e2e -- --project=chromium`
   - LOD: `npm run perf:lod:burnin -- --iterations 10 --strict`
   - Drill: `npm run ops:rollout-rollback:drill -- --keep-temp`
   - Evidence: rerun `node scripts/ops/gate-e-evidence-bundle.js ...`
3. Ship minimal fix-forward PR.
4. Reconfirm branch protection checks remain enforced.

### M3: Completion signoff

1. Run:
   - `npm run ops:gate-e:signoff`
2. Accept completion only if all are true:
   - streak >= 14 and `meetsTarget=true`
   - drill report pass=true
   - branch protection verification passes
3. Optional: apply signoff status to `agent_context/vision_gap_analysis.md`:
   - `npm run ops:gate-e:signoff -- --update-gap-analysis`
4. Use generated outputs for handoff:
   - `test-results/ops/gate-e-completion-signoff-latest.json`
   - `test-results/ops/gate-e-completion-signoff-latest.md`
   - `test-results/ops/gate-e-handoff-bundle-latest.json`
   - `test-results/ops/gate-e-handoff-bundle-latest.md`

## Evidence Files

1. `test-results/ops/gate-e-evidence-latest.json`
2. `test-results/ops/gate-e-nightly-streak-latest.json`
3. `test-results/ops/rollout-rollback-drill-latest.json`
4. `test-results/perf/lod-burnin-latest.json`
5. `test-results/ops/gate-e-baseline-lock-latest.json`

## Notes

1. Local runs usually do not produce `gate-e-nightly-streak-latest.json` because that artifact is generated only in scheduled workflow context.
2. Branch protection verification requires authenticated GitHub CLI or valid `GH_TOKEN`.
3. Legacy artifact cleanup target paths are:
   - `packages/agents/.turbo`
   - `packages/agents/dist`
   - `packages/agents/node_modules`
   - `packages/agents/tsconfig.tsbuildinfo`
4. Import diagnostics script output is standardized under:
   - `test-results/diagnostics/`
5. Recommended local cleanup sequence before local Gate-E reruns:
   - `npm run clean:repo-local`
   - `npm run clean:legacy-artifacts`
   - `npm run desktop:web-dist:verify`
