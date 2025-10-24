# Quick Start: Local-First Storage

## TL;DR

Canvas Memory now stores your documents **locally** (`~/.canvas-memory/`) and only keeps metadata in Neo4j. This gives you:

- 🔒 **Privacy:** Documents never leave your machine
- 💰 **Cost:** 90% reduction in Neo4j storage
- ⚡ **Speed:** Faster queries, instant local access

---

## For New Installations

### 1. Start the Server

```bash
npm run dev:boot
```

The server will automatically:

- ✅ Initialize `~/.canvas-memory/documents/`
- ✅ Create metadata directories
- ✅ Connect to Neo4j
- ✅ Print storage location

You'll see:

```
📁 Initializing local document store...
✅ Local document store initialized at: /Users/you/.canvas-memory
```

### 2. Import Conversations

Use the existing import endpoints - they now use local storage automatically:

```bash
curl -X POST http://localhost:4001/api/v1/import/enhanced \
  -F "files=@my-chat-export.json" \
  -F 'config={"export_code":true,"sources_cap":150}'
```

**What happens:**

1. Content saves to `~/.canvas-memory/documents/`
2. Metadata saves to Neo4j with `content_location` pointers
3. You can view the graph immediately (metadata only, fast!)

### 3. Access Content

**Via API:**

```bash
# Get message content
curl http://localhost:4001/api/v1/content/message/{msg_id}

# Get storage stats
curl http://localhost:4001/api/v1/content/stats
```

**Via Frontend:**
The canvas loads graph structure instantly, then lazy-loads content when you click nodes.

---

## For Existing Installations (Migration)

If you have data already stored in Neo4j, migrate it to local storage:

### Step 1: Dry Run (Safe - No Changes)

```bash
npm run migrate:to-local:dry-run
```

This shows what would be migrated without making any changes.

Example output:

```
💬 Migrating Messages...
   ✅ 1,234 migrated, 0 skipped, 0 errors

📄 Migrating Sources...
   ✅ 45 migrated, 0 skipped, 0 errors

💻 Migrating Code Blocks...
   ✅ 67 migrated, 0 skipped, 0 errors

Total Bytes: 123.45 MB
```

### Step 2: Run Migration

```bash
npm run migrate:to-local
```

**What it does:**

1. Reads all Messages/Sources/CodeBlocks from Neo4j
2. Extracts content fields
3. Saves to `~/.canvas-memory/documents/`
4. Updates Neo4j nodes with `content_location` pointers
5. Removes `content` fields from Neo4j
6. Verifies integrity

### Step 3: Verify

```bash
# Check local storage
ls -lah ~/.canvas-memory/documents/messages/
ls -lah ~/.canvas-memory/documents/sources/

# Check Neo4j (should show metadata only)
curl http://localhost:4001/api/v1/content/stats
```

---

## File Structure

After import/migration, your local storage looks like:

```
~/.canvas-memory/
├── documents/
│   ├── conversations/
│   │   └── conv_abc123/
│   │       ├── conversation.json    # Full export
│   │       └── [archived messages]
│   ├── messages/
│   │   └── conv_abc123/
│   │       ├── conv_abc123_msg_0.md
│   │       ├── conv_abc123_msg_1.md
│   │       └── ...
│   ├── sources/
│   │   ├── src_xyz456.md            # Stitched source doc
│   │   └── ...
│   └── code/
│       ├── code_def789.py           # Extracted code
│       ├── code_ghi012.js
│       └── ...
└── metadata/
    ├── conv_abc123.meta.json        # File metadata
    ├── src_xyz456.meta.json
    └── ...
```

---

## Checking Storage Stats

```bash
curl http://localhost:4001/api/v1/content/stats | jq
```

Example response:

```json
{
  "local_storage": {
    "totalDocuments": 1346,
    "totalSize": 129485760, // ~123 MB
    "byType": {
      "message": { "count": 1234, "size": 115343360 },
      "source": { "count": 45, "size": 8942400 },
      "code": { "count": 67, "size": 5200000 }
    },
    "path": "~/.canvas-memory"
  },
  "neo4j": {
    "total_nodes": 1500,
    "message_nodes": 1234,
    "source_nodes": 45,
    "code_block_nodes": 67
  },
  "storage_model": "local-first"
}
```

**Before migration:**

- Neo4j: ~120 MB (full content)

**After migration:**

- Neo4j: ~5-10 MB (metadata only) → **90% reduction!**
- Local: ~120 MB (content, free storage)

---

## Frontend Usage

### Load Graph (Metadata Only)

```typescript
const { nodes, edges } = await fetch('/api/v1/boards/board_123/graph').then((r) => r.json());

// Fast! Only ~10-50KB response with metadata
```

### Lazy-Load Content

```typescript
const loadMessageContent = async (messageId: string) => {
  const { content } = await fetch(`/api/v1/content/message/${messageId}`).then((r) => r.json());

  return content; // Instant! Reads from local filesystem
};
```

### Example Component

```tsx
function MessageNode({ node }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleExpand = async () => {
    setLoading(true);
    const { content } = await fetch(`/api/v1/content/message/${node.id}`).then((r) => r.json());
    setContent(content);
    setLoading(false);
  };

  return (
    <div>
      <h4>
        {node.role} - {new Date(node.timestamp).toLocaleString()}
      </h4>
      {!content ? (
        <button onClick={handleExpand}>{loading ? 'Loading...' : 'Show Content'}</button>
      ) : (
        <div className="content">{content}</div>
      )}
    </div>
  );
}
```

---

## Environment Config

### Default (Uses `~/.canvas-memory`)

```bash
# apps/api/.env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

### Custom Storage Location

```bash
# apps/api/.env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Custom path
LOCAL_DOCS_PATH=/custom/path/to/documents
```

---

## Backup Your Data

### Quick Backup

```bash
# Backup everything
tar -czf canvas-backup-$(date +%Y%m%d).tar.gz ~/.canvas-memory/

# Backup only documents (no metadata cache)
tar -czf canvas-docs-$(date +%Y%m%d).tar.gz ~/.canvas-memory/documents/
```

### Restore

```bash
tar -xzf canvas-backup-20250110.tar.gz -C ~/
```

### Selective Backup

```bash
# Backup only conversations
tar -czf conversations-backup.tar.gz \
  ~/.canvas-memory/documents/conversations/

# Backup only sources
tar -czf sources-backup.tar.gz \
  ~/.canvas-memory/documents/sources/
```

---

## Troubleshooting

### "Content not found" errors

**Check if file exists:**

```bash
ls ~/.canvas-memory/documents/messages/{conv_id}/{msg_id}.md
```

**Check Neo4j node:**

```bash
curl http://localhost:4001/api/v1/nodes/{msg_id} | jq '.node.content_location'
# Should show: "local://documents/messages/..."
```

### Permission errors

```bash
# Ensure directory is writable
chmod -R u+w ~/.canvas-memory/
```

### Migration didn't work

```bash
# Re-run dry run to see what's pending
npm run migrate:to-local:dry-run

# Check Neo4j for nodes still with content
curl 'http://localhost:4001/api/v1/nodes?kind=Message' | \
  jq '.nodes[] | select(.content != null)'
```

---

## Performance Tips

### Large Imports

For large imports (1000+ messages), the system automatically:

- ✅ Deduplicates by content hash
- ✅ Stores only unique content
- ✅ Points multiple nodes to same file if identical

Example:

- 1000 messages with 200 unique contents
- Storage: 200 files (not 1000)
- Neo4j: 1000 metadata nodes pointing to 200 content locations

### Content Access

- **First access:** Reads from disk (~1-5ms)
- **Subsequent:** Can be cached in app memory
- **Network:** Zero latency (local filesystem)

---

## What Changed

### Import Pipeline

```typescript
// OLD: Everything in Neo4j
await neo4j.run(
  `
  CREATE (m:Message {content: $content})  // ❌ Full content
`,
  { content: fullMessageText }
);

// NEW: Content local, metadata in Neo4j
const metadata = await localStore.saveMessage(id, content);
await neo4j.run(
  `
  CREATE (m:Message {
    content_location: $location,  // ✅ Pointer only
    content_hash: $hash,
    char_count: $size
  })
`,
  { location: metadata.location, hash: metadata.hash, size: metadata.size }
);
```

### Content Retrieval

```typescript
// OLD: Read from Neo4j
const result = await neo4j.run(`MATCH (m:Message {id: $id}) RETURN m.content`);
const content = result.records[0].get('content'); // ❌ Slow, cloud DB

// NEW: Read from local filesystem
const result = await neo4j.run(`MATCH (m:Message {id: $id}) RETURN m.content_location`);
const location = result.records[0].get('content_location');
const content = await localStore.getContentByPath(location); // ✅ Fast, local
```

---

## Next Steps

1. ✅ **Backend complete** - All APIs ready
2. ⏳ **Frontend pending** - Update canvas to use content APIs
3. 🔮 **Future:**
   - Optional cloud backup (encrypted)
   - Multi-device sync
   - Local vector search
   - Export tools

---

## Questions?

- **Architecture details:** See `ARCHITECTURE_LOCAL_FIRST.md`
- **Full summary:** See `LOCAL_FIRST_IMPLEMENTATION_SUMMARY.md`
- **Issues:** Check troubleshooting section above

---

## Summary

### Before

```
[User uploads] → [Neo4j stores EVERYTHING]
                     ↓
                 Slow, expensive, cloud-dependent
```

### After

```
[User uploads] → [Local storage] + [Neo4j metadata only]
                     ↓              ↓
                  Fast, free     Fast queries
                  Private        Graph structure
```

**Start using it:**

```bash
npm run dev:boot
# Import data normally - local storage is automatic!
```
