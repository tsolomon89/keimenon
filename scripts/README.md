# Scripts Directory

Development and production helper scripts for Keimenon (local-only storage).

## Quick Start

```bash
npm run dev
npm run dev:clean
npm run dev:clean:browser
npm run dev:clean:electron
npm run validate
npm run check-ports
npm run kill-ports
```

## Core Scripts

### `check-port.js`

Check whether a port is currently in use.

```bash
node scripts/check-port.js 3000
```

### `kill-port.js`

Stop processes bound to specific ports.

```bash
node scripts/kill-port.js 3000 4001
node scripts/kill-port.js 3000 --force
```

### `wait-for.js`

Wait for HTTP/TCP endpoints before continuing.

```bash
node scripts/wait-for.js http://localhost:4001/health
node scripts/wait-for.js localhost:4001 --timeout 30000
```

### `validate-env.js`

Validate Node/npm and app environment files.

```bash
node scripts/validate-env.js
node scripts/validate-env.js --verbose
```

Checks include:

- Node.js 22.x
- npm >= 9
- dependency installation
- required local storage env values (`STORAGE_MODE=local`, `LOCAL_DOCS_PATH`, `SQLITE_PATH`)
- API and web URL configuration

### `dev.js`

Development orchestrator.

Flow:

1. Run validation
2. Detect/fix port conflicts
3. Enforce local storage mode
4. Start API
5. Wait for health endpoint
6. Start web app

### `dev-clean-browser.js`

Hard-reset browser startup wrapper around `dev.js`.

Flow:

1. Force-kill processes on API/Web ports
2. Verify ports are free
3. Run ordered browser startup (`dev.js --clean`)

### `dev-clean-electron.js`

Hard-reset electron startup wrapper around `dev-desktop.js`.

Flow:

1. Force-kill processes on API/Web ports
2. Kill stale Keimenon Electron processes
3. Run ordered electron startup (`dev-desktop.js`)

### `dev-boot.js`

Boot helper that prepares env files/dependencies and then runs `dev.js`.

## Gate E Hardening Scripts

### `perf/lod-burnin.ts`

Deterministic 10k/50k LOD performance burn-in with budget gates and JSON report output.

```bash
npm run perf:lod:burnin:quick
npm run perf:lod:burnin
```

### `ops/rollout-rollback-drill.ts`

Automated rollout/rollback drill:

1. Run SQL migrations on isolated temp database
2. Create backup snapshot
3. Simulate rollout mutation
4. Restore backup and verify invariants
5. Run regression checks for raw-local policy and objective lifecycle bridge
6. Validate Gate-E kill-switch contract tests
7. Execute kill-switch matrix scenarios:
   - baseline
   - objective enqueue kill switch on
   - semantic stage kill switch on

```bash
npm run ops:rollout-rollback:drill:quick
npm run ops:rollout-rollback:drill
```

Kill-switch env flags used in rollback drills:

- `KILL_SWITCH_OBJECTIVE_ENQUEUE`
- `KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE`

### `ops/gate-e-evidence-bundle.js`

Aggregates Gate-E outputs into a single machine-readable evidence bundle.

Output contract:

- `e2e`
- `lod`
- `drill`
- `timestamp`
- `pass`

Usage:

```bash
npm run ops:gate-e:evidence -- --e2e-status success --lod-report test-results/perf/lod-burnin-latest.json --drill-report test-results/ops/rollout-rollback-drill-latest.json --output test-results/ops/gate-e-evidence-latest.json
```

### `ops/apply-branch-protection.js`

Applies and verifies required Gate-E checks on `main` branch protection.

Requires `GH_TOKEN` or `GITHUB_TOKEN` with repository admin permissions.

```bash
npm run ops:branch-protection:apply
npm run ops:branch-protection:verify
```

## Port Reference

| Port | Service | Protocol |
| ---- | ------- | -------- |
| 3000 | Web app | HTTP     |
| 4001 | API     | HTTP     |

## Troubleshooting

### Port conflicts

```bash
npm run check-ports
npm run kill-ports
npm run dev:clean
```

### Environment issues

```bash
npm run validate
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### Restart quickly

```bash
npm run kill-ports
npm run dev
```

## Production Notes

Development scripts are local workflow helpers. For production, use your deployment process (container orchestration, process manager, or platform runtime).

For clean startup runbook details, see:

- `docs/ops/clean-dev-startup.md`
