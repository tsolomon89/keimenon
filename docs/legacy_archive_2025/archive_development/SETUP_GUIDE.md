# Canvas Memory OS - Setup Guide

Complete guide to get Canvas Memory OS running in 5 minutes.

---

## Quick Start (Automated) 🚀

### Windows Users

```bash
setup.bat
```

The script will:

- Check prerequisites
- Install dependencies
- Create environment files
- Guide you through Neo4j setup
- Build all packages

Then just run:

```bash
npm run dev
```

---

## Manual Setup 📋

### Prerequisites

- **Node.js 18+** and **npm 9+**
- **Neo4j database** (Cloud or Docker)

### Step 1: Install Dependencies (2-3 min)

```bash
npm install
```

### Step 2: Configure Neo4j

#### Option A: Neo4j Aura (Cloud - Recommended) ☁️

**Why Aura?**

- Free forever (no credit card)
- 50,000 nodes / 175,000 relationships
- No Docker required
- 24/7 availability
- Perfect for development

**Setup:**

1. Go to https://console.neo4j.io/
2. Click "Start Free"
3. Sign up with email (no credit card)
4. Create a new free instance
5. Copy your connection details:
   - Connection URI (e.g., `neo4j+s://xxxxx.databases.neo4j.io`)
   - Username (default: `neo4j`)
   - Password (you set this)

#### Option B: Local Docker 🐳

**Requirements:**

- Docker Desktop installed

**Setup:**

```bash
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/testpassword \
  neo4j:5.19
```

**Credentials:**

- URI: `bolt://localhost:7687`
- Username: `neo4j`
- Password: `testpassword`

### Step 3: Environment Files (1 min)

#### Backend Configuration

Create `apps/api/.env`:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
# Server
PORT=3001
NODE_ENV=development

# Neo4j - UPDATE THESE WITH YOUR CREDENTIALS
NEO4J_URI=bolt://localhost:7687           # or neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password              # CHANGE THIS

# Storage
STORAGE_PATH=./storage
MAX_FILE_SIZE_MB=10

# Auth (placeholder)
JWT_SECRET=your_secret_key_here           # CHANGE THIS (any random string)

# Limits (Free tier)
FREE_MAX_SOURCES=500
FREE_MAX_NODES=20000
FREE_MAX_GROUPS=50
FREE_STORAGE_GB=5
```

#### Frontend Configuration

Create `apps/web/.env.local`:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
# API
NEXT_PUBLIC_API_URL=http://localhost:3001

# Feature Flags
NEXT_PUBLIC_ENABLE_PRO_FEATURES=false
NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES=false
```

### Step 4: Build Packages (1 min)

```bash
npm run build
```

### Step 5: Launch (1 min)

```bash
npm run dev
```

This starts:

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001

---

## Verify Installation ✅

### 1. Check API Health

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "canvas-memory-api",
  "version": "0.1.0",
  "dependencies": {
    "neo4j": "connected"
  }
}
```

### 2. Check Frontend

Open http://localhost:3000 in your browser.

You should see:

- **Canvas Memory OS** landing page
- Two buttons: "Open Canvas" and "Ingest Files"

### 3. Test File Upload

1. Click "Ingest Files"
2. Drag & drop a test file (PDF, text, image)
3. Click "Upload"
4. You should see:
   - Upload success message
   - File details
   - Auto-generated groups
   - "View on Canvas" button

### 4. Test Canvas Visualization

1. Click "View on Canvas"
2. You should see:
   - 2D canvas with your uploaded files as nodes
   - Pan: Click & drag
   - Zoom: Scroll wheel
   - Select: Click nodes

---

## Troubleshooting 🔧

### Neo4j Connection Failed

**Problem:** API can't connect to Neo4j

**Solution:**

```bash
# Check Neo4j is running
# For Docker:
docker ps | findstr neo4j

# For Aura:
# Check your connection URI and credentials in apps/api/.env
```

### Port Already in Use

**Problem:** Port 3000 or 3001 is taken

**Solution:**

```bash
# Windows - Find what's using the port:
netstat -ano | findstr :3000
# Kill the process:
taskkill /PID <PID> /F
```

### Module Not Found Errors

**Problem:** TypeScript can't find modules

**Solution:**

```bash
# Clean and rebuild
rm -rf node_modules .turbo
npm install
npm run build
```

### Upload Fails

**Problem:** File upload returns 500 error

**Solution:**

1. Check `storage/` directory exists
2. Check file size (must be <10MB)
3. Check API logs for detailed error
4. Verify Neo4j connection in health endpoint

---

## Development Workflow 💻

### Available Commands

```bash
# Start development servers (hot-reload)
npm run dev

# Build all packages
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Clean build artifacts
npm run clean
```

### Monorepo Structure

```
canvas-memory-os/
├── apps/
│   ├── web/              # Next.js frontend (port 3000)
│   └── api/              # Express backend (port 3001)
├── packages/
│   ├── types/            # Shared TypeScript types
│   ├── db/               # Neo4j client
│   ├── ui/               # React components
│   ├── graph/            # Graph algorithms
│   └── parsers/          # File parsers
└── storage/
    └── uploads/          # Uploaded files
```

### Hot Reload

Changes automatically reload:

- **Frontend**: Next.js Fast Refresh
- **Backend**: tsx watch mode

### Testing Changes

1. Upload files via `/ingest`
2. View on canvas via `/board/default_board`
3. Check API endpoints via curl or Postman

---

## API Endpoints 📡

### Health Check

```bash
GET http://localhost:3001/health
```

### List Nodes

```bash
GET http://localhost:3001/api/v1/nodes
```

### Upload Files

```bash
POST http://localhost:3001/api/v1/ingest/files
Content-Type: multipart/form-data

files: <file>
board_id: default_board
```

### Get Board Graph

```bash
GET http://localhost:3001/api/v1/boards/default_board/graph
```

### Full API Documentation

```bash
GET http://localhost:3001/api/v1
```

---

## Security Notes 🔒

### Development Environment

The default `.env` files are configured for **local development only**.

**Before deploying to production:**

1. Change `JWT_SECRET` to a strong random string
2. Use environment-specific Neo4j credentials
3. Enable HTTPS for Neo4j connections (neo4j+s://)
4. Set `NODE_ENV=production`
5. Configure proper CORS origins
6. Review file upload limits

### Neo4j Security

**Aura:**

- Automatically secured with TLS
- Use strong passwords
- Don't commit credentials to git

**Docker:**

- Default password is `testpassword` - fine for local dev
- Change for any shared/exposed environments

---

## Next Steps 🎯

1. ✅ Upload test files via `/ingest`
2. ✅ View files on canvas via `/board/default_board`
3. ✅ Test pan, zoom, and selection
4. 📖 Read [PROGRESS.md](PROGRESS.md) for current status
5. 📖 Read [ROADMAP.md](ROADMAP.md) for upcoming features
6. 🔧 Start building Phase 1D features (Claims & Docs)

---

## Getting Help 💬

- **Documentation**: See `ai_context/` folder
- **Issues**: Check console logs (browser & terminal)
- **Neo4j Browser**: http://localhost:7474 (Docker only)
- **Aura Console**: https://console.neo4j.io/

---

## Quick Reference Card 📇

| Task                    | Command                             |
| ----------------------- | ----------------------------------- |
| Initial setup (Windows) | `setup.bat`                         |
| Start dev servers       | `npm run dev`                       |
| Build packages          | `npm run build`                     |
| Type check              | `npm run type-check`                |
| Frontend URL            | http://localhost:3000               |
| API URL                 | http://localhost:3001               |
| Health check            | `curl http://localhost:3001/health` |
| Neo4j Browser (Docker)  | http://localhost:7474               |
| Neo4j Console (Aura)    | https://console.neo4j.io/           |

---

**Ready to build the future of knowledge management!** 🚀
