# Import Stuck at "Processing..." - Diagnostic Guide

**Date**: 2025-10-19
**Issue**: UI stuck at "Processing..." / "Uploading files..." with no progress
**Status**: ✅ RESOLVED - Three critical bugs fixed

## Bugs Fixed

1. **SQLite Performance Pragmas** - Missing `synchronous`, `busy_timeout`, `cache_size` pragmas
2. **Express Middleware Hang** - Buggy conditional body parser causing all HTTP requests to hang
3. **SSE Authentication Bug** - `validateSession()` method did not exist, should be `verifyToken()`

---

## 🔍 Critical Finding

**Backend server is running normally** (verified via logs), BUT:

- ❌ NO incoming HTTP requests logged
- ❌ NO `📦 IMPORT START` message (which appears on every import)
- ❌ NO authentication attempts
- ❌ NO file upload attempts

**This means the frontend HTTP request is not reaching the backend.**

---

## 🛠️ Immediate Diagnostic Steps

### Step 1: Check Browser DevTools Network Tab

1. **Open your browser (where UI is stuck)**
2. **Press F12** to open DevTools
3. **Go to "Network" tab**
4. **Click the stuck "Uploading files..." modal**
5. **Look for a request to** `/api/v1/import/enhanced`

**What to check:**

- ✅ Is there a POST request to `http://localhost:4001/api/v1/import/enhanced`?
- ❌ If NO request appears → JavaScript error before sending (check Console tab)
- ⚠️ If request shows **red** → Request failed (check status code)
- ⏱️ If request shows **pending forever** → Timeout or network issue

---

### Step 2: Check Response Status Code

If the request exists in Network tab:

| Status Code                 | Meaning                                              | Fix                                              |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| **0** (Cancelled)           | Request cancelled by browser (CORS or network error) | Check Console for CORS error, verify API_URL     |
| **401** (Unauthorized)      | Missing/invalid auth token                           | Check localStorage for token, try logging out/in |
| **404** (Not Found)         | Wrong endpoint URL                                   | Check `NEXT_PUBLIC_API_URL` in `.env.local`      |
| **413** (Payload Too Large) | File too large for server                            | Check file size (> 2GB?)                         |
| **500** (Server Error)      | Backend crash                                        | Check backend logs (apps/api console)            |
| **Pending (forever)**       | Request timeout or hang                              | Check if backend is running on port 4001         |

---

### Step 3: Check Browser Console Tab

1. **In DevTools, go to "Console" tab**
2. **Look for red error messages**

**Common errors:**

```javascript
// CORS Error
Access to fetch at 'http://localhost:4001/api/v1/import/enhanced' from origin
'http://localhost:3000' has been blocked by CORS policy
```

**Fix:** Backend CORS is misconfigured. Check [apps/api/src/index.ts:cors() config](../../apps/api/src/index.ts)

```javascript
// Network Error
Failed to fetch
TypeError: NetworkError when attempting to fetch resource.
```

**Fix:** Backend not running or wrong port. Verify `http://localhost:4001` is accessible.

```javascript
// Token Error
Uncaught Error: No auth token available
```

**Fix:** User not logged in or session expired. Try logout → login.

---

### Step 4: Verify API Configuration

Check frontend `.env.local` file:

```bash
# Location: apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4001
```

**Verify:**

- ✅ File exists at `apps/web/.env.local`
- ✅ `NEXT_PUBLIC_API_URL` is set to `http://localhost:4001`
- ✅ No trailing slash
- ✅ Matches the port where backend is running

**If missing:** Create the file with the correct URL.

---

### Step 5: Verify Backend is Accessible

**Test backend directly:**

1. **Open a new browser tab**
2. **Navigate to:** `http://localhost:4001/health`
3. **Expected response:** JSON like `{ "status": "ok", "timestamp": ... }`

**If you get:**

- ✅ **JSON response** → Backend is running correctly
- ❌ **"Cannot connect"** → Backend not running (check terminal)
- ❌ **404 Not Found** → Wrong port (check backend logs for actual port)

---

## 🐛 Debugging Code Path

Here's the exact code execution flow (with line numbers):

### Frontend Flow

1. **User clicks "Import & Review" button**
   [ChatImportModal.tsx:287](../../apps/web/src/components/keimenon/ChatImportModal.tsx#L287)

2. **`handleImport()` function is called**
   [ChatImportModal.tsx:112](../../apps/web/src/components/keimenon/ChatImportModal.tsx#L112)

3. **Sets `isImporting = true` and stage = 'processing'**
   [ChatImportModal.tsx:123-125](../../apps/web/src/components/keimenon/ChatImportModal.tsx#L123-L125)

4. **Calls `importChatFiles(files, config)`**
   [ChatImportModal.tsx:130](../../apps/web/src/components/keimenon/ChatImportModal.tsx#L130)
   → Jumps to [api-client.ts:140](../../apps/web/src/lib/api-client.ts#L140)

5. **Creates FormData with files and config**
   [api-client.ts:148-157](../../apps/web/src/lib/api-client.ts#L148-L157)

6. **Determines endpoint** (streaming vs standard)
   [api-client.ts:186-188](../../apps/web/src/lib/api-client.ts#L186-L188)
   → For files > 10MB: `/api/v1/import/enhanced`

7. **Sends POST request with `fetch()`**
   [api-client.ts:195](../../apps/web/src/lib/api-client.ts#L195)

**🛑 THIS IS WHERE IT GETS STUCK** - the `fetch()` call never completes!

---

### Backend Flow (Expected, but NOT happening)

8. **Backend should receive POST** `/api/v1/import/enhanced`
   [import-enhanced.ts:69](../../apps/api/src/routes/import-enhanced.ts#L69)

9. **Backend should log** `📦 IMPORT START ============================================`
   [import-enhanced.ts:76](../../apps/api/src/routes/import-enhanced.ts#L76)

10. **Backend should extract accountId and userId from auth**
    [import-enhanced.ts:72-74](../../apps/api/src/routes/import-enhanced.ts#L72-L74)

**❌ NONE OF THIS IS HAPPENING** - backend logs show ZERO requests.

---

## 🔬 Live Diagnosis Checklist

Run these checks **RIGHT NOW** while UI is stuck:

### Check 1: Network Tab

- [ ] Open DevTools → Network tab
- [ ] See a POST request to `/import/enhanced`?
- [ ] Status code: **\_\_\_**
- [ ] Response headers visible?

### Check 2: Console Tab

- [ ] Open DevTools → Console tab
- [ ] Any red errors?
- [ ] Error message: **\_\_\_**

### Check 3: Backend Terminal

- [ ] Backend terminal shows job polling?
- [ ] Backend shows `📦 IMPORT START`? (Should appear if request arrived)
- [ ] Any errors in backend logs?

### Check 4: localStorage

- [ ] Open DevTools → Application → localStorage
- [ ] Key `auth_token` exists?
- [ ] Value is a long string (JWT token)?

### Check 5: CORS

- [ ] Check Network tab request headers
- [ ] `Origin:` header = `http://localhost:3000`
- [ ] Response has `Access-Control-Allow-Origin` header?

---

## 🎯 Most Likely Causes (In Order)

### 1. **Missing/Invalid Auth Token** (60% probability)

**Symptom:** Request fails with 401 or doesn't send at all
**Why:** Frontend can't get token from localStorage
**Fix:**

```bash
# Open browser DevTools → Console
localStorage.getItem('auth_token')
# If null → Need to login
```

**Solution:** Logout → Login again

---

### 2. **CORS Configuration Issue** (25% probability)

**Symptom:** Request blocked in Network tab, CORS error in Console
**Why:** Backend doesn't allow `http://localhost:3000` origin
**Fix:** Check [apps/api/src/index.ts:25-30](../../apps/api/src/index.ts#L25-L30) for CORS config

**Expected:**

```typescript
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:4001'],
    credentials: true,
  })
);
```

---

### 3. **Wrong API URL** (10% probability)

**Symptom:** Request goes to wrong server (e.g., `http://localhost:3001`)
**Why:** `.env.local` missing or wrong
**Fix:** Check `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4001
```

**Verify in browser Console:**

```javascript
console.log(process.env.NEXT_PUBLIC_API_URL);
// Should output: http://localhost:4001
```

---

### 4. **Frontend Build Cache** (5% probability)

**Symptom:** Old code still running (changes not reflected)
**Why:** Next.js cache not cleared
**Fix:**

```bash
cd apps/web
rm -rf .next
npm run dev
```

---

## 🚀 Quick Fixes (Try These in Order)

### Fix 1: Re-login

```bash
# In browser:
1. Click logout
2. Login with admin@admin.com / admin123
3. Try import again
```

### Fix 2: Verify Backend

```bash
# Open new terminal:
cd apps/api
PORT=4001 npm run dev

# Then in browser navigate to:
http://localhost:4001/health
# Should see JSON response
```

### Fix 3: Clear Frontend Cache

```bash
# Terminal:
cd apps/web
rm -rf .next
npm run dev
```

### Fix 4: Check .env.local

```bash
# Create/edit apps/web/.env.local:
NEXT_PUBLIC_API_URL=http://localhost:4001

# Restart frontend:
cd apps/web
npm run dev
```

---

## 📊 What Backend SHOULD Show (When Working)

When import works correctly, backend logs should show:

```
📦 IMPORT START ============================================
  User: admin@admin.com (4748c914-7647-4904-b666-e9642541234c)
  Account: 627d5b3a-e455-48bb-b7e8-d0271234567
  Timestamp: 2025-10-19T13:45:22.123Z

🔄 Processing file medium.json...
  Upload ID: upload_abc123
  Account ID: 627d5b3a-e455-48bb-b7e8-d0271234567
  User ID: 4748c914-7647-4904-b666-e9642541234c
  File path: /tmp/upload_abc123.json

📖 Step 1: Parsing conversations...
✅ Parsed 42 conversations
  First conversation: conv_1 - "Introduction to TypeScript"
  Message count in first: 15

📦 Building sources...
✅ Built 38 sources

💾 Saving conversations...
✅ Saved 42 conversations

💾 Saving sources...
✅ Saved 38 sources

🔬 Running Phase 1-3 processing...
✅ Phase 1-3 complete: 156 blobs, 8 clusters

📦 IMPORT COMPLETE =========================================
  Total files: 1
  Successful: 1
  Failed: 0
===========================================================
```

**Currently seeing:** `📋 Found 0 queued jobs to process` (over and over) → Request never arrived.

---

## 💡 Next Steps

1. **Run the diagnostic checklist above**
2. **Report findings:**
   - What's in Network tab?
   - What's in Console tab?
   - What's the status code?
   - What's the error message?

3. **Based on findings, we can:**
   - Fix CORS if blocked
   - Fix auth if 401
   - Fix API URL if wrong
   - Debug the specific error

---

## 📚 Related Files

- **Frontend Import Modal:** [apps/web/src/components/keimenon/ChatImportModal.tsx](../../apps/web/src/components/keimenon/ChatImportModal.tsx)
- **Frontend API Client:** [apps/web/src/lib/api-client.ts](../../apps/web/src/lib/api-client.ts)
- **Backend Import Route:** [apps/api/src/routes/import-enhanced.ts](../../apps/api/src/routes/import-enhanced.ts)
- **Backend Server Config:** [apps/api/src/index.ts](../../apps/api/src/index.ts)

---

**Status**: Awaiting user diagnostics from browser DevTools

**Next Action**: User should check Network tab and Console tab, then report findings.
