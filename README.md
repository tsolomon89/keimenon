# Keimenon

Local-first knowledge graph platform with account-isolated data and a monorepo workspace layout.

## Prerequisites

- Node.js `22.x`
- npm `>=9`

## Quick Start

```bash
npm install
npm run dev
```

Default endpoints:

- API: `http://localhost:4001/api/v1`
- API health: `http://localhost:4001/health`
- Web: `http://localhost:3000`

## Required Quality Gates

All root commands are authoritative and runnable from repository root:

```bash
npm run lint
npm run type-check
npm run test
npm run build
npm run test:auth
npm run migrate:to-local:dry-run
```

## Workspace Commands

```bash
npm run dev              # Orchestrated API + web startup
npm run dev:clean        # Same as dev, with port cleanup
npm run validate         # Environment validation
npm run check-ports      # Detect port conflicts
npm run kill-ports       # Stop port conflicts
```

## Storage And Configuration

The maintained runtime contract is local-only:

- `STORAGE_MODE=local`
- `LOCAL_DOCS_PATH` is required
- `SQLITE_PATH` is required

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
npm run node:check
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

## Notes

- `TESTING_MANUAL.md` is intentionally out of scope for this refinement pass.
- Generated artifacts and historical logs are excluded from maintained source/doc cleanup.
