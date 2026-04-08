# Clean Development Startup (Browser + Electron)

This repo now provides two deterministic clean-start commands:

1. Browser mode (API + Web):

```bash
npm run dev:clean:browser
```

2. Electron mode (API + Web + Electron):

```bash
npm run dev:clean:electron
```

## What These Scripts Do

Both commands perform cleanup first, then startup in a fixed order.

1. Load `apps/api/.env` (if present) so `PORT` overrides are respected.
2. Kill any process bound to the configured API/Web ports.
3. Verify those ports are fully free before startup.

Note: clean startup does **not** wipe graph/database content. Use `npm run factory-reset:global-sweep` when you need a full fresh data reset across canonical and stale local DB/runtime locations.
For incident recovery (stop processes + global sweep + settings schema repair + status report), use:

```bash
npm run recovery:full-fresh-admin
```

Additionally, Electron mode also:

1. Kills stale `electron.exe` (or `electron` on Unix) processes that match Keimenon command lines.

## Startup Order

### Browser (`dev:clean:browser`)

1. API (`@keimenon/api`)
2. API readiness check (`/ready`)
3. Web (`@keimenon/web`)

This delegates to the existing ordered orchestrator (`scripts/dev.js --clean`).

### Electron (`dev:clean:electron`)

1. API (`@keimenon/api`)
2. API readiness check (`/ready`)
3. Web (`@keimenon/web`)
4. Electron (`keimenon-desktop`) with embedded API disabled in dev

This delegates to `scripts/dev-desktop.js`.

## Pre-login startup gate

The web login route now enforces backend readiness before rendering credential inputs.

Behavior:

1. Full-screen startup gate appears when backend `/ready` is not green.
2. Gate polls `/ready` and also fetches `/health/modules` details for actionable diagnostics.
3. Login form renders only after readiness is green.
4. Root/login redirects preserve startup context query params (`apiPort`, `dev`) to keep desktop dev routing stable.

## Ports

Default ports:

1. Web: `3000`
2. API: `4001` (or value from `PORT` in `apps/api/.env`)

You can override Web port in Electron flow with:

```bash
WEB_PORT=3002 npm run dev:clean:electron
```

On Windows PowerShell:

```powershell
$env:WEB_PORT = "3002"; npm run dev:clean:electron
```

## Recommended Usage

Use clean-start when:

1. You ran long imports overnight and want a known-good reset.
2. You switched between Browser and Electron modes.
3. You see stale process/port conflicts or "works after refresh" behavior.

## Related Scripts

1. `npm run dev` - normal startup
2. `npm run dev:boot` - boot helper (env/deps) then normal startup
3. `npm run dev:check` - check whether dev services are listening
4. `npm run dev:reset` - canonical reset (ports + optional local test cleanup)
5. `npm run dev:stop` - ports-only reset
6. `npm run dev:clean` - existing browser clean startup (`scripts/dev.js --clean`)

## ABI mismatch recovery

If startup detects native module ABI mismatch (for example `better-sqlite3`), the dev orchestrator performs one automatic runtime repair attempt and retries backend startup once.

If retry still fails, run:

```bash
npm run runtime:repair
```
