# Project Capabilities and Deployment Strategy

## 1. Project Analysis (Code-Based)

**Application Type**: Multi-tenant Knowledge Management & Analysis System ("Keimenon").

### Key Capabilities

- **Ingestion**: Streaming file uploads with robust deduplication (fingerprinting + similarity search).
- **AI Agents**: Autonomous agents (`Gatherer`, `Autogrouper`, `Verifier`) for data collection and clustering.
- **Knowledge Graph**: Hybrid storage architecture using **SQLite** (local data) and **Neo4j** (graph relationships).
- **Visualization**: Rich 3D and 2D graph visualizations using `@react-three/fiber` and `d3-force`.

### Technical Constraints

- **Stateful API**: The backend (`apps/api`) writes directly to the local filesystem for database storage (`/data/keimenon.db`) and file uploads (`/data/uploads`). It does not use cloud object storage (S3) by default.
- **Infrastructure**: The system is designed to run as a cohesive unit (API + Web + Neo4j + Nginx), evidenced by `docker-compose.prod.yml`.

---

## 2. Deployment Recommendations

### Option A: The "Production Standard" (Recommended)

**Target**: Virtual Private Server (VPS) - DigitalOcean, Hetzner, AWS EC2.

- **Approach**: Use the existing `docker-compose.prod.yml`.
- **Why**: The code is explicitly architected for this. It keeps the distinct services (API, Graph DB, Web) on a single high-performance machine with local disk access.
- **Pros**:
  - No code changes required.
  - Cost-effective (single fixed monthly price).
  - Full control over data security.
- **Cons**: Requires managing a Linux server.

### Option B: PaaS for Easy Sharing

**Target**: Railway.app or Render.

- **Approach**:
  1.  **Web**: Deploy `apps/web` to Vercel or Railway.
  2.  **API**: Deploy `apps/api` to Railway. **Critical**: You must attach a "Persistent Volume" to the API service to handle the SQLite DB and file uploads.
  3.  **Graph**: Use a specialized provider (Neo4j Aura) or run Neo4j as a service on Railway.
- **Why**: Easier to set up "managed" URLs for sharing without SysAdmin work.
- **Pros**: Automated building and HTTPS.
- **Cons**: Slightly more complex configuration for the persistent storage volumes.

### Option C: The Hybrid Split

- **Web**: Vercel (Front-end).
- **API**: VPS (Back-end).
- **Why**: Leverages Vercel's global CDN for the React content while keeping the stateful API on a cheap, persistent server.
