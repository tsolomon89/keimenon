# Search & Query System (Planned)

**Status**: Planned / Partially Designed
**Backend**: SQLite FTS5 (Implemented in DB layer)
**API**: Pending

## Overview

The Search system will provide full-text search capabilities across all node content in the Knowledge Graph. It leverages SQLite's FTS5 extension to enable fast, ranked text search.

## Architecture

### Database Layer (Implemented)

The database schema already includes an FTS5 virtual table `nodes_fts` that automatically syncs with the `nodes` table via triggers.

```sql
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  id UNINDEXED,
  content,
  content='nodes',
  content_rowid='rowid'
);
```

### API Layer (Planned)

**Endpoint**: `GET /api/v1/search`

**Parameters**:

- `q`: Search query (required)
- `kind`: Filter by node kind (optional)
- `limit`: Max results (default 50)

### Features Roadmap

- [ ] **Basic Text Search**: Match keywords in content.
- [ ] **Ranking**: Rank results by relevance (BM25).
- [ ] **Filtering**: Filter by properties (kind, date, author).
- [ ] **Snippets**: Return highlighted text snippets.
- [ ] **Vector Search**: Future integration with vector embeddings for semantic search.

## Usage Example (Proposed)

```bash
curl "http://localhost:3001/api/v1/search?q=machine+learning&kind=Source"
```

## Integration

The frontend will use a global search bar (`Cmd+K`) to access this API, displaying results grouped by type (Sources, Groups, Messages).
