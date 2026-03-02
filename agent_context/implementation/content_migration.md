# Content Migration Strategy

> **Goal**: Migrate 100% of legacy Markdown/JSON content into the Universal Schema (Records in Database).

## Phase 1: Ingestion

**Contract**:

1.  **Scan**: The ingester MUST walk `ai_context` and `docs/` directories.
2.  **Parse**: It MUST convert Markdown frontmatter + body into structured JSON.
3.  **Hash**: It MUST compute SHA-256 of content to prevent duplicate processing.

## Phase 2: Transformation

Map Source Artifacts to Record Kinds.

- `*.md` MUST map to `kind: 'Concept'`
- `*.ts` MUST map to `kind: 'Asset', type: 'code'`
- `chat_data/*.json` MUST map to `kind: 'Conversation'`

## Phase 3: Loading (Seeding)

**Tool**: `scripts/seed-content.ts`

- **Idempotency**: MUST use deterministic UUIDs based on file path/hash.
- **Linking**:
  - MUST parse internal Markdown links (for example: `Link Text -> ./target-file.md`).
  - MUST resolve target path to UUID.
  - MUST create `Link` record (Concept -> References -> Concept).

## Phase 4: Verification (Acceptance Checks)

- [ ] **Count Check**: `COUNT(Files) == COUNT(Records)`
- [ ] **Orphan Check**: `COUNT(Records with 0 references) < Threshold`
- [ ] **Integrity**: Every internal link in Markdown MUST result in a valid `Link` edge in the graph.
