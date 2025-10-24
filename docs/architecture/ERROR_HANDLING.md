# Error Handling Architecture

**Last Updated**: 2025-10-17
**Status**: ✅ Production Ready

## Overview

The Canvas Memory OS uses a **centralized, reactive error handling system** that captures, categorizes, and displays errors across the entire application. All errors are automatically routed to the Console Footer for real-time debugging.

## Architecture Components

### 1. ErrorCaptureService (Core)

**Location**: [error-capture.service.ts](../../apps/web/src/services/error-capture.service.ts)

**Purpose**: Singleton service that captures all errors, categorizes them by domain/severity, and notifies subscribers.

**Key Features**:

- **Global Error Listeners**: Automatically captures uncaught errors and promise rejections
- **Domain-Based Categorization**: api, import, analytics, ui, database, system
- **Severity Levels**: error, warn, info, debug
- **Circular Buffer**: Max 1000 errors to prevent memory growth
- **LocalStorage Persistence**: Critical errors persist across sessions
- **Export Functionality**: Export errors as JSON or CSV for debugging
- **Subscriber Pattern**: Components can subscribe for real-time updates

**Usage**:

```typescript
import { errorCapture } from '@/services/error-capture.service';

// Capture an error
try {
  await riskyOperation();
} catch (err: any) {
  const capturedError = errorCapture.capture(
    err,
    {
      domain: 'import',
      operation: 'processing.uploadFile',
      metadata: {
        fileName: file.name,
        fileSize: file.size,
      },
    },
    'error' // severity
  );

  // Use the user-friendly message
  showToast(capturedError.userMessage);
}
```

---

### 2. ConsoleContext (Reactive State)

**Location**: [ConsoleContext.tsx](../../apps/web/src/contexts/ConsoleContext.tsx)

**Purpose**: React context that provides reactive state management for the Console Footer.

**Key Features**:

- **Real-time Error Updates**: Subscribes to ErrorCaptureService
- **Filter Management**: Domain, severity, search, time range
- **Keyboard Shortcuts**: Backtick (`) to toggle console
- **Export/Clear Actions**: User-friendly error management

**Hooks**:

```typescript
// Get all console state and actions
const { errors, errorCounts, setFilters, clearErrors, isOpen, setIsOpen } = useConsole();

// Get filtered errors
const apiErrors = useConsoleErrors({ domain: 'api' });

// Get errors for specific domain
const importErrors = useDomainErrors('import');
```

---

### 3. CanvasFooter (UI)

**Location**: [CanvasFooter.tsx](../../apps/web/src/components/canvas/CanvasFooter.tsx)

**Purpose**: Visual console UI with intelligent tabs and real-time error display.

**Tabs**:

1. **Console**: Error-focused view with stack traces
2. **Logs**: Structured log viewer (compact rows)
3. **Tasks**: Import/processing status (planned)
4. **Shortcuts**: Keyboard reference

**Features**:

- **Dynamic Filtering**: Domain dropdown, severity dropdown, search input
- **Export**: JSON and CSV download
- **Clear**: Bulk error removal
- **Color-Coded Errors**: Red (error), Yellow (warn), Blue (info), Gray (debug)
- **Expandable Stack Traces**: Click to view full error details

---

### 4. Error Handler Middleware (API)

**Location**: [error-handler.middleware.ts](../../apps/api/src/middleware/error-handler.middleware.ts)

**Purpose**: Centralized error handling for Express routes.

**Key Features**:

- **asyncHandler**: Wrapper for async routes (auto-catches promise rejections)
- **errorLogger**: Middleware that logs errors and sends user-friendly responses
- **APIError**: Custom error class with context and user messages
- **ErrorFactory**: Helper functions for common HTTP errors

**Usage**:

```typescript
import { asyncHandler, ErrorFactory } from '@/middleware/error-handler.middleware';

// Wrap async routes
router.get(
  '/endpoint',
  asyncHandler(async (req, res) => {
    const data = await fetchData();
    if (!data) {
      throw ErrorFactory.notFound('Data', 'endpoint.fetchData');
    }
    res.json({ data });
  })
);

// Add error logger at end of app
app.use(errorLogger);
```

---

### 5. Frontend Error Interceptor

**Location**: [error-handler.ts](../../apps/web/src/lib/error-handler.ts)

**Purpose**: Centralized error handling for API calls (integrated with errorCapture).

**Key Features**:

- **Automatic Error Capture**: All API errors automatically sent to console
- **User-Friendly Messages**: AppError classes provide readable error messages
- **Retry Logic**: withRetry wrapper for transient failures
- **Type-Safe Errors**: ValidationError, NetworkError, FileError, AuthError

**Error Classes**:

```typescript
// Validation error (400)
throw new ValidationError('Invalid email format', { field: 'email' });

// Auth error (401/403)
throw new AuthError('Session expired');

// Network error (503, connection issues)
throw new NetworkError('Unable to connect to server');

// File error (invalid format, too large)
throw new FileError('Invalid JSON format in file');

// Generic app error
throw new AppError('Something went wrong', 'CUSTOM_CODE', 500);
```

---

### 6. React Error Boundary

**Location**: [ErrorBoundary.tsx](../../apps/web/src/components/common/ErrorBoundary.tsx)

**Purpose**: Catches React component errors and displays fallback UI.

**Key Features**:

- **Auto-Capture**: Errors automatically sent to console
- **Custom Fallback**: Optionally provide custom error UI
- **Dev Mode Details**: Stack trace visible in development
- **Reset Functionality**: Try Again / Reload Page buttons

**Usage**:

```typescript
// Wrap components
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// Custom fallback UI
<ErrorBoundary fallback={<CustomErrorUI />}>
  <MyComponent />
</ErrorBoundary>

// HOC pattern
export default withErrorBoundary(MyComponent);
```

---

## Error Flow Diagram

```
┌─────────────────────┐
│  Error Occurs       │
│  (anywhere in app)  │
└──────────┬──────────┘
           │
           ├─────────────────────────────────────┐
           │                                     │
           ▼                                     ▼
┌──────────────────────┐              ┌──────────────────────┐
│  Frontend Errors     │              │  Backend Errors      │
│  • API calls         │              │  • Route handlers    │
│  • React components  │              │  • Database ops      │
│  • Import processing │              │  • File processing   │
└──────────┬───────────┘              └──────────┬───────────┘
           │                                     │
           │  errorCapture.capture()             │  errorLogger()
           │  (domain, operation, severity)      │  (logs to console)
           ▼                                     │
┌──────────────────────────────────────────────┐│
│  ErrorCaptureService                          ││
│  • Categorize by domain/severity              ││
│  • Store in circular buffer (max 1000)        ││
│  • Persist critical errors to localStorage    ││
│  • Notify all subscribers                     ││
└──────────┬────────────────────────────────────┘│
           │                                     │
           │  subscribe(callback)                │
           ▼                                     │
┌──────────────────────────────────────────────┐│
│  ConsoleContext                               ││
│  • Reactive state management                  ││
│  • Filter errors by domain/severity/search    ││
│  • Keyboard shortcut (backtick)               ││
│  • Export/clear actions                       ││
└──────────┬────────────────────────────────────┘│
           │                                     │
           │  useConsole()                       │
           ▼                                     │
┌──────────────────────────────────────────────┐│
│  CanvasFooter UI                              ││
│  • Console tab (error-focused, stack traces)  ││
│  • Logs tab (structured view)                 ││
│  • Tasks tab (import/processing status)       ││
│  • Shortcuts tab (keyboard reference)         ││
│  • Dynamic filters (domain, severity, search) ││
└───────────────────────────────────────────────┘│
                                                 │
           ┌─────────────────────────────────────┘
           │  (Backend sends HTTP error response)
           ▼
┌──────────────────────────────────────────────┐
│  Frontend Receives Error                      │
│  • handleApiError() catches response          │
│  • Captures to errorCapture                   │
│  • Throws AppError for UI to handle           │
└───────────────────────────────────────────────┘
```

---

## Domain Categories

| Domain        | Description                | Examples                                                  |
| ------------- | -------------------------- | --------------------------------------------------------- |
| **api**       | API/network errors         | 403 Forbidden, 500 Internal Server Error, network timeout |
| **import**    | Import pipeline errors     | File parsing, duplicate detection, graph indexing         |
| **analytics** | Analytics dashboard errors | Failed to fetch metrics, invalid data format              |
| **ui**        | UI/React component errors  | Component render failure, state management issues         |
| **database**  | Database operation errors  | Query timeout, connection failure, constraint violation   |
| **system**    | System-level errors        | Unhandled exceptions, memory issues, browser errors       |

---

## Severity Levels

| Severity  | Color     | Description                                   | When to Use                                            |
| --------- | --------- | --------------------------------------------- | ------------------------------------------------------ |
| **error** | 🔴 Red    | Critical errors requiring immediate attention | API failures, import errors, auth errors               |
| **warn**  | 🟡 Yellow | Non-critical issues that should be reviewed   | 404 Not Found, validation errors, deprecated API usage |
| **info**  | 🔵 Blue   | Informational messages for debugging          | File analysis complete, import started                 |
| **debug** | ⚪ Gray   | Detailed debugging information                | Variable values, execution flow, performance metrics   |

---

## Best Practices

### 1. Always Capture Context

```typescript
// ❌ Bad - No context
errorCapture.capture(err, { domain: 'import', operation: 'unknown' });

// ✅ Good - Rich context
errorCapture.capture(err, {
  domain: 'import',
  operation: 'processing.uploadFile',
  userId: user.id,
  accountId: user.accountId,
  metadata: {
    fileName: file.name,
    fileSize: file.size,
    uploadId: uploadId,
  },
});
```

### 2. Use Appropriate Severity

```typescript
// ❌ Bad - Everything is an error
errorCapture.capture(new Error('File not found'), { ... }, 'error');

// ✅ Good - Use warn for non-critical issues
errorCapture.capture(new Error('File not found'), { ... }, 'warn');
```

### 3. Provide User-Friendly Messages

```typescript
// ❌ Bad - Technical jargon
throw new APIError('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed');

// ✅ Good - User-friendly message
throw new APIError(
  'SQLITE_CONSTRAINT: FOREIGN KEY constraint failed',
  500,
  { domain: 'database', operation: 'createNode' },
  'Unable to save data. Please ensure all required fields are filled.'
);
```

### 4. Use Error Factories

```typescript
// ❌ Bad - Manual error creation
throw new APIError('Not found', 404, { domain: 'api', operation: 'getUser' }, 'User not found');

// ✅ Good - Use factory
throw ErrorFactory.notFound('User', 'users.getUser');
```

### 5. Wrap All Async Routes

```typescript
// ❌ Bad - No error handling
router.get('/endpoint', async (req, res) => {
  const data = await fetchData(); // Unhandled promise rejection!
  res.json({ data });
});

// ✅ Good - Use asyncHandler
router.get(
  '/endpoint',
  asyncHandler(async (req, res) => {
    const data = await fetchData();
    res.json({ data });
  })
);
```

---

## Testing Error Handling

### Manual Testing

1. **Trigger a 403 error** (access forbidden):

   ```typescript
   // In browser console
   fetch('http://localhost:4001/api/v1/analytics/overview', {
     headers: { Authorization: 'Bearer invalid_token' },
   });
   ```

2. **Trigger a network error**:

   ```typescript
   // Stop API server, then try to load dashboard
   ```

3. **Trigger a validation error**:

   ```typescript
   // Upload an invalid file format
   ```

4. **Open Console Footer**:
   - Press ` (backtick) to toggle console
   - Check Console tab for errors with stack traces
   - Check Logs tab for structured error log
   - Use filters to narrow down by domain/severity

### Automated Testing

```typescript
describe('Error Handling', () => {
  it('should capture API errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error');

    try {
      await apiClient.get('/invalid-endpoint');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(consoleSpy).toHaveBeenCalled();
    }
  });

  it('should display errors in console footer', () => {
    const { getByText } = render(<CanvasFooter isOpen={true} />);

    errorCapture.capture(
      new Error('Test error'),
      { domain: 'ui', operation: 'test' },
      'error'
    );

    expect(getByText('Test error')).toBeInTheDocument();
  });
});
```

---

## Migration Guide

### Existing Code → New Error System

**Before**:

```typescript
try {
  await fetchData();
} catch (err: any) {
  console.error('Failed to fetch data:', err);
  setError(err.message);
}
```

**After**:

```typescript
try {
  await fetchData();
} catch (err: any) {
  const capturedError = errorCapture.capture(
    err,
    {
      domain: 'api',
      operation: 'component.fetchData',
      metadata: { componentName: 'MyComponent' },
    },
    'error'
  );
  setError(capturedError.userMessage);
}
```

---

## Troubleshooting

### Error not appearing in console?

1. **Check if ConsoleProvider is mounted**:
   - [canvas/page.tsx](../../apps/web/src/app/canvas/page.tsx) should wrap app with `<ConsoleProvider>`

2. **Check if error is being captured**:

   ```typescript
   // Add debug log
   errorCapture.capture(err, { ... });
   console.log('Captured errors:', errorCapture.getRecent(10));
   ```

3. **Check console filters**:
   - Open Console Footer (press backtick)
   - Check "All Domains" and "All Severities" filters

### Console Footer not opening?

1. **Check keyboard shortcut**:
   - Press ` (backtick) to toggle

2. **Check ConsoleContext**:
   ```typescript
   const { isOpen, setIsOpen } = useConsole();
   console.log('Console open?', isOpen);
   ```

### Too many errors clogging the console?

1. **Clear errors**:
   - Click "Clear all" button in Console Footer

2. **Use filters**:
   - Filter by domain (e.g., only show "import" errors)
   - Filter by severity (e.g., only show "error" level)
   - Use search to find specific error messages

3. **Export for later analysis**:
   - Click "Export as JSON" to save errors for later debugging

---

## Future Enhancements

### Planned Features

1. **Error Aggregation**: Group similar errors together
2. **Error Trends**: Chart error frequency over time
3. **Error Notifications**: Toast/banner for critical errors
4. **Error Reporting**: Send errors to external service (Sentry, LogRocket)
5. **Error Search**: Full-text search across error messages and stack traces
6. **Error Replay**: Capture user actions leading up to error for debugging
7. **Error Analytics**: Dashboard showing error metrics (most common errors, etc.)

---

## Related Documentation

- [API Error Handling](../api/ERROR_HANDLING.md) - Backend error handling patterns
- [Console Debugging Guide](../guides/CONSOLE_DEBUGGING.md) - How to use Console Footer
- [Import Pipeline](../features/IMPORT_PIPELINE.md) - Import error handling specifics
- [Analytics Dashboard](../features/ANALYTICS_DASHBOARD.md) - Analytics error handling

---

**Status**: ✅ **All 4 phases complete. Error handling system is production-ready.**
