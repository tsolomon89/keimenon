# Testing Checklist: Error Handling + Background Operations

**Quick Reference** - Print this and check off each item as you test

---

## 🚀 Prerequisites

- ✅ Dev servers running: `npm run dev`
- ✅ Browser open: http://localhost:3000/canvas
- ✅ Console Footer working: Press `` ` `` to test
- [ ] Test data available: `ai_context/chat_data/test-samples/small.json`

---

## ✅ Test 1: Data Deletion with Minimize

**Location**: Settings Page

- ✅ Navigate to Settings page
- ✅ Press `` ` `` to open Console Footer
- ✅ Click "Clear Canvas Data" button
- ✅ Confirmation modal appears with stats
- ✅ Click "Clear Data" button
- ✅**"Minimize" button appears during deletion**
- ✅Click "Minimize" button
- ✅ Modal closes, deletion continues
- ❌ Navigate to CRM Dashboard
- [ ] **Operation appears in Operations Table** with:
  - [ ] Red Trash2 icon
  - [ ] "Clearing canvas data" title
  - [ ] Progress indicator
- [ ] Operation completes (green checkmark)
- [ ] Press `` ` `` and check Console tab
- [ ] **No errors displayed**

**Result**: ✅ Pass / ❌ Fail

**Notes**: Going to "Settings" or " Dashboard " views still just get stuck on loading after minimizing the delete modal. ****************\_\_\_\_****************

---

## ✅ Test 2: Import with Minimize

**Location**: Canvas Page

- ✅ Click "Import" button in canvas toolbar
- ✅ ImportFlowPanel opens in right sidebar
- ✅ **Stage 1: File Selection**
  - ✅ Drag & drop zone visible
  - ✅ Click "Choose Files" button
  - ✅ Select: `ai_context/chat_data/test-samples/small.json`
- ✅ **Stage 2: File Analysis** (automatic)
  - ✅ "Analyzing files..." message appears
  - ✅ Progress bar shows 0-100%
  - ✅ Detects file type automatically
- ❌ **Stage 3: Configuration**
  - ❌ File summary shows "1 file detected • Chat import"
  - ✅ '✅' Include user messages (checked)
  - ✅ '✅' Include assistant messages (checked)
  - ✅ '✅' Extract code blocks from messages (checked)
  - ❌ '✅' Enable duplicate detection (checked)
  - ✅ Click "Start Import" button
- [ ] **Stage 4: Processing**
  - [ ] ImportPipelineProgress shows stages
  - [ ] ImportStatsPanel shows animated counters
  - [ ] ImportMiniGraph shows live graph preview
  - [ ] **"Minimize" button appears in header**
  - [ ] Click "Minimize" button
  - [ ] Panel closes, import continues
- [ ] Navigate to CRM Dashboard
- [ ] **Operation appears in Operations Table** with:
  - [ ] Gray FileText icon
  - [ ] File name as title
  - [ ] Progress bar (0-100%)
  - [ ] Live stats (nodes/edges created)
- [ ] Operation completes (green checkmark)
- [ ] Press `` ` `` and check Console tab
- [ ] **No errors displayed**

**Result**: ✅ Pass / ❌ Fail

**Notes**:

- Stage 2 : Clicking back next to 'Configuration Import' takes you back to processing not the start of the form. This puts the user in a loop and and cant realy go back.
  -Error onConfigChange is not a function

  ````
  _src\components\import\sections\ProcessingModeSection.tsx (13:5) @ onConfigChange

    11 | export function ProcessingModeSection({ config, onConfigChange }: ProcessingModeSectionProps) {
    12 |   const handleModeChange = (mode: 'automatic' | 'manual') => {
  > 13 |     onConfigChange({ ...config, processingMode: mode });
      |     ^
    14 |   };
    15 |
    16 |   return (
      ```
      ____________________________________

  ---
  ````

- Stage 3 : Decection issues. Only found 1 file. Thats fine but we know its hundred of chats each chat is technically its own 'source'
- Stage 3 : Missing configuration options from legacy modal (options).
- - We HAVE AI or Human messages filter but we DO NOT have the selection that seperates each them as different sources (if both ar selected)
- - Matching pattern rules and configurations for duplications checked and what not. (though maybe this 'SHOULD' an account setting in the in the 'Settings' view instead of the import process itself. as this is related to the larger DB model and proceessing architecture )
- Stage 4 : here clicking back takes you back to the review page again. I think all the back buttons take you to the start of import flow in this component instead of the previous page.
- Stage 4 : i can close, minimize the Inspector pane with the import/uploading stuff. and I can upload naother files and it says "Uploading" don't know if its doing anything or not.

## ✅ Test 3: Multiple Operations

**Location**: Dashboard

- [ ] Start import (minimize after it starts)
- ❌ Immediately start deletion (minimize after it starts)
- [ ] Navigate to CRM Dashboard
- [ ] **Both operations visible in Operations Table**:
  - [ ] Import: Gray FileText icon
  - [ ] Deletion: Red Trash2 icon
- [ ] Both show progress independently
- [ ] Both complete successfully (green checkmarks)
- [ ] Press `` ` `` and check Console tab
- [ ] **No errors displayed**

**Result**: ✅ Pass / ❌ Fail

**Notes**:

- i can close, minimize the Inspector pane with the import/uploading stuff. and I can upload another files and it says "Uploading" don't know if its doing anything or not.
- the "Setting"s and "Dashboard" will still not load will the files are processing.

## ✅ Test 4: Console Footer

**Location**: Any page

- ✅ **Open Console Footer**:
  - ✅ Press `` ` `` (backtick) key
  - ✅ Console Footer opens at bottom
  - ✅ 4 tabs visible: Console, Logs, Tasks, Shortcuts
- ✅ **Console Tab**:
  - ✅ Switch to Console tab
  - ✅ Trigger an error (e.g., try to import with network disconnected)
  - ✅ Error appears with:
    - ✅ Timestamp
    - ✅ Domain badge (e.g., red "import")
    - ✅ Operation name (e.g., "upload.startUpload")
    - ✅ User-friendly message
    - ✅ Collapsible stack trace
  - ✅ **Test Filters**:
    - ✅ Domain dropdown works
    - ✅ Severity dropdown works
    - ✅ Search text box filters errors
  - ✅ **Test Actions**:
    - ✅ "Export JSON" downloads file
    - ❌ "Export CSV" downloads file
    - ✅ "Clear" button removes all errors
- ✅ **Close Console Footer**:
  - ✅ Press `` ` `` again
  - ✅ Console Footer closes

**Result**: ✅ Pass / ❌ Fail

**Notes**: ******************\_******************
No download csv option down clicking the download icon/button.

---

## ✅ Test 5: Edge Cases

### Empty Database Deletion

- [ ] Clear all canvas data
- [ ] Try to clear again
- [ ] Modal shows: "No canvas data to clear"
- [ ] Operation succeeds gracefully
- [ ] No errors in Console Footer

**Result**: ✅ Pass / ❌ Fail

### Authentication Errors

- [ ] Log out
- [ ] Try to access import or deletion (should redirect to login)
- [ ] Log back in
- [ ] Features work normally

**Result**: ✅ Pass / ❌ Fail

### Large Dataset Deletion

- [ ] Import large file (medium.json if available)
- [ ] Clear canvas data
- [ ] Operation completes in <5 seconds
- [ ] No errors

**Result**: ✅ Pass / ❌ Fail

**Notes**: ******************\_******************

---

## ✅ Test 6: API Tests

**Location**: Terminal

```bash
cd apps/api
npm test data-management
```

**Expected Output**:

```
PASS  src/__tests__/data-management.test.ts
  Data Management API
    GET /api/v1/data/stats
      ✓ should return canvas data statistics
      ✓ should require authentication
      ✓ should return zero stats for empty account
    DELETE /api/v1/data/canvas
      ✓ should clear canvas data for current user
      ✓ should not affect other accounts
      ✓ should handle empty database gracefully
      ✓ should require authentication
      ✓ should create audit log entry
    DELETE /api/v1/data/all-clients (Admin Only)
      ✓ should clear all client canvas data (admin only)
      ✓ should require admin privileges
      ✓ should require authentication
      ✓ should handle no client data gracefully
    Error Handling
      ✓ should return user-friendly error for invalid token
      ✓ should handle concurrent deletions safely
    Performance
      ✓ should delete large datasets efficiently

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

**Checklist**:

- [ ] All 12 tests pass
- [ ] No errors or warnings
- [ ] Test duration <30 seconds

**Result**: ✅ Pass / ❌ Fail

**Notes**: ******************\_******************

---

## ✅ Test 7: Multi-Tenancy

**Location**: Settings Page

### Admin Clears Client Data

- [ ] Log in as admin (admin@admin.com / admin123)
- [ ] Import data as admin
- [ ] Log in as client (client@client.com / client123)
- [ ] Import data as client
- [ ] Log back in as admin
- [ ] Go to Settings page
- [ ] Find "Clear All Client Data (Admin Only)" card
- [ ] Click "Clear All Client Data"
- [ ] Confirm deletion
- [ ] **Verify**:
  - [ ] Client data cleared
  - [ ] Admin data preserved
  - [ ] Audit log created

**Result**: ✅ Pass / ❌ Fail

### Client Cannot Access Admin Features

- [ ] Log in as client
- [ ] Go to Settings page
- [ ] **"Clear All Client Data" card NOT visible**
- [ ] Try direct API call (should fail):
  ```bash
  curl -X DELETE http://localhost:4001/api/v1/data/all-clients \
    -H "Authorization: Bearer $CLIENT_TOKEN"
  # Expected: 403 Forbidden
  ```

**Result**: ✅ Pass / ❌ Fail

**Notes**: ******************\_******************

---

## ✅ Test 8: Error Message Quality

**Objective**: Verify user-friendly error messages

### Database Locked Error

- [ ] Simulate database lock (not trivial - may skip)
- [ ] Expected: "Database is currently busy. Please try again in a moment."

### Network Error

- [ ] Disconnect network
- [ ] Try to import
- [ ] Expected: "Network error. Please check your connection and try again."

### Authentication Error

- [ ] Use invalid token
- [ ] Expected: "Your session has expired. Please log in again."

**Result**: ✅ Pass / ❌ Fail

**Notes**: ******************\_******************

---

## 📊 Summary

**Total Tests**: 8 major test areas

**Results**:

- [ ] Test 1: Data Deletion with Minimize
- [ ] Test 2: Import with Minimize
- [ ] Test 3: Multiple Operations
- [ ] Test 4: Console Footer
- [ ] Test 5: Edge Cases
- [ ] Test 6: API Tests (12 tests)
- [ ] Test 7: Multi-Tenancy
- [ ] Test 8: Error Message Quality

**Overall**: **\_** / 8 passed

---

## 🐛 Bugs Found

| #   | Test | Description | Severity |
| --- | ---- | ----------- | -------- |
| 1   |      |             |          |
| 2   |      |             |          |
| 3   |      |             |          |

---

## ✅ Sign-Off

**Tested By**: **********\_**********

**Date**: **********\_**********

**Status**: ⬜ Approved for Production / ⬜ Needs Fixes

**Notes**:

---

---

---

---

## 📞 Help & Resources

- **Documentation**: [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)
- **API Tests**: [apps/api/src/**tests**/data-management.test.ts](apps/api/src/__tests__/data-management.test.ts)
- **Error Architecture**: [docs/architecture/ERROR_HANDLING.md](docs/architecture/ERROR_HANDLING.md)
- **Keyboard Shortcut**: Press `` ` `` (backtick) to open Console Footer

**Quick Debug Commands**:

```bash
# Check error logs
grep -r "errorCapture.capture" apps/web/src/

# Check database
sqlite3 ~/.canvas-memory/canvas.db "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 5;"

# Run specific test
npm test -- -t "should clear canvas data"
```

---

**Good luck with testing! 🚀**
