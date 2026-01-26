# Setup Guide

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

This will install all dependencies for all workspaces in the monorepo.

### 2. Set Up Neo4j Database

#### Option A: Local Neo4j (Docker)

```bash
docker run \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your_password \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:5.19
```

Access Neo4j Browser at http://localhost:7474

#### Option B: Neo4j Aura (Cloud)

1. Sign up at https://neo4j.com/cloud/aura/
2. Create a free instance
3. Note the connection URI and credentials

### 3. Configure Environment Variables

#### Backend API (`apps/api/.env`)

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
PORT=3001
NODE_ENV=development

# Neo4j Connection
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password

# Storage
STORAGE_PATH=./storage
MAX_FILE_SIZE_MB=10

# Limits (Free tier defaults)
FREE_MAX_SOURCES=500
FREE_MAX_NODES=20000
FREE_MAX_GROUPS=50
FREE_STORAGE_GB=5
```

#### Frontend Web (`apps/web/.env.local`)

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001

# Feature Flags
NEXT_PUBLIC_ENABLE_PRO_FEATURES=false
NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES=false
```

### 4. Initialize Database Schema

Start the API server to automatically initialize Neo4j schema:

```bash
cd apps/api
npm run dev
```

The schema initialization will create:

- Node uniqueness constraints
- Performance indexes
- Relationship types

### 5. Start Development

In the root directory:

```bash
npm run dev
```

This starts both frontend (port 3000) and backend (port 3001) in watch mode.

## Verify Setup

### Backend Health Check

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-10-06T...",
  "service": "canvas-memory-api",
  "version": "0.1.0"
}
```

### Frontend

Open http://localhost:3000 in your browser. You should see the Canvas Memory OS landing page.

### Neo4j Browser

1. Open http://localhost:7474
2. Connect using credentials from `.env`
3. Run query to verify schema:

```cypher
SHOW CONSTRAINTS
```

You should see constraints for Node.id, Source.fingerprint, etc.

## Development Workflow

### Adding a New Package

```bash
mkdir -p packages/my-package/src
cd packages/my-package
npm init -y
```

Add to root `package.json` workspaces (already configured).

### Building Packages

```bash
# Build all packages
npm run build

# Build specific package
cd packages/types
npm run build
```

### Type Checking

```bash
# Check all workspaces
npm run type-check

# Check specific app
cd apps/web
npm run type-check
```

## Troubleshooting

### Neo4j Connection Issues

1. Verify Neo4j is running:

```bash
docker ps | grep neo4j
```

2. Check Neo4j logs:

```bash
docker logs neo4j
```

3. Test connection:

```bash
curl http://localhost:7474
```

### Port Conflicts

If ports 3000 or 3001 are in use:

```bash
# Change API port
PORT=3002 npm run dev

# Change frontend port
cd apps/web
PORT=3001 npm run dev
```

### Module Resolution Errors

Clear Turborepo cache:

```bash
rm -rf .turbo
rm -rf node_modules
npm install
```

### TypeScript Errors in Monorepo

Build packages in dependency order:

```bash
cd packages/types && npm run build
cd ../db && npm run build
cd ../ui && npm run build
```

## Next Steps

1. ✅ Verify all services are running
2. 📝 Review [Living Spec](ai_context/canvas_memory_os_living_spec_v_0.md)
3. 🎨 Explore UI mockups in `ai_context/mock_screenshots/`
4. 🔧 Start implementing Phase 1B: File ingest pipeline

## Resources

- [Turborepo Docs](https://turbo.build/repo/docs)
- [Neo4j Driver Docs](https://neo4j.com/docs/javascript-manual/current/)
- [Next.js 14 Docs](https://nextjs.org/docs)
- [Radix UI Components](https://www.radix-ui.com/)
