# Local-First Storage Architecture

## Overview

Canvas Memory OS now uses a **local-first storage architecture** that separates document content from graph metadata, providing better privacy, cost efficiency, and scalability.

### Key Principles

✅ **User's documents stay 100% local** by default
✅ **Only metadata + graph structure** goes to Neo4j
✅ **Graph DB is the "smart index"** - not the source of truth
✅ **Works offline** - all content locally accessible
✅ **Privacy by design** - documents never leave user's machine

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      User's Machine                         │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ~/.canvas-memory/                                      │ │
│  │  ├── documents/                                         │ │
│  │  │   ├── conversations/{id}/conversation.json          │ │
│  │  │   ├── messages/{conv_id}/{msg_id}.md                │ │
│  │  │   ├── sources/{source_id}.md                        │ │
│  │  │   └── code/{code_id}.{ext}                          │ │
│  │  └── metadata/                                          │ │
│  │      └── {id}.meta.json (file index)                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                    │
│                          │ content read/write                 │
│                          ▼                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Canvas Memory API                                      │ │
│  │  ├── LocalDocumentStore (filesystem ops)               │ │
│  │  ├── Content API (GET /api/v1/content/*)               │ │
│  │  └── Import Pipeline (save local + Neo4j metadata)     │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                    │
└──────────────────────────┼────────────────────────────────────┘
                           │ metadata only
                           ▼
              ┌────────────────────────────┐
              │  Neo4j (Local or Cloud)    │
              │  - Node IDs, timestamps    │
              │  - Graph relationships     │
              │  - Content locations       │
              │  - Embeddings (vectors)    │
              │  - Similarity scores       │
              └────────────────────────────┘
```

---

## Data Flow

### **Import Flow**

```
1. User uploads chat export
   ↓
2. Parser extracts conversations/messages/code
   ↓
3. LocalDocumentStore saves content to ~/.canvas-memory/
   ↓
4. Neo4j gets metadata nodes with content_location pointers
   ↓
5. User sees graph structure instantly (metadata only, fast)
```

### **Retrieval Flow**

```
1. User opens canvas → Load graph from Neo4j (fast, ~10KB)
   ↓
2. User clicks message node → API reads from local filesystem
   ↓
3. Content displayed (instant, no network latency)
```

---

## Storage Locations

### **Local Filesystem** (`~/.canvas-memory/`)

| Type               | Location                                         | Example                              |
| ------------------ | ------------------------------------------------ | ------------------------------------ |
| Full conversations | `documents/conversations/{id}/conversation.json` | Full chat export with all messages   |
| Message content    | `documents/messages/{conv_id}/{msg_id}.md`       | Individual message text              |
| Source documents   | `documents/sources/{source_id}.md`               | Stitched source docs with provenance |
| Code blocks        | `documents/code/{code_id}.{ext}`                 | Extracted code (`.py`, `.js`, etc.)  |
| Metadata index     | `metadata/{id}.meta.json`                        | File metadata (hash, size, path)     |

### **Neo4j Graph Database**

Stores **ONLY**:

```cypher
// Message node (metadata only)
Message {
  id: string,
  role: "user" | "assistant",
  content_location: "local://documents/messages/{conv}/{msg}.md",
  content_hash: string,  // SHA256 for deduplication
  char_count: number,
  timestamp: number,
  thread_id: string
}

// Source node (metadata only)
Source {
  id: string,
  title: string,
  fingerprint: string,
  content_location: "local://documents/sources/{id}.md",
  mime_type: string,
  size_bytes: number
}

// CodeBlock node (metadata only)
CodeBlock {
  id: string,
  language: string,
  content_location: "local://documents/code/{id}.{ext}",
  content_hash: string,
  line_count: number,
  char_count: number
}
```

**Relationships** (always in Neo4j):

```cypher
(ChatThread)-[:HAS_MESSAGE]->(Message)
(Source)-[:COMPILED_FROM]->(Message)
(CodeBlock)-[:DERIVES_FROM]->(Message)
(Message)-[:SIMILAR_TO]->(Message)
(Group)-[:CONTAINS]->(Source|Message|CodeBlock)
```

---

## API Endpoints

### **New Content Retrieval APIs**

```typescript
// Get full message content
GET /api/v1/content/message/:id
Response: { id, content, role, timestamp, source: "local" }

// Get source document
GET /api/v1/content/source/:id
Response: { id, title, content, mime_type, source: "local" }

// Get code block
GET /api/v1/content/code/:id
Response: { id, code, language, source: "local" }

// Get full conversation
GET /api/v1/content/conversation/:id
Response: { id, conversation: {...}, source: "local" }

// Get storage stats
GET /api/v1/content/stats
Response: {
  local_storage: { totalDocuments, totalSize, byType },
  neo4j: { total_nodes, message_nodes, source_nodes },
  storage_model: "local-first"
}
```

### **Existing Graph APIs** (unchanged)

```typescript
// Get graph structure (metadata only, fast)
GET /api/v1/boards/:id/graph
Response: { nodes: [...], edges: [...] }  // ~10-50KB

// Content loaded on-demand when user expands nodes
```

---

## Migration from Old Architecture

If you have existing data with content stored in Neo4j, use the migration script:

```bash
# Dry run (shows what would be migrated)
npm run migrate:to-local:dry-run

# Actual migration
npm run migrate:to-local

# With custom batch size
npm run migrate:to-local -- --batch-size=50
```

**What it does:**

1. Reads all Messages, Sources, and CodeBlocks from Neo4j
2. Extracts content fields
3. Saves content to `~/.canvas-memory/documents/`
4. Updates Neo4j nodes with `content_location` pointers
5. Removes `content` fields from Neo4j
6. Verifies migration integrity

---

## Benefits

### **Privacy**

- 🔒 Documents never leave your machine
- 🔒 No cloud vendor has access to your content
- 🔒 Full control over your data

### **Cost**

- 💰 **90% reduction** in Neo4j storage costs
- 💰 Only small metadata in cloud database
- 💰 Filesystem storage is essentially free

### **Performance**

- ⚡ **Faster graph queries** (no large text fields)
- ⚡ **No network latency** for content reads
- ⚡ **Instant local access** to documents

### **Scalability**

- 📈 Handle **millions of messages** without Neo4j bloat
- 📈 Filesystem scales better than graph DB for large text
- 📈 Easy backup: just copy `~/.canvas-memory/`

---

## Deployment Models

### **Model A: 100% Local (Free Tier)**

```
User's Machine:
  ├─ Documents (Local Filesystem)
  ├─ API Server (Local)
  └─ Neo4j Desktop (Local)
```

**Cost:** $0
**Privacy:** Maximum
**Offline:** Fully functional

### **Model B: Hybrid (Pro Tier)**

```
User's Machine:              Cloud:
  ├─ Documents (Local)         ├─ Neo4j Aura (Graph only)
  ├─ API (Local)               └─ [Optional] Encrypted backup
  └─ Frontend
```

**Cost:** ~$5-10/month (Neo4j Aura small instance)
**Privacy:** Documents stay local, graph syncs
**Offline:** Works offline, syncs when online

### **Model C: Multi-Device (Business Tier)**

```
Device 1:            Cloud:               Device 2:
  Documents  <--->  Graph Index  <--->   Documents
                    + Encrypted
                      Document Sync
```

**Cost:** Custom
**Privacy:** E2E encrypted sync
**Offline:** Each device works independently

---

## Configuration

### **Environment Variables**

```bash
# apps/api/.env

# Neo4j connection (can be local or cloud)
NEO4J_URI=bolt://localhost:7687  # or neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password

# Local document storage path (optional)
LOCAL_DOCS_PATH=~/.canvas-memory  # Default
# Or custom: LOCAL_DOCS_PATH=/path/to/your/documents

# Old storage path (for uploads/temp files)
STORAGE_PATH=./storage
```

### **Programmatic Config**

```typescript
import { getLocalDocumentStore } from './services/local-document-store';

const store = getLocalDocumentStore({
  basePath: '~/.canvas-memory', // Custom path
  enableDeduplication: true, // Content-addressable storage
});

await store.initialize();
```

---

## Frontend Integration

### **Graph-First UI Pattern**

```typescript
// 1. Load graph structure (fast, metadata only)
const graph = await fetch('/api/v1/boards/board_123/graph');
// Response: { nodes: [...], edges: [...] }  (~10KB)

// 2. Render canvas with nodes
<Canvas nodes={graph.nodes} edges={graph.edges} />

// 3. Lazy-load content when user clicks
const handleNodeClick = async (nodeId) => {
  const content = await fetch(`/api/v1/content/message/${nodeId}`);
  setExpandedNode({ ...node, content: content.content });
};
```

**Benefits:**

- Initial load: ~10KB (graph structure)
- Content loaded only when needed
- Scales to thousands of nodes
- No network latency (local reads)

---

## Backup & Portability

### **Full System Backup**

```bash
# Backup documents
tar -czf canvas-memory-backup-$(date +%Y%m%d).tar.gz ~/.canvas-memory/

# Backup Neo4j (if local)
neo4j-admin dump --database=neo4j --to=/path/to/backup/
```

### **Restore on New Machine**

```bash
# 1. Extract documents
tar -xzf canvas-memory-backup.tar.gz -C ~/

# 2. Install Canvas Memory OS
git clone https://github.com/yourorg/canvas-memory-os
cd canvas-memory-os
npm install

# 3. Restore Neo4j (or let it rebuild from documents)
neo4j-admin load --from=/path/to/backup/
```

### **Selective Sync**

```bash
# Sync only specific conversations
rsync -av ~/.canvas-memory/documents/conversations/conv_abc/ \
  other-machine:~/.canvas-memory/documents/conversations/conv_abc/
```

---

## Development

### **Running Locally**

```bash
# Start everything
npm run dev:boot

# Check local storage
ls -lah ~/.canvas-memory/documents/

# View storage stats
curl http://localhost:4001/api/v1/content/stats
```

### **Testing Content Retrieval**

```bash
# Get message content
curl http://localhost:4001/api/v1/content/message/{id}

# Get source document
curl http://localhost:4001/api/v1/content/source/{id}

# Get conversation
curl http://localhost:4001/api/v1/content/conversation/{id}
```

---

## Troubleshooting

### **Content not found**

```bash
# Check if file exists
ls ~/.canvas-memory/documents/messages/{conv_id}/{msg_id}.md

# Check Neo4j node
curl http://localhost:4001/api/v1/nodes/{id}
# Look for content_location field
```

### **Migration issues**

```bash
# Run migration with dry-run first
npm run migrate:to-local:dry-run

# Check for errors
# Fix issues, then run actual migration
npm run migrate:to-local
```

### **Permission errors**

```bash
# Ensure ~/.canvas-memory is writable
chmod -R u+w ~/.canvas-memory/
```

---

## Future Enhancements

### **Planned Features**

- [ ] Optional encrypted cloud backup (user-controlled keys)
- [ ] Selective sync across devices
- [ ] Local vector database for semantic search (e.g., DuckDB + pgvector)
- [ ] Compression for large conversations
- [ ] Git-like versioning for document history
- [ ] Export to standard formats (Markdown, JSON, CSV)

---

## FAQ

**Q: Can I use cloud Neo4j with local documents?**
A: Yes! The graph can be in Neo4j Aura while documents stay local. This enables multi-device graph access while keeping content private.

**Q: What happens if I delete `~/.canvas-memory/`?**
A: You lose all document content. Neo4j will still have metadata, but content APIs will return 404. Always backup before deleting.

**Q: Can I change the storage location?**
A: Yes, set `LOCAL_DOCS_PATH` environment variable. Existing documents must be moved manually.

**Q: Does this work on Windows?**
A: Yes, `~/.canvas-memory` resolves to `C:\Users\{username}\.canvas-memory` on Windows.

**Q: What about mobile/tablet?**
A: Future feature. Would use app-local storage (e.g., iOS Documents folder) with same architecture.

**Q: Can I use S3/cloud storage instead of local filesystem?**
A: Not yet, but planned. The `LocalDocumentStore` interface could support S3/Azure/GCS adapters.

---

## Contributing

When adding new node types with content:

1. Add `content_location` field to schema
2. Make `content` field optional
3. Update `LocalDocumentStore` with new storage method
4. Add corresponding Content API route
5. Update migration script

---

## License

See main project LICENSE file.
