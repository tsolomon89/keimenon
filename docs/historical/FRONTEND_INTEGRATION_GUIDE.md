# Frontend Integration Guide - Local-First Storage

## Overview

This guide shows how to integrate the new local-first storage architecture into your frontend components. The backend is complete and ready to use!

---

## What's Available

### **1. API Client Methods**

Location: [`apps/web/src/lib/api-client.ts`](apps/web/src/lib/api-client.ts)

```typescript
import {
  getMessageContent,
  getSourceContent,
  getCodeContent,
  getConversationContent,
  getStorageStats,
} from '@/lib/api-client';

// Get message content
const message = await getMessageContent(messageId);
// Returns: { id, content, source: 'local'|'neo4j', role, timestamp }

// Get storage stats
const stats = await getStorageStats();
// Returns: { local_storage: {...}, neo4j: {...}, storage_model }
```

### **2. Content Loading Hook**

Location: [`apps/web/src/hooks/useContentLoader.ts`](apps/web/src/hooks/useContentLoader.ts)

```typescript
import { useContentLoader } from '@/hooks/useContentLoader';

function MyComponent() {
  const { loadContent, getContent, isLoading, getError } = useContentLoader();

  const handleClick = async (nodeId: string) => {
    const content = await loadContent(nodeId, 'message');
    console.log(content);
  };

  return <button onClick={() => handleClick('msg_123')}>Load</button>;
}
```

**Features:**

- ✅ In-memory caching (load once)
- ✅ Loading states per node
- ✅ Error handling per node
- ✅ Deduplication (prevents double-loads)

### **3. Pre-built Components**

#### **NodeDetailPanel**

Location: [`apps/web/src/components/canvas/NodeDetailPanel.tsx`](apps/web/src/components/canvas/NodeDetailPanel.tsx)

```typescript
import { NodeDetailPanel } from '@/components/canvas/NodeDetailPanel';

<NodeDetailPanel
  node={selectedNode}
  onClose={() => setSelectedNode(null)}
/>
```

**Features:**

- Auto-loads content when opened
- Shows metadata (ID, timestamp, size)
- Displays content with syntax highlighting (code)
- Shows source badge (Local vs Neo4j)

#### **StorageStatsDashboard**

Location: [`apps/web/src/components/canvas/StorageStatsDashboard.tsx`](apps/web/src/components/canvas/StorageStatsDashboard.tsx)

```typescript
import { StorageStatsDashboard } from '@/components/canvas/StorageStatsDashboard';

// Just drop it in - it's a floating button
<StorageStatsDashboard />
```

**Shows:**

- Local storage stats (total docs, size, by type)
- Neo4j stats (total nodes, by type)
- Storage efficiency metrics

---

## Integration Patterns

### **Pattern 1: Canvas with Detail Panel**

```typescript
import { useState } from 'react';
import { NodeDetailPanel } from '@/components/canvas/NodeDetailPanel';
import { StorageStatsDashboard } from '@/components/canvas/StorageStatsDashboard';

function CanvasPage() {
  const [selectedNode, setSelectedNode] = useState(null);

  return (
    <div className="relative h-screen">
      {/* Your existing canvas */}
      <Canvas2D onNodeClick={setSelectedNode} />

      {/* Detail panel (slides in from right) */}
      <NodeDetailPanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
      />

      {/* Storage stats (floating button) */}
      <StorageStatsDashboard />
    </div>
  );
}
```

### **Pattern 2: Custom Message Display**

```typescript
import { useContentLoader } from '@/hooks/useContentLoader';

function MessageNode({ nodeId, metadata }: { nodeId: string; metadata: any }) {
  const { loadContent, getContent, isLoading } = useContentLoader();
  const [expanded, setExpanded] = useState(false);

  const content = getContent(nodeId);

  const handleExpand = async () => {
    if (!content) {
      await loadContent(nodeId, 'message');
    }
    setExpanded(true);
  };

  return (
    <div className="border rounded p-3">
      {/* Metadata (always visible) */}
      <div className="flex items-center gap-2">
        <span className="font-medium">{metadata.role}</span>
        <span className="text-sm text-gray-500">
          {metadata.char_count} chars
        </span>
        <button onClick={handleExpand} className="text-blue-600">
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Content (lazy-loaded) */}
      {expanded && (
        <div className="mt-2">
          {isLoading(nodeId) && <p>Loading...</p>}
          {content && <p className="whitespace-pre-wrap">{content.content}</p>}
        </div>
      )}
    </div>
  );
}
```

### **Pattern 3: Source Document Viewer**

```typescript
import { useSourceContent } from '@/hooks/useContentLoader';

function SourceViewer({ sourceId }: { sourceId: string }) {
  const { content, isLoading, error, load } = useSourceContent(sourceId);

  useEffect(() => {
    load(); // Auto-load on mount
  }, [load]);

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error} />;
  if (!content) return null;

  return (
    <div>
      <h1>{content.title}</h1>
      <div className="prose" dangerouslySetInnerHTML={{ __html: content.content }} />
    </div>
  );
}
```

### **Pattern 4: Code Block with Copy**

```typescript
import { useCodeContent } from '@/hooks/useContentLoader';

function CodeBlockViewer({ codeId }: { codeId: string }) {
  const { content, isLoading, load } = useCodeContent(codeId);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) return <Spinner />;
  if (!content) return null;

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-mono">{content.language}</span>
        <button onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="bg-gray-900 text-white p-4 rounded overflow-x-auto">
        <code>{content.code}</code>
      </pre>
    </div>
  );
}
```

---

## Example: Updating Canvas2D

Here's how to add content loading to your existing canvas:

```typescript
// apps/web/src/components/canvas/Canvas2D.tsx

import { useState } from 'react';
import { NodeDetailPanel } from './NodeDetailPanel';
import { StorageStatsDashboard } from './StorageStatsDashboard';

export function Canvas2D() {
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);

  // Your existing graph loading logic
  useEffect(() => {
    loadGraphMetadata(); // Loads from /api/v1/boards/:id/graph
  }, []);

  const loadGraphMetadata = async () => {
    // This already works - it loads metadata only
    const response = await fetch('/api/v1/boards/board_123/graph');
    const { nodes, edges } = await response.json();
    setNodes(nodes); // Metadata only - fast!
  };

  return (
    <div className="relative h-screen">
      {/* Your existing canvas rendering */}
      <svg className="w-full h-full">
        {nodes.map(node => (
          <g key={node.id} onClick={() => setSelectedNode(node)}>
            <circle cx={node.x} cy={node.y} r={10} />
            <text x={node.x} y={node.y}>{node.kind}</text>
          </g>
        ))}
      </svg>

      {/* NEW: Detail panel for content */}
      <NodeDetailPanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
      />

      {/* NEW: Storage stats */}
      <StorageStatsDashboard />
    </div>
  );
}
```

**What changed:**

- ✅ Graph loading unchanged (still fast, metadata only)
- ✅ Added `NodeDetailPanel` for content viewing
- ✅ Added `StorageStatsDashboard` for stats
- ✅ Content loaded only when user clicks a node

---

## Performance Optimization

### **Lazy Loading Benefits**

```typescript
// Before (if all content was in graph):
GET /api/v1/boards/board_123/graph
Response: 50MB (100 conversations with full content)
Time: 10-30 seconds

// After (metadata only):
GET /api/v1/boards/board_123/graph
Response: 50KB (100 conversations, metadata only)
Time: 0.5-1 second

// Content loaded on-demand:
GET /api/v1/content/message/msg_123
Response: 5KB (single message)
Time: 0.01 seconds (local filesystem read!)
```

### **Caching Strategy**

The `useContentLoader` hook automatically caches content:

```typescript
const { loadContent, getContent } = useContentLoader();

// First call: loads from API
await loadContent('msg_123', 'message'); // ~10ms (local read)

// Subsequent calls: instant (cached in memory)
const cached = getContent('msg_123'); // <1ms (memory)
```

---

## Testing

### **1. Test API Endpoints**

```bash
# Get message content
curl http://localhost:4001/api/v1/content/message/{msg_id}

# Get storage stats
curl http://localhost:4001/api/v1/content/stats

# Expected response:
{
  "local_storage": {
    "totalDocuments": 123,
    "totalSize": 52428800,  // bytes
    "byType": {
      "message": { "count": 100, "size": 40000000 },
      "source": { "count": 20, "size": 10000000 },
      "code": { "count": 3, "size": 2428800 }
    },
    "path": "~/.canvas-memory"
  },
  "neo4j": {
    "total_nodes": 150,
    "message_nodes": 100,
    "source_nodes": 20,
    "code_block_nodes": 3
  },
  "storage_model": "local-first"
}
```

### **2. Test Components**

```typescript
// Test NodeDetailPanel
import { render, screen } from '@testing-library/react';
import { NodeDetailPanel } from '@/components/canvas/NodeDetailPanel';

test('loads and displays message content', async () => {
  const node = {
    id: 'msg_123',
    kind: 'Message',
    role: 'user',
    timestamp: Date.now(),
  };

  render(<NodeDetailPanel node={node} onClose={() => {}} />);

  // Should show loading state
  expect(screen.getByText(/Loading content/i)).toBeInTheDocument();

  // Wait for content to load
  await waitFor(() => {
    expect(screen.getByText(/Hello world/i)).toBeInTheDocument();
  });
});
```

---

## Migration Checklist

If you have existing components that need updating:

### **For Graph/Canvas Components:**

- [ ] ✅ No changes needed! Graph loading already works (metadata only)
- [ ] Add `NodeDetailPanel` for content viewing
- [ ] Add `StorageStatsDashboard` for stats (optional)

### **For Message/Source Viewers:**

- [ ] Replace direct content access with `useContentLoader` hook
- [ ] Add loading states
- [ ] Add error handling

### **For Conversation Lists:**

- [ ] Keep existing list rendering (uses metadata)
- [ ] Use content APIs when user opens a conversation

---

## Common Patterns

### **Pattern: Virtualized List with Lazy Content**

```typescript
import { useContentLoader } from '@/hooks/useContentLoader';
import { FixedSizeList } from 'react-window';

function MessageList({ messageIds }: { messageIds: string[] }) {
  const { loadContent, getContent, isLoading } = useContentLoader();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleExpand = async (id: string) => {
    if (!getContent(id)) {
      await loadContent(id, 'message');
    }
    setExpandedIds(prev => new Set(prev).add(id));
  };

  const Row = ({ index, style }: { index: number; style: any }) => {
    const id = messageIds[index];
    const content = getContent(id);
    const isExpanded = expandedIds.has(id);

    return (
      <div style={style} className="border-b p-2">
        <div onClick={() => handleExpand(id)} className="cursor-pointer">
          <span className="font-medium">Message {index + 1}</span>
          {isLoading(id) && <span className="text-gray-500"> Loading...</span>}
        </div>
        {isExpanded && content && (
          <div className="mt-2 text-sm">{content.content}</div>
        )}
      </div>
    );
  };

  return (
    <FixedSizeList
      height={600}
      itemCount={messageIds.length}
      itemSize={100}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

### **Pattern: Search Results with Preview**

```typescript
function SearchResults({ results }: { results: Array<{ id: string; preview: string }> }) {
  const { loadContent, getContent } = useContentLoader();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    await loadContent(id, 'message');
  };

  const selectedContent = selectedId ? getContent(selectedId) : null;

  return (
    <div className="flex gap-4">
      {/* Results list (metadata/preview) */}
      <div className="w-1/3 space-y-2">
        {results.map(result => (
          <div
            key={result.id}
            onClick={() => handleSelect(result.id)}
            className="p-3 border rounded cursor-pointer hover:bg-gray-50"
          >
            <p className="text-sm truncate">{result.preview}</p>
          </div>
        ))}
      </div>

      {/* Full content panel (lazy-loaded) */}
      <div className="w-2/3 border rounded p-4">
        {selectedContent ? (
          <div className="whitespace-pre-wrap">{selectedContent.content}</div>
        ) : (
          <p className="text-gray-500">Select a message to view content</p>
        )}
      </div>
    </div>
  );
}
```

---

## Troubleshooting

### **Content not loading**

```typescript
// Check if API is accessible
const testApi = async () => {
  try {
    const stats = await getStorageStats();
    console.log('API working:', stats);
  } catch (error) {
    console.error('API error:', error);
    // Check: Is API running on correct port?
    // Check: Is NEXT_PUBLIC_API_URL set correctly?
  }
};
```

### **CORS issues**

If you see CORS errors, check API base URL:

```typescript
// apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4001

// Or in production:
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### **TypeScript errors**

Make sure types are exported:

```typescript
// apps/web/src/lib/api-client.ts already exports:
export type { MessageContent, SourceContent, CodeContent, ConversationContent, StorageStats };

// Use them in your components:
import type { MessageContent } from '@/lib/api-client';
```

---

## Next Steps

1. **Integrate into existing canvas:**
   - Add `NodeDetailPanel` component
   - Add `StorageStatsDashboard` component
   - Test clicking nodes loads content

2. **Update conversation viewers:**
   - Use `useContentLoader` hook
   - Add loading states
   - Add error handling

3. **Add search/filter:**
   - Search works on metadata (fast)
   - Load full content only for selected results

4. **Monitor performance:**
   - Check `StorageStatsDashboard` for stats
   - Verify content loads quickly (<100ms)
   - Confirm caching works

---

## Summary

**What's Done:**

- ✅ Backend completely ready
- ✅ API client with all content methods
- ✅ Content loading hook with caching
- ✅ Pre-built UI components (panel, dashboard)
- ✅ Full TypeScript support

**What's Left:**

- Import components into your existing pages
- Add click handlers to load content
- Test with real data

**Estimated Integration Time:**

- Simple (add detail panel): ~30 minutes
- Medium (update message viewers): ~2 hours
- Advanced (search, virtualization): ~1 day

---

## Example Complete Integration

Here's a complete example showing everything together:

```typescript
// apps/web/src/app/canvas/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { NodeDetailPanel } from '@/components/canvas/NodeDetailPanel';
import { StorageStatsDashboard } from '@/components/canvas/StorageStatsDashboard';

export default function CanvasPage() {
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGraph();
  }, []);

  const loadGraph = async () => {
    try {
      const response = await fetch('http://localhost:4001/api/v1/boards/board_default/graph');
      const { nodes, edges } = await response.json();
      setNodes(nodes);
    } catch (error) {
      console.error('Failed to load graph:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading graph...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-gray-50">
      {/* Simple node list (replace with your canvas) */}
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Canvas Memory Graph</h1>
        <div className="grid grid-cols-4 gap-4">
          {nodes.map((node: any) => (
            <button
              key={node.id}
              onClick={() => setSelectedNode(node)}
              className="p-4 bg-white border rounded hover:bg-blue-50 text-left"
            >
              <div className="text-sm font-medium">{node.kind}</div>
              <div className="text-xs text-gray-500 truncate">{node.id}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <NodeDetailPanel
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
      />

      {/* Storage stats */}
      <StorageStatsDashboard />
    </div>
  );
}
```

Save this file and visit `/canvas` in your app - everything should work!

---

**Questions? See:**

- `ARCHITECTURE_LOCAL_FIRST.md` - Full architecture details
- `LOCAL_FIRST_IMPLEMENTATION_SUMMARY.md` - Implementation overview
- `QUICK_START_LOCAL_FIRST.md` - Quick start guide
