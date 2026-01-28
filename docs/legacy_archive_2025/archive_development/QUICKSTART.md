# Keimenon - Quick Start Guide

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Neo4j database running at `bolt://localhost:7687` (or update `.env` with your connection details)

## Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment**:
   The `.env` and `apps/web/.env.local` files have been created with default settings:
   - API server runs on port 3001
   - Neo4j connection: `bolt://localhost:7687`
   - Web app connects to API at `http://localhost:3001`

3. **Start Neo4j** (if not already running):
   ```bash
   # Using Docker:
   docker run -p 7687:7687 -p 7474:7474 -e NEO4J_AUTH=neo4j/password neo4j:latest
   ```

## Running the Application

### Option 1: Start everything at once (recommended)

```bash
npm run dev
```

This starts both the API server and web app using Turbo.

### Option 2: Start individually

```bash
# Terminal 1 - API Server
cd apps/api
npm run dev

# Terminal 2 - Web App
cd apps/web
npm run dev
```

## Accessing the Application

1. Open your browser to: http://localhost:3000
2. You'll be redirected to the login page
3. Enter any email/password (mock auth for development)
4. You'll be taken to the keimenon

## First Upload

### Via Welcome Modal (first time users):

1. On your first visit, you'll see a welcome modal
2. Click the "Upload Files" card to open the upload interface

### Via Toolbar:

1. Click the "Upload Sources" button in the toolbar
2. Drag and drop files or click to browse
3. Supported formats: PDF, TXT, Markdown, PNG, JPEG, JSON, CSV
4. Configure upload options if needed (board, auto-group, duplicate detection)
5. Click "Upload"

### Via Empty State Cards:

1. Click any of the action cards on the keimenon empty state
2. The "Upload Sources" card opens the upload modal

## Troubleshooting

### Upload fails with "Not Found" error:

- Ensure the API server is running on port 3001
- Check that `apps/web/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3001`
- Verify the storage directory exists: `storage/temp`

### Can't connect to Neo4j:

- Verify Neo4j is running: http://localhost:7474
- Check credentials in `.env` match your Neo4j instance
- Default: `neo4j/password`

### Port already in use:

- API (3001): Change `PORT` in `.env`
- Web (3000): Next.js will auto-increment to 3001 if busy
- Update `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` if you change API port

## Architecture

```
keimenon/
├── apps/
│   ├── api/          # Express API server (port 3001)
│   └── web/          # Next.js web app (port 3000)
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── db/           # Neo4j client
│   ├── ui/           # Shared UI components
│   └── parsers/      # File parsers
└── storage/          # File upload storage
    └── temp/         # Temporary upload directory
```

## Features Implemented

✅ Mock authentication flow
✅ Keimenon UI with header, toolbar, sidebars, footer
✅ File upload with drag & drop
✅ First-time user welcome modal
✅ Upload configuration options
✅ Empty state guidance
✅ Responsive layout (collapsible panels)

## Next Steps

- Start Neo4j database
- Run `npm run dev`
- Open http://localhost:3000
- Upload your first sources!

For more details, see the documentation in `ai_context/`.
