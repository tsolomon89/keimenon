# Token Lifecycle and Expiration Handling

## Overview

This document describes how JWT token lifecycle and expiration are handled in Keimenon, including automatic logout, user notifications, and error recovery.

## Token Structure

JWT tokens contain:

- `exp`: Expiration timestamp (Unix seconds)
- `userId`: User ID
- `accountId`: Current account ID
- `email`: User email
- `permissionLevel`: User permission level
- `accountType`: Account type (admin/client)
- `accountClass`: Account class (free/professional/business)

## Token Validation Flow

### 1. Pre-Flight Validation

Before every API call, the `getAuthHeaders()` function in [api-client.ts](../../apps/web/src/lib/api-client.ts):

1. Retrieves token from localStorage
2. Decodes JWT payload
3. Checks `exp` timestamp against current time (with 30-second buffer)
4. If expired:
   - Triggers `handleTokenExpiration()`
   - Clears localStorage
   - Dispatches `auth:token-expired` event
   - Redirects to `/login?reason=expired` after 1 second
5. If valid, includes token in `Authorization: Bearer {token}` header

### 2. Runtime Validation (401/403 Interceptor)

The `fetchWithAuthInterceptor()` function catches authentication failures from the API:

1. Wraps all `fetch()` calls
2. Checks response status codes
3. If `401 Unauthorized` or `403 Forbidden`:
   - Extracts error message from response
   - Calls `handleTokenExpiration(errorMessage)`
   - Triggers same cleanup flow as pre-flight validation

### 3. User Notification

The [TokenExpirationListener](../../apps/web/src/components/auth/TokenExpirationListener.tsx) component:

1. Mounted at root level in [layout.tsx](../../apps/web/src/app/layout.tsx)
2. Listens for `auth:token-expired` events
3. Displays error toast: "Session Expired - You will be redirected to the login page"
4. Toast duration: 3 seconds (matches redirect delay)

### 4. Login Page Message

The [login page](../../apps/web/src/app/login/page.tsx):

1. Detects `?reason=expired` query parameter
2. Shows yellow info banner:
   - Icon: Clock
   - Title: "Session Expired"
   - Message: "Your session has expired. Please log in again to continue."

## Implementation Files

### Core Files

| File                                                       | Purpose                            | Key Functions                                                               |
| ---------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| `apps/web/src/lib/api-client.ts`                           | Token validation & API interceptor | `getAuthHeaders()`, `fetchWithAuthInterceptor()`, `handleTokenExpiration()` |
| `apps/web/src/contexts/AuthContext.tsx`                    | Auth state management              | `isTokenExpired()`, `parseUserFromToken()`, `logout()`                      |
| `apps/web/src/components/auth/TokenExpirationListener.tsx` | Global event listener              | Listens for `auth:token-expired`                                            |
| `apps/web/src/app/login/page.tsx`                          | Login UI                           | Shows expiration message                                                    |

### Supporting Files

- `apps/web/src/hooks/useToast.ts` - Toast notification hook
- `apps/web/src/components/ui/Toast.tsx` - Toast UI component
- `apps/web/src/components/ui/ToastContainer.tsx` - Toast container

## Error Scenarios

### Scenario 1: Token Expires While User is Active

**Flow:**

1. User makes API call (e.g., loads settings)
2. `getAuthHeaders()` detects expired token
3. Toast notification appears
4. Token cleared from localStorage
5. Redirect to login after 1 second
6. Login page shows "Session Expired" banner

### Scenario 2: API Returns 401 (e.g., Token Revoked)

**Flow:**

1. User makes API call
2. `getAuthHeaders()` validates token (passes pre-flight check)
3. API returns 401 Unauthorized
4. `fetchWithAuthInterceptor()` catches 401
5. Toast notification appears with error message
6. Token cleared from localStorage
7. Redirect to login after 1 second
8. Login page shows "Session Expired" banner

### Scenario 3: User Tries to Access Protected Page with Expired Token

**Flow:**

1. User bookmarks `/keimenon` and returns after token expires
2. Page loads, React components mount
3. First API call triggers pre-flight validation
4. Token detected as expired
5. Toast notification appears
6. Redirect to login
7. Login page shows "Session Expired" banner

## Token Refresh (Future Enhancement)

Currently, the system does NOT implement token refresh. When a token expires, the user must log in again.

### Planned Implementation

**TODO:** Add token refresh endpoint and automatic refresh logic

- Related: `apps/api/src/routes/auth.routes.ts` (needs POST /auth/refresh endpoint)
- Related: `apps/web/src/lib/api-client.ts:6` (TODO comment)
- See: RFC 6749 (OAuth 2.0 - Refresh Token Grant)

**Design:**

1. API issues both `access_token` (short-lived, 15 min) and `refresh_token` (long-lived, 7 days)
2. `getAuthHeaders()` checks if token expires in < 5 minutes
3. If expiring soon, calls `/api/v1/auth/refresh` with `refresh_token`
4. Receives new `access_token`
5. Updates localStorage
6. Continues with original API call

**Security Considerations:**

- Refresh tokens stored in HttpOnly cookies (not localStorage)
- Refresh tokens rotated on each use (one-time use)
- Refresh tokens tied to specific device/session
- Refresh token revocation on logout

## Testing

### Manual Testing

1. **Expired Token Scenario:**

   ```typescript
   // In browser console:
   localStorage.setItem('keimenon_token', 'eyJhbGci...EXPIRED_TOKEN');
   // Then navigate to /keimenon or reload page
   ```

2. **401 Error Scenario:**
   - Log in normally
   - Manually expire token on backend
   - Trigger any API call (e.g., load settings)

### E2E Testing

**TODO:** Add E2E tests for token expiration scenarios

- Related: `tests/e2e/auth-token-expiration.spec.ts` (needs creation)
- Test cases:
  - User session expires during activity
  - User returns with expired token
  - User receives 401 from API
  - Toast notification displays correctly
  - Login page shows expiration message

### Unit Testing

**TODO:** Add unit tests for token validation

- Related: `apps/web/src/lib/__tests__/api-client.test.ts` (needs creation)
- Test cases:
  - `isTokenExpired()` correctly detects expired tokens
  - `getAuthHeaders()` throws when token expired
  - `fetchWithAuthInterceptor()` catches 401/403
  - `handleTokenExpiration()` clears storage and redirects

## Debugging

### Enable Token Debug Logging

Uncomment debug logs in `api-client.ts`:

```typescript
function getAuthHeaders(): HeadersInit {
  const token = getToken();
  if (token) {
    const payload = decodeJWT(token);
    console.log('🔍 Token validation:', {
      exp: payload?.exp,
      now: Math.floor(Date.now() / 1000),
      expiresIn: payload?.exp - Math.floor(Date.now() / 1000),
      isExpired: isTokenExpired(token),
    });
  }
  // ...
}
```

### Common Issues

**Issue:** Token expires but user not redirected

- **Cause:** Event listener not mounted
- **Fix:** Ensure `TokenExpirationListener` is in root layout

**Issue:** Toast not showing on expiration

- **Cause:** Toast provider not mounted
- **Fix:** Check `TokenExpirationListener` is rendering `ToastContainer`

**Issue:** User gets "Invalid token" errors after login

- **Cause:** Stale token in localStorage
- **Fix:** Clear localStorage before login, or add cache-busting logic

## Security Best Practices

1. **Never extend token lifetime on client** - Token expiration is a security feature
2. **Use short-lived tokens** - Recommended: 15-60 minutes for access tokens
3. **Validate tokens server-side** - Client validation is UX, not security
4. **Log auth failures** - Monitor for brute force attacks
5. **Implement rate limiting** - Prevent token guessing
6. **Use HTTPS only** - Prevent token interception

## Related Documentation

- [Authentication Architecture](../architecture/AUTH.md)
- [API Error Handling](./ERROR_HANDLING.md) (needs creation)
- [Security Best Practices](../architecture/SECURITY.md) (needs creation)

---

**Last Updated:** 2025-11-25
**Status:** ✅ Implemented (except token refresh)
**Tested:** Manual testing complete, E2E tests pending
