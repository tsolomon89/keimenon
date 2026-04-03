# Clean Development Startup (Browser + Electron)

This repo now provides two deterministic clean-start commands:

1. Browser mode (API + Web):

```bash
npm run dev:clean:browser
```

2. Electron mode (Web + Electron + embedded API):

```bash
npm run dev:clean:electron
```

## What These Scripts Do

Both commands perform cleanup first, then startup in a fixed order.

1. Load `apps/api/.env` (if present) so `PORT` overrides are respected.
2. Kill any process bound to the configured API/Web ports.
3. Verify those ports are fully free before startup.

Additionally, Electron mode also:

1. Kills stale `electron.exe` (or `electron` on Unix) processes that match Keimenon command lines.

## Startup Order

### Browser (`dev:clean:browser`)

1. API (`@keimenon/api`)
2. API health check
3. Web (`@keimenon/web`)

This delegates to the existing ordered orchestrator (`scripts/dev.js --clean`).

### Electron (`dev:clean:electron`)

1. Web (`@keimenon/web`)
2. Electron (`keimenon-desktop`)
3. Embedded API started by Electron main process

This delegates to `scripts/dev-desktop.js`.

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
