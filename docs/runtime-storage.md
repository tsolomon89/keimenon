# Runtime And Storage Contract

## Supported topology

- Node.js `22.x` everywhere: local dev, tests, CI, and Docker
- One API process/container
- One SQLite database file on local disk
- WAL enabled
- Foreign keys enabled
- Backups created through SQLite's online backup path

## Unsupported topology

- Multiple API replicas sharing the same SQLite file
- Shared network filesystems for the live SQLite database
- Serverless API deployment for the current backend
- Mixing Node 22 and Node 24 in repo-owned child processes

## Runtime checks

Use these commands from the repository root:

```bash
npm run doctor:runtime
npm run sqlite:check
npm run sqlite:backup
```

`doctor:runtime` verifies the active Node runtime and native `better-sqlite3` load path.

`sqlite:check` runs `PRAGMA integrity_check` against the configured database.

`sqlite:backup` creates an online backup without relying on direct file copies of the live database.

## Backup and restore

Create a backup:

```bash
npm run sqlite:backup
npm run sqlite:backup -- --compress
```

Restore from a backup:

```bash
npm run restore -- --file "<backup-file>"
```

## Failure modes

- Wrong Node major: install or diagnostics fail immediately
- Native ABI mismatch: `doctor:runtime` fails before tests or startup continue
- SQLite corruption: `sqlite:check` fails and blocks rollout
- Cross-connection visibility issues in tests: fix repository/worker coordination, not journal mode drift

## Local troubleshooting

- Switch to Node 22 and rerun `npm run doctor:runtime`
- Stop stale dev/test processes before rebuilding native modules
- Use `npm run kill-ports` if local services are stuck
- Use `npm run sqlite:check` before assuming the DB file is healthy
