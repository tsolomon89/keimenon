# Diagnostics Needed - Current Issues

**Date**: 2025-10-17
**Status**: Need User Testing & Browser Console Logs

## Issue 1: ChatImportModal Flow Works (No Issue)

**User Report**: "We didn't get the extended form the old import modal that would use to appear from clicking 'Import Chat Conversations'"

**Investigation Result**: ✅ **The ChatImportModal IS properly wired up and working**

**Wiring**:

1. User clicks "Import Chat Conversations" in FirstTimeUploadModal (line 61)
2. Calls `onOpenChatImport()` (line 61)
3. Sets `showChatImportModal = true` (canvas/page.tsx:79)
4. Renders `<ChatImportModal onDismiss={...} />` (CanvasLayout.tsx:102-104)

**ChatImportModal Features** (Fully Implemented):

- ✅ File selection stage (drag & drop + file picker)
- ✅ Processing stage (platform detection, analysis)
- ✅ Config stage (import settings, filters)
- ✅ Duplicate review stage (DuplicateReviewPanel)
- ✅ Real API calls (importChatFiles, analyzeFiles, detectPlatform)

**Files**:

- [ChatImportModal.tsx](apps/web/src/components/canvas/ChatImportModal.tsx) - Lines 1-310
- [canvas/page.tsx](apps/web/src/app/canvas/page.tsx) - Lines 78-80, 88-90, 102-104
- [CanvasLayout.tsx](apps/web/src/components/canvas/CanvasLayout.tsx) - Lines 102-104

**User Action Required**:

1. Click "Import Chat Conversations" button
2. Verify modal appears with file selection UI
3. If modal doesn't appear, check browser console for errors
4. Share console logs/screenshots

---

## Issue 2: Analytics Stuck on "Loading analytics..."

**User Report**: "Processing analytics is stuck on loading 'Loading analytics...' and not seeing anything actively happen on the canvas"

**Possible Causes**:

### Cause 1: API Endpoint Returning 403/401 (Most Likely)

**Symptom**: Network tab shows red 401/403 responses
**Reason**: Our changes removed `requireAdmin` but might have broken something else
**Check**:

```
1. Open browser DevTools (F12)
2. Go to Network tab
3. Refresh dashboard
4. Look for /api/v1/analytics/overview request
5. Check status code (should be 200, not 403/401)
6. If 403/401: Click request → Preview tab → See error message
```

### Cause 2: API Returning Empty/Invalid Data

**Symptom**: Network request succeeds (200) but UI shows loading forever
**Reason**: Response missing required fields (accountStats, totalSeats, etc.)
**Check**:

```
1. Network tab → /api/v1/analytics/overview
2. Click Response tab
3. Verify JSON structure matches expected format
4. Check if `accounts`, `user_activity`, `storage` fields exist
```

### Cause 3: Database Query Errors

**Symptom**: API returns 500 Internal Server Error
**Reason**: SQL queries failing (missing columns, syntax errors)
**Check**:

```
1. Network tab → check for 500 errors
2. Look at API server terminal output for SQL errors
3. Check if account_id column exists in audit_log table
```

### Cause 4: Frontend Error in CRMDashboard

**Symptom**: Console shows JavaScript errors
**Reason**: Component trying to access undefined properties
**Check**:

```
1. Console tab → look for red errors
2. Check for "Cannot read property 'X' of undefined"
3. Share full error stack trace
```

---

## Diagnostic Steps (Please Run)

### Step 1: Check Browser Console

```
1. Open canvas page
2. Press F12 to open DevTools
3. Click Console tab
4. Look for any red errors
5. Copy/paste ALL errors here
```

### Step 2: Check Network Requests

```
1. DevTools → Network tab
2. Refresh page
3. Find /api/v1/analytics/overview request
4. Click on it
5. Check:
   - Status: (should be 200)
   - Response tab: Copy/paste JSON
   - Headers tab: Check X-Operating-Account if in CRM mode
```

### Step 3: Check API Server Logs

```
# In terminal where API server is running
# Look for:
- SQL errors
- "Analytics overview error:"
- Stack traces
# Copy/paste any errors
```

### Step 4: Test Different User Types

**Test A: Client User (Native Mode)**

```
1. Login as client user (accountType='client')
2. Navigate to dashboard
3. Expected: Should see account-scoped analytics
4. Check: Network request status, console errors
```

**Test B: Admin User (Native Mode)**

```
1. Login as admin user
2. Navigate to dashboard (should be in CRM mode by default)
3. Expected: Should see system-wide analytics
4. Check: Network request status, console errors
```

**Test C: Admin User (CRM Mode with Client Account)**

```
1. Login as admin user
2. Switch to CRM mode
3. Select a client account
4. Navigate to dashboard
5. Expected: Should see client-scoped analytics
6. Check: X-Operating-Account header present
```

---

## Quick Fixes to Try

### Fix 1: Check Auth Token

**File**: Browser Console

```javascript
// Run in browser console
localStorage.getItem('canvas_memory_token');
// Should return a JWT token, not null
```

### Fix 2: Check Operating Context Headers

**Location**: DevTools → Network → /analytics/overview → Request Headers
**Expected**:

```
Authorization: Bearer eyJhbGc...
X-Operating-Account: <accountId> (if in CRM mode)
X-Operating-Mode: crm (if in CRM mode)
```

### Fix 3: Test API Directly

**Method**: Use curl/Postman to test API

```bash
# Replace $TOKEN with your actual token
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4001/api/v1/analytics/overview

# Expected: 200 OK with JSON response
# If 403: Auth issue
# If 500: Database/SQL issue
```

---

## Expected Responses

### Analytics Overview Response (Client User)

```json
{
  "accounts": {
    "active": 1,
    "total_seats": 3,
    "tier_distribution": {
      "free": 0,
      "professional": 1,
      "business": 0
    }
  },
  "user_activity": {
    "last_7_days": 2,
    "last_30_days": 3,
    "avg_session_time_minutes": 15.5
  },
  "storage": {
    "total_nodes": 1523,
    "total_edges": 3047,
    "total_sources": 42,
    "storage_size_bytes": 2048576
  },
  "processing": {
    "active": 0,
    "completed_today": 0,
    "failed": 0
  },
  "billing": {
    "mrr": 29,
    "churn_rate": 0,
    "customer_ltv": 0
  },
  "system_health": {
    "api_latency_ms": 0,
    "error_rate": 0,
    "uptime_percent": 100
  }
}
```

### Analytics Overview Response (Admin User, System-Wide)

```json
{
  "accounts": {
    "active": 15,
    "total_seats": 47,
    "tier_distribution": {
      "free": 10,
      "professional": 3,
      "business": 2
    }
  }
  // ... same structure, different numbers
}
```

---

## Files to Review

If issues persist, check these files for potential problems:

### Backend

1. **apps/api/src/routes/analytics.routes.ts** (lines 48-243)
   - Check SQL query syntax
   - Verify `targetAccountId` variable usage
   - Check `isSystemWideView` logic

2. **apps/api/src/middleware/auth.middleware.ts** (lines 36-178)
   - Verify requireAuth adds req.user properly
   - Check operating context extraction (lines 67-121)

### Frontend

3. **apps/web/src/components/canvas/CRMDashboard.tsx** (lines 96-123)
   - Check useEffect fetchAnalytics function
   - Verify error handling (lines 114-119)
   - Check state updates (lines 110-113)

4. **apps/web/src/lib/api-client.ts**
   - Search for getAnalyticsOverview function
   - Verify it sends correct headers
   - Check error handling

---

## Next Steps

**User**: Please provide the following information:

1. **Browser Console Output**
   - Any red errors
   - Any warnings related to analytics

2. **Network Tab Details**
   - Status code for /api/v1/analytics/overview
   - Full response JSON (if 200 OK)
   - Full error response (if 4xx/5xx)

3. **User Context**
   - What account type are you? (admin/client)
   - What mode are you in? (CRM/portal/native)
   - If admin in CRM mode: which client account is selected?

4. **ChatImportModal Test**
   - Click "Import Chat Conversations"
   - Does the modal appear? (Yes/No)
   - If no: any console errors?
   - If yes: can you select files and see config stage?

Once we have this information, we can pinpoint the exact issue and fix it immediately.

---

**Status**: Awaiting user diagnostics (console logs, network responses, screenshots)
