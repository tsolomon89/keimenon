# Quick Start Guide

Get Canvas Memory OS running in 5 minutes!

## Prerequisites

- **Node.js 18+** and **npm 9+**
- **Neo4j 5.x** (Docker or cloud)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

This installs all packages in the monorepo (~2-3 minutes).

### 2. Start Neo4j

#### Option A: Docker (Recommended)

```bash
docker run --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/testpassword \
  neo4j:5.19
```

#### Option B: Neo4j Aura (Cloud)

1. Sign up at https://neo4j.com/cloud/aura-free/
2. Create free instance
3. Note connection URI and password

### 3. Configure Environment

**Backend** (`apps/api/.env`):

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=testpassword
STORAGE_PATH=./storage
```

**Frontend** (`apps/web/.env.local`):

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Start Development Servers

```bash
npm run dev
```

This starts:

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001

You should see:

```
⚡️ Canvas Memory API running on port 3001
🔌 Connecting to Neo4j...
✅ Connected to Neo4j
🔧 Initializing Neo4j schema...
💾 Initializing storage...
```

### 5. Test the Application

#### Upload Files

1. Open http://localhost:3000
2. Click **"Ingest Files"**
3. Drag & drop some files (PDF, images, text, etc.)
4. Click **"Upload"**
5. See results: uploaded sources, auto-generated groups, duplicates

#### View Canvas

1. Click **"View on Canvas"**
2. See your files as nodes on a 2D graph
3. Try:
   - **Pan**: Click & drag background
   - **Zoom**: Scroll wheel
   - **Select**: Click nodes
   - **Multi-select**: Shift + click

---

## Troubleshooting

### Neo4j Connection Failed

**Problem**: API can't connect to Neo4j

**Solution**:

```bash
# Check Neo4j is running
docker ps | grep neo4j

# View logs
docker logs neo4j

# Test connection
curl http://localhost:7474
```

### Port Already in Use

**Problem**: Port 3000 or 3001 taken

**Solution**:

```bash
# Change API port
PORT=3002 npm run dev

# Or kill processes
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:3000 | xargs kill
```

### Module Not Found Errors

**Problem**: TypeScript can't find modules

**Solution**:

```bash
# Clean and rebuild
rm -rf node_modules .turbo
npm install
cd packages/types && npm run build
cd ../db && npm run build
```

### Upload Fails

**Problem**: File upload returns 500 error

**Solution**:

1. Check storage directory exists: `ls storage/`
2. Check file size (must be <10MB)
3. Check file type is allowed (see `.env.example`)
4. Check API logs for detailed error

---

## Development Workflow

### Add New Files

1. Upload via `/ingest` page
2. Files are fingerprinted (SHA-256)
3. Automatically grouped by type/domain
4. Stored in `storage/uploads/`
5. Nodes created in Neo4j

### View Graph

1. Go to `/board/default_board`
2. Canvas loads all nodes
3. D3-force calculates layout
4. Render at 60 FPS

### Modify Code

Changes hot-reload automatically:

- **Frontend**: Next.js Fast Refresh
- **Backend**: tsx watch mode

### Build for Production

```bash
npm run build
```

Builds all packages and apps.

---

## Key Directories

```
apps/
├── web/        # Next.js frontend (port 3000)
└── api/        # Express backend (port 3001)

packages/
├── types/      # Shared TypeScript types
├── db/         # Neo4j client
├── ui/         # React components
└── graph/      # Graph algorithms

storage/
├── uploads/    # Uploaded files
└── temp/       # Temporary files
```

---

## Key Files

### Frontend

- `apps/web/src/app/page.tsx` - Landing page
- `apps/web/src/app/ingest/page.tsx` - File upload
- `apps/web/src/app/board/[id]/page.tsx` - Canvas
- `apps/web/src/components/canvas/Canvas2D.tsx` - Graph renderer

### Backend

- `apps/api/src/index.ts` - Main server
- `apps/api/src/routes/ingest.ts` - Upload endpoint
- `apps/api/src/routes/nodes.ts` - Node CRUD
- `apps/api/src/services/autogroup.ts` - Clustering

### Packages

- `packages/types/src/nodes.ts` - Node schemas
- `packages/types/src/edges.ts` - Edge schemas
- `packages/graph/src/layout.ts` - D3-force layout
- `packages/db/src/neo4j.ts` - Database client

---

## API Endpoints

Test with curl:

```bash
# Health check
curl http://localhost:3001/health

# List nodes
curl http://localhost:3001/api/v1/nodes

# Upload file
curl -X POST http://localhost:3001/api/v1/ingest/files \
  -F "files=@example.pdf" \
  -F "board_id=default_board"

# Get node
curl http://localhost:3001/api/v1/nodes/src_abc123
```

---

## Next Steps

1. ✅ Upload some files
2. ✅ View on canvas
3. ✅ Test selection & zoom
4. 📖 Read [PROGRESS.md](PROGRESS.md) for detailed status
5. 📖 Read [ROADMAP.md](ROADMAP.md) for what's next
6. 🔧 Start implementing Phase 1D (Claims & Docs)

---

## Getting Help

- **Documentation**: See `ai_context/` folder
- **Issues**: Check console logs (browser & terminal)
- **Database**: Neo4j Browser at http://localhost:7474

---

**Ready to build the future of knowledge management!** 🚀
