# Local-First Import Implementation

**Date**: 2025-10-15
**Status**: NEW - Side-by-side with old implementation for testing
**Purpose**: Eliminate unnecessary server uploads, implement true local-first processing

---

## 🎯 Problem Statement

### What Was Wrong

The codebase had **three different upload modals** that all uploaded files to the server:

1. **UploadModal.tsx** → `POST /api/v1/ingest/files`
2. **StreamingUploadModal.tsx** → `POST /api/v1/import/enhanced`
3. **FirstTimeUploadModal.tsx** → Another upload UI

All three sent files to the server for processing, which contradicts the **local-first philosophy** stated in CLAUDE.md:

> "Free/Pro default to on-device processing and BYO keys"

### Root Cause

- **Design Mismatch**: Built server upload infrastructure when local-first was intended
- **Confusion**: Three upload UIs doing essentially the same thing
- **Server Dependency**: Free tier users forced to use server for local operations
- **Connection Issues**: Users trying to "connect to server" for uploads when they shouldn't need to

---

## ✅ Solution: LocalFirstImportModal

### New Architecture

```
User drops file
    ↓
Browser reads file (FileReader API)
    ↓
Browser parses JSON (@keimenon/parsers)
    ↓
Browser extracts code, builds sources
    ↓
Browser saves to local storage (IndexedDB/LocalStorage)
    ↓
NO SERVER UPLOAD NEEDED!
```

### Key Benefits

- **No Server Required**: Processing happens entirely in browser
- **Works Offline**: No internet connection needed
- **Free Tier Compatible**: $0 infrastructure cost
- **Privacy**: Data never leaves user's device
- **Fast**: No network latency
- **Scalable**: No server resources consumed

---

## 📁 New Files Created

### 1. `apps/web/src/lib/local-import.ts`

**Purpose**: Local-first import service using browser APIs

**Key Features**:

- Uses `FileReader` API to read files in browser
- Imports `@keimenon/parsers` directly on client-side
- Processes conversations, extracts code, builds sources locally
- Reports progress via callback
- No server communication required

**Key Classes**:

```typescript
export class LocalImportService {
  async importFile(file: File, config: LocalImportConfig): Promise<LocalImportResult>;
  async importFiles(files: File[], config: LocalImportConfig): Promise<LocalImportResult[]>;
}
```

### 2. `apps/web/src/components/keimenon/LocalFirstImportModal.tsx`

**Purpose**: New consolidated import UI component

**Key Features**:

- Drag & drop file selection
- Configuration panel (roles, code extraction, deduplication)
- Real-time progress indicator
- Processing stages: reading → parsing → extracting → stitching → complete
- Info banner explaining local-first processing
- Success summary with statistics

**Differences from Old Modals**:

- ✅ No FormData uploads
- ✅ No server endpoints called
- ✅ Green "NEW" badge to distinguish from old UI
- ✅ Info banner explaining local-first approach
- ✅ Cleaner, single-purpose UI

---

## 🔄 Migration Strategy (Keeping Old Code)

### A/B Testing Approach

The new local-first modal is wired up as the **default**, but old modals are still accessible:

```typescript
// In apps/web/src/app/keimenon/page.tsx
const handleOpenUpload = () => {
  // Default: Use new local-first modal
  // Hold Shift: Use old server upload modal
  if (typeof window !== 'undefined' && (window as any).event?.shiftKey) {
    setShowUploadModal(true); // OLD
  } else {
    setShowLocalFirstImportModal(true); // NEW
  }
};
```

**Testing Instructions**:

- Click Upload button → Opens NEW local-first modal
- Hold Shift + Click Upload → Opens OLD server upload modal

### Old Files (Preserved for Rollback)

These files are **untouched** and can be used for comparison:

1. ✅ `UploadModal.tsx` - Original upload modal
2. ✅ `StreamingUploadModal.tsx` - Streaming upload modal
3. ✅ `FirstTimeUploadModal.tsx` - Welcome modal
4. ✅ `apps/api/src/services/streaming-upload.ts` - Server-side upload handler
5. ✅ `apps/api/src/services/import-local.ts` - Server-side processing

**Deprecation Plan**: After 2 weeks of successful testing, create issue to remove old code.

---

## 🧪 Testing Checklist

### Basic Functionality

- [ ] Upload button opens LocalFirstImportModal (without Shift)
- [ ] Upload button + Shift opens old UploadModal
- [ ] Drag & drop file works
- [ ] File selection dialog works
- [ ] Configuration panel toggles work

### File Processing

- [ ] Small file (< 1MB) processes successfully
- [ ] Medium file (10-50MB) processes successfully
- [ ] Large file (100MB+) processes successfully
- [ ] Multiple files process in sequence
- [ ] Invalid JSON shows error

### Progress Reporting

- [ ] Progress bar updates during processing
- [ ] Stage labels update correctly
- [ ] Detail messages appear
- [ ] Processing doesn't freeze UI

### Results Display

- [ ] Statistics show correct counts
- [ ] Multiple files show individual results
- [ ] Success state displays properly
- [ ] Error state displays helpful message

### Browser Compatibility

- [ ] Works in Chrome/Edge
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works on mobile browsers

---

## 🚀 Dependencies Added

Updated `apps/web/package.json`:

```json
{
  "dependencies": {
    "@keimenon/parsers": "*",
    "@keimenon/types": "*"
  }
}
```

**Installation Required**:

```bash
# From project root
npm install

# Or in apps/web
cd apps/web && npm install
```

---

## 📊 Architecture Comparison

### OLD (Server Upload)

```
Browser             Server              Database
  │                   │                    │
  │ ──FormData───>    │                    │
  │                   │ ──Parse───>        │
  │                   │ ──Extract──>       │
  │                   │ ──Save──────────>  │
  │ <──Response───    │                    │
  │                   │                    │
```

**Pros**: Centralized processing
**Cons**: Server cost, network dependency, slower, privacy concerns

### NEW (Local-First)

```
Browser            LocalStorage        (Optional Server)
  │                     │                      │
  │ ──Read File──>      │                      │
  │ ──Parse──>          │                      │
  │ ──Extract──>        │                      │
  │ ──Save─────────>    │                      │
  │                     │                      │
  │ (Optional) ─────Sync──────────────>        │
```

**Pros**: Fast, free, offline, private, scalable
**Cons**: No centralized data (Pro tier adds sync)

---

## 🔧 Server Role (Clarified)

### What Server IS For:

- ✅ Authentication (session management)
- ✅ Multi-user sync (Pro/Business tier)
- ✅ BYO API key storage (encrypted)
- ✅ Team collaboration features

### What Server IS NOT For:

- ❌ File uploads (Free tier)
- ❌ Chat parsing (Free tier)
- ❌ Code extraction (Free tier)
- ❌ Local operations

**Free Tier**: Server only for auth
**Pro Tier**: Server for auth + optional sync
**Business Tier**: Server for auth + sync + team features

---

## 📝 Implementation Notes

### Why FileReader API?

Modern browser API for reading files without server upload:

- Supports large files (streaming if needed)
- Progress events available
- Works in all modern browsers
- Async/await friendly

### Why Keep Parsers Client-Side?

The `@keimenon/parsers` package is designed to work anywhere:

- Pure TypeScript, no Node.js dependencies
- Already used on server
- Now also works in browser
- DRY principle: One parser implementation

### Storage Strategy

**Phase 1** (Current): In-memory results
**Phase 2** (Next): IndexedDB for persistence
**Phase 3** (Future): Optional server sync

---

## 🐛 Known Limitations

1. **No Persistence Yet**: Results are in-memory only
   - **Fix**: Implement IndexedDB storage (next task)

2. **Large Files (> 500MB)**: May cause memory issues
   - **Fix**: Implement streaming parser for huge files

3. **No Progress Streaming**: Progress is simulated
   - **Fix**: Hook into actual parser progress events

4. **No Server Sync**: Can't sync across devices yet
   - **Fix**: Implement optional sync endpoint (Pro tier)

---

## 🎯 Next Steps

### Immediate (This Week)

1. ✅ Create LocalImportService
2. ✅ Create LocalFirstImportModal
3. ✅ Wire up to Keimenon page
4. ⏳ Test with real files
5. ⏳ Install dependencies
6. ⏳ Fix any compilation errors

### Short-Term (Next Week)

1. Implement IndexedDB storage
2. Add graph refresh after import
3. Add error recovery
4. Performance testing with large files

### Mid-Term (Next Month)

1. Remove old upload modals (after testing)
2. Implement optional server sync (Pro tier)
3. Add streaming parser for huge files
4. Add import history

---

## 📚 Related Files

### Core Implementation

- `apps/web/src/lib/local-import.ts` - Service
- `apps/web/src/components/keimenon/LocalFirstImportModal.tsx` - UI
- `apps/web/src/app/keimenon/page.tsx` - Integration

### Dependencies

- `packages/parsers/src/index.ts` - Chat parsers
- `packages/parsers/src/types.ts` - Type definitions

### Documentation

- `CLAUDE.md` - Local-first philosophy
- `ai_context/docs_active/LOCAL_FIRST_SUCCESS.md` - SQLite implementation
- `ai_context/docs_active/ARCHITECTURE.md` - System architecture

### Old Code (For Comparison)

- `apps/web/src/components/keimenon/UploadModal.tsx`
- `apps/web/src/components/keimenon/StreamingUploadModal.tsx`
- `apps/api/src/services/streaming-upload.ts`

---

## 💡 FAQ

### Q: Why keep three upload modals?

**A**: For gradual migration and easy rollback. Old code stays until new is proven.

### Q: What about Business tier uploads?

**A**: Business tier can still use server for team features. Local-first is default.

### Q: Will old endpoints be removed?

**A**: Yes, but only after 2 weeks of successful testing and user feedback.

### Q: Can users still use old upload?

**A**: Yes! Hold Shift when clicking Upload button.

### Q: What about mobile?

**A**: FileReader API works on mobile browsers. Testing needed.

### Q: Performance with 100MB+ files?

**A**: Should work, but may need optimization. Test and report issues.

---

## ✅ Cleanup Checklist (Do Later)

**ONLY after new implementation is verified stable**:

- [ ] Remove `UploadModal.tsx`
- [ ] Remove `StreamingUploadModal.tsx`
- [ ] Deprecate `/api/v1/ingest/files` endpoint
- [ ] Deprecate `/api/v1/import/enhanced` endpoint
- [ ] Remove `streaming-upload.ts` service
- [ ] Update `FirstTimeUploadModal.tsx` to use new modal
- [ ] Remove shift-key branching logic
- [ ] Update all documentation references

---

**End of Document**
