# E2E API Mocking Guide

**Purpose**: Guide for using API mocks in E2E tests to avoid flaky endpoints and improve test reliability.

**Created**: 2025-10-29
**File**: [tests/e2e/fixtures/api-mocks.ts](fixtures/api-mocks.ts)

---

## When to Use API Mocking

### ✅ Good Use Cases

1. **Tests focused on UI behavior, not API integration**

   ```typescript
   // Testing that Settings page renders correctly
   test('should display settings categories', async ({ page, mockSettingsApi }) => {
     await mockSettingsApi();
     await page.goto('/settings');
     await expect(page.getByText('Data')).toBeVisible();
   });
   ```

2. **Tests that fail due to API timing issues in parallel execution**

   ```typescript
   // Avoiding 401 errors from token timing
   test('should load data management card', async ({ page, mockDataStatsApi }) => {
     await mockDataStatsApi();
     await page.goto('/settings');
     // Stats now load instantly without authentication delays
   });
   ```

3. **Tests that need consistent data regardless of DB state**

   ```typescript
   // Testing error display with specific node count
   test('should show error when node count > 1000', async ({ page, mockApiRoute }) => {
     await mockApiRoute('**/api/v1/nodes**', { nodes: [], total: 1001 });
     await page.goto('/canvas');
     await expect(page.getByText('Node limit exceeded')).toBeVisible();
   });
   ```

4. **Tests that need to simulate slow/failed API responses**

   ```typescript
   import { delayApiResponse, failApiRequest } from './fixtures/api-mocks';

   test('should show loading spinner', async ({ page }) => {
     await delayApiResponse(page, '**/api/v1/settings**', 3000);
     await page.goto('/settings');
     await expect(page.getByTestId('settings-loading')).toBeVisible();
   });

   test('should handle API errors gracefully', async ({ page }) => {
     await failApiRequest(page, '**/api/v1/data/stats**', 500);
     await page.goto('/settings');
     await expect(page.getByText('Failed to load stats')).toBeVisible();
   });
   ```

### ❌ When NOT to Use Mocking

1. **Tests specifically testing API integration**

   ```typescript
   // DON'T mock in debug-auth.spec.ts
   test('should have token and API access after login', async ({ page }) => {
     // This test MUST use real API to verify authentication works
     await page.goto('/login');
     // ...
   });
   ```

2. **End-to-end flow tests**

   ```typescript
   // DON'T mock in full workflow tests
   test('complete import workflow', async ({ page }) => {
     // Should test real import → processing → display flow
     await page.goto('/canvas');
     await page.click('Upload');
     // ...
   });
   ```

3. **Tests for critical user paths**
   ```typescript
   // DON'T mock login/auth for user journey tests
   test('user can complete onboarding', async ({ page }) => {
     // Real authentication is critical for this test
     await page.goto('/login');
     // ...
   });
   ```

---

## Available Mock Fixtures

### Basic Fixtures

#### `mockSettingsApi()`

Mocks `/api/v1/settings/registry/all` with default categories.

**Usage**:

```typescript
import { test, expect } from './fixtures/api-mocks';

test('settings page renders', async ({ page, mockSettingsApi }) => {
  await mockSettingsApi();
  await page.goto('/settings');

  // Now safe to check for categories without API delays
  await expect(page.getByText('Data')).toBeVisible();
  await expect(page.getByText('General')).toBeVisible();
});
```

**Mock Response**:

```json
{
  "registry": [
    { "id": "general", "name": "General", ... },
    { "id": "data", "name": "Data", ... },
    { "id": "account", "name": "Account", ... },
    { "id": "privacy", "name": "Privacy", ... }
  ]
}
```

#### `mockDataStatsApi()`

Mocks `/api/v1/data/stats` with default stats.

**Usage**:

```typescript
test('data management card displays stats', async ({ page, mockDataStatsApi }) => {
  await mockDataStatsApi();
  await page.goto('/settings');
  await page.click('Data');

  await expect(page.getByText('100 nodes')).toBeVisible();
});
```

**Mock Response**:

```json
{
  "stats": {
    "totalNodes": 100,
    "totalEdges": 250,
    "nodesByKind": { ... },
    "databaseSize": 1024000,
    "lastUpdated": "2025-10-29T12:00:00Z"
  }
}
```

#### `mockAllAuthApis()`

Mocks all common auth-protected endpoints (Settings, Stats, Nodes, Edges, Imports GET).

**Usage**:

```typescript
test('canvas page loads without auth delays', async ({ page, mockAllAuthApis }) => {
  await mockAllAuthApis();
  await page.goto('/login');

  // Login with real auth
  await page.fill('[name=email]', 'admin@admin.com');
  await page.fill('[name=password]', 'admin123');
  await page.click('button[type=submit]');

  // All subsequent API calls are mocked
  await page.waitForURL('/canvas');
  await expect(page.getByText('Canvas')).toBeVisible();
});
```

**Note**: Login API (`/api/v1/auth/login`) is NOT mocked - real authentication still works.

#### `mockApiRoute(urlPattern, response, status?)`

Create custom API mocks for specific test needs.

**Usage**:

```typescript
test('custom node data', async ({ page, mockApiRoute }) => {
  await mockApiRoute('**/api/v1/nodes**', {
    nodes: [{ id: 'node_1', kind: 'Source', title: 'Test Node' }],
    total: 1,
  });

  await page.goto('/canvas');
  await expect(page.getByText('Test Node')).toBeVisible();
});

// Mock error response
test('handle API error', async ({ page, mockApiRoute }) => {
  await mockApiRoute('**/api/v1/nodes**', { error: 'Database error' }, 500);

  await page.goto('/canvas');
  await expect(page.getByText('Failed to load nodes')).toBeVisible();
});
```

---

## Helper Functions

### `mockEndpoints(page, endpoints)`

Mock multiple endpoints at once.

**Usage**:

```typescript
import { mockEndpoints } from './fixtures/api-mocks';

test('multiple mocked endpoints', async ({ page }) => {
  await mockEndpoints(page, {
    '/api/v1/settings/registry/all': {
      response: { registry: [...] },
    },
    '/api/v1/data/stats': {
      response: { stats: { totalNodes: 50 } },
    },
    '/api/v1/nodes': {
      response: { nodes: [], total: 0 },
    },
  });

  await page.goto('/settings');
});
```

### `delayApiResponse(page, urlPattern, delayMs)`

Simulate slow network to test loading states.

**Usage**:

```typescript
import { delayApiResponse } from './fixtures/api-mocks';

test('shows loading spinner during slow API', async ({ page }) => {
  await delayApiResponse(page, '**/api/v1/settings/registry/all', 3000);

  await page.goto('/settings');

  // Loading state should be visible for 3 seconds
  await expect(page.getByTestId('settings-loading')).toBeVisible();

  // After 3s, data loads
  await expect(page.getByText('Data')).toBeVisible({ timeout: 5000 });
});
```

### `failApiRequest(page, urlPattern, status, errorMessage?)`

Simulate API errors to test error handling.

**Usage**:

```typescript
import { failApiRequest } from './fixtures/api-mocks';

test('displays error message on API failure', async ({ page }) => {
  await failApiRequest(page, '**/api/v1/data/stats', 500, 'Database unavailable');

  await page.goto('/settings');
  await page.click('Data');

  await expect(page.getByText('Failed to load data')).toBeVisible();
  await expect(page.getByText('Database unavailable')).toBeVisible();
});

test('retries failed requests', async ({ page }) => {
  await failApiRequest(page, '**/api/v1/nodes', 429); // Rate limited

  await page.goto('/canvas');
  await expect(page.getByText('Rate limit exceeded')).toBeVisible();
});
```

---

## Real-World Examples

### Example 1: Fix Settings Navigation Flakiness

**Problem**: Settings page "Data" category doesn't appear in parallel execution due to 401 errors.

**Before** (Flaky):

```typescript
test('should navigate to settings page', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'admin@admin.com');
  await page.fill('[name=password]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL('/canvas');

  // Click Settings
  await page.click('button[title="Settings"]');
  await page.waitForTimeout(3000); // Hope API responds in time

  // This fails intermittently with 401
  const dataCategory = page.getByRole('button', { name: /^Data$/i });
  await expect(dataCategory).toBeVisible({ timeout: 10000 });
});
```

**After** (Reliable):

```typescript
import { test, expect } from './fixtures/api-mocks';

test('should navigate to settings page', async ({ page, mockSettingsApi }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'admin@admin.com');
  await page.fill('[name=password]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL('/canvas');

  // Mock Settings API to avoid 401 errors
  await mockSettingsApi();

  // Click Settings
  await page.click('button[title="Settings"]');

  // Data category appears instantly, no 401 errors
  const dataCategory = page.getByRole('button', { name: /^Data$/i });
  await expect(dataCategory).toBeVisible();
});
```

### Example 2: Test Data Management UI Without Real Data

**Problem**: Need to test UI with specific node counts, but DB state varies.

**Solution**:

```typescript
import { test, expect } from './fixtures/api-mocks';

test('should display correct node counts', async ({ page, mockDataStatsApi, mockApiRoute }) => {
  // Mock stats with specific numbers
  await mockApiRoute('**/api/v1/data/stats', {
    stats: {
      totalNodes: 1234,
      totalEdges: 5678,
      nodesByKind: {
        Source: 100,
        Chat: 500,
        MessageRef: 634,
      },
    },
  });

  await page.goto('/login');
  // ... login ...
  await page.goto('/settings');
  await page.click('Data');

  // Check exact counts
  await expect(page.getByText('1,234 nodes')).toBeVisible();
  await expect(page.getByText('5,678 edges')).toBeVisible();
  await expect(page.getByText('Source: 100')).toBeVisible();
});
```

### Example 3: Test Loading States

**Problem**: Settings page renders so fast in tests that loading state is never visible.

**Solution**:

```typescript
import { test, expect } from './fixtures/api-mocks';
import { delayApiResponse } from './fixtures/api-mocks';

test('should show loading skeleton while fetching settings', async ({ page }) => {
  // Delay Settings API by 2 seconds
  await delayApiResponse(page, '**/api/v1/settings/registry/all', 2000);

  await page.goto('/login');
  // ... login ...
  await page.goto('/settings');

  // Loading skeleton should be visible
  await expect(page.getByTestId('settings-loading')).toBeVisible();

  // After 2s, real data loads
  await expect(page.getByText('Data')).toBeVisible({ timeout: 3000 });
});
```

### Example 4: Test Error Handling

**Problem**: Need to test how UI handles API errors, but hard to trigger in tests.

**Solution**:

```typescript
import { test, expect } from './fixtures/api-mocks';
import { failApiRequest } from './fixtures/api-mocks';

test('should display error when stats API fails', async ({ page }) => {
  await failApiRequest(page, '**/api/v1/data/stats', 500);

  await page.goto('/login');
  // ... login ...
  await page.goto('/settings');
  await page.click('Data');

  // Error message should be visible
  await expect(page.getByText('Failed to load statistics')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('should retry on error', async ({ page }) => {
  let callCount = 0;

  await page.route('**/api/v1/data/stats', async (route) => {
    callCount++;

    if (callCount === 1) {
      // First call fails
      await route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) });
    } else {
      // Second call succeeds
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ stats: { totalNodes: 100 } }),
      });
    }
  });

  await page.goto('/settings');
  await page.click('Data');

  // Error appears
  await expect(page.getByText('Failed to load statistics')).toBeVisible();

  // Click Retry
  await page.click('button[name=Retry]');

  // Success after retry
  await expect(page.getByText('100 nodes')).toBeVisible();
});
```

---

## Best Practices

### 1. Mock at the Right Level

**❌ Don't mock everything**:

```typescript
test('full import workflow', async ({ page, mockAllAuthApis }) => {
  await mockAllAuthApis(); // ❌ Too broad - kills the actual workflow test
  // ...
});
```

**✅ Mock only what's flaky**:

```typescript
test('settings UI renders correctly', async ({ page, mockSettingsApi }) => {
  await mockSettingsApi(); // ✅ Just the flaky Settings API
  // Login and other APIs still real
});
```

### 2. Be Explicit About What's Mocked

**❌ Hidden mocking**:

```typescript
// Other developers don't know Settings API is mocked
test('settings page', async ({ page, mockSettingsApi }) => {
  await mockSettingsApi();
  // ... 50 lines of test code ...
});
```

**✅ Clear mocking**:

```typescript
test('settings page UI (mocked API)', async ({ page, mockSettingsApi }) => {
  //     ^^^ Clear in test name

  // Mock Settings API to avoid 401 errors in parallel execution
  await mockSettingsApi();

  // ... test code ...
});
```

### 3. Prefer Real APIs for Integration Tests

**❌ Mock in integration test**:

```typescript
test('login → canvas → upload flow', async ({ page, mockAllAuthApis }) => {
  await mockAllAuthApis(); // ❌ Not a real integration test anymore
});
```

**✅ Use real APIs**:

```typescript
test('login → canvas → upload flow', async ({ page }) => {
  // ✅ Real integration test, no mocks
  // If flaky, fix the root cause instead of mocking
});
```

### 4. Document Why You're Mocking

```typescript
test('settings categories render', async ({ page, mockSettingsApi }) => {
  // TODO: Remove this mock once TEST_ISOLATION_IMPLEMENTATION.md is complete
  // Mocking to avoid 401 errors from token timing in parallel execution
  await mockSettingsApi();

  // ... test ...
});
```

---

## Troubleshooting

### Mock Not Working

**Problem**: API mock not intercepting requests.

**Solution**: Ensure mock is set up BEFORE navigation:

```typescript
// ❌ Wrong order
test('my test', async ({ page, mockSettingsApi }) => {
  await page.goto('/settings'); // ❌ Navigation happens first
  await mockSettingsApi(); // ❌ Too late
});

// ✅ Correct order
test('my test', async ({ page, mockSettingsApi }) => {
  await mockSettingsApi(); // ✅ Mock set up first
  await page.goto('/settings'); // ✅ Navigation uses mock
});
```

### Mock Too Broad

**Problem**: Mocking too many endpoints breaks unrelated features.

**Solution**: Use specific URL patterns:

```typescript
// ❌ Too broad
await page.route('**/api/**', ...); // Mocks EVERYTHING

// ✅ Specific
await mockSettingsApi(); // Only mocks Settings API
```

### Mock Not Realistic

**Problem**: Mock data doesn't match real API shape, tests pass but app breaks.

**Solution**: Copy real API responses for mocks:

```typescript
// Get real response:
// 1. Open DevTools → Network tab
// 2. Make API call
// 3. Copy response JSON

// Use in mock:
await mockApiRoute('**/api/v1/settings/registry/all', {
  // Paste real response here
  registry: [
    /* real data */
  ],
});
```

---

## Migration Guide

### Updating Existing Tests

**Before**:

```typescript
test('settings navigation', async ({ page }) => {
  await page.goto('/login');
  // ... login ...
  await page.waitForURL('/canvas');

  await page.click('button[title="Settings"]');
  await page.waitForTimeout(3000); // Arbitrary wait

  const dataCategory = page.getByRole('button', { name: /^Data$/i });
  await expect(dataCategory).toBeVisible({ timeout: 10000 });
});
```

**After**:

```typescript
import { test, expect } from './fixtures/api-mocks';

test('settings navigation (mocked API)', async ({ page, mockSettingsApi }) => {
  await page.goto('/login');
  // ... login ...
  await page.waitForURL('/canvas');

  // Mock Settings API to avoid parallel execution issues
  await mockSettingsApi();

  await page.click('button[title="Settings"]');
  // No arbitrary waits needed

  const dataCategory = page.getByRole('button', { name: /^Data$/i });
  await expect(dataCategory).toBeVisible(); // Instant
});
```

---

## Related Documentation

- [tests/e2e/fixtures/api-mocks.ts](fixtures/api-mocks.ts) - API mocking implementation
- [docs/SETTINGS_PAGE_RACE_CONDITIONS.md](../../docs/SETTINGS_PAGE_RACE_CONDITIONS.md) - Settings page issues
- [docs/TEST_ISOLATION_IMPLEMENTATION.md](../../docs/TEST_ISOLATION_IMPLEMENTATION.md) - Test isolation (long-term fix)
- [tests/e2e/debug-auth.spec.ts](debug-auth.spec.ts) - Example of NOT mocking (tests real API)

---

**End of Guide**
