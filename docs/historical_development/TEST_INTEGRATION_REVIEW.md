# Test Integration Review: SSE & Visualization Features

**Date**: 2025-10-17
**Scope**: Phases 7-9 (SSE Backend, Frontend Consumer, Visualizations)

---

## Executive Summary

### ❌ **Our new features (SSE, visualizations) are NOT covered by existing tests**

**Current Test Coverage:**

- ✅ Chat import processing (comprehensive)
- ✅ Database operations (SQLite)
- ✅ API upload endpoints
- ✅ Multi-tenancy isolation
- ❌ **SSE streaming (NOT tested)**
- ❌ **Real-time progress events (NOT tested)**
- ❌ **Visualization components (NOT tested)**

**Impact**: Low risk (SSE is optional enhancement, core import works without it)

---

## Current Test Suite Overview

### Test Files (3 total):

1. **`comprehensive-system-test.test.ts`** - Backend pipeline tests
2. **`import-enhanced.test.ts`** - Import API endpoint tests
3. **`ui-integration-test.test.ts`** - End-to-end UI integration tests

### What They Test:

```
┌──────────────────────────────────────────────────────────┐
│ EXISTING TEST COVERAGE (Before Phases 7-9)              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ✅ File upload → API endpoint                           │
│ ✅ Chat parsing (JSON → conversations)                  │
│ ✅ Source document building                             │
│ ✅ Code block extraction                                │
│ ✅ Duplicate detection (Jaccard/Levenshtein)            │
│ ✅ Database persistence (nodes, edges)                  │
│ ✅ Multi-tenancy (account_id isolation)                 │
│ ✅ Groups/Folders API                                   │
│ ✅ Authentication & authorization                       │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ NEW FEATURES NOT COVERED (Phases 7-9)                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ❌ SSE streaming (`/api/v1/import/progress/stream/:id`) │
│ ❌ Progress event emission (8 stages)                   │
│ ❌ HTTP polling fallback                                │
│ ❌ SSE reconnection logic                               │
│ ❌ Frontend hook (`useImportProgressStream`)            │
│ ❌ Visualization components (Pipeline, Stats, Graph)    │
│ ❌ Canvas rendering                                     │
│ ❌ Animation loops                                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Detailed Gap Analysis

### 1. SSE Backend (`import-progress-stream.ts`)

**What we built:**

- EventEmitter-based SSE server
- Progress event streaming
- Heartbeat (30s intervals)
- Connection management
- Cancellation endpoint

**Current test coverage:** ❌ **NONE**

**What SHOULD be tested:**

```typescript
describe('SSE Import Progress Stream', () => {
  it('should establish SSE connection', async () => {
    const response = await fetch('/api/v1/import/progress/stream/test_id', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('should emit progress events during import', async () => {
    // Start import
    const uploadResult = await uploadFile(testFile, token);
    const uploadId = uploadResult.uploadId;

    // Connect to SSE
    const events: any[] = [];
    const sse = new EventSource(`/api/v1/import/progress/stream/${uploadId}`);

    sse.onmessage = (e) => events.push(JSON.parse(e.data));

    // Wait for completion
    await waitFor(() => events.some((e) => e.stage === 'done'));

    // Verify all stages were emitted
    const stages = events.map((e) => e.stage);
    expect(stages).toContain('queued');
    expect(stages).toContain('reading');
    expect(stages).toContain('parsing');
    expect(stages).toContain('done');
  });

  it('should send heartbeat every 30 seconds', async () => {
    // Test heartbeat mechanism
  });

  it('should handle connection close gracefully', async () => {
    // Test cleanup logic
  });
});
```

**Why it's important:**

- SSE is a new communication pattern (not covered by existing tests)
- Connection management can have subtle bugs (memory leaks, zombie connections)
- Event ordering is critical for UI state

**Risk if not tested:**

- Medium - SSE is optional enhancement, core import works without it
- But users won't see real-time progress if SSE fails silently

---

### 2. Progress Event Emission (`import-enhanced.ts` modifications)

**What we built:**

- 8 progress emission points during import
- Stats tracking (nodes, edges, sources, conversations)
- Error emission on failure

**Current test coverage:** ⚠️ **PARTIAL**

- Existing tests verify import succeeds
- But don't verify progress events are emitted

**What SHOULD be tested:**

```typescript
describe('Import Progress Emission', () => {
  it('should emit queued event immediately after upload', async () => {
    const events: any[] = [];
    subscribeToProgress(uploadId, (event) => events.push(event));

    await uploadFile(testFile, token);

    const queuedEvent = events.find((e) => e.stage === 'queued');
    expect(queuedEvent).toBeDefined();
    expect(queuedEvent.progress).toBe(0);
  });

  it('should emit parsing event with conversation count', async () => {
    const events: any[] = [];
    subscribeToProgress(uploadId, (event) => events.push(event));

    await uploadFile(testFile, token);

    const parsingEvent = events.find((e) => e.stage === 'parsing');
    expect(parsingEvent.stats.conversationsProcessed).toBeGreaterThan(0);
  });

  it('should emit done event with final stats', async () => {
    const events: any[] = [];
    subscribeToProgress(uploadId, (event) => events.push(event));

    await uploadFile(testFile, token);

    const doneEvent = events.find((e) => e.stage === 'done');
    expect(doneEvent.progress).toBe(100);
    expect(doneEvent.stats.nodesCreated).toBeGreaterThan(0);
  });

  it('should emit error event on import failure', async () => {
    const events: any[] = [];
    subscribeToProgress(uploadId, (event) => events.push(event));

    await uploadFile(malformedFile, token).catch(() => {});

    const errorEvent = events.find((e) => e.stage === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error).toBeDefined();
  });
});
```

**Why it's important:**

- Progress tracking is core to user experience
- Stats must be accurate for UI display
- Error events critical for debugging failed imports

**Risk if not tested:**

- Medium - Progress events are the foundation for UI updates
- Incorrect stats → confusing UI → user distrust

---

### 3. Frontend Hook (`useImportProgressStream`)

**What we built:**

- SSE connection management
- Automatic reconnection with exponential backoff
- Polling fallback
- Event callbacks

**Current test coverage:** ❌ **NONE** (frontend tests don't exist)

**What SHOULD be tested:**

```typescript
describe('useImportProgressStream', () => {
  it('should connect to SSE stream when uploadId is provided', () => {
    const { result } = renderHook(() => useImportProgressStream('test_id'));

    expect(result.current.connectionState).toBe('connecting');
    // Wait for connection
    waitFor(() => expect(result.current.connectionState).toBe('connected'));
  });

  it('should retry connection on failure with exponential backoff', async () => {
    // Mock SSE failure
    mockEventSource.onErrorHandler();

    const { result } = renderHook(() =>
      useImportProgressStream('test_id', {
        maxRetries: 3,
        retryDelay: 100,
      })
    );

    // Verify retry attempts
    await waitFor(() => {
      expect(mockEventSource.connectAttempts).toBe(4); // Initial + 3 retries
    });
  });

  it('should fall back to polling after max retries', async () => {
    // Mock SSE failures
    mockEventSource.alwaysFail = true;

    const { result } = renderHook(() => useImportProgressStream('test_id'));

    await waitFor(() => {
      expect(result.current.connectionState).toBe('error');
      expect(mockFetch).toHaveBeenCalledWith('/api/v1/import/progress/test_id');
    });
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => useImportProgressStream('test_id'));

    unmount();

    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('should call onComplete callback when import finishes', async () => {
    const onComplete = jest.fn();

    renderHook(() => useImportProgressStream('test_id', { onComplete }));

    // Simulate done event
    mockEventSource.emit({ stage: 'done', progress: 100 });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'done', progress: 100 })
      );
    });
  });
});
```

**Why it's important:**

- Hook is the bridge between SSE backend and UI
- Reconnection logic can fail in subtle ways
- Polling fallback must activate correctly

**Risk if not tested:**

- High - This hook is used by ALL import UI components
- Bugs here affect entire import visualization system

---

### 4. Visualization Components

**What we built:**

- `ImportPipelineProgress` - 7-stage pipeline
- `ImportStatsPanel` - Animated counters
- `ImportMiniGraph` - Canvas with particles

**Current test coverage:** ❌ **NONE** (frontend tests don't exist)

**What SHOULD be tested:**

```typescript
describe('ImportPipelineProgress', () => {
  it('should render all 7 stages', () => {
    render(<ImportPipelineProgress currentStage="queued" progress={0} />);

    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('should highlight active stage', () => {
    const { rerender } = render(
      <ImportPipelineProgress currentStage="parsing" progress={20} />
    );

    const parsingStage = screen.getByText('Parsing').closest('div');
    expect(parsingStage).toHaveClass('text-purple-300');

    // Update to next stage
    rerender(<ImportPipelineProgress currentStage="indexing" progress={50} />);

    const indexingStage = screen.getByText('Indexing').closest('div');
    expect(indexingStage).toHaveClass('text-purple-300');
  });

  it('should show error state', () => {
    render(
      <ImportPipelineProgress
        currentStage="parsing"
        progress={20}
        error="Parse error"
      />
    );

    expect(screen.getByText('Parse error')).toBeInTheDocument();
  });
});

describe('ImportStatsPanel', () => {
  it('should animate counter changes', async () => {
    const { rerender } = render(
      <ImportStatsPanel stats={{ conversationsProcessed: 10, messagesProcessed: 100, ... }} />
    );

    // Update stats
    rerender(
      <ImportStatsPanel stats={{ conversationsProcessed: 20, messagesProcessed: 200, ... }} />
    );

    // Verify animation occurs (counter should interpolate)
    // This is tricky to test - may need visual regression testing
  });
});

describe('ImportMiniGraph', () => {
  it('should render canvas element', () => {
    render(<ImportMiniGraph recentNodes={[]} width={400} height={300} />);

    const canvas = screen.getByRole('img'); // Canvas has implicit img role
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('width', '400');
  });

  it('should spawn nodes from recentNodes prop', () => {
    const nodes = [
      { id: 'node1', kind: 'ChatThread', label: 'Test Chat' },
      { id: 'node2', kind: 'Message', label: 'Test Message' },
    ];

    const { rerender } = render(<ImportMiniGraph recentNodes={[]} />);

    // Update with nodes
    rerender(<ImportMiniGraph recentNodes={nodes} />);

    // Verify canvas was updated (hard to test canvas rendering directly)
    // May need snapshot testing or visual regression testing
  });
});
```

**Why it's important:**

- Visual components are user-facing (bugs are immediately visible)
- Animation logic can have edge cases (React state updates, RAF timing)
- Canvas rendering can fail silently (wrong coordinates, color mismatches)

**Risk if not tested:**

- Medium - Visual bugs won't break functionality but hurt UX
- Canvas issues can cause high CPU usage if animation loop breaks

---

## Test Integration Recommendations

### Option 1: Add Tests to Existing Suites ✅ **RECOMMENDED**

**Pros:**

- Leverages existing test infrastructure
- Runs as part of CI pipeline
- Consistent with current testing strategy

**Cons:**

- Mixing integration and unit tests
- SSE testing requires EventSource polyfill

**Implementation:**

```bash
# Create new test file
apps/api/src/__tests__/import-progress-sse.test.ts

# Add SSE-specific tests
describe('Import Progress SSE', () => {
  // SSE connection tests
  // Event emission tests
  // Polling fallback tests
});
```

**Files to create:**

1. `apps/api/src/__tests__/import-progress-sse.test.ts` - SSE backend tests
2. `apps/web/src/__tests__/useImportProgressStream.test.ts` - Hook tests (if/when frontend tests added)
3. `apps/web/src/__tests__/visualizations.test.tsx` - Component tests (if/when frontend tests added)

---

### Option 2: Manual Testing Only ⚠️

**Pros:**

- Zero effort (already done during development)
- Sufficient for non-critical features

**Cons:**

- No regression protection
- Manual testing required for every change
- Can't catch edge cases (connection drops, retries)

**When to use:**

- MVP/prototype stage
- Features that rarely change
- Visual-heavy components (hard to test programmatically)

---

### Option 3: E2E Tests Only (Playwright/Cypress)

**Pros:**

- Tests real browser behavior
- Catches visual regressions
- Tests entire user flow

**Cons:**

- Slow (30s+ per test)
- Flaky (network timing, animation delays)
- Hard to debug

**When to use:**

- After unit/integration tests are in place
- For critical user flows
- For visual regression testing

---

## Immediate Action Items

### Priority 1: Add SSE Backend Tests (2-3 hours)

**File**: `apps/api/src/__tests__/import-progress-sse.test.ts`

**Tests to add:**

1. ✅ SSE connection establishment
2. ✅ Event emission during import
3. ✅ Heartbeat mechanism
4. ✅ Connection cleanup
5. ✅ Polling fallback endpoint
6. ✅ Authentication (JWT validation)
7. ✅ Error events on import failure

**Dependencies:**

- EventSource polyfill: `npm install --save-dev eventsource`
- Mock import uploads (already exists)

**Risk if skipped:** Medium

- SSE is optional but important for UX
- Bugs can cause memory leaks (zombie connections)

---

### Priority 2: Document Manual Testing Steps (30 minutes)

**File**: `apps/api/src/__tests__/README.md` (update)

**Add section:**

```markdown
## Manual Testing: SSE Real-Time Progress

### Prerequisites

- API running: `cd apps/api && npm run dev`
- Web running: `cd apps/web && npm run dev`

### Test Steps

1. Navigate to http://localhost:3000/canvas
2. Click Upload button → Opens ImportFlowPanel
3. Select JSON file (use `ai_context/chat_data/test-samples/small.json`)
4. Click "Start Import"
5. **Verify:**
   - Pipeline stages light up sequentially (Queued → Reading → ... → Done)
   - Counters animate smoothly (15 → 342)
   - Graph renders nodes with particles
   - Progress bar fills from 0% → 100%

### Test SSE Connection

1. Open browser DevTools → Network tab
2. Filter for "EventSource"
3. Start import
4. **Verify:**
   - Connection to `/api/v1/import/progress/stream/:id` established
   - Type shows "eventsource"
   - Events stream in real-time

### Test Polling Fallback

1. Start import
2. Stop API server mid-import
3. **Verify:**
   - "Connection: error (using polling fallback)" appears
   - UI continues to update (via polling)
4. Restart API server
5. **Verify:** Import completes successfully
```

**Risk if skipped:** Low

- Manual testing is already being done
- Documentation just formalizes it

---

### Priority 3: Add Frontend Hook Tests (3-4 hours) - FUTURE

**Only if frontend tests are set up**

**File**: `apps/web/src/__tests__/useImportProgressStream.test.ts`

**Dependencies:**

- `@testing-library/react-hooks`
- `jest` or `vitest`
- EventSource mock

**Risk if skipped:** Medium

- Hook is critical for all import UI
- But manual testing can catch most issues

---

## Current Test Commands

### Run Existing Tests

```bash
# All tests
cd apps/api && npm test

# Backend pipeline only
npm test comprehensive-system-test

# UI integration only
npm test ui-integration-test

# Specific test
npm test -- -t "should persist imported data"

# With coverage
npm test -- --coverage
```

### Test SSE Manually

```bash
# Terminal 1: Start API
cd apps/api && npm run dev

# Terminal 2: Test SSE endpoint
TOKEN="your-jwt-token"
UPLOAD_ID="test_upload_id"

curl -N -H "Authorization: Bearer $TOKEN" \
  http://localhost:4001/api/v1/import/progress/stream/$UPLOAD_ID

# Expected output:
# : heartbeat
# : heartbeat
# data: {"type":"connected","uploadId":"test_upload_id"}
```

---

## Integration with Existing Test Suite

### Where New Tests Fit:

```
apps/api/src/__tests__/
├── comprehensive-system-test.test.ts   (Backend pipeline)
├── import-enhanced.test.ts             (Import API)
├── ui-integration-test.test.ts         (UI integration)
└── import-progress-sse.test.ts         ← NEW: SSE tests
```

### Test Coverage Matrix (After SSE Tests):

| Layer                  | Backend Tests | UI Tests | SSE Tests |
| ---------------------- | ------------- | -------- | --------- |
| File Upload Endpoint   | ⚠️            | ✅       | -         |
| Chat Import Processing | ✅            | ⚠️       | -         |
| **SSE Streaming**      | ❌            | ❌       | ✅        |
| **Progress Events**    | ❌            | ❌       | ✅        |
| HTTP Polling Fallback  | ❌            | ❌       | ✅        |
| Graph Integrity        | ✅            | ⚠️       | -         |
| Multi-Tenancy          | ❌            | ✅       | -         |

---

## Conclusion

### Summary:

- ❌ **SSE and visualization features are NOT covered by existing tests**
- ⚠️ **Manual testing has been done, but no automated tests**
- ✅ **Core import functionality IS well-tested** (existing tests)

### Recommendation:

**Add SSE backend tests (Priority 1)** - 2-3 hours of work

- Provides regression protection
- Catches connection/memory leak issues
- Low effort, high value

**Document manual testing (Priority 2)** - 30 minutes

- Already being done informally
- Formalizes testing process
- Helps future developers

**Frontend tests (Priority 3)** - FUTURE

- Only if frontend test suite is set up
- Not critical (manual testing sufficient for now)

### Risk Assessment:

**Without Tests:**

- 🟡 Medium Risk - SSE is optional enhancement
- ✅ Core import works fine (already tested)
- ⚠️ But SSE bugs could cause memory leaks or poor UX

**With Tests:**

- 🟢 Low Risk - Regression protection
- ✅ Catch connection issues early
- ✅ Confidence in refactoring

**Recommendation: Add SSE tests before production deployment**

---

**Last Updated**: 2025-10-17
**Status**: Awaiting test implementation
