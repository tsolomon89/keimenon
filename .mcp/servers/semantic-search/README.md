# Keimenon — Semantic Search MCP Server (Read-Only)

## Purpose

Exposes Keimenon's deterministic local search graph to AI agents through MCP.
Agents use the exact same BM25 index, phrase graph, traversal service, and
provenance model as the human UI.

This server is a thin JSON-RPC → HTTP adapter. It does **not** access the
database directly. All queries go through the local Keimenon API which enforces
auth, account isolation, topic visibility, sequester policy, and provenance.

## Required Environment Variables

| Variable             | Description                                    | Example                  |
| -------------------- | ---------------------------------------------- | ------------------------ |
| `KEIMENON_API_URL`   | Local Keimenon API base URL                    | `http://localhost:3001`  |
| `KEIMENON_MCP_TOKEN` | JWT Bearer token (obtain via login API or CLI) | `eyJhbGciOiJIUzI1NiI...` |

## Optional Environment Variables

| Variable              | Description                                 |
| --------------------- | ------------------------------------------- |
| `KEIMENON_ACCOUNT_ID` | Override account ID (validated server-side) |

## How to Obtain a Token

```bash
# Login via the API to get a JWT token
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  | jq -r '.token'
```

Set the token in your environment or `.mcp/config.json` env block.

## Tools

### 1. `search_user_corpus`

BM25-ranked search over the user's local knowledge corpus.

**Inputs:**
| Parameter | Type | Default | Description |
|-----------|---------|---------|--------------------------------|
| `q` | string | — | Search query (1–500 chars) |
| `limit` | number | 20 | Max results (max 25) |
| `minScore`| number | 0.01 | Minimum BM25 score threshold |
| `explain` | boolean | true | Include score component breakdown |

**Returns:** Ranked spans with source IDs, snippets, matched terms, BM25 score components, provenance.

**Backend:** `GET /api/v1/search/query`

### 2. `explain_connection`

Explain why two sources are semantically connected.

**Inputs:**
| Parameter | Type | Description |
|-----------|--------|----------------------|
| `sourceA` | string | First source node ID |
| `sourceB` | string | Second source node ID|

**Returns:** Shared phrases, co-occurrence evidence, promoted topic paths, source overlap score.

**Backend:** `GET /api/v1/search/explain-connection`

### 3. `traverse_topic_graph`

Localized graph traversal from specific nodes.

**Inputs:**
| Parameter | Type | Default | Description |
|-------------------------|----------|---------|---------------------------------------------|
| `rootNodeIds` | string[] | — | Starting node IDs (1–100) |
| `maxHops` | number | 2 | Max depth (max 3) |
| `expansionStrategy` | string | mixed | phrase/topic/source_overlap/bm25/provenance/mixed |
| `includeSuggestedTopics`| boolean | false | Include status=suggested topics |
| `includeSequestered` | boolean | false | Include sequestered nodes |
| `minEdgeWeight` | number | 0 | Minimum edge weight threshold (0–1) |

**Returns:** Traversal paths, included/excluded nodes, ranked spans/sources, provenance.

**Backend:** `POST /api/v1/spine/traverse`

### 4. `build_context_pack`

Build a deterministic ContextPack from a traversal. Not persisted.

**Inputs:**
| Parameter | Type | Default | Description |
|-------------------------|----------|---------|----------------------------------|
| `rootNodeIds` | string[] | — | Starting node IDs (1–100) |
| `maxHops` | number | 2 | Max depth (max 3) |
| `maxChars` | number | 12000 | Max chars in context pack |
| `includeSuggestedTopics`| boolean | false | Include status=suggested topics |
| `includeSequestered` | boolean | false | Include sequestered nodes |
| `expansionStrategy` | string | mixed | Expansion strategy |

**Returns:** Deterministic context pack with ranked snippets, provenance, budget info.

**Backend:** `POST /api/v1/spine/context-pack`

### 5. `preview_unified_doc`

Generate a deterministic markdown preview. Does NOT write to the graph.

**Inputs:**
| Parameter | Type | Default | Description |
|-------------------------|----------|---------|----------------------------------|
| `rootNodeIds` | string[] | — | Starting node IDs (1–100) |
| `maxHops` | number | 2 | Max depth (max 3) |
| `maxChars` | number | 12000 | Max chars in document |
| `includeSuggestedTopics`| boolean | false | Include status=suggested topics |

**Returns:** Markdown preview with provenance links back to raw sources.

**Backend:** `POST /api/v1/spine/unified-doc`

## Safety Defaults

All tools enforce conservative defaults per AGENTS.md:

- `includeSuggestedTopics = false` — suggested topics are invisible unless explicitly requested
- `includeSequestered = false` — sequestered nodes are excluded
- `maxHops ≤ 3` — traversal depth is bounded
- `limit ≤ 25` — search result count is bounded
- `maxChars ≤ 200000` — output size is bounded
- Rejected topics are **never** returned (enforced by the API)
- **No write tools** are exposed by this server

## Testing

### List tools

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | KEIMENON_API_URL=http://localhost:3001 KEIMENON_MCP_TOKEN=your_token \
    node .mcp/servers/semantic-search/index.js
```

### Search

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_user_corpus","arguments":{"q":"symbolic necessity","limit":5}}}' \
  | KEIMENON_API_URL=http://localhost:3001 KEIMENON_MCP_TOKEN=your_token \
    node .mcp/servers/semantic-search/index.js
```

### Explain connection

```bash
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"explain_connection","arguments":{"sourceA":"src-id-1","sourceB":"src-id-2"}}}' \
  | KEIMENON_API_URL=http://localhost:3001 KEIMENON_MCP_TOKEN=your_token \
    node .mcp/servers/semantic-search/index.js
```

## Verification Checklist

1. ✅ `tools/list` returns exactly 5 tools
2. ✅ `search_user_corpus` calls local API and returns structured BM25 results
3. ✅ `explain_connection` returns provenance paths
4. ✅ `traverse_topic_graph` respects `includeSuggestedTopics=false`
5. ✅ `build_context_pack` is deterministic
6. ✅ `preview_unified_doc` does not write to the graph
7. ✅ Auth failure returns clear MCP error with diagnostic
8. ✅ API unavailable returns clear MCP error with diagnostic
9. ✅ Account isolation is enforced by backend API
10. ✅ Read-only server exposes no write tools
