# UI/UX Components - Remaining Work Analysis

**Generated**: 2025-10-14
**Project**: Keimenon
**Status**: Phase 1 Complete, Multi-Feature Gaps Identified

---

## Executive Summary

### Overall Progress: ~65% Complete

**✅ Completed Infrastructure:**

- Core layout system (Header/LHS/RHS/Footer/Viewport)
- Authentication & multi-tenant system
- Permission-based UI gating
- Admin CRM dashboard
- Portal mode wrapper
- Settings page framework
- Basic 2D keimenon with force-directed layout
- File upload & chat import modals
- Streaming upload with progress tracking

**🔴 Critical Missing Components:**

- Advanced keimenon lenses (3D, nD, Matrix, Timeline, Diff)
- Claims extraction UI & workflow
- Verification panel & verification runs UI
- UnifiedDoc composer & viewer
- Scope builder & selection management
- Group/Folder tree management (partial)
- Analytics dashboard data visualization
- Search & command palette (⌘K)

**📊 By Phase:**

- **MVP (Free tier)**: 70% complete - Missing claims UI, L0 doc composer
- **Pro features**: 25% complete - Missing archetypes, verifiers, Galaxy lens, receipts UI
- **Business features**: 40% complete - Missing Action nodes UI, scheduling, advanced CRM

---

## 1. Main Viewport - Board Lenses (Core Views)

### A. Keimenon2D (2D Board) - ✅ 80% Complete

**Location**: `apps/web/src/components/keimenon/Keimenon2D.tsx`

**Status**: Basic force-directed layout working

**✅ Implemented:**

- Force-directed graph layout using d3-force
- Pan and zoom with mouse/trackpad
- Node rendering with color coding by type
- Edge rendering with arrows
- Click and double-click handlers
- Multi-select with shift-click

**❌ Missing:**

- **Lasso selection** for creating Selection Scopes
- **Edge policy chips** (Sequester/Scope/Verify badges on edges)
- **Zoom-to-reveal** for Constellations (cluster expansion)
- **Node detail panel** integration (right sidebar)
- **Drag-to-reroute** edges
- **Context ring menu** on node selection (radial menu)
- **Minimap** for navigation
- **Layout persistence** (save/restore positions)

**Priority**: 🟡 MEDIUM (4-6 hours)
**Backend Requirements**: Edge policies endpoint, layout save endpoint

---

### B. Keimenon3D (3D Board) - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/Keimenon3D.tsx`

**Status**: Not implemented (Pro feature)

**Requires:**

- Three.js or react-three-fiber integration
- 3D force-directed layout (d3-force-3d)
- ObjectiveClaims nodes added to graph
- Depth slider for Z-axis navigation
- Focus + blur effects to reduce clutter
- Camera controls (orbit, pan, zoom)

**Priority**: 🟢 LOW (Pro feature) (16-20 hours)
**Backend Requirements**: ObjectiveClaims nodes in graph

---

### C. Galaxy / nD View - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/KeimenonGalaxy.tsx`

**Status**: Not implemented (Pro/Admin feature)

**Requires:**

- Curved-space layout using trust tensor
- Particle density throttling by zoom level
- Constellations as single stars (clickable to expand)
- Verification warp (visual distortion for verified/unverified)
- WebGL or Keimenon2D rendering for performance
- Lens dial for morphing metrics (semantic ↔ provenance ↔ verification)

**Priority**: 🟢 LOW (Future) (24-30 hours)
**Backend Requirements**: Trust tensor calculation, constellation metadata

---

### D. Matrix / Adjacency View - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/KeimenonMatrix.tsx`

**Status**: Not implemented

**Requires:**

- Bipartite heatmap (Sources ↔ Claims or Groups ↔ Chats)
- Full adjacency matrix option
- Row/column filtering
- Cell click to navigate to relationship
- Export to CSV/PNG

**Priority**: 🟡 MEDIUM (Audit use case) (8-12 hours)
**Backend Requirements**: Adjacency matrix query endpoint

---

### E. Timeline / Staleness View - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/KeimenonTimeline.tsx`

**Status**: Not implemented

**Requires:**

- Timeline scrubber (date range selection)
- Ingest cadence visualization
- Verify cadence visualization
- Claim half-life decay indicators
- Node staleness highlighting
- Playback controls (animate changes over time)

**Priority**: 🟢 LOW (Future) (12-16 hours)
**Backend Requirements**: Temporal metadata on nodes/edges

---

### F. Diff / Receipt Replay View - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/KeimenonDiff.tsx`

**Status**: Not implemented (Pro feature)

**Requires:**

- Receipt selector (dropdown or search)
- Graph diff visualization (added/removed/modified nodes)
- UnifiedDoc diff viewer (text diff with citations)
- Side-by-side comparison mode
- Replay mode (step through changes)

**Priority**: 🟢 LOW (Pro feature) (16-20 hours)
**Backend Requirements**: Receipt storage, diff calculation endpoint

---

## 2. Header / Top Tools

### Current Status: ✅ 75% Complete

**Location**: `apps/web/src/components/keimenon/KeimenonHeader.tsx`

**✅ Implemented:**

- Account switcher (admin mode)
- Operating mode toggle (Native/CRM/Portal)
- Shell mode indicator
- User profile dropdown
- Logout functionality
- Service mode indicator

**❌ Missing:**

- **Breadcrumbs** (Workspace › Board › Lens)
- **Lens selector** dropdown (2D/3D/nD/Galaxy/Matrix/Timeline/Diff)
- **Scope chips** showing selection count and token estimate
- **Meters** (tokens left, verifier runs left) - plan-aware
- **Global search/command palette** (⌘K)
- **Plan banner** (Free vs Pro/Business with upgrade prompt)
- **Low-Power Mode indicator** (when graph exceeds threshold)

**Priority**: 🔴 HIGH (6-8 hours)
**Backend Requirements**:

- Scope metadata endpoint
- Plan/quota status endpoint
- Search index endpoint

---

## 3. LHS Sidebar (Navigation / Filters)

### Current Status: ✅ 60% Complete

**Location**: `apps/web/src/components/keimenon/KeimenonSidebar.tsx`

**✅ Implemented:**

- Mode switcher (Keimenon/Dashboard/Settings)
- Settings tree navigation (static)
- Collapsible panel

**❌ Missing:**

- **Boards list** with star/favorite (multi-board support)
- **Groups & Folders tree** (drag to rearrange, promote/demote)
  - Currently shows static placeholder tree
  - Backend endpoints exist but not wired
- **Sequester toggles** on groups/folders
- **Filters panel**:
  - Type filter (Source/Claim/Doc/Chat)
  - Sequester state filter
  - Verification status filter
  - Staleness filter
- **Saved Scopes** list (receipt pins)
- **Search within sidebar**

**Priority**: 🔴 HIGH (8-12 hours)
**Backend Requirements**:

- Groups CRUD endpoints (✅ exist, need wiring)
- Boards CRUD endpoints (✅ exist, need wiring)
- Scopes/receipts endpoints
- Filter query endpoints

---

## 4. RHS Sidebar (Inspector / Selection Stack)

### Current Status: ✅ 40% Complete

**Location**: `apps/web/src/components/keimenon/KeimenonSidebar.tsx`

**✅ Implemented:**

- Settings inspector with history/docs
- Collapsible panel
- Overlay mode toggle

**❌ Missing Core Tiles:**

### A. Node Details Tile - ⏳ Partial

**Component**: `apps/web/src/components/keimenon/NodeDetailPanel.tsx` (exists but not integrated)

**Needs:**

- Display node metadata (type, timestamps, provenance)
- Sequester toggle with reason input
- Edit metadata button
- Delete node button (with confirmation)
- View full content button

**Priority**: 🔴 HIGH (3-4 hours)

---

### B. Selection Stack Tile - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/SelectionStack.tsx`

**Needs:**

- Show N selected items as collapsible tiles
- Each tile with Quick Actions:
  - Add to Scope
  - Sequester
  - Open Source
  - Cite in Doc
- Pin tile to keep visible when selection changes
- Clear selection button

**Priority**: 🔴 HIGH (6-8 hours)

---

### C. ObjectiveClaim Editor Tile - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/ClaimEditor.tsx`

**Needs:**

- Create new claim from selection
- Edit claim text
- Mark supports/refutes relationships
- Attach verifications
- Evidence grading (A/B/C)
- Export claim

**Priority**: 🔴 HIGH (MVP requirement) (12-16 hours)
**Backend Requirements**: Claims CRUD endpoints (partially exists)

---

### D. UnifiedDoc Preview Tile - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/DocPreview.tsx`

**Needs:**

- Show L0/L1 doc snippets
- Ring selector (L0/L1/L2)
- Citations clickable (navigate to source)
- Export button (Markdown/PDF)
- Edit mode for doc sections
- Claims index view

**Priority**: 🔴 HIGH (MVP requirement) (16-20 hours)
**Backend Requirements**: UnifiedDoc composition endpoint

---

### E. Scope Builder Tile - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/ScopeBuilder.tsx`

**Needs:**

- Current scope summary (N nodes, token estimate)
- Include/exclude controls for selected items
- Rank ordering (drag to reorder)
- Save scope (name + description)
- Load saved scope
- Clear scope button

**Priority**: 🟡 MEDIUM (Pro feature) (8-12 hours)
**Backend Requirements**: Scopes CRUD endpoints

---

### F. Verification Panel Tile - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/VerificationPanel.tsx`

**Needs:**

- Queue verification runs (HTTP_CHECK/SCHEMA_MATCH/COMPUTE)
- Show run status (pending/running/success/failed)
- View run artifacts (logs, responses)
- Retry failed runs
- Schedule recurring verifications (Business)
- Verification history timeline

**Priority**: 🟡 MEDIUM (Pro/Business feature) (12-16 hours)
**Backend Requirements**: Verifier service endpoints

---

## 5. Footer / Console Bar

### Current Status: ✅ 30% Complete

**Location**: `apps/web/src/components/keimenon/KeimenonFooter.tsx`

**✅ Implemented:**

- Collapsible footer with tabs
- Basic placeholder content

**❌ Missing Tabs:**

### A. Logs Tab - ⏳ Partial

**Needs:**

- Real-time log streaming
- Log level filtering (debug/info/warn/error)
- Search logs
- Clear logs button
- Export logs

**Priority**: 🟡 MEDIUM (4-6 hours)

---

### B. Tasks/Queue Tab - ❌ Not Started

**Needs:**

- Show running tasks (imports, verifications, doc generation)
- Task progress bars
- Cancel task button
- View task details
- Task history

**Priority**: 🟡 MEDIUM (6-8 hours)
**Backend Requirements**: Task queue status endpoint

---

### C. REPL Tab - ❌ Not Started (Future)

**Needs:**

- Receipt-aware command input
- Command history
- Autocomplete for commands
- Output display

Example commands:

```
scope add group:"API Docs"
verify run 12
doc compose L0
```

**Priority**: 🟢 LOW (Pro feature) (16-20 hours)

---

### D. Budget Events Tab - ❌ Not Started

**Needs:**

- Show token usage events
- Cost breakdown by operation
- Plan limit warnings
- Export budget report

**Priority**: 🟢 LOW (Pro/Business feature) (6-8 hours)

---

### E. Shortcuts Tab - ✅ Can Be Static

**Needs:**

- List keyboard shortcuts
- Searchable
- Grouped by category

**Priority**: 🟢 LOW (2-3 hours)

---

## 6. Modals & Overlays

### A. Upload Modal - ✅ 90% Complete

**Location**: `apps/web/src/components/keimenon/UploadModal.tsx`

**✅ Implemented:**

- File upload with drag-and-drop
- URL upload support
- Progress tracking
- Multi-file support
- Streaming upload for large files

**❌ Missing:**

- **Circuit breaker feedback** (show precise reason when limit hit)
- **Storage quota display** (show used/available)

**Priority**: 🟢 LOW (2-3 hours)

---

### B. Chat Import Modal - ✅ 85% Complete

**Location**: `apps/web/src/components/keimenon/ChatImportModal.tsx`

**✅ Implemented:**

- Multi-stage import wizard
- Platform detection
- Configuration options
- Duplicate detection UI
- Streaming import

**❌ Missing:**

- **Preset saving** (save config for reuse)
- **Import history** (view past imports)

**Priority**: 🟢 LOW (3-4 hours)

---

### C. First Time Upload Modal - ✅ Complete

**Location**: `apps/web/src/components/keimenon/FirstTimeUploadModal.tsx`

**Status**: Onboarding modal for new users - functional

---

### D. Group Creation Modal - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/GroupCreationModal.tsx`

**Needs:**

- Group name input
- Group description
- Select parent folder
- Initial membership (drag sources)
- Sequester rules for group

**Priority**: 🔴 HIGH (4-6 hours)
**Backend Requirements**: Groups CRUD (✅ exists)

---

### E. Claim Creation Modal - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/ClaimCreationModal.tsx`

**Needs:**

- Extract claim from selected text
- Claim type selector (fact/endpoint/parameter/definition/metric/config)
- Add supporting sources
- Add contradicting sources
- Evidence grading
- Confidence slider

**Priority**: 🔴 HIGH (MVP requirement) (8-12 hours)

---

## 7. Specialized Views (Routes)

### A. /ingest - ✅ 80% Complete

**Location**: `apps/web/src/app/ingest/page.tsx`

**✅ Implemented:**

- Dropzone UI
- Upload progress tracking
- Ingest results display

**❌ Missing:**

- **Autogroup log** (show suggested groups)
- **Latest items panel** in RHS

**Priority**: 🟡 MEDIUM (4-6 hours)

---

### B. /claims - ❌ Not Started

**Expected Location**: `apps/web/src/app/claims/page.tsx`

**Needs:**

- Claims table with sorting/filtering
- Claim status badges (unverified/verified/refuted)
- Click to center on keimenon
- Bulk operations (verify/delete)
- Export claims to CSV

**Priority**: 🔴 HIGH (MVP requirement) (12-16 hours)
**Backend Requirements**: Claims list/filter endpoint

---

### C. /docs/[docId] - ❌ Not Started

**Expected Location**: `apps/web/src/app/docs/[docId]/page.tsx`

**Needs:**

- UnifiedDoc full view
- Ring selector (L0/L1/L2)
- Section collapsing
- Diff mode (compare versions)
- Export to Markdown/PDF
- Edit mode
- Claims index sidebar

**Priority**: 🔴 HIGH (MVP requirement) (16-20 hours)
**Backend Requirements**: UnifiedDoc CRUD endpoints

---

### D. /verify - ❌ Not Started (Pro/Business)

**Expected Location**: `apps/web/src/app/verify/page.tsx`

**Needs:**

- Verification runs list
- Run details view
- Artifacts browser
- Schedule editor (cron-like)
- Run statistics dashboard

**Priority**: 🟡 MEDIUM (Pro feature) (12-16 hours)
**Backend Requirements**: Verifier service

---

### E. /admin - ⏳ Partial

**Location**: `apps/web/src/components/keimenon/CRMDashboard.tsx` (admin view)

**✅ Implemented:**

- Account list with search
- Account switching
- Basic metrics (returns zeros - see BUG_REVIEW_AND_FINDINGS.md)

**❌ Missing:**

- **Instance Emulator** (simulate tier/quotas)
- **Config Registry CRUD** (edit schemas)
- **Advanced analytics charts** (user growth, revenue, churn)
- **Bulk operations** (disable accounts, adjust quotas)

**Priority**: 🟡 MEDIUM (8-12 hours)

---

### F. /settings - ✅ 85% Complete

**Location**: `apps/web/src/components/settings/SettingsPage.tsx`

**✅ Implemented:**

- Settings tree navigation
- Setting cards with live preview
- History viewer
- Apply/Revert workflow

**❌ Missing:**

- **Search settings**
- **Bulk reset**
- **Export/import settings config**

**Priority**: 🟢 LOW (3-4 hours)

---

## 8. Interactive UI Features

### A. Context Ring Menu - ❌ Not Started

**Expected Location**: `apps/web/src/components/keimenon/ContextRing.tsx`

**Needs:**

- Radial menu on node selection
- Actions:
  - Add to Scope
  - Sequester
  - Derive Claim
  - Open in RHS
  - Pin
- Smooth animation
- Touch-friendly

**Priority**: 🟡 MEDIUM (6-8 hours)

---

### B. Edge Sculpting - ❌ Not Started

**Needs:**

- Drag edge to reroute
- Click edge to toggle policy chips
- Edge context menu (delete, change type)

**Priority**: 🟢 LOW (4-6 hours)

---

### C. Zoom HUD - ⏳ Partial

**Current**: Basic zoom via mouse wheel

**Missing:**

- Zoom slider UI
- +/- buttons
- Fit-to-selection button
- Zoom level indicator

**Priority**: 🟡 MEDIUM (2-3 hours)

---

### D. Lens Dial - ❌ Not Started (Pro)

**Expected Location**: `apps/web/src/components/keimenon/LensDial.tsx`

**Needs:**

- On-keimenon control (draggable)
- Morph metrics slider (semantic ↔ provenance ↔ verification)
- Visual feedback (graph animates)

**Priority**: 🟢 LOW (Pro feature) (8-12 hours)

---

## 9. Search & Command System

### A. Global Search (⌘K) - ❌ Not Started

**Expected Location**: `apps/web/src/components/common/CommandPalette.tsx`

**Needs:**

- Fuzzy search across:
  - Nodes
  - Claims
  - Docs
  - Groups
  - Settings
- Recent searches
- Command shortcuts (e.g., "new group", "upload file")
- Navigate to results

**Priority**: 🔴 HIGH (12-16 hours)
**Backend Requirements**: Search index endpoint

---

## 10. Tier-Specific UI Enforcement

### Current Status: ⏳ Partial

**Location**: `apps/web/src/components/common/PermissionGate.tsx`

**✅ Implemented:**

- Permission-based UI gating
- Role-based access control
- Tooltip on disabled features

**❌ Missing:**

- **Free tier guardrails**:
  - 2D only (hide lens selector)
  - Particle density low (performance mode)
  - Token meters hidden
  - RHS Verification/Doc tiles grayed with upgrade prompt
- **Plan banners** (upgrade prompts)
- **Circuit breaker UI** (show precise reason and upgrade path)

**Priority**: 🟡 MEDIUM (6-8 hours)

---

## 11. Empty & Error States

### Current Status: ⏳ Partial

**✅ Implemented:**

- Keimenon empty state (guides)
- Loading spinners
- Basic error messages

**❌ Missing:**

- **Circuit breaker banner** (with link to meters & plan)
- **RHS empty selection tips**
- **Better error recovery UI** (retry buttons, helpful messages)
- **Offline state handling**

**Priority**: 🟡 MEDIUM (4-6 hours)

---

## 12. Responsiveness & Accessibility

### Current Status: ⏳ Partial

**✅ Implemented:**

- Desktop layout with collapsible sidebars
- Dark theme

**❌ Missing:**

- **Mobile responsiveness**:
  - LHS → bottom sheet
  - RHS → full screen overlay
  - Keimenon gestures optimized
- **Tablet split view** (LHS 25%, keimenon 50%, RHS 25%)
- **Keyboard shortcuts** (full parity with mouse actions)
- **Focus rings** and ARIA roles
- **Reduced motion** preference support
- **Screen reader** support

**Priority**: 🟡 MEDIUM (16-20 hours)

---

## 13. Priority Matrix & Effort Estimate

### 🔴 Critical Path (MVP Blockers) - ~70-90 hours

| Component                     | Hours | Dependencies             |
| ----------------------------- | ----- | ------------------------ |
| Claims UI (create/edit/list)  | 16-20 | Claims backend endpoints |
| UnifiedDoc composer & viewer  | 20-24 | Doc composition backend  |
| Groups tree wiring            | 8-12  | Groups API (✅ exists)   |
| Scope builder                 | 8-12  | Scopes backend           |
| Search/Command palette        | 12-16 | Search index backend     |
| Node detail panel integration | 3-4   | None                     |
| Selection stack               | 6-8   | None                     |

---

### 🟡 High Value Features (Pro) - ~90-120 hours

| Component                    | Hours | Dependencies                |
| ---------------------------- | ----- | --------------------------- |
| Keimenon3D                   | 16-20 | Three.js, 3D layout         |
| Verification panel           | 12-16 | Verifier service            |
| Receipt replay/diff          | 16-20 | Receipt storage             |
| Matrix view                  | 8-12  | Adjacency query             |
| Lens selector & switching    | 6-8   | None                        |
| Scope chips & meters         | 6-8   | Quota/plan API              |
| Analytics charts (fix zeros) | 8-10  | DB queries (see BUG_REVIEW) |

---

### 🟢 Polish & UX - ~50-70 hours

| Component               | Hours | Dependencies      |
| ----------------------- | ----- | ----------------- |
| Mobile responsiveness   | 16-20 | None              |
| Keyboard shortcuts      | 8-12  | None              |
| Context ring menu       | 6-8   | None              |
| Timeline view           | 12-16 | Temporal metadata |
| Galaxy view             | 24-30 | Trust tensor      |
| Accessibility (a11y)    | 12-16 | None              |
| Error states & recovery | 4-6   | None              |

---

## 14. Backend Dependencies Summary

### ✅ Endpoints That Exist But Need Frontend Wiring:

- Groups CRUD (`/api/v1/groups`)
- Boards CRUD (`/api/v1/boards`)
- Settings CRUD (`/api/v1/settings`)
- Users CRUD (`/api/v1/users`)
- Accounts CRUD (`/api/v1/accounts`)
- Analytics (`/api/v1/analytics/*`) - returns stub data, needs real calculations

### ❌ Endpoints That Need to Be Created:

- **Claims CRUD** (`/api/v1/claims`) - partial, needs completion
- **UnifiedDoc composition** (`/api/v1/docs/compose`)
- **Scopes management** (`/api/v1/scopes`)
- **Receipts storage** (`/api/v1/receipts`)
- **Verification service** (`/api/v1/verify/*`)
- **Search index** (`/api/v1/search`)
- **Adjacency matrix** (`/api/v1/graph/matrix`)
- **Trust tensor** (`/api/v1/graph/trust-tensor`)
- **Task queue status** (`/api/v1/tasks`)

---

## 15. Recommended Implementation Order

### Sprint 1 (Week 1-2): MVP Core - Claims & Docs

1. **Claims backend endpoints** (8-12 hours)
2. **Claims UI (create/edit/list)** (16-20 hours)
3. **UnifiedDoc backend** (12-16 hours)
4. **UnifiedDoc viewer** (16-20 hours)

**Outcome**: Users can extract claims and compose L0 docs (MVP requirement)

---

### Sprint 2 (Week 3): Navigation & Organization

5. **Wire Groups tree** (8-12 hours)
6. **Node detail panel integration** (3-4 hours)
7. **Selection stack** (6-8 hours)
8. **Group creation modal** (4-6 hours)

**Outcome**: Users can organize sources into groups and inspect selections

---

### Sprint 3 (Week 4): Search & Scope Management

9. **Search backend** (8-12 hours)
10. **Command palette (⌘K)** (12-16 hours)
11. **Scope builder** (8-12 hours)
12. **Scope chips in header** (4-6 hours)

**Outcome**: Users can search, build scopes, and see token estimates

---

### Sprint 4 (Week 5): Pro Features - Verification

13. **Verification backend** (16-20 hours)
14. **Verification panel UI** (12-16 hours)
15. **Analytics fix (real data)** (8-10 hours)

**Outcome**: Pro users can queue verifications and see real analytics

---

### Sprint 5 (Week 6-7): Advanced Lenses

16. **Keimenon3D** (16-20 hours)
17. **Matrix view** (8-12 hours)
18. **Lens selector** (6-8 hours)

**Outcome**: Pro users have multiple visualization options

---

### Sprint 6 (Week 8): Polish & Accessibility

19. **Mobile responsiveness** (16-20 hours)
20. **Keyboard shortcuts** (8-12 hours)
21. **Error states & recovery** (4-6 hours)

**Outcome**: Production-ready UI/UX

---

## 16. Known Issues from Bug Review

### Critical (From BUG_REVIEW_AND_FINDINGS.md):

- ❌ **Analytics return stub data** (session time = 0, storage = 0, MRR = 0)
- ❌ **Neo4j integration incomplete** (import decisions not persisted)
- ❌ **Groups navigation not implemented** (UI exists, no handlers)

### Medium:

- ⚠️ **Duplicate detection incomplete** (no embedding-based similarity)
- ⚠️ **Settings tree uses static data** (no backend persistence)

**These must be fixed in parallel with new component development.**

---

## 17. Total Effort Summary

| Category                  | Hours              | Status            |
| ------------------------- | ------------------ | ----------------- |
| MVP Core (Claims & Docs)  | 70-90              | 0%                |
| Navigation & Organization | 25-35              | 20%               |
| Search & Scope            | 32-46              | 0%                |
| Pro Features (Verify)     | 36-46              | 10%               |
| Advanced Lenses           | 30-40              | 15%               |
| Polish & Accessibility    | 28-38              | 20%               |
| **Total Remaining**       | **~220-295 hours** | **~35% complete** |

**At 40 hours/week**: 5.5-7.5 weeks of focused UI work

---

## 18. Quick Wins (High Impact, Low Effort)

These can be done quickly to improve UX:

1. **Wire Groups tree** (existing backend) - 8-12 hours
2. **Node detail panel integration** - 3-4 hours
3. **Zoom HUD (slider + buttons)** - 2-3 hours
4. **Analytics fix (real data)** - 8-10 hours
5. **Empty state improvements** - 4-6 hours
6. **Keyboard shortcuts (basic set)** - 4-6 hours

**Total Quick Wins**: ~30-40 hours, significant UX improvement

---

## 19. Testing Requirements

For each new component:

- **Unit tests**: Component rendering, props, state changes
- **Integration tests**: Component + API interactions
- **E2E tests**: Full user workflows (claims creation, doc composition)
- **Accessibility tests**: Keyboard nav, screen reader, focus management
- **Performance tests**: Large graph rendering, layout calculation

**Estimate**: +30% time for test coverage (e.g., 10 hours feature = 3 hours tests)

---

## 20. Documentation Needs

### User-Facing:

- Keyboard shortcuts reference
- Claims workflow guide
- UnifiedDoc composition guide
- Verification setup guide

### Developer:

- Component API documentation
- State management patterns
- Backend integration guide
- Testing patterns

**Estimate**: ~20-30 hours for comprehensive docs

---

## Conclusion

**Current State**: Solid foundation (~65% complete) with all core infrastructure in place

**To MVP**: ~70-90 hours of focused work on Claims & Docs UI

**To Production (Pro features)**: ~220-295 hours total remaining

**Recommended Next Steps**:

1. Fix critical bugs (analytics, groups wiring) - 16-24 hours
2. Implement Claims UI & backend - 24-32 hours
3. Implement UnifiedDoc composer - 28-36 hours
4. Wire existing Groups/Settings backends - 8-12 hours
5. Add Search & Command palette - 20-28 hours

**Total to "Feature Complete MVP"**: ~96-132 hours (2.5-3.5 weeks full-time)

---

_End of Report_
