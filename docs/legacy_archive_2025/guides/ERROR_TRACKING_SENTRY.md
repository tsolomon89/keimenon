# Sentry Error Tracking Integration

**Last Updated**: October 21, 2025
**Status**: ✅ Implemented (Opt-In)

## Overview

Keimenon now supports **optional, privacy-respecting error tracking** via Sentry. This integration is designed with our **local-first philosophy** in mind:

- ✅ **Opt-in only** - Never sends data without explicit user consent
- ✅ **PII scrubbing** - Automatically removes sensitive data before sending
- ✅ **Self-hosted support** - Works with self-hosted Sentry instances
- ✅ **Transparent** - User can disable at any time
- ✅ **Integrated** - Works seamlessly with existing ErrorCaptureService

---

## Architecture

### Backend (API)

**Files**:

- [sentry.service.ts](../../apps/api/src/services/sentry.service.ts) - Sentry integration service
- [index.ts](../../apps/api/src/index.ts:61-63) - Sentry initialization
- [index.ts](../../apps/api/src/index.ts:380-381) - Sentry error handler

**Initialization**:

```typescript
// MUST be before all other middleware
initSentry(app);

// ... routes ...

// MUST be after routes but before other error handlers
addSentryErrorHandler(app);
```

**Environment Variables** (`.env`):

```bash
# Sentry DSN (leave empty to disable)
SENTRY_DSN=https://your-dsn@sentry.io/project-id

# Environment (production, staging, development)
SENTRY_ENVIRONMENT=production

# Sample rates (0.0 to 1.0)
SENTRY_SAMPLE_RATE=1.0
SENTRY_TRACES_SAMPLE_RATE=0.1

# Enable profiling
SENTRY_PROFILING_ENABLED=false

# Scrub PII (default: true)
SENTRY_SCRUB_PII=true
```

**PII Scrubbing**:
Automatically removes:

- Authorization headers
- Cookies
- API keys
- User emails
- Password fields
- Tokens/secrets in query parameters

### Frontend (Web)

**Files**:

- [sentry.service.ts](../../apps/web/src/services/sentry.service.ts) - Sentry integration service
- [SentryProvider.tsx](../../apps/web/src/components/providers/SentryProvider.tsx) - React provider
- [layout.tsx](../../apps/web/src/app/layout.tsx:26) - Provider integration
- [error-capture.service.ts](../../apps/web/src/services/error-capture.service.ts:153-170) - Auto-forwarding

**Environment Variables** (`.env.local`):

```bash
# Sentry DSN (leave empty to disable)
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id

# Environment
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production

# Sample rates
NEXT_PUBLIC_SENTRY_SAMPLE_RATE=1.0
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1

# Session replay sample rates
NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_REPLAY_ERROR_SAMPLE_RATE=1.0

# Scrub PII (default: true)
NEXT_PUBLIC_SENTRY_SCRUB_PII=true
```

**User Consent**:
Stored in `localStorage` as `sentry_consent`:

- `true` - User has consented, Sentry is active
- `false` or missing - Sentry is disabled

---

## Usage

### Backend

**Automatic Error Capture**:
All errors passing through Express error handlers are automatically captured if Sentry is enabled.

**Manual Error Capture**:

```typescript
import { captureError, captureMessage } from '@/services/sentry.service';

try {
  await riskyOperation();
} catch (err) {
  captureError(err, {
    tags: {
      operation: 'riskyOperation',
      userId: user.id,
    },
    extra: {
      fileName: 'test.json',
      fileSize: 1024,
    },
    user: {
      id: user.id,
      accountId: user.accountId,
      rank: user.rank,
    },
    level: 'error',
  });
  throw err;
}
```

**Set User Context**:

```typescript
import { setSentryUser } from '@/services/sentry.service';

// After authentication
setSentryUser({
  id: user.id,
  accountId: user.accountId,
  rank: user.rank,
});

// On logout
setSentryUser(null);
```

### Frontend

**Automatic Error Capture**:
All errors captured by `ErrorCaptureService` (with severity `error` or `warn`) are automatically forwarded to Sentry **if user has consented**.

**Manual Error Capture**:

```typescript
import { errorCapture } from '@/services/error-capture.service';

try {
  await fetchData();
} catch (err) {
  // This will automatically go to Sentry if user consented
  errorCapture.capture(
    err,
    {
      domain: 'api',
      operation: 'fetchData',
      userId: user.id,
      accountId: user.accountId,
      metadata: {
        endpoint: '/api/v1/data',
      },
    },
    'error'
  );
}
```

**User Consent Management**:

```typescript
import { setUserConsent, hasUserConsent } from '@/services/sentry.service';

// Enable error tracking
setUserConsent(true);

// Disable error tracking
setUserConsent(false);

// Check consent status
const consented = hasUserConsent();
```

---

## Setup Guide

### 1. Create Sentry Project

#### Option A: Sentry.io (Cloud)

1. Sign up at [sentry.io](https://sentry.io)
2. Create a new project (select "Express" for backend, "React" for frontend)
3. Copy the DSN

#### Option B: Self-Hosted Sentry

1. Deploy Sentry (see [self-hosting docs](https://develop.sentry.dev/self-hosted/))
2. Create a project
3. Copy the DSN

### 2. Configure Backend

Add to `apps/api/.env`:

```bash
SENTRY_DSN=https://your-backend-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
SENTRY_SAMPLE_RATE=1.0
SENTRY_TRACES_SAMPLE_RATE=0.1
```

### 3. Configure Frontend

Add to `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SENTRY_DSN=https://your-frontend-dsn@sentry.io/project-id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_SAMPLE_RATE=1.0
```

### 4. Enable User Consent (Frontend Only)

**Option A: Add to Settings UI** (Recommended)
Create a toggle in Settings page:

```typescript
import { setUserConsent, hasUserConsent } from '@/services/sentry.service';

function SettingsPage() {
  const [consentGiven, setConsentGiven] = useState(hasUserConsent());

  const handleConsentChange = (enabled: boolean) => {
    setUserConsent(enabled);
    setConsentGiven(enabled);

    // Re-initialize if enabled
    if (enabled) {
      initSentry();
    }
  };

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={consentGiven}
          onChange={(e) => handleConsentChange(e.target.checked)}
        />
        Help improve Keimenon by sending error reports
      </label>
      <p className="text-sm text-gray-500">
        We respect your privacy. Error reports are anonymized and contain no personal data.
      </p>
    </div>
  );
}
```

**Option B: Prompt on First Error** (Alternative)
Show a consent dialog the first time an error occurs.

---

## Privacy & Security

### What Data is Sent?

**Sent to Sentry**:

- ✅ Error messages and stack traces
- ✅ Operation context (domain, operation name)
- ✅ User ID and Account ID (non-PII identifiers)
- ✅ Request URLs (without sensitive query params)
- ✅ Browser/OS information
- ✅ Timestamp and environment

**NOT Sent to Sentry**:

- ❌ User email addresses
- ❌ Passwords
- ❌ API tokens/keys
- ❌ Authorization headers
- ❌ Cookies
- ❌ File contents
- ❌ Chat message content
- ❌ Personally identifiable information (PII)

### PII Scrubbing

Both backend and frontend automatically scrub:

- Authorization headers (`authorization`, `cookie`, `x-api-key`)
- Query parameters containing `token`, `password`, `key`
- User email addresses
- Fields containing `password`, `token`, `secret`

### User Control

Users can:

- ✅ Opt in or out at any time
- ✅ Use the app without ever enabling Sentry
- ✅ See what data is being sent (transparent)
- ✅ Use self-hosted Sentry for complete control

---

## Testing

### Test Backend Sentry

```bash
# 1. Set Sentry DSN in apps/api/.env
SENTRY_DSN=https://your-dsn@sentry.io/project-id

# 2. Start API server
cd apps/api
npm run dev

# 3. Trigger a test error
curl http://localhost:4001/api/v1/test-error

# 4. Check Sentry dashboard
# You should see the error appear within seconds
```

### Test Frontend Sentry

```typescript
// 1. Set Sentry DSN in apps/web/.env.local
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id

// 2. Enable user consent
localStorage.setItem('sentry_consent', 'true');

// 3. Trigger a test error in browser console
import { errorCapture } from '@/services/error-capture.service';

errorCapture.capture(
  new Error('Test error from browser'),
  {
    domain: 'ui',
    operation: 'test.error',
  },
  'error'
);

// 4. Check Sentry dashboard
// You should see the error appear within seconds
```

---

## Deployment Recommendations

### Free Tier

- **Disable Sentry** (no DSN configured)
- All errors handled locally via ErrorCaptureService
- Users get local error console (press backtick)

### Pro Tier

- **Optional Sentry** (user opt-in required)
- Provide DSN in environment variables
- Users must explicitly enable in settings
- Recommend session replay for debugging

### Business Tier

- **Self-hosted Sentry** (recommended)
- Complete control over error data
- Compliance with data governance
- Org-wide error dashboard

---

## Troubleshooting

### Errors not appearing in Sentry?

1. **Check DSN is set**:

   ```bash
   # Backend
   echo $SENTRY_DSN

   # Frontend
   echo $NEXT_PUBLIC_SENTRY_DSN
   ```

2. **Check user consent** (frontend only):

   ```javascript
   // In browser console
   localStorage.getItem('sentry_consent');
   // Should return 'true'
   ```

3. **Check Sentry is initialized**:
   - Backend: Look for log "📊 Sentry: Initialized successfully"
   - Frontend: Look for log "📊 Sentry: Initialized successfully" in console

4. **Check environment**:
   - Sentry is disabled in development by default
   - Set `SENTRY_ENVIRONMENT=production` to enable

5. **Check sample rate**:
   - If `SENTRY_SAMPLE_RATE=0.1`, only 10% of errors are sent
   - Set to `1.0` for testing

### Too many errors in Sentry?

1. **Reduce sample rate**:

   ```bash
   SENTRY_SAMPLE_RATE=0.1  # Send only 10% of errors
   ```

2. **Add error filtering in Sentry dashboard**:
   - Filter out expected errors (404s, etc.)
   - Group similar errors

3. **Fix root causes**:
   - Use Sentry insights to identify patterns
   - Prioritize high-frequency errors

---

## Cost Considerations

### Sentry Pricing

- **Developer (Free)**: 5,000 errors/month, 7-day retention
- **Team ($26/month)**: 50,000 errors/month, 90-day retention
- **Business ($80/month)**: 100,000 errors/month, 1-year retention

### Optimizing Costs

1. **Use sampling**:

   ```bash
   SENTRY_SAMPLE_RATE=0.1  # 10% of errors
   SENTRY_TRACES_SAMPLE_RATE=0.01  # 1% of traces
   ```

2. **Filter noise**:
   - Don't send 404 errors (expected)
   - Don't send client-side validation errors
   - Filter by severity (errors only, not warnings)

3. **Self-host for large scale**:
   - No per-event costs
   - Unlimited events
   - Full control

---

## Future Enhancements

### Planned Features

1. **Settings UI** (NOT_STARTED.md Task 16)
   - Toggle for enabling/disabling Sentry
   - View what data is sent
   - Opt-in flow with explanation

2. **Error Trends**
   - Chart error frequency over time
   - Identify regression patterns

3. **Performance Monitoring**
   - Track API response times
   - Frontend render performance
   - Database query performance

4. **Session Replay** (Pro tier)
   - Visual replay of user sessions leading to errors
   - Privacy-safe (masks all text/inputs)

---

## Related Documentation

- [Error Handling Architecture](../architecture/ERROR_HANDLING.md) - Error handling system overview
- [Privacy Policy](../PRIVACY.md) - Privacy commitments
- [NOT_STARTED.md](../active_development/NOT_STARTED.md) - Task 16: Error Tracking Integration

---

**Status**: ✅ **Implementation complete. Ready for opt-in use.**
