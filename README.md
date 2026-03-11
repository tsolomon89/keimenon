# Keimenon

Local-first knowledge graph platform with account-isolated data and a monorepo workspace layout.

## Prerequisites

- Node.js `22.x`
- npm `>=9`

## Quick Start

```bash
npm install
npm run doctor:runtime
npm run dev
```

Default endpoints:

- API: `http://localhost:4001/api/v1`
- API health: `http://localhost:4001/health`
- Web: `http://localhost:3000`

## Required Quality Gates

All root commands are authoritative and runnable from repository root:

```bash
npm run doctor:runtime
npm run lint
npm run type-check
npm run test
npm run build
npm run test:auth
npm run migrate:to-local:dry-run
npm run sqlite:check
```

## Workspace Commands

```bash
npm run dev              # Orchestrated API + web startup
npm run dev:clean        # Same as dev, with port cleanup
npm run validate         # Environment validation
npm run doctor:runtime   # Verify Node 22 + better-sqlite3 runtime health
npm run sqlite:check     # Run PRAGMA integrity_check on the configured DB
npm run sqlite:backup    # Create an online SQLite backup
npm run check-ports      # Detect port conflicts
npm run kill-ports       # Stop port conflicts
```

## Storage And Configuration

The maintained runtime contract is local-only:

- `STORAGE_MODE=local`
- `LOCAL_DOCS_PATH` is required
- `SQLITE_PATH` is required
- Production support is limited to a single API instance on local disk-backed storage
- Shared network filesystems, horizontal API scaling, and serverless API deployment are unsupported with the current SQLite contract

Environment template:

- API: `apps/api/.env.example`
- Web: `apps/web/.env.example`

## Monorepo Layout

- `apps/api` - Express API
- `apps/web` - Next.js web client
- `apps/desktop` - Electron desktop app
- `apps/desktop-e2e` - Desktop E2E tests
- `packages/*` - shared libraries/types/parsers/db/ui
- `agent_context/*` - active architecture/spec context
- `scripts/*` - local development and validation tooling

## Authentication And Isolation

- Tenancy unit is **Account**
- Canonical isolation key is `account_id`
- Admin users may run cross-account operations where explicitly permitted
- Client users are restricted to their own account scope

## Troubleshooting

### Node version failures

Use Node 22 and re-run:

```bash
npm run doctor:runtime
npm run node:check
```

`npm install` fails on the wrong Node major by design because `.npmrc` enforces `engine-strict=true`.
Only `npm` is supported for this monorepo (pnpm/yarn are intentionally rejected in `preinstall`).

If native modules were built under the wrong runtime, repair them with:

```bash
npm run runtime:repair
```

### Stuck dev/test processes

```bash
npm run kill-ports
npm run dev
```

### Reset local state (manual)

Back up your local SQLite file before deleting it:

- Default docs path: `~/.keimenon`
- Default DB file: `~/.keimenon/keimenon.db`

### Backup and restore

Use the SQLite-aware backup path instead of copying the live database file directly:

```bash
npm run sqlite:backup
npm run sqlite:backup -- --compress
npm run restore -- --file "<backup-file>"
```

Production backups should come from the mounted SQLite volume via SQLite's online backup path, not from ad hoc file copies while the API is live.

## Notes

- `TESTING_MANUAL.md` is intentionally out of scope for this refinement pass.
- Generated artifacts and historical logs are excluded from maintained source/doc cleanup.
- Desktop/Electron uses its own native module ABI and keeps its Electron-specific rebuild/install path.
