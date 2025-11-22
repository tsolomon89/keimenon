# Front-End Component Tree Audit

**Date**: 2025-10-22
**Purpose**: Complete map of component tree showing wiring status, deprecated systems, orphaned components, and error handling coverage.

---

## Executive Summary

### Key Findings

- **Total Routes**: 11 identified
- **Main Application Modes**: 3 (canvas, dashboard/CRM, settings)
- **Modals Documented**: 8+ with triggering logic mapped
- **Orphaned Components**: 3 identified (1 confirmed obsolete, 2 need verification)
- **Error Handling**: Infrastructure excellent, minor gaps in UI components
- **Navigation**: Fully context-aware across all modes

### Component Status Overview

- ✅ **Wired & Working**: ~90% of components properly connected
- ⚠️ **Legacy/Deprecated**: 3 components (UploadModal, ChatImportModal.old, StreamingUploadModal)
- ❌ **Orphaned/Broken**: 1 confirmed (ChatImportModal.old.tsx)
- 🔧 **Needs Improvement**: 4 components (alert() usage, missing error capture)

---

## 1. Application Architecture

### 1.1 Provider Hierarchy

```
Root Layout (apps/web/src/app/layout.tsx)
├─ SentryProvider
│  └─ ErrorBoundary
│     └─ AuthProvider
│        └─ OperatingProvider (multi-account context)
│           └─ ShellProvider (portal/crm mode)
│              └─ UIVersionProvider
│                 └─ {page content}

Canvas Page (/canvas) - Main Application Entry
└─ ConsoleProvider (error display, debugging)
   └─ BackgroundOperationsProvider (background job tracking)
      └─ ImportProgressProvider (SSE job updates)
         └─ CanvasLayout (mode-aware hub)
```

### 1.2 CanvasLayout Mode System

The CanvasLayout component manages three distinct application modes:

```typescript
type CanvasMode = 'auth' | 'dashboard' | 'settings' | 'canvas';
type ShellMode = 'admin' | 'client'; // LOCKED to user.accountType
```

**Mode Combinations:**

- `canvas` mode + any shell → Graph visualization (CanvasViewport)
- `dashboard` mode + any shell → Dashboard (CRMDashboard component, API-scoped data)
- `settings` mode + any shell → Settings Page
- `auth` mode → Not yet implemented (auth stays as separate routes)

---

## 2. Complete Route Map

### 2.1 Public Routes

| Route       | File                    | Purpose                      | Status    |
| ----------- | ----------------------- | ---------------------------- | --------- |
| `/`         | `app/page.tsx`          | Root redirect (auth gateway) | ✅ Active |
| `/login`    | `app/login/page.tsx`    | User authentication          | ✅ Active |
| `/register` | `app/register/page.tsx` | User registration            | ✅ Active |

### 2.2 Authenticated Routes

| Route         | File                      | Purpose              | Primary Mode | Status    |
| ------------- | ------------------------- | -------------------- | ------------ | --------- |
| `/canvas`     | `app/canvas/page.tsx`     | **Main application** | All 3 modes  | ✅ Active |
| `/account`    | `app/account/page.tsx`    | Account settings     | Settings     | ✅ Active |
| `/board/[id]` | `app/board/[id]/page.tsx` | Canvas2D board view  | Canvas       | ✅ Active |
| `/ingest`     | `app/ingest/page.tsx`     | File ingestion       | Import       | ✅ Active |

### 2.3 User Management Routes

| Route         | File                      | Purpose      | Status    |
| ------------- | ------------------------- | ------------ | --------- |
| `/users`      | `app/users/page.tsx`      | User list    | ✅ Active |
| `/users/new`  | `app/users/new/page.tsx`  | Create user  | ✅ Active |
| `/users/[id]` | `app/users/[id]/page.tsx` | User details | ✅ Active |

### 2.4 Development/Testing Routes

| Route         | File                      | Purpose                | Status    |
| ------------- | ------------------------- | ---------------------- | --------- |
| `/test-error` | `app/test-error/page.tsx` | Error boundary testing | ✅ Active |

---

## 3. Component Tree (Primary Application)

### 3.1 Canvas Page (/canvas) - Full Hierarchy

```
CanvasPage (apps/web/src/app/canvas/page.tsx)
│
├─ ConsoleProvider
│  ├─ BackgroundOperationsProvider
│  │  └─ ImportProgressProvider
│  │     │
│  │     ├─ CanvasLayout (apps/web/src/components/canvas/CanvasLayout.tsx)
│  │     │  │
│  │     │  ├─ CanvasHeader (mode-aware header)
│  │     │  │  ├─ Logo + Title
│  │     │  │  ├─ CanvasToolbar (conditional: canvas mode only)
│  │     │  │  └─ Navigation controls
│  │     │  │
│  │     │  ├─ CanvasSidebar (LEFT) - Context-aware navigation
│  │     │  │  ├─ [Canvas Mode] Groups Tree (useGroupsTree)
│  │     │  │  ├─ [Dashboard Mode] Accounts Tree (useAccountTree)
│  │     │  │  └─ [Settings Mode] Settings Navigation (useSettingsTree)
│  │     │  │
│  │     │  ├─ MAIN CONTENT (mode-switched)
│  │     │  │  ├─ [canvas mode] CanvasViewport
│  │     │  │  │  ├─ React Flow Canvas
│  │     │  │  │  ├─ Node Rendering (custom nodes)
│  │     │  │  │  └─ Edge Rendering
│  │     │  │  │
│  │     │  │  ├─ [dashboard mode + crm shell] CRMDashboard
│  │     │  │  │  ├─ ImportsTableCard ✅ (NEW: import history)
│  │     │  │  │  ├─ Analytics widgets
│  │     │  │  │  └─ CRM-specific tools
│  │     │  │  │
│  │     │  │  └─ [settings mode] SettingsPage
│  │     │  │     ├─ DataManagementCard ✅ (NEW: data cleanup)
│  │     │  │     ├─ UsersListCard ✅ (NEW: user management)
│  │     │  │     ├─ ErrorTrackingCard ✅ (NEW: Sentry config)
│  │     │  │     └─ Other settings cards
│  │     │  │
│  │     │  ├─ CanvasSidebar (RIGHT) - Inspector Panels
│  │     │  │  ├─ [Canvas Mode] Node inspector
│  │     │  │  ├─ [Dashboard Mode] AccountInspector
│  │     │  │  │  └─ UserDetailInspector ✅ (NEW)
│  │     │  │  └─ [Settings Mode] Settings detail view
│  │     │  │
│  │     │  ├─ CanvasFooter
│  │     │  │  ├─ Console component (error display)
│  │     │  │  ├─ Job progress indicators
│  │     │  │  └─ Background operation status
│  │     │  │
│  │     │  └─ MODALS (conditional rendering)
│  │     │     ├─ UploadModal ⚠️ (LEGACY - Shift-key accessible)
│  │     │     └─ ChatImportModal (server-based import)
│  │     │
│  │     ├─ FirstTimeUploadModal (onboarding)
│  │     └─ LocalFirstImportModal ✅ (NEW DEFAULT - browser-based)
│  │
│  └─ [Additional modals rendered at page level]
│     ├─ CreateUserInAccountModal
│     ├─ CreateAccountModal
│     └─ ConfirmationModal
│
└─ [Orphaned/Unconfirmed]
   └─ StreamingUploadModal ❓ (POTENTIALLY ORPHANED - no usage found)
```

### 3.2 Component Wiring Status

| Component                    | File                                  | Wired To                           | Visibility Context                  | Status       |
| ---------------------------- | ------------------------------------- | ---------------------------------- | ----------------------------------- | ------------ |
| **CanvasLayout**             | `canvas/CanvasLayout.tsx`             | `/canvas` route                    | All modes                           | ✅ Hub       |
| **CanvasHeader**             | `canvas/CanvasHeader.tsx`             | CanvasLayout                       | All modes                           | ✅ Wired     |
| **CanvasToolbar**            | `canvas/CanvasToolbar.tsx`            | CanvasHeader                       | Canvas mode only                    | ✅ Wired     |
| **CanvasSidebar**            | `canvas/CanvasSidebar.tsx`            | CanvasLayout (left & right)        | All modes                           | ✅ Wired     |
| **CanvasFooter**             | `canvas/CanvasFooter.tsx`             | CanvasLayout                       | All modes                           | ✅ Wired     |
| **CanvasViewport**           | `canvas/CanvasViewport.tsx`           | CanvasLayout                       | Canvas mode                         | ✅ Wired     |
| **CRMDashboard**             | `canvas/CRMDashboard.tsx`             | CanvasLayout                       | Dashboard + CRM shell               | ✅ Wired     |
| **SettingsPage**             | `settings/SettingsPage.tsx`           | CanvasLayout                       | Settings mode                       | ✅ Wired     |
| **ImportsTableCard**         | `canvas/ImportsTableCard.tsx`         | CRMDashboard                       | Dashboard mode                      | ✅ Wired     |
| **DataManagementCard**       | `settings/DataManagementCard.tsx`     | SettingsPage                       | Settings mode                       | ✅ Wired     |
| **UsersListCard**            | `settings/UsersListCard.tsx`          | SettingsPage                       | Settings mode                       | ✅ Wired     |
| **ErrorTrackingCard**        | `settings/ErrorTrackingCard.tsx`      | SettingsPage                       | Settings mode                       | ✅ Wired     |
| **AccountInspector**         | `inspector/AccountInspector.tsx`      | CanvasSidebar (right)              | Dashboard mode                      | ✅ Wired     |
| **UserDetailInspector**      | `inspector/UserDetailInspector.tsx`   | AccountInspector                   | Dashboard mode (when user selected) | ✅ Wired     |
| **LocalFirstImportModal**    | `canvas/LocalFirstImportModal.tsx`    | Canvas page (state-based)          | All modes (triggered)               | ✅ Wired     |
| **ChatImportModal**          | `canvas/ChatImportModal.tsx`          | CanvasLayout (state-based)         | All modes (triggered)               | ✅ Wired     |
| **FirstTimeUploadModal**     | `canvas/FirstTimeUploadModal.tsx`     | Canvas page (conditional)          | First-time users                    | ✅ Wired     |
| **CreateUserInAccountModal** | `modals/CreateUserInAccountModal.tsx` | UsersListCard, UserDetailInspector | Settings mode                       | ✅ Wired     |
| **ConfirmationModal**        | `common/ConfirmationModal.tsx`        | Various (utility)                  | Multiple contexts                   | ✅ Wired     |
| **UploadModal**              | `canvas/UploadModal.tsx`              | CanvasLayout (Shift-key fallback)  | All modes (legacy trigger)          | ⚠️ LEGACY    |
| **StreamingUploadModal**     | `import/StreamingUploadModal.tsx`     | ❓ Not found                       | ❓ Unknown                          | ❓ ORPHANED? |
| **ChatImportModal.old.tsx**  | `canvas/ChatImportModal.old.tsx`      | None                               | N/A                                 | ❌ OBSOLETE  |

---

## 4. Modal System Documentation

### 4.1 Modal Triggering Matrix

| Modal                        | Trigger Component(s)               | Trigger Event                                    | Visibility Context    | Notes                    |
| ---------------------------- | ---------------------------------- | ------------------------------------------------ | --------------------- | ------------------------ |
| **LocalFirstImportModal**    | Canvas page                        | Import button + showLocalFirstImportModal state  | All modes             | ✅ NEW DEFAULT           |
| **ChatImportModal**          | CanvasLayout                       | Server import button + showChatImportModal state | All modes             | ✅ Active (server-based) |
| **UploadModal**              | CanvasLayout                       | Shift + click import button                      | All modes             | ⚠️ LEGACY fallback       |
| **FirstTimeUploadModal**     | Canvas page                        | isFirstTime flag (localStorage)                  | First-time users only | ✅ Onboarding            |
| **CreateUserInAccountModal** | UsersListCard, UserDetailInspector | "Create User" button                             | Settings mode         | ✅ Active                |
| **CreateAccountModal**       | Various                            | "Create Account" action                          | CRM contexts          | ✅ Active                |
| **ConfirmationModal**        | DataManagementCard, others         | Destructive actions                              | Multiple contexts     | ✅ Utility               |
| **StreamingUploadModal**     | ❓ Unknown                         | ❓ Unknown                                       | ❓ Unknown            | ❓ NO USAGE FOUND        |

### 4.2 Modal State Management

**Pattern Used**: Boolean state flags in parent components

```typescript
// Example from apps/web/src/app/canvas/page.tsx
const [showUploadModal, setShowUploadModal] = useState(false);
const [showChatImportModal, setShowChatImportModal] = useState(false);
const [showLocalFirstImportModal, setShowLocalFirstImportModal] = useState(false);

// Passed down to children
<CanvasLayout
  showChatImportModal={showChatImportModal}
  onShowChatImportModal={setShowChatImportModal}
  // ... other props
/>
```

**State Location Strategy**:

- Page-level modals: State in route page component
- Layout-level modals: State in CanvasLayout
- Component-level modals: Local state in triggering component

---

## 5. Navigation & Context Awareness

### 5.1 NavigationModelFactory Pattern

**File**: `apps/web/src/components/canvas/CanvasSidebar.tsx:66-84`

```typescript
const navigation = useMemo(() => {
  const factory = new NavigationModelFactory(shellMode, canvasMode);

  // LEFT SIDEBAR
  if (shellMode === 'crm' && side === 'left') {
    return factory.createAccountsNavigation(accountsTree); // CRM mode
  }
  if (canvasMode === 'canvas' && side === 'left') {
    return factory.createGroupsNavigation(groupsTree); // Graph mode
  }
  if (canvasMode === 'settings' && side === 'left') {
    return factory.createSettingsNavigation(settingsTree); // Settings mode
  }

  // RIGHT SIDEBAR (inspector panels)
  // ... similar logic for right-side panels
}, [shellMode, canvasMode, side, accountsTree, groupsTree, settingsTree]);
```

### 5.2 Navigation Behavior by Mode

| Mode          | Shell Mode | Left Sidebar        | Right Sidebar                          | Header Toolbar               | Footer               |
| ------------- | ---------- | ------------------- | -------------------------------------- | ---------------------------- | -------------------- |
| **Canvas**    | portal/crm | Groups Tree         | Node Inspector                         | CanvasToolbar (zoom, layout) | Console + Job status |
| **Dashboard** | crm        | Accounts Tree       | AccountInspector + UserDetailInspector | Standard nav                 | Console + Job status |
| **Settings**  | portal/crm | Settings Navigation | Settings detail view                   | Standard nav                 | Console + Job status |

### 5.3 Context Hooks Used

| Hook                | File                            | Purpose                   | Used By                        |
| ------------------- | ------------------------------- | ------------------------- | ------------------------------ |
| `useAccountTree()`  | `hooks/useAccountTree.ts`       | Fetch account hierarchy   | CanvasSidebar (CRM mode)       |
| `useGroupsTree()`   | `hooks/useGroupsTree.ts`        | Fetch groups hierarchy    | CanvasSidebar (canvas mode)    |
| `useSettingsTree()` | `hooks/useSettingsTree.ts`      | Build settings nav        | CanvasSidebar (settings mode)  |
| `useConsole()`      | `contexts/ConsoleContext.tsx`   | Error display & filtering | CanvasFooter                   |
| `useAuth()`         | `contexts/AuthContext.tsx`      | User session              | All authenticated routes       |
| `useOperating()`    | `contexts/OperatingContext.tsx` | Multi-account context     | CanvasLayout, AccountInspector |
| `useShell()`        | `contexts/ShellContext.tsx`     | Portal/CRM mode           | CanvasSidebar, CRMDashboard    |

---

## 6. Error Handling & Logging Audit

### 6.1 Infrastructure Quality: ✅ Excellent

**Core Services**:

1. **error-capture.service.ts** (`apps/web/src/services/error-capture.service.ts`)
   - Singleton error capture service
   - Circular buffer (max 1000 errors)
   - Window error & unhandled rejection listeners
   - Filtering, export (JSON/CSV), persistence (localStorage)
   - Sentry integration

2. **error-handler.ts** (`apps/web/src/lib/error-handler.ts`)
   - Typed error classes (AppError, ValidationError, NetworkError, etc.)
   - Enhanced API error handler with backend error structure parsing
   - Event logging functions (logApiEvent, logJobEvent, logDataEvent)
   - Retry wrapper, safe JSON parse, error boundary wrapper

3. **error-handler.middleware.ts** (Backend - `apps/api/src/middleware/error-handler.middleware.ts`)
   - APIError class with context
   - asyncHandler wrapper for Express routes
   - ErrorFactory for common HTTP errors
   - Structured error responses

### 6.2 Error Handling Coverage by Component

#### ✅ Excellent Error Handling

| Component               | File                                | Coverage      | Patterns Used                                                                                                                    |
| ----------------------- | ----------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **DataManagementCard**  | `settings/DataManagementCard.tsx`   | Comprehensive | errorCapture.capture() on all operations (lines 62-75, 175-193, 230-247), specific error pattern matching, UI error state        |
| **ImportsTableCard**    | `canvas/ImportsTableCard.tsx`       | Comprehensive | errorCapture.capture() throughout, abort controllers, timeout handling, Promise.allSettled for bulk ops (lines 304-401, 447-489) |
| **UserDetailInspector** | `inspector/UserDetailInspector.tsx` | Good          | Try-catch blocks, error state management, user-friendly messages                                                                 |
| **CRMDashboard**        | `canvas/CRMDashboard.tsx`           | Good          | Error state hooks, loading states, fallback UI                                                                                   |

#### ⚠️ Good but Has Issues

| Component           | File                         | Issues                        | Lines         | Fix Needed                         |
| ------------------- | ---------------------------- | ----------------------------- | ------------- | ---------------------------------- |
| **ChatImportModal** | `canvas/ChatImportModal.tsx` | Uses alert() instead of UI    | 183, 202, 239 | Replace with error state display   |
| **ChatImportModal** | `canvas/ChatImportModal.tsx` | console.error without capture | 156           | Add errorCapture.capture()         |
| **ChatImportModal** | `canvas/ChatImportModal.tsx` | Missing input validation      | 143-166       | Add file type/structure validation |
| **UsersListCard**   | `settings/UsersListCard.tsx` | Uses alert() for errors       | 91            | Replace with error state display   |
| **UsersListCard**   | `settings/UsersListCard.tsx` | console.log without capture   | 46, 112       | Use errorCapture.info() instead    |

#### ❌ Needs Implementation

| Component                   | File                       | Issue                                   | Recommendation                                       |
| --------------------------- | -------------------------- | --------------------------------------- | ---------------------------------------------------- |
| **CanvasToolbar**           | `canvas/CanvasToolbar.tsx` | No error handling for layout operations | Add try-catch around algorithm execution             |
| **Various Form Components** | Multiple                   | Basic validation only                   | Add errorCapture integration for submission failures |

### 6.3 Error Capture Integration Points

**Where errorCapture is properly deployed**:

1. API client (handleApiError) - `apps/web/src/lib/error-handler.ts:52-134`
2. Data management operations - `apps/web/src/components/settings/DataManagementCard.tsx`
3. Import operations - `apps/web/src/components/canvas/ImportsTableCard.tsx`
4. Job streaming - `apps/web/src/hooks/useJobStream.ts`
5. Background operations - `apps/web/src/contexts/BackgroundOperationsContext.tsx`

**Event Logging Functions Available**:

```typescript
// apps/web/src/lib/error-handler.ts:293-348
logApiEvent(message, { domain, operation, metadata });
logDataEvent(message, operation, metadata);
logJobEvent(message, operation, metadata);
```

**Example Usage** (ChatImportModal.tsx:78-85):

```typescript
logJobEvent('Server import job created', 'import.server.jobCreated', {
  jobId: response.job.id,
  fileType: selectedFile.type,
  fileSize: selectedFile.size,
});
```

---

## 7. Console Component Integration

### 7.1 Console Context Architecture

**File**: `apps/web/src/contexts/ConsoleContext.tsx`

**Provider Hierarchy**:

```
CanvasPage
└─ ConsoleProvider ← Wraps entire canvas application
   ├─ Subscribes to errorCapture service
   ├─ Provides error filtering capabilities
   ├─ Manages console UI state (open/closed, active tab)
   └─ Consumed by CanvasFooter
```

**Data Flow**:

```
1. Error occurs in any component
2. Component calls errorCapture.capture(error, context)
3. errorCapture notifies all subscribers
4. ConsoleContext receives notification
5. ConsoleContext updates errors state (applies filters)
6. CanvasFooter re-renders with new error
7. User sees error in console component
```

### 7.2 Information Accessible in Console

**Via useConsole() hook**:

```typescript
interface ConsoleContextValue {
  // Error data
  errors: CapturedError[]; // Filtered list of errors
  errorCounts: Record<ErrorSeverity, number>; // { error: X, warn: Y, info: Z, debug: W }

  // Filtering
  activeFilters: ErrorFilters; // Current filter state
  setFilters: (filters: ErrorFilters) => void;
  clearFilters: () => void;

  // Actions
  clearErrors: () => void;
  clearErrorsByDomain: (domain: ErrorDomain) => void;
  exportErrors: (format: 'json' | 'csv') => string;

  // UI State
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeTab: 'console' | 'logs' | 'tasks' | 'shortcuts';
  setActiveTab: (tab) => void;
}
```

**Error Object Structure** (CapturedError interface):

```typescript
interface CapturedError {
  id: string; // Unique identifier
  timestamp: number; // Unix timestamp
  domain: ErrorDomain; // 'api' | 'import' | 'analytics' | 'ui' | 'database' | 'system' | 'jobs'
  operation: string; // e.g., 'import.server.uploadFile', 'analytics.fetchOverview'
  message: string; // Technical error message
  stack?: string; // Stack trace
  severity: ErrorSeverity; // 'error' | 'warn' | 'info' | 'debug'
  context: ErrorContext; // Full context (userId, accountId, metadata)
  error: Error; // Original error object
  userMessage?: string; // User-friendly message
}
```

**Available Filters** (ErrorFilters interface):

```typescript
interface ErrorFilters {
  domain?: ErrorDomain | ErrorDomain[]; // Filter by one or multiple domains
  severity?: ErrorSeverity | ErrorSeverity[]; // Filter by severity level(s)
  search?: string; // Text search in message/operation
  startTime?: number; // Time range start
  endTime?: number; // Time range end
}
```

### 7.3 Convenience Hooks for Debugging

**useConsoleErrors(filters)** - Get filtered errors:

```typescript
const { errors, count, errorCount, warnCount, infoCount } = useConsoleErrors({
  domain: 'import',
  severity: 'error',
});
```

**useDomainErrors(domain)** - Get all errors for specific domain:

```typescript
const { errors } = useDomainErrors('jobs');
```

**Example Use Case for AI Agent Debugging**:

```typescript
// Check recent import errors for automated diagnosis
const { errors: importErrors } = useDomainErrors('import');
const recentFailures = importErrors.filter((e) => e.severity === 'error').slice(0, 5);

// Analyze error patterns
const commonIssues = recentFailures.reduce((acc, err) => {
  const issue = err.metadata?.issue || 'unknown';
  acc[issue] = (acc[issue] || 0) + 1;
  return acc;
}, {});
```

### 7.4 Keyboard Shortcuts

**Backtick (`) key** - Toggle console open/closed (apps/web/src/contexts/ConsoleContext.tsx:80-97)

- Does not trigger when focus is in input/textarea
- Global keyboard listener for quick access

---

## 8. Deprecated & Orphaned Components

### 8.1 Confirmed Obsolete

| Component                   | File                                        | Status      | Action Required                            |
| --------------------------- | ------------------------------------------- | ----------- | ------------------------------------------ |
| **ChatImportModal.old.tsx** | `components/canvas/ChatImportModal.old.tsx` | ❌ Obsolete | **DELETE** - Clearly marked as old version |

**Reason**: File has `.old.tsx` suffix, no imports found in codebase.

### 8.2 Legacy/Deprecated (Still Accessible)

| Component       | File                                | Status    | Replacement           | Migration Path                                                 |
| --------------- | ----------------------------------- | --------- | --------------------- | -------------------------------------------------------------- |
| **UploadModal** | `components/canvas/UploadModal.tsx` | ⚠️ LEGACY | LocalFirstImportModal | Keep for now (Shift-key fallback), deprecate in future release |

**Reason**: Still accessible via Shift+click in CanvasLayout (line ~450), but LocalFirstImportModal is the new default.

**Usage Found**:

- `apps/web/src/app/canvas/page.tsx:31` - State management
- `apps/web/src/components/canvas/CanvasLayout.tsx:~450` - Conditional rendering

**Recommendation**:

1. Add deprecation notice to component
2. Log warning when accessed: `console.warn('UploadModal is deprecated, use LocalFirstImportModal')`
3. Remove in next major version (v2.0.0)

### 8.3 Potentially Orphaned (Needs Verification)

| Component                | File                                         | Status       | Investigation Needed                                  |
| ------------------------ | -------------------------------------------- | ------------ | ----------------------------------------------------- |
| **StreamingUploadModal** | `components/import/StreamingUploadModal.tsx` | ❓ ORPHANED? | Verify if any dynamic imports or runtime usage exists |

**Search Results**: No imports found in:

- Component files
- Page files
- Context files

**Possible Scenarios**:

1. Truly orphaned - can be deleted
2. Dynamically imported at runtime (check for React.lazy or dynamic import())
3. Used in external/plugin system (unlikely)

**Action Required**: Manual verification needed before deletion.

---

## 9. Recommended Actions

### 9.1 Immediate Actions (High Priority)

1. **Delete Obsolete File**

   ```bash
   # DELETE: apps/web/src/components/canvas/ChatImportModal.old.tsx
   ```

2. **Replace alert() Calls with UI Error State**
   - **ChatImportModal.tsx** (lines 183, 202, 239)
   - **UsersListCard.tsx** (line 91)

   ```typescript
   // Current (bad):
   alert(`Error: ${message}`);

   // Replace with:
   setError(message);
   // Or use errorCapture.capture() for console visibility
   ```

3. **Add Missing errorCapture Integration**
   - **ChatImportModal.tsx:156** - Replace console.error with errorCapture.capture()
   - **UsersListCard.tsx:46, 112** - Replace console.log with errorCapture.info()

### 9.2 Short-Term Actions (Medium Priority)

4. **Verify and Handle StreamingUploadModal**
   - Check for dynamic imports: `grep -r "StreamingUploadModal" apps/web/src/`
   - Check for lazy loading: `grep -r "React.lazy.*StreamingUploadModal" apps/web/src/`
   - If confirmed orphaned: **DELETE** file

5. **Add Deprecation Warning to UploadModal**

   ```typescript
   // Add to component body:
   useEffect(() => {
     console.warn(
       'UploadModal is deprecated and will be removed in v2.0.0. Use LocalFirstImportModal instead.'
     );
   }, []);
   ```

6. **Add Input Validation to ChatImportModal**
   - File type validation (lines 143-166)
   - File structure validation before server upload
   - Better error messages for invalid files

### 9.3 Long-Term Actions (Low Priority)

7. **Standardize Error State UI Pattern**
   - Create reusable error display component
   - Replace all alert() and basic error text with standard component
   - Document pattern in component library

8. **Enhanced Console Integration for AI Agents**
   - Add operation timing metadata to errors
   - Add breadcrumb trail for multi-step operations
   - Export console logs in structured format for analysis

9. **Component Documentation**
   - Add JSDoc comments to all public components
   - Document prop types and usage examples
   - Create Storybook stories for isolated testing

10. **Remove UploadModal (v2.0.0)**
    - After sufficient migration period (6+ months)
    - Ensure all users are aware of LocalFirstImportModal
    - Remove Shift-key fallback logic

---

## 10. Testing & Verification Checklist

### 10.1 Manual Testing Routes

- [ ] Navigate to each route and verify component rendering
- [ ] Test all 3 canvas modes (canvas, dashboard, settings)
- [ ] Trigger each modal and verify functionality
- [ ] Test keyboard shortcuts (backtick for console)
- [ ] Test error capture in console component
- [ ] Verify navigation context changes (canvas → dashboard → settings)
- [ ] Test inspector panel switching
- [ ] Verify modal state management (open/close)

### 10.2 Error Handling Testing

- [ ] Trigger network errors (disable network, check errorCapture)
- [ ] Test invalid file uploads (check error messages)
- [ ] Test API errors (400, 401, 403, 404, 500)
- [ ] Verify error persistence (refresh page, check localStorage)
- [ ] Test error filtering in console
- [ ] Test error export (JSON/CSV)

### 10.3 Automated Testing Gaps

- [ ] Add E2E tests for modal workflows (Playwright/Cypress)
- [ ] Add integration tests for error capture service
- [ ] Add unit tests for NavigationModelFactory
- [ ] Add snapshot tests for component tree stability

---

## 11. Metrics & Statistics

### Component Counts

- **Total Components**: ~60+ (including subcomponents)
- **Route Pages**: 11
- **Modals**: 8 documented
- **Context Providers**: 8
- **Custom Hooks**: 10+

### Error Handling Coverage

- **Full Coverage**: ~80% (DataManagementCard, ImportsTableCard, etc.)
- **Partial Coverage**: ~15% (ChatImportModal, UsersListCard)
- **No Coverage**: ~5% (minor utility components)

### Code Health

- **Obsolete Files**: 1 (ChatImportModal.old.tsx)
- **Deprecated Components**: 1 (UploadModal)
- **Potentially Orphaned**: 1 (StreamingUploadModal)
- **Alert() Usage**: 4 instances (needs replacement)
- **Missing Error Capture**: 3 instances

---

## 12. Appendix

### A. Key File Paths Reference

**Routes**:

- Root layout: `apps/web/src/app/layout.tsx`
- Canvas page (main): `apps/web/src/app/canvas/page.tsx`
- Board view: `apps/web/src/app/board/[id]/page.tsx`

**Core Components**:

- CanvasLayout: `apps/web/src/components/canvas/CanvasLayout.tsx`
- CanvasSidebar: `apps/web/src/components/canvas/CanvasSidebar.tsx`
- CRMDashboard: `apps/web/src/components/canvas/CRMDashboard.tsx`
- SettingsPage: `apps/web/src/components/settings/SettingsPage.tsx`

**Error Handling**:

- Frontend handler: `apps/web/src/lib/error-handler.ts`
- Error capture service: `apps/web/src/services/error-capture.service.ts`
- Backend middleware: `apps/api/src/middleware/error-handler.middleware.ts`
- Console context: `apps/web/src/contexts/ConsoleContext.tsx`

**Deprecated/Orphaned**:

- Obsolete: `apps/web/src/components/canvas/ChatImportModal.old.tsx`
- Legacy: `apps/web/src/components/canvas/UploadModal.tsx`
- Orphaned?: `apps/web/src/components/import/StreamingUploadModal.tsx`

### B. Error Domain Mappings

| Domain      | Use Cases                    | Example Operations                                     |
| ----------- | ---------------------------- | ------------------------------------------------------ |
| `api`       | HTTP requests, REST calls    | `api.accounts.fetch`, `api.nodes.create`               |
| `import`    | File uploads, data ingestion | `import.server.uploadFile`, `import.browser.parseJSON` |
| `analytics` | Analytics queries            | `analytics.fetchOverview`, `analytics.computeMetrics`  |
| `ui`        | UI-specific errors           | `ui.component.render`, `ui.form.validation`            |
| `database`  | Database operations          | `database.query`, `database.migration`                 |
| `system`    | System-level errors          | `system.unhandledRejection`, `system.window.error`     |
| `jobs`      | Background job tracking      | `jobs.create`, `jobs.progress`, `jobs.complete`        |

### C. Console Keyboard Shortcuts

| Key     | Action         | Context                        |
| ------- | -------------- | ------------------------------ |
| `` ` `` | Toggle console | Global (not in input/textarea) |

---

**Document Version**: 1.0
**Last Updated**: 2025-10-22
**Maintainer**: AI Agent (Claude Code)
**Next Review**: After implementing recommended actions
