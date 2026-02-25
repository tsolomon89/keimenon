# System Operations

## Authentication & Authorization
### The JWT Contract
- **Issuer**: Oblio Auth Service
- **Claims**:
    - `sub`: User ID
    - `tid`: Tenant ID (Critical for isolation)
    - `roles`: `['admin', 'editor']`
- **Storage**: `httpOnly` Cookie (Web) or Bearer Header (API).

### Security Model
1.  **TLS**: Mandatory in production.
2.  **Isolation**: Queries are scoped by `tid` explicitly.
3.  **Secrets**: Managed via `.env` (Infisical/Dotenv), never committed.

## Operations
### Deployment
- **Model**: Dockerized Containers (Node.js 20-alpine).
- **Orchestration**: Kubernetes / ECS / Coolify.
- **Region Constraints**: Data residency requirements may dictate distinct clusters.

### Database Operations
- **Backup**: SQLite `.db` file copy (WAL safe) or Neo4j Dump.
- **Migration**: `npm run migrate` executes Schema Record insertions.

### Monitoring
- **Health Check**: `/health` (Deep check of DB + Redis).
- **Ready Check**: `/ready` (Traffic acceptance).
- **Metrics**: Prometheus scraper endpoint at `/metrics`.
