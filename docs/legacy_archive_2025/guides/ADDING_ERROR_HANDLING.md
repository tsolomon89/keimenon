# Adding Error Handling to Your Code

**Quick Guide** | Last Updated: 2025-10-17

This guide shows you how to add error handling to new and existing code using the Canvas Memory OS error handling system.

---

## Quick Start

### 1. Frontend Component Error Handling

```typescript
import { errorCapture } from '@/services/error-capture.service';

function MyComponent() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const result = await apiClient.get('/api/v1/data');
      setData(result.data);
    } catch (err: any) {
      // Capture error (automatically shows in Console Footer)
      const captured = errorCapture.capture(
        err,
        {
          domain: 'api', // or 'import', 'analytics', 'ui', 'database', 'system'
          operation: 'MyComponent.fetchData',
          metadata: {
            componentName: 'MyComponent',
            timestamp: Date.now(),
          },
        },
        'error' // or 'warn', 'info', 'debug'
      );

      // Show user-friendly message in UI
      setError(captured.userMessage);
    }
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {/* ... */}
    </div>
  );
}
```

---

### 2. Backend Route Error Handling

```typescript
import { asyncHandler, ErrorFactory } from '@/middleware/error-handler.middleware';

// Wrap all async routes with asyncHandler
router.get(
  '/endpoint',
  asyncHandler(async (req, res) => {
    // No try/catch needed - asyncHandler catches errors automatically

    const data = await fetchData();

    if (!data) {
      // Throw user-friendly errors
      throw ErrorFactory.notFound('Data', 'endpoint.fetchData');
    }

    res.json({ success: true, data });
  })
);

// Add error logger at end of Express app
app.use(errorLogger);
```

**Error Factory Methods**:

- `ErrorFactory.badRequest(message, operation, metadata?)` - 400
- `ErrorFactory.unauthorized(operation)` - 401
- `ErrorFactory.forbidden(operation, reason?)` - 403
- `ErrorFactory.notFound(resource, operation)` - 404
- `ErrorFactory.conflict(message, operation, metadata?)` - 409
- `ErrorFactory.internal(message, operation, metadata?)` - 500
- `ErrorFactory.database(message, operation, metadata?)` - 500

---

### 3. React Error Boundary

```typescript
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// Wrap components that might throw errors
function App() {
  return (
    <ErrorBoundary>
      <MyComponent />
    </ErrorBoundary>
  );
}

// Or use HOC pattern
export default withErrorBoundary(MyComponent);
```

---

## Common Patterns

### API Call with Retry

```typescript
import { withRetry } from '@/lib/error-handler';

const data = await withRetry(
  async () => {
    return await apiClient.get('/api/v1/data');
  },
  {
    maxAttempts: 3,
    delay: 1000,
    backoff: true,
    onRetry: (attempt, error) => {
      console.log(`Retry ${attempt}:`, error);
    },
  }
);
```

---

### File Upload Error Handling

```typescript
try {
  const formData = new FormData();
  formData.append('file', file);

  await apiClient.post('/api/v1/upload', formData);
} catch (err: any) {
  errorCapture.capture(
    err,
    {
      domain: 'import',
      operation: 'upload.file',
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
    },
    'error'
  );

  // Show user-friendly message
  if (err.statusCode === 413) {
    alert('File is too large. Maximum size is 10MB.');
  } else {
    alert(err.message || 'Failed to upload file');
  }
}
```

---

### Database Error Handling

```typescript
import { ErrorFactory } from '@/middleware/error-handler.middleware';

router.post(
  '/nodes',
  asyncHandler(async (req, res) => {
    try {
      const node = await db.createNode(req.body);
      res.json({ success: true, node });
    } catch (err: any) {
      // SQLite constraint errors
      if (err.code === 'SQLITE_CONSTRAINT') {
        throw ErrorFactory.conflict('Node already exists', 'nodes.create', { nodeId: req.body.id });
      }

      // Generic database error
      throw ErrorFactory.database(err.message, 'nodes.create', { nodeData: req.body });
    }
  })
);
```

---

### Stream Error Handling (SSE)

```typescript
// Backend
const sse = new ServerSentEvents(res);

try {
  for await (const chunk of processData()) {
    sse.send({ type: 'progress', data: chunk });
  }
  sse.send({ type: 'complete' });
  sse.close();
} catch (err: any) {
  sse.send({
    type: 'error',
    error: err.message || 'Processing failed',
  });
  sse.close();
}

// Frontend
const { progress, error } = useImportProgressStream(uploadId, {
  onError: (errorMessage) => {
    errorCapture.capture(
      new Error(errorMessage),
      {
        domain: 'import',
        operation: 'stream.processing',
        metadata: { uploadId },
      },
      'error'
    );
  },
});
```

---

## Checklist for Adding Error Handling

### Frontend Checklist

- [ ] Wrap async operations in try/catch
- [ ] Call `errorCapture.capture()` in catch block
- [ ] Provide appropriate domain ('api', 'import', 'analytics', 'ui', etc.)
- [ ] Include detailed operation name (e.g., 'MyComponent.fetchData')
- [ ] Add metadata (file names, IDs, etc.) for debugging
- [ ] Use appropriate severity ('error', 'warn', 'info', 'debug')
- [ ] Show user-friendly message in UI (`captured.userMessage`)
- [ ] Consider wrapping component with ErrorBoundary

### Backend Checklist

- [ ] Wrap async routes with `asyncHandler()`
- [ ] Use `ErrorFactory` for common HTTP errors
- [ ] Include operation name (e.g., 'users.create')
- [ ] Add metadata for debugging (IDs, user context, etc.)
- [ ] Provide user-friendly error messages
- [ ] Use appropriate status codes (400, 401, 403, 404, 500, etc.)
- [ ] Ensure `errorLogger` is added at end of Express app

---

## Testing Your Error Handling

### 1. Test Error Capture

```typescript
// Trigger an error manually
errorCapture.capture(
  new Error('Test error'),
  {
    domain: 'ui',
    operation: 'test.manualTrigger',
    metadata: { testId: 'test-123' },
  },
  'error'
);

// Check Console Footer (press backtick)
// - Should see "Test error" in Console tab
// - Check domain filter shows "UI"
// - Check severity shows "error"
```

### 2. Test Error UI

1. Open Console Footer (press `)
2. Trigger an error (invalid API call, file upload, etc.)
3. Verify error appears in Console tab
4. Check error details (timestamp, domain, operation, stack trace)
5. Test filters (domain dropdown, severity dropdown, search)
6. Test export (JSON and CSV)
7. Test clear (removes all errors)

### 3. Test Error Boundary

```typescript
// Create a component that throws
function BrokenComponent() {
  throw new Error('Intentional error for testing');
}

// Wrap with ErrorBoundary
<ErrorBoundary>
  <BrokenComponent />
</ErrorBoundary>

// Should show fallback UI with "Something went wrong"
// Check Console Footer - error should be captured
```

---

## Debugging Tips

### View Recent Errors in Console

```typescript
// In browser console
import { errorCapture } from '@/services/error-capture.service';

// Get last 10 errors
console.log(errorCapture.getRecent(10));

// Get errors for specific domain
console.log(errorCapture.getRecent(50, { domain: 'import' }));

// Get errors by severity
console.log(errorCapture.getRecent(50, { severity: 'error' }));
```

### Clear Errors Programmatically

```typescript
errorCapture.clearErrors();
```

### Export Errors for Analysis

```typescript
// Export as JSON
const json = errorCapture.exportJSON({ domain: 'import' });
console.log(json);

// Export as CSV
const csv = errorCapture.exportCSV({ severity: 'error' });
console.log(csv);
```

---

## Examples by Use Case

### Analytics Dashboard

```typescript
useEffect(() => {
  const fetchAnalytics = async () => {
    try {
      const data = await getAnalyticsOverview();
      setOverview(data);
    } catch (err: any) {
      errorCapture.capture(
        err,
        {
          domain: 'analytics',
          operation: 'dashboard.fetchOverview',
          metadata: { component: 'CRMDashboard' },
        },
        'error'
      );

      setError('Failed to load analytics data');
    }
  };

  fetchAnalytics();
}, []);
```

### Import Pipeline

```typescript
// File analysis
try {
  const metadata = await detectFileMetadata(file);
  setFiles(filesWithMetadata);
} catch (err: any) {
  errorCapture.capture(
    err,
    {
      domain: 'import',
      operation: 'fileAnalysis.detectMetadata',
      metadata: {
        fileName: file.name,
        fileSize: file.size,
      },
    },
    'warn'
  ); // Non-fatal - proceed anyway
}

// File upload
try {
  await apiClient.post('/api/v1/import/enhanced', formData);
} catch (err: any) {
  errorCapture.capture(
    err,
    {
      domain: 'import',
      operation: 'upload.startUpload',
      metadata: {
        fileCount: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
      },
    },
    'error'
  );

  setUploadError(err.message);
}
```

### User Authentication

```typescript
try {
  const response = await apiClient.post('/api/v1/auth/login', {
    email,
    password,
  });

  setToken(response.data.token);
} catch (err: any) {
  errorCapture.capture(
    err,
    {
      domain: 'api',
      operation: 'auth.login',
      metadata: { email },
    },
    'warn'
  ); // Warn, not error - failed login is expected

  if (err.statusCode === 401) {
    setError('Invalid email or password');
  } else {
    setError('Login failed. Please try again.');
  }
}
```

---

## Related Documentation

- [Error Handling Architecture](../architecture/ERROR_HANDLING.md) - System overview
- [Console Debugging Guide](CONSOLE_DEBUGGING.md) - Using Console Footer
- [API Error Responses](../api/ERROR_RESPONSES.md) - Backend error formats

---

**Quick Reference**:

| Domain      | Use For                    |
| ----------- | -------------------------- |
| `api`       | API/network errors         |
| `import`    | Import pipeline errors     |
| `analytics` | Analytics dashboard errors |
| `ui`        | React component errors     |
| `database`  | Database operation errors  |
| `system`    | System-level errors        |

| Severity | When to Use                           |
| -------- | ------------------------------------- |
| `error`  | Critical failures requiring attention |
| `warn`   | Non-critical issues to review         |
| `info`   | Informational messages                |
| `debug`  | Detailed debugging info               |
