# API Reference

**Base URL**: `http://localhost:3001/api/v1`
**Auth**: Bearer Token required for most endpoints

## Modules

The API is organized into the following feature modules:

### Authentication & Users

- `POST /auth/*` - Registration, login, session management (`auth.routes.ts`)
- `GET /users/*` - User profile and management (`users.routes.ts`)
- `GET /accounts/*` - Multi-tenant account management (`accounts.routes.ts`)

### Content & Graph

- `GET /nodes/*` - CRUD for standard nodes (`nodes.ts`)
- `GET /edges/*` - CRUD for edges (`edges.ts`)
- `GET /content/*` - Content retrieval (messages, sources) (`content.ts`)
- `GET /groups/*` - Group management (`groups.routes.ts`, `groups.ts`)
- `GET /cluster/*` - Clustering operations (`cluster.routes.ts`)

### Injest & Data Management

- `POST /ingest` - File upload and fingerprinting (`ingest.ts`)
- `POST /import/enhanced` - Advanced chat import (`import-enhanced.ts`)
- `POST /uploads` - File upload management (`uploads.routes.ts`)
- `POST /data-management/*` - Bulk operations (`data-management.ts`)
- `GET /duplicates/*` - Duplicate detection (`duplicates.ts`)

### System & Ops

- `GET /health` - System health check (`health.routes.ts`)
- `GET /metrics` - Prometheus/System metrics (`metrics.routes.ts`)
- `GET /config` - Client configuration (`config.ts`)
- `GET /admin` - Administrative functions (`admin.routes.ts`)

### Agents & Analytics

- `POST /agents/*` - AI Agent execution (`agents.routes.ts`)
- `GET /analytics/*` - Usage and performance analytics (`analytics.routes.ts`)

> **Note**: Full OpenAPI/Swagger documentation is currently in development. Please refer to `apps/api/src/routes` for exact schema definitions.
