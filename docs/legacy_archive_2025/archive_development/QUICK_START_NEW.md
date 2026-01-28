# Quick Start Guide

Get Keimenon running in 5 minutes!

## Prerequisites

- **Node.js 18+** and **npm 9+**
- **Database**: Neo4j 5.x (Docker/cloud) OR SQLite (local, no setup needed!)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

This installs all packages in the monorepo (~2-3 minutes).

### 2. Choose Your Database

#### Option A: SQLite (Easiest - No Setup!) ⭐ RECOMMENDED FOR BEGINNERS

**Best for**: Local development, demos, Free tier, quick testing

✅ No installation needed!
✅ Single file database
✅ Works immediately
✅ Perfect for <10k nodes

Just skip to step 3 and use the SQLite configuration below.

#### Option B: Neo4j via Docker

**Best for**: Large graphs (>10k nodes), production deployments, advanced queries

```bash
docker run --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/testpassword \
  neo4j:5.19
```

#### Option C: Neo4j Aura (Cloud)

1. Sign up at https://neo4j.com/cloud/aura-free/
2. Create free instance
3. Note connection URI and password

### 3. Configure Environment

**Backend** (`apps/api/.env`):

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

**For SQLite (local mode) - EASIEST:**

```env
STORAGE_MODE=local
DATABASE_PATH=./data/keimenon.db
STORAGE_PATH=./storage
PORT=3001
```

**For Neo4j (keimenon mode):**

```env
STORAGE_MODE=keimenon
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=testpassword
STORAGE_PATH=./storage
PORT=3001
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
⚡️ Keimenon API running on port 3001
🔌 Connecting to database...
✅ Connected to SQLite (or Neo4j)
🔧 Initializing schema...
💾 Initializing storage...
```

### 5. Test the Application

#### Quick Test 1: Upload Files

1. Open http://localhost:3000
2. Click **"Ingest Files"**
3. Drag & drop some files (PDF, images, text, etc.)
4. Click **"Upload"**
5. See results: uploaded sources, auto-generated groups, duplicates

#### Quick Test 2: Import Chat Conversations 🆕 STAR FEATURE!

**Get your chat export:**

- **ChatGPT**: Settings → Data Controls → Export data → Download `conversations.json`
- **Claude**: Settings → Export conversations → Download
- **Gemini**: Activity → Download your data → Select Gemini

**Import it:**

1. Go to http://localhost:3000/ingest
2. Upload your exported JSON file
3. Click **"Import Conversations"** (or use enhanced import)
4. Watch the magic happen:
   - ✨ Conversations automatically parsed
   - 💎 Code blocks extracted
   - 🔍 Duplicates detected
   - 📚 Sources created from meaningful segments
   - 🏷️ Auto-organized by topic

#### View on Keimenon

1. Click **"View on Keimenon"**
2. See your content as nodes on a 2D graph:
   - 🔵 Blue nodes = Files/Sources
   - 🟣 Purple nodes = Groups
   - 💬 Chat nodes = Conversations
   - 💻 Code blocks = Extracted snippets
3. Interact:
   - **Pan**: Click & drag background
   - **Zoom**: Scroll wheel
   - **Select**: Click nodes
   - **Multi-select**: Shift + click

---

## API Quick Reference

Test with curl:

```bash
# Health check
curl http://localhost:3001/health

# List all nodes
curl http://localhost:3001/api/v1/nodes

# Upload files
curl -X POST http://localhost:3001/api/v1/ingest/files \
  -F "files=@example.pdf" \
  -F "board_id=default_board"

# Import chat (basic)
curl -X POST http://localhost:3001/api/v1/import/chat \
  -F "file=@conversations.json" \
  -F "config={}"

# Import chat (enhanced with all features)
curl -X POST http://localhost:3001/api/v1/import/enhanced \
  -F "file=@conversations.json" \
  -F "config={\"export_code\":true,\"duplicate_detection_enabled\":true,\"sources_min_chars_user\":400}"

# View source content
curl http://localhost:3001/api/v1/content/:source_id

# Get board graph
curl http://localhost:3001/api/v1/boards/default_board/graph
```

---

## Troubleshooting

### Database Connection Issues

**SQLite Mode:**

- Check `DATABASE_PATH` directory exists
- Ensure write permissions
- Database file auto-creates on first run

**Neo4j Mode:**

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
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:3000 | xargs kill

# Or change port:
PORT=3002 npm run dev
```

### Module Not Found Errors

**Problem**: TypeScript can't find modules

**Solution**:

```bash
# Clean and rebuild
rm -rf node_modules .turbo
npm install
npm run build
```

### Import Fails

**Problem**: Chat import returns error

**Solutions**:

1. **File too large**: Use `/import-stream` endpoint instead
2. **Wrong format**: Check it's ChatGPT/Claude/Gemini JSON
3. **Memory issues**: Use SQLite mode (more efficient)
4. **Malformed JSON**: Validate JSON syntax

```bash
# Test JSON validity
cat conversations.json | jq . > /dev/null && echo "Valid JSON" || echo "Invalid JSON"
```

---

## Development Workflow

### Import Chat Workflow (Most Common)

1. Export from ChatGPT/Claude/Gemini
2. Upload to `/ingest` page
3. Choose import options:
   - **Sources mode**: Extract meaningful segments
   - **Code extraction**: Auto-detect code blocks
   - **Duplicate detection**: Find and merge similar content
4. Review import results
5. View on keimenon
6. Generate documentation from sources

### File Upload Workflow

1. Upload via `/ingest` page
2. Files fingerprinted (SHA-256)
3. Automatically grouped by type/domain
4. Stored in `storage/uploads/`
5. Nodes created in database

### View & Organize

1. Go to `/board/default_board`
2. Keimenon renders graph with D3-force layout
3. Pan, zoom, select nodes
4. Group related content
5. Export to Markdown

---

## Key Directories

```
apps/
├── web/           # Next.js frontend (port 3000)
└── api/           # Express backend (port 3001)

packages/
├── types/         # Shared TypeScript types
├── db/            # Neo4j + SQLite clients
├── parsers/       # ChatGPT, Claude, Gemini parsers ⭐
├── ui/            # React components
└── graph/         # Graph algorithms

storage/
├── uploads/       # Uploaded files
└── temp/          # Temporary files

data/              # SQLite database (local mode)
└── keimenon.db      # Auto-created
```

---

## Key Files

### Frontend

- `apps/web/src/app/page.tsx` - Landing page
- `apps/web/src/app/ingest/page.tsx` - File upload & import UI
- `apps/web/src/app/board/[id]/page.tsx` - Keimenon viewer
- `apps/web/src/components/keimenon/Keimenon2D.tsx` - Graph renderer

### Backend (Imports ⭐)

- `apps/api/src/routes/import.ts` - Basic chat import
- `apps/api/src/routes/import-enhanced.ts` - Advanced import
- `apps/api/src/routes/import-stream.ts` - Streaming import
- `apps/api/src/services/import.ts` - Import orchestration
- `apps/api/src/services/code-extractor.ts` - Code block extraction
- `apps/api/src/services/similarity-engine.ts` - Duplicate detection

### Backend (Core)

- `apps/api/src/index.ts` - Main server
- `apps/api/src/routes/ingest.ts` - File upload
- `apps/api/src/routes/nodes.ts` - Node CRUD
- `apps/api/src/services/autogroup.ts` - Clustering

### Parsers ⭐

- `packages/parsers/src/parsers/chatgpt.ts` - ChatGPT parser
- `packages/parsers/src/parsers/claude.ts` - Claude parser
- `packages/parsers/src/parsers/gemini.ts` - Gemini parser
- `packages/parsers/src/sources/segment-extractor.ts` - Sources mode

### Database

- `packages/db/src/neo4j.ts` - Neo4j client
- `packages/db/src/sqlite/client.ts` - SQLite client
- `packages/db/src/database-factory.ts` - Storage mode factory

---

## Next Steps

### For Users:

1. ✅ Import your ChatGPT conversations
2. ✅ Explore the keimenon
3. ✅ Extract code blocks
4. 📖 Read [IMPORT_GUIDE.md](IMPORT_GUIDE.md) for detailed import instructions
5. 📖 Read [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for feature overview

### For Developers:

1. 📖 Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
2. 📖 Read [MASTER_DOCS.md](MASTER_DOCS.md) for complete reference
3. 📖 Read [TODO_TRACKER.md](TODO_TRACKER.md) for remaining work
4. 🔧 Check out the parser code in `packages/parsers/`
5. 🧪 Run tests: `npm run test`

---

## Feature Highlights

### What Makes Keimenon Unique:

✅ **Import AI Conversations** - ChatGPT, Claude, Gemini support
✅ **Auto-Extract Code** - Never lose that perfect snippet again
✅ **Duplicate Detection** - Smart merging with 4 algorithms
✅ **Local-First** - SQLite mode, your data stays on your machine
✅ **Visual Organization** - See your knowledge as a graph
✅ **Sources Mode** - Extract meaningful segments from chats
✅ **Free Tier** - Generous limits, no credit card needed

---

## Getting Help

- **Import Issues**: See [IMPORT_GUIDE.md](IMPORT_GUIDE.md)
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)
- **General Docs**: See `ai_context/` folder
- **Console Logs**: Browser DevTools & terminal output
- **Database Browser**:
  - Neo4j: http://localhost:7474
  - SQLite: Use DB Browser for SQLite or `sqlite3 data/keimenon.db`

---

## Pro Tips

### Speed Up Development

```bash
# Use SQLite for fast local dev
STORAGE_MODE=local npm run dev

# Hot reload works for both frontend and backend
# Just save files and changes apply instantly
```

### Import Large Chat Histories

```bash
# Use streaming import for files >50MB
curl -X POST http://localhost:3001/api/v1/import-stream \
  -F "file=@large_conversations.json"

# Enable only what you need
curl -X POST http://localhost:3001/api/v1/import/enhanced \
  -F "file=@conversations.json" \
  -F "config={\"export_code\":true,\"duplicate_detection_enabled\":false}"
```

### Backup Your Data

```bash
# SQLite: Just copy the file
cp data/keimenon.db data/keimenon-backup.db

# Neo4j: Use neo4j-admin dump
docker exec neo4j neo4j-admin database dump neo4j
```

---

**Ready to organize your AI conversations! 🚀**

Start with the SQLite mode for the easiest experience, then switch to Neo4j when you need more power!
