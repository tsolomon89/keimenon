# Manual E2E Testing Guide

**Purpose**: Verify that all claimed-complete features work end-to-end
**Time Required**: ~1 hour
**Prerequisites**: Backend and frontend running locally

---

## Setup (5 minutes)

### 1. Start Backend

```bash
cd apps/api
npm run dev
```

**Expected Output**:

```
🚀 API server running on port 4001
✅ Database connected
✅ Migrations applied
```

### 2. Start Frontend

```bash
cd apps/web
npm run dev
```

**Expected Output**:

```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
✓ Compiled successfully
```

### 3. Open Browser

- Navigate to: `http://localhost:3000`
- Open DevTools Console (F12)
- Have test file ready: Small chat export (<1MB JSON)

---

## Test 1: Import Flow with Particle Visualization (20 min)

**Feature Claimed**: "Progress Visualization - COMPLETE with particle effects"
**Files**: [ProgressVisualization.tsx](apps/web/src/components/keimenon/ProgressVisualization.tsx), [useJobStream.ts](apps/web/src/hooks/useJobStream.ts)

### Steps

1. **Navigate to Keimenon**
   - URL should be: `http://localhost:3000/keimenon`
   - Verify keimenon viewport renders

2. **Open Import Modal**
   - Click toolbar button or press hotkey
   - "Import Chat" modal should appear

3. **Select File**
   - Choose a chat export file (JSON format)
   - Options:
     - ChatGPT export: `conversations.json`
     - Claude export: `claude_conversations.json`
     - Test file: `ai_context/chat_data/test-samples/small.json`

4. **Start Upload**
   - Click "Upload" or "Start Import"
   - **VERIFY**: Job created (check network tab for POST request)

5. **Watch Progress Visualization**
   - **VERIFY**: Particle effects appear on keimenon
     - Purple/pink particles spawning
     - Particles have physics (gravity, velocity, fade)
     - Particles emit from random positions
   - **VERIFY**: Progress bar appears at top
     - Shows percentage (0-100%)
     - Shows node count (e.g., "Importing: 45% (123/273 nodes)")
     - Gradient fill with glow effect

6. **Monitor SSE Updates**
   - Open DevTools Console
   - **VERIFY**: SSE messages logged:
     ```
     [Job stream] connected
     [Job stream] jobs.update received
     [Job stream] graph.update received
     ```

7. **Check Background Operations**
   - Open footer or dashboard
   - **VERIFY**: Import job appears in table
     - Status updates (queued → running → succeeded)
     - Progress bar fills
     - Real-time updates (no page refresh needed)

8. **Verify Completion**
   - Wait for import to finish
   - **VERIFY**: Particles fade out after 2 seconds
   - **VERIFY**: Job status shows "succeeded"
   - **VERIFY**: Node count updated in keimenon

### Expected Results ✅

- [ ] Particle system renders with physics
- [ ] Progress bar updates in real-time
- [ ] SSE connection works (check console logs)
- [ ] Job appears in Background Operations
- [ ] Import completes successfully
- [ ] Nodes appear in keimenon after import

### Failure Scenarios ❌

- **No particles**: ProgressVisualization not integrated
- **No progress updates**: SSE connection failed
- **Job not in table**: ImportsTableCard not connected
- **Import hangs**: Backend worker issue

### Screenshots to Capture

1. Particles mid-import (showing physics)
2. Progress bar with percentage
3. Background Operations table with running job
4. DevTools showing SSE events
5. Final success state

---

## Test 2: User Management CRUD (15 min)

**Feature Claimed**: "User Management UI - COMPLETE (Session 2)"
**Files**: [UsersListCard.tsx](apps/web/src/components/settings/UsersListCard.tsx), [UserDetailInspector.tsx](apps/web/src/components/inspector/UserDetailInspector.tsx)

### Steps

1. **Navigate to Settings**
   - Press `` ` `` (backtick) to open command palette
   - Type "settings" or click Settings in sidebar
   - Navigate to: Settings → Account → Users

2. **Verify Users List**
   - **VERIFY**: Current users displayed
   - **VERIFY**: Search box present
   - **VERIFY**: Permission badges (admin, leader, senior, junior)
   - **VERIFY**: "You" badge on current user
   - **VERIFY**: Active/Inactive status shown

3. **Create New User**
   - Click "Add User" button
   - Modal should open: `CreateUserInAccountModal`
   - Fill form:
     - Name: "Test User"
     - Email: "test@example.com"
     - Password: "test123"
     - Permission: "junior"
   - Click "Create User"
   - **VERIFY**: Modal closes
   - **VERIFY**: User appears in list immediately (no page refresh)
   - **VERIFY**: Console shows event: `[API] User created: Test User`

4. **View User Details**
   - Click on the new user row
   - **VERIFY**: Right sidebar opens (Inspector Bar)
   - **VERIFY**: UserDetailInspector shows:
     - User name and email
     - Permission level (editable dropdown)
     - Active/Inactive toggle
     - Created date
     - Last login (if available)

5. **Edit User**
   - Change permission level to "senior"
   - Click "Save" or auto-save triggers
   - **VERIFY**: Permission updates in inspector
   - **VERIFY**: Permission badge updates in list
   - **VERIFY**: Console shows event: `[API] User updated`

6. **Delete User**
   - Click delete button (trash icon) on user row
   - **VERIFY**: Confirmation dialog appears
   - Confirm deletion
   - **VERIFY**: User removed from list
   - **VERIFY**: Console shows event: `[API] User deleted: Test User`

7. **Test Search**
   - Type "admin" in search box
   - **VERIFY**: List filters to show only admin users
   - Clear search
   - **VERIFY**: All users shown again

### Expected Results ✅

- [ ] Users list loads and displays correctly
- [ ] "Add User" creates user and refreshes list
- [ ] User detail inspector shows on click
- [ ] Permission editing works
- [ ] User deletion works with confirmation
- [ ] Search filters users correctly
- [ ] Events logged to console

### Failure Scenarios ❌

- **List doesn't refresh after create**: onSuccess callback not wired
- **Inspector doesn't open**: onUserSelect not connected
- **Edit doesn't save**: API call failing
- **Delete fails**: Permission issue or API error

### Screenshots to Capture

1. Users list with multiple users
2. Create user modal filled out
3. User detail inspector open
4. Console showing user creation event
5. Updated list after user creation

---

## Test 3: Responsive Design (10 min)

**Feature Claimed**: "Frontend Responsiveness - COMPLETE (Oct 22, 2025)"
**Files**: [KeimenonLayout.tsx](apps/web/src/components/keimenon/KeimenonLayout.tsx), [KeimenonSidebar.tsx](apps/web/src/components/keimenon/KeimenonSidebar.tsx)

### Steps

1. **Desktop View (≥ 1024px)**
   - Open DevTools → Device toolbar (Ctrl+Shift+M)
   - Set width to 1920px
   - **VERIFY**: Both sidebars visible
   - **VERIFY**: Keimenon has full space
   - **VERIFY**: Toolbar horizontal layout
   - **VERIFY**: Footer full width

2. **Tablet View (640px - 1024px)**
   - Resize to 768px width
   - **VERIFY**: Sidebars overlay content (not inline)
   - **VERIFY**: Backdrop appears when sidebar opens
   - **VERIFY**: Tap outside sidebar closes it
   - **VERIFY**: Toolbar adapts (some items collapse)

3. **Mobile View (< 640px)**
   - Resize to 375px width (iPhone SE)
   - **VERIFY**: Sidebars closed by default
   - **VERIFY**: Hamburger menu appears
   - **VERIFY**: Click node → sidebar auto-closes on mobile
   - **VERIFY**: Responsive padding (compact spacing)
   - **VERIFY**: Touch targets ≥ 44px

4. **Test Auto-Close**
   - Stay in mobile view (375px)
   - Open left sidebar
   - Click keimenon area
   - **VERIFY**: Sidebar closes automatically
   - Open right sidebar (Inspector)
   - Tap keimenon
   - **VERIFY**: Sidebar closes automatically

5. **Test Breakpoint Transitions**
   - Slowly resize from 1920px → 375px
   - **VERIFY**: Smooth transitions
   - **VERIFY**: No layout jumps or flashes
   - **VERIFY**: Content remains accessible at all sizes

### Expected Results ✅

- [ ] Desktop: Both sidebars visible inline
- [ ] Tablet: Sidebars overlay with backdrop
- [ ] Mobile: Sidebars closed by default
- [ ] Auto-close works on mobile
- [ ] Smooth transitions between breakpoints
- [ ] No horizontal scroll at any size

### Failure Scenarios ❌

- **Sidebars don't overlay on mobile**: CSS media queries not working
- **Auto-close doesn't work**: Mobile detection broken
- **Layout breaks**: Flexbox/grid issues
- **Horizontal scroll appears**: Content overflow

### Screenshots to Capture

1. Desktop view (1920px) - both sidebars open
2. Tablet view (768px) - sidebar with backdrop
3. Mobile view (375px) - sidebar closed
4. Mobile sidebar auto-close in action
5. All three breakpoints side-by-side

---

## Test 4: Error Handling (10 min)

**Feature Claimed**: "Error Handling System - COMPLETE"
**Files**: [ErrorBoundary.tsx](apps/web/src/components/common/ErrorBoundary.tsx), [error-handler.middleware.ts](apps/api/src/middleware/error-handler.middleware.ts)

### Steps

1. **Test React Error Boundary**
   - Navigate to Settings → Debug → Modals (admin only)
   - Click "Trigger Error" button (if available)
   - **VERIFY**: ErrorBoundary catches error
   - **VERIFY**: Fallback UI shows:
     - Red alert icon
     - "Something went wrong" message
     - Error message displayed
     - "Try Again" button
     - "Reload Page" button
   - Click "Try Again"
   - **VERIFY**: Component re-renders

2. **Test API Error Handling**
   - Open DevTools Console
   - Navigate to Users list
   - Edit a user's permission to invalid value (via DevTools)
   - Save
   - **VERIFY**: Error response shows user-friendly message
   - **VERIFY**: Console shows detailed error context:
     ```
     [API Error] {
       message: "Invalid permission level",
       statusCode: 400,
       domain: "api",
       operation: "users.update"
     }
     ```

3. **Test Sentry Integration**
   - Navigate to Settings → Security → Privacy & Error Tracking
   - **VERIFY**: ErrorTrackingCard displays
   - **VERIFY**: Toggle switch present
   - **VERIFY**: Privacy information shown
   - Enable error tracking
   - **VERIFY**: "Error tracking active" indicator appears
   - **VERIFY**: Green pulse dot animates

4. **Test Console Error Capture**
   - Press `` ` `` to open keimenon console
   - Trigger an error (e.g., failed API call)
   - **VERIFY**: Error appears in console feed
   - **VERIFY**: Shows: timestamp, severity, domain, operation, message

### Expected Results ✅

- [ ] ErrorBoundary catches React errors
- [ ] Fallback UI displays correctly
- [ ] API errors show user-friendly messages
- [ ] Error context logged to console
- [ ] Sentry toggle works
- [ ] Console captures all errors

### Failure Scenarios ❌

- **ErrorBoundary doesn't catch errors**: Not integrated in layout
- **Generic "Error" message**: error-handler.middleware not working
- **Sentry UI missing**: Component not integrated in Settings
- **Console doesn't show errors**: ErrorCaptureService not wired

### Screenshots to Capture

1. ErrorBoundary fallback UI
2. API error with user-friendly message
3. Sentry toggle in Settings
4. Console showing error events
5. DevTools showing error context

---

## Test 5: SSE Streaming (10 min)

**Feature Claimed**: "Jobs System - COMPLETE with SSE streaming"
**Files**: [useJobStream.ts](apps/web/src/hooks/useJobStream.ts)

### Steps

1. **Verify Connection**
   - Open DevTools → Network tab
   - Filter by "EventSource" or "stream"
   - Navigate to Keimenon
   - **VERIFY**: Connection to `/api/v1/stream/jobs?token=...`
   - **VERIFY**: Connection stays open (pending state)
   - **VERIFY**: Heartbeat events every 30 seconds

2. **Test Real-Time Updates**
   - Start an import (see Test 1)
   - Watch Network tab SSE messages
   - **VERIFY**: `jobs.update` events received
   - **VERIFY**: `graph.update` events received (if applicable)
   - **VERIFY**: Events contain job progress data

3. **Test Reconnection**
   - While import is running:
   - Stop backend server (`Ctrl+C` in terminal)
   - **VERIFY**: Frontend shows "reconnecting" state
   - **VERIFY**: Console logs: "Job stream reconnection scheduled"
   - Restart backend (`npm run dev`)
   - **VERIFY**: Connection re-establishes automatically
   - **VERIFY**: Updates resume

4. **Test Multi-Job Updates**
   - Start 2-3 imports simultaneously (if possible)
   - **VERIFY**: All jobs update in real-time
   - **VERIFY**: No jobs are missed
   - **VERIFY**: Progress bars update independently

### Expected Results ✅

- [ ] SSE connection establishes on page load
- [ ] Heartbeat events received every 30s
- [ ] Job updates received in real-time
- [ ] Auto-reconnect works after disconnect
- [ ] Multiple jobs update correctly

### Failure Scenarios ❌

- **No connection**: SSE endpoint not available
- **No updates**: Events not being sent from backend
- **Reconnect fails**: Exponential backoff broken
- **Jobs out of sync**: State management issue

### Screenshots to Capture

1. Network tab showing SSE connection
2. SSE events in Network details
3. Console showing reconnection attempts
4. Multiple jobs updating simultaneously

---

## Results Documentation Template

```markdown
# Manual E2E Test Results

**Date**: [Date]
**Tester**: [Your Name]
**Environment**: Local development

## Test Summary

| Test                       | Status     | Notes                                       |
| -------------------------- | ---------- | ------------------------------------------- |
| Import Flow with Particles | ✅ PASS    | Particles render, progress updates work     |
| User Management CRUD       | ✅ PASS    | All CRUD operations work                    |
| Responsive Design          | ⚠️ PARTIAL | Desktop/mobile work, tablet has minor issue |
| Error Handling             | ✅ PASS    | ErrorBoundary catches errors                |
| SSE Streaming              | ✅ PASS    | Real-time updates work                      |

## Detailed Results

### Test 1: Import Flow

- **Status**: ✅ PASS
- **Evidence**: [Screenshot URLs]
- **Notes**:
  - Particle system works perfectly
  - Progress bar updates smoothly
  - Job completes successfully
- **Issues**: None

### Test 2: User Management

- **Status**: ✅ PASS
- **Evidence**: [Screenshot URLs]
- **Notes**:
  - User creation works
  - List refreshes automatically
  - Inspector integration works
- **Issues**: None

[Continue for all tests...]

## Overall Assessment

**Features Working**: 5/5 (100%)
**Critical Issues**: 0
**Minor Issues**: 0
**Recommendations**: All claimed features verified working

## Screenshots

1. [Link to screenshots folder]
2. [Video recording if available]

## Next Steps

- [ ] Add Playwright E2E tests for regression prevention
- [ ] Document any edge cases discovered
- [ ] Update VERIFICATION_REPORT.md with manual test results
```

---

## Tips for Efficient Testing

### Use Browser Profiles

- Create separate Chrome profiles for different test scenarios
- Saves login state between sessions

### Keyboard Shortcuts

- `` ` `` - Keimenon console
- `Ctrl+Shift+M` - Device toolbar
- `Ctrl+Shift+I` - DevTools
- `F12` - DevTools (alternative)

### Network Throttling

- DevTools → Network → Throttling
- Test with "Slow 3G" to see SSE reconnection

### Console Filtering

- Filter by `[API]` to see API events
- Filter by `[Job stream]` to see SSE events
- Filter by `ERROR` to see errors only

### Video Recording

- Use OBS Studio or built-in screen recording
- Record full test sessions for documentation
- Annotate recordings with issues found

---

## Success Criteria

All tests should pass with ✅ PASS status. If any test fails:

1. **Document the failure** (screenshot + description)
2. **Check for simple fixes** (clear cache, restart servers)
3. **File a bug report** with reproduction steps
4. **Update VERIFICATION_REPORT.md** with findings

If 80%+ of tests pass, features are "production-ready with known issues."
If <80% pass, features need more work before claiming "COMPLETE."

---

**Remember**: These are real features with real implementations. The goal is to verify they work end-to-end, not to find bugs. Most features should pass on first attempt.
