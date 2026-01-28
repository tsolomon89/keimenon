# TODO Tracker — What's Left to Build

**Last Updated**: 2025-10-11
**Current Phase**: Phase 1D (UnifiedDocs) - 75% Complete
**Next Milestone**: MVP Release (2-3 weeks away!)

---

## Quick Status Overview

| Phase                              | Status         | Completion | Priority |
| ---------------------------------- | -------------- | ---------- | -------- |
| Phase 1A: Foundation               | ✅ Complete    | 100%       | -        |
| Phase 1B: Ingest & Autogroup       | ✅ Complete    | 100%       | -        |
| **Phase 1B.5: Chat Import System** | ✅ Complete    | 90%        | -        |
| Phase 1C: Keimenon Visualization   | ✅ Complete    | 100%       | -        |
| Phase 1D: UnifiedDocs              | 🔄 In Progress | 25%        | **HIGH** |
| Infrastructure & Polish            | ✅ Mostly Done | 85%        | MEDIUM   |
| Testing & Documentation            | 🔄 In Progress | 40%        | **HIGH** |
| Phase 2: Pro Features              | 📋 Planned     | 0%         | LOW      |

---

## ✅ What's Already Built (Major Accomplishments)

### Chat Import System (90% Complete)

- [x] ChatGPT export parser (JSON/JSONL)
- [x] Claude export parser (JSON)
- [x] Gemini export parser (JSON)
- [x] Generic format parser with auto-detection
- [x] Streaming import with progress tracking
- [x] Sources mode: Extract meaningful segments
- [x] Code extraction service with deduplication
- [x] Similarity engine (jaccard, levenshtein, cosine algorithms)
- [x] Duplicate detection and decision system
- [x] Multiple stitching strategies (by chat, by title, by topic)
- [x] Batch import processing
- [x] Import decisions UI for handling duplicates
- [x] Content viewing routes
- [x] Local document store for embedded storage

### Infrastructure (85% Complete)

- [x] Dual storage: Neo4j + SQLite with factory pattern
- [x] Input validation with Zod schemas
- [x] Rate limiting (express-rate-limit)
- [x] Environment variable validation
- [x] Content sanitization
- [x] Error handling middleware
- [x] 30+ API endpoints across 12 route files
- [x] Migration scripts between storage modes

### Frontend (80% Complete)

- [x] 2D Keimenon with D3-force layout
- [x] File upload with drag-and-drop
- [x] Node selection (single and multi-select)
- [x] Pan and zoom controls
- [x] Board page with FourRegionLayout
- [x] Selection inspector

---

## 🔥 Critical Path to MVP (2-3 Weeks)

### Week 1: UnifiedDocs (16-20 hours)

**Priority 1: UnifiedDoc L0 Compiler**

- [ ] **UnifiedDoc L0 compiler service** (6-8 hours)
  - Location: `apps/api/src/services/unifieddoc.ts`
  - Input: Array of source IDs or scope
  - Algorithm:
    1. Fetch sources (from imports, files, or manual)
    2. Group by topic/conversation
    3. Render as bullet list with citations
    4. Count tokens (use simple word count \* 1.3 estimate)
    5. Enforce 5k token limit for Free tier
  - Output: UnifiedDoc node with markdown content

**Priority 2: UnifiedDoc API Endpoints** (2-3 hours)

- [ ] POST `/api/v1/docs` - Create doc from scope
- [ ] GET `/api/v1/docs/:id` - Fetch doc
- [ ] GET `/api/v1/docs/:id/export` - Download Markdown
- [ ] PUT `/api/v1/docs/:id/refresh` - Regenerate

**Priority 3: UnifiedDoc Viewer UI** (4-6 hours)

- [ ] Create `apps/web/src/app/docs/[id]/page.tsx`
- [ ] Use react-markdown for rendering
- [ ] Add citation hover tooltips
- [ ] Export to Markdown button
- [ ] "Refresh from sources" button

**Priority 4: Markdown Export** (1-2 hours)

- [ ] Format citations as footnotes
- [ ] Add metadata header (generated date, sources count)
- [ ] Content-Disposition: attachment header

### Week 2: Polish & Testing (12-16 hours)

**UI Polish** (5-6 hours)

- [ ] **Error boundaries** (2 hours)
  - Wrap Keimenon2D, IngestPage, BoardPage
  - ErrorFallback component with "Try again" button

- [ ] **Loading states** (2 hours)
  - Keimenon layout spinner
  - Import progress indicators (enhance existing)
  - Skeleton UIs for data fetching

- [ ] **Toast notifications** (1 hour)
  - Install `sonner` library
  - Add toast for all user actions
  - Success/error/info variants

- [ ] **Empty states** (30 min)
  - Empty keimenon message
  - No imports yet message
  - No sources in group

**Testing** (6-8 hours)

- [ ] **Parser tests** (3-4 hours)
  - Test ChatGPT parser with sample exports
  - Test Claude parser with sample exports
  - Test Gemini parser
  - Edge cases: empty files, malformed JSON

- [ ] **Import flow tests** (3-4 hours)
  - End-to-end import test
  - Duplicate detection test
  - Code extraction test
  - Sources mode test

**Documentation** (3-4 hours)

- [ ] Create **IMPORT_GUIDE.md** (see separate section below)
- [ ] Update README.md with import features
- [ ] Add API examples to QUICK_START.md

### Week 3: Final Polish (8-12 hours)

**Board Management UI** (4-6 hours)

- [ ] Board switcher dropdown in header
- [ ] Board creation modal
- [ ] Board settings (rename, delete)
- [ ] Board templates (optional)

**Minor Features** (4-6 hours)

- [ ] Keyboard shortcuts (Escape to clear, Delete to remove)
- [ ] Node search/filter in sidebar
- [ ] Layout persistence (save node positions)
- [ ] Docker Compose file for easy setup

---

## 📝 IMPORT_GUIDE.md Contents (High Priority)

Create comprehensive guide with these sections:

### 1. Overview

- What is chat import?
- Supported platforms
- Use cases (organize conversations, extract code, find duplicates)

### 2. Exporting Your Chats

**ChatGPT:**

```
1. Go to Settings → Data Controls
2. Click "Export data"
3. Wait for email with download link
4. Download conversations.json
```

**Claude:**

```
1. Go to Settings → Export conversations
2. Download claude_conversations.json
3. (or use browser extension to export)
```

**Gemini:**

```
1. Go to Activity → Download your data
2. Select Gemini conversations
3. Download gemini_export.json
```

### 3. Import Process

**Basic Import:**

```bash
# Using curl
curl -X POST http://localhost:3001/api/v1/import/chat \
  -F "file=@conversations.json" \
  -F "config={}"
```

**Enhanced Import (with all features):**

```bash
curl -X POST http://localhost:3001/api/v1/import/enhanced \
  -F "file=@conversations.json" \
  -F "config={\"export_code\":true,\"duplicate_detection_enabled\":true}"
```

### 4. Configuration Options

Document all config options from import-enhanced.ts:

- sources_role_subset
- sources_min_chars_user/assistant
- sources_stitch_strategy
- export_code
- duplicate_detection_enabled
- duplicate_similarity_threshold
- etc.

### 5. Sources Mode Explained

- What are sources?
- Why extract segments?
- Stitching strategies comparison

### 6. Code Extraction

- Auto-detection of code blocks
- Language identification
- Deduplication across conversations
- Viewing extracted code

### 7. Duplicate Detection

- How similarity algorithms work
- Setting thresholds
- Using the decisions UI
- Auto-merge vs manual review

### 8. Troubleshooting

- File too large (use streaming import)
- Import failed (check logs)
- Duplicates not detected (adjust threshold)
- Memory issues (use SQLite mode)

---

## 🎯 Quick Wins (< 2 hours each)

High-impact, low-effort tasks:

- [ ] Add toast notifications (30 min) - Already have library
- [ ] Add empty states (1 hour) - Simple UI components
- [ ] Board name editing (1 hour) - API exists, just add UI
- [ ] Docker Compose file (1 hour) - Simple 3-service setup
- [ ] Dark mode toggle (1 hour) - Tailwind supports it
- [ ] Node search filter (2 hours) - Filter existing list

---

## 🚫 What NOT To Do (Phantom Tasks Removed)

These were in the old tracker but **already exist**:

- ~~Manual claim extraction UI~~ → Import decisions UI exists
- ~~Rule-based extraction service~~ → Code extraction exists
- ~~Citation tracking~~ → Span tracking in sources mode
- ~~Rate limiting~~ → Implemented with express-rate-limit
- ~~Input validation~~ → Zod schemas at all boundaries
- ~~Environment validation~~ → Startup checks implemented
- ~~Claims extraction~~ → Code extraction is a form of this

---

## 📊 Realistic Timeline

### To MVP Release: 2-3 weeks

- Week 1: UnifiedDocs (16-20 hours)
- Week 2: Polish & Testing (12-16 hours)
- Week 3: Final touches (8-12 hours)

**Total: 36-48 hours remaining**

### Post-MVP: 4-5 months to production-ready

- Phase 2: Pro Features (4-6 weeks)
  - AI chat with scope
  - Verifiers
  - Galaxy lens
  - Advanced docs (L1-L3)
- Phase 3: Business Features (6-8 weeks)
  - Multi-seat & SSO
  - CRM integrations
  - Scheduled agents
- Phase 4: Scale & Polish (4-6 weeks)
  - Performance optimization
  - Real-time collaboration
  - Mobile app

---

## 🎨 Optional Enhancements (Post-MVP)

Nice to have but not blocking MVP:

### UI Improvements

- [ ] Mobile responsiveness
- [ ] Keimenon performance optimization (viewport culling)
- [ ] Advanced keyboard shortcuts
- [ ] Command palette (Cmd+K)
- [ ] Sequester UI controls

### Infrastructure

- [ ] API documentation with Swagger
- [ ] Logging framework (winston/pino)
- [ ] CI/CD pipeline
- [ ] Monitoring (Prometheus)
- [ ] Error tracking (Sentry)

### Features

- [ ] Workspace & entitlements system
- [ ] Plan switcher UI
- [ ] Advanced similarity (embedding algorithm)
- [ ] Cross-board references
- [ ] Version history for docs

---

## 🔍 Testing Priorities

### Must Have Tests:

1. Parser tests (all 4 parsers)
2. Import flow integration test
3. Duplicate detection algorithm test
4. Code extraction test
5. Sources mode stitching test

### Nice to Have Tests:

1. Keimenon rendering tests
2. API endpoint tests (all 30+)
3. E2E user flows (Playwright)
4. Performance benchmarks

**Current Coverage**: ~10%
**Target for MVP**: 50%
**Target for Production**: 80%

---

## 📈 Progress Tracking

### Completed Hours: ~180-200 hours

- Phase 1A-C: 80-100 hours
- Chat Import System: 80-90 hours
- Infrastructure: 20-30 hours

### Remaining Hours: ~40-50 hours

- UnifiedDocs: 16-20 hours
- Polish & Testing: 12-16 hours
- Final touches: 8-12 hours
- Documentation: 4-6 hours

### Total Project: ~220-250 hours to MVP

**Much less than the original 400-600 hour estimate!**

---

## 🎉 When MVP is Released

Features to announce:

1. ✅ Import ChatGPT, Claude, Gemini conversations
2. ✅ Auto-extract code blocks from chats
3. ✅ Detect and merge duplicate content
4. ✅ Organize on visual knowledge graph
5. ✅ Local-first (no server required with SQLite)
6. ✅ Generate consolidated documentation
7. ✅ Export to Markdown
8. ✅ Free tier with generous limits

Marketing angles:

- "Turn your AI chat history into a knowledge graph"
- "Never lose that perfect code snippet again"
- "Organize 1000+ conversations in minutes"
- "Local-first: Your data stays on your machine"

---

## 📌 Notes

- All time estimates are for single developer
- Multiply by 1.5x for real-world (interruptions, debugging)
- MVP scope is intentionally minimal
- Pro features can wait until post-MVP
- Focus on core value: Import → Organize → Document

**Next Review**: After UnifiedDocs completion

---

**Last Updated**: 2025-10-11
**Status**: Ready for final sprint to MVP! 🚀
