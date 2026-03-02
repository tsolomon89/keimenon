# System Operations

## Authentication And Authorization

### JWT Contract

- `sub`: user id
- `account_id`: active account scope
- `roles`: permission roles

Storage:

- Web: secure/httpOnly cookie or token storage policy
- API: bearer token header

### Security Model

1. TLS required in production.
2. Data access scoped by `account_id`.
3. Secrets managed in environment configuration only.

## Deployment

- Runtime: Node.js services (API + web + desktop integrations).
- Orchestration: container or process-manager based.

## Database Operations

- Backup: SQLite `.db` file copy (WAL-safe process).
- Migration: run managed migration scripts from repository commands.

## Monitoring

- Health check: `/health`
- Readiness check: `/ready`
- Metrics endpoint: `/metrics`
