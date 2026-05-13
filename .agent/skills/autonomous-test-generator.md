---
name: autonomous-test-generator
description: Generates Playwright E2E tests with visual verification. Creates tests for untested endpoints using live browser inspection to ensure accurate locators.
allowed-tools: Read, Write, Edit, Glob, Grep, mcp__keimenon-database__query_nodes, mcp__keimenon-api-testing__test_endpoint, mcp__playwright-e2e__pw_run, mcp__playwright-test__browser_snapshot
context: fork
agent: general-purpose
---

# Autonomous Test Generator (with Visual Verification)

---**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):- **Context Consolidation**: Automatic, not optional (Section 13.0)- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)- **Full-Scope Traversal**: Address all layers (Section 13.3)- **Recursive Intelligence**: Enrich system with every run (Section 13.4)---

## Purpose

Automatically generates comprehensive Playwright E2E tests for untested endpoints and user flows by coordinating the Playwright Generator agent with Keimenon MCP servers. **Enhanced with visual reconnaissance** to verify elements exist before generating tests, ensuring tests target real UI components with accurate locators.

**Visual Verification Integration**: Following Anthropic's Agent SDK pattern, this skill uses live browser inspection to generate tests that match the actual UI state, not assumptions from code analysis alone.

## Usage

Invoke this skill when you need to:

- Generate E2E tests for specific endpoints (with visual verification)
- Create tests for new features (visually confirmed)
- Fill coverage gaps identified by autonomous-test-discoverer
- Generate data-driven tests from database schema
- Create multi-account testing scenarios
- Ensure generated tests have robust, visually-verified locators

## Tools Available

- **Read**: Read route handlers, components, existing tests for patterns
- **Write**: Create new test files
- **Edit**: Update existing tests
- **Glob**: Find test templates and patterns
- **Grep**: Search for similar test implementations
- **Task (Playwright Generator Agent)**: Generate tests from specs (with visual context)
- **MCP Database**: Query schema for test data generation
- **MCP API Testing**: Validate endpoints before generating tests
- **MCP Playwright E2E**: Launch app, navigate, capture screenshots
- **MCP Visual Feedback**: Extract element properties, verify layout
- **MCP Docs**: Extract feature specifications

## Workflow (Enhanced with Visual Reconnaissance)

### Phase 1: Endpoint Analysis

1. Receive target endpoint from autonomous-test-discoverer or user
2. Extract endpoint details:
   - Route: `/api/v1/nodes/:id`
   - Method: `GET`, `POST`, `PUT`, `DELETE`
   - Auth: Required permission level
   - Schema: Zod request/response validators
   - Account type: client, admin, or both
3. Query `keimenon-api-testing` MCP to verify endpoint is accessible

### Phase 2: Test Data Preparation

1. Query `keimenon-database` MCP for relevant node/edge types
2. Generate realistic test data matching schemas:
   - Use Faker.js for strings, numbers, dates
   - Follow project patterns (e.g., `id` format: `src_abc123`)
   - Respect constraints (required fields, enums, relationships)
3. Create data fixtures for test isolation

### Phase 2.5: Visual Reconnaissance 📸 (NEW)

**Purpose**: Verify UI elements exist in the actual application before generating tests

**Critical**: This phase prevents generating tests with invalid selectors

1. **Launch test application in browser**:

   ```typescript
   // Start servers if not running
   (await mcp__playwright) - e2e__app_start({ env: 'local' });

   // Wait for servers to be ready
   await waitForServerReady('http://localhost:4001/health');
   await waitForServerReady('http://localhost:3000');
   ```

2. **Authenticate and navigate to target page**:

   ```typescript
   // Determine which page/view contains the endpoint's UI
   const targetPage = mapEndpointToUIPath(endpoint);
   // Examples:
   // - POST /api/v1/nodes → "/keimenon" (create node UI)
   // - GET /api/v1/groups → "/groups" (groups list)
   // - PUT /api/v1/settings → "/settings" (settings panel)

   // Use Task to launch browser and navigate
   const visualInspection = await Task({
     subagent_type: 'playwright-test-planner',
     prompt: `Navigate to ${targetPage} and inspect UI for ${endpoint}
   
     Steps:
     1. Login with test account (client@test.com / 123456)
     2. Navigate to ${targetPage}
     3. Wait for page to load completely
     4. Capture screenshot of entire page
     5. List all interactive elements (buttons, forms, links, inputs)
     6. Generate robust locators for each element
     7. Return structured data about UI state
   
     Return:
     - Screenshot path
     - List of elements with locators
     - Page structure/layout
     - Any modals, dialogs, or dynamic content
     `,
   });
   ```

3. **📸 Capture screenshot of target page**:

   ```typescript
   const screenshot = {
     path: visualInspection.screenshot_path,
     timestamp: Date.now(),
     page_url: targetPage,
     viewport: { width: 1920, height: 1080 },
   };
   ```

4. **📸 Extract interactive elements from live page**:

   ```typescript
   // Use browser tools to find all elements related to this endpoint
   const elements = await extractInteractiveElements(visualInspection);

   // Example result:
   const uiElements = [
     {
       type: 'button',
       role: 'button',
       text: 'Create Source Node',
       locator: "page.getByRole('button', { name: /create source node/i })",
       visible: true,
       enabled: true,
       position: { x: 850, y: 120 },
       screenshot_region: { x: 800, y: 100, w: 180, h: 50 },
     },
     {
       type: 'input',
       role: 'textbox',
       label: 'Node Title',
       locator: "page.getByLabel('Node Title')",
       visible: false, // Initially hidden (in dialog)
       required: true,
     },
     {
       type: 'input',
       role: 'textbox',
       label: 'Content',
       locator: "page.getByLabel('Content')",
       visible: false, // Initially hidden (in dialog)
       required: true,
     },
     {
       type: 'button',
       role: 'button',
       text: 'Submit',
       locator: "page.getByRole('button', { name: /submit/i })",
       visible: false, // In dialog
       form_action: 'POST /api/v1/nodes',
     },
   ];
   ```

5. **📸 Map visual elements to API operations**:

   ```typescript
   // Determine which UI elements trigger which API calls
   const uiToApiMapping = {
     endpoint: 'POST /api/v1/nodes',
     trigger_element: uiElements.find((e) => e.text === 'Create Source Node'),
     form_elements: uiElements.filter((e) => e.type === 'input'),
     submit_element: uiElements.find((e) => e.text === 'Submit'),
     success_indicators: [
       { type: 'toast', text: 'Node created successfully' },
       { type: 'element', selector: 'keimenon .node', description: 'New node appears in keimenon' },
     ],
     error_indicators: [
       { type: 'toast', text: /error/i },
       { type: 'message', selector: '.error-message' },
     ],
   };
   ```

6. **Verify element existence and accessibility**:

   ```typescript
   const verificationResults = {
     endpoint: 'POST /api/v1/nodes',
     ui_verified: true,
     elements_found: uiElements.length,
     critical_elements_verified: [
       { element: 'Create button', found: true, accessible: true },
       { element: 'Title input', found: true, accessible: true },
       { element: 'Content input', found: true, accessible: true },
       { element: 'Submit button', found: true, accessible: true },
     ],
     issues: [],
     screenshots: {
       page_initial: screenshot.path,
       // We'll capture more screenshots during test generation
     },
   };

   // If any critical elements missing:
   if (verificationResults.critical_elements_verified.some((e) => !e.found)) {
     console.warn(`⚠️ Visual verification found missing UI elements for ${endpoint}
       This endpoint may not have a UI implementation yet.
       Test generation will proceed with API-only tests.
     `);
   }
   ```

7. **📸 Capture element-specific screenshots** (optional, for complex UIs):

   ```typescript
   // For complex features, capture screenshots of specific regions
   const detailedScreenshots = await captureElementScreenshots(uiElements);

   // Example:
   // - create-button.png: Just the "Create Source Node" button
   // - node-form.png: The node creation form (when opened)
   // - success-state.png: What success looks like
   ```

8. **Generate visual context summary for test generation**:
   ```typescript
   const visualContext = {
     endpoint: 'POST /api/v1/nodes',
     page_url: targetPage,
     screenshots: {
       full_page: screenshot.path,
       ...detailedScreenshots,
     },
     verified_locators: {
       trigger_button: "page.getByRole('button', { name: /create source node/i })",
       title_input: "page.getByLabel('Node Title')",
       content_input: "page.getByLabel('Content')",
       submit_button: "page.getByRole('button', { name: /submit/i })",
     },
     user_flow: [
       "1. Click 'Create Source Node' button",
       '2. Dialog/modal opens with form',
       "3. Fill 'Node Title' input",
       "4. Fill 'Content' input",
       "5. Click 'Submit' button",
       '6. Wait for success toast',
       '7. Verify new node appears in keimenon',
     ],
     success_criteria: [
       "Toast message: 'Node created successfully'",
       'New node element appears in keimenon',
       'API response: 201 Created',
     ],
     timing_considerations: [
       'Wait for dialog to open (animation ~300ms)',
       'Wait for API response (POST /api/v1/nodes)',
       'Wait for keimenon to re-render with new node',
     ],
     responsive_notes: 'Tested at 1920x1080, may need mobile viewport tests',
   };
   ```

### Phase 3: Test Spec Generation (with Visual Evidence)

1. Define test scenarios based on endpoint semantics **and visual context**:
   - **POST (Create)**: Valid data, invalid data, duplicate, auth checks
     - **Visual**: Verify form opens, inputs exist, submission works
   - **GET (Read)**: Found, not found, unauthorized, filtering, pagination
     - **Visual**: Verify data displays, empty state, loading state
   - **PUT/PATCH (Update)**: Valid update, partial update, invalid, not found, unauthorized
     - **Visual**: Verify edit form, fields pre-populated, save feedback
   - **DELETE**: Success, not found, unauthorized, cascade effects
     - **Visual**: Verify delete confirmation, success feedback, item removed from UI

2. For each scenario, specify:
   - Preconditions (setup data)
   - Test steps (user actions) **← Enhanced with visual locators**
   - Assertions (expected outcomes) **← Enhanced with visual verification**
   - Cleanup (tear down data)

3. **Include visual verification in test spec**:
   ```typescript
   const testSpec = {
     scenario: 'Create Source Node - Happy Path',
     visual_context: visualContext, // ← Attach visual evidence
     steps: [
       {
         action: 'click',
         element: 'Create Source Node button',
         locator: visualContext.verified_locators.trigger_button,
         visual_verification: 'Button highlighted in ' + screenshot.path,
       },
       {
         action: 'wait',
         condition: 'Dialog opens',
         visual_verification: 'Look for dialog modal in screenshot',
       },
       // ... more steps with visual references
     ],
     assertions: [
       {
         type: 'api',
         check: 'Response status 201',
       },
       {
         type: 'visual',
         check: 'New node appears in keimenon',
         how_to_verify: 'Check for new .node element with matching title',
       },
       {
         type: 'visual',
         check: 'Success toast displayed',
         locator: "page.getByText('Node created successfully')",
       },
     ],
   };
   ```

### Phase 4: Template Selection

1. Search existing tests for similar patterns
2. Select appropriate template:
   - CRUD operations: `tests/e2e/templates/crud-template.spec.ts`
   - Auth flows: `tests/e2e/templates/auth-template.spec.ts`
   - Multi-account: `tests/e2e/templates/multi-tenant-template.spec.ts`
   - Complex workflows: `tests/e2e/templates/workflow-template.spec.ts`
3. Adapt template to specific endpoint **using visual locators**

### Phase 5: Playwright Agent Invocation (with Visual Evidence)

1. **Invoke Playwright Generator agent with FULL visual context**:
   ```typescript
   Task({
     subagent_type: "playwright-test-generator",
     prompt: `Generate a Playwright test for ${endpoint}
   ```

📸 VISUAL CONTEXT (verified in live browser):
Page URL: ${visualContext.page_url}
Screenshot: ${visualContext.screenshots.full_page}

VERIFIED UI ELEMENTS (these exist on the page):
${visualContext.verified_locators.map(el => `

- ${el.name}: ${el.locator}
  Visual: ${el.description}
  Location: ${el.position.x}, ${el.position.y}
  ${el.visible ? '✅ Visible' : '⚠️ Hidden initially'}
  `).join('\n')}

USER FLOW (visually confirmed):
${visualContext.user_flow.map((step, i) => `${i+1}. ${step}`).join('\n')}

SUCCESS CRITERIA (what to verify visually):
${visualContext.success_criteria.map(c => `  - ${c}`).join('\n')}

TIMING CONSIDERATIONS (observed in live app):
${visualContext.timing_considerations.map(t => `  - ${t}`).join('\n')}

API SPEC:

- Endpoint: ${endpoint}
- Method: ${method}
- Request schema: ${requestSchema}
- Response schema: ${responseSchema}
- Account type: ${accountType}

TEST SCENARIOS TO GENERATE:
${scenario.name}

REQUIREMENTS:

- Use ONLY the verified locators provided above (don't guess)
- Follow the exact user flow observed visually
- Add waits for timing considerations mentioned
- Include visual assertions (toasts, new elements appearing)
- Add screenshot comparisons for critical steps
- Follow project conventions:
  - Use testId fixtures for selectors (already provided)
  - Apply test isolation via worker databases
  - Tag appropriately (@smoke for critical paths)
  - Include proper cleanup
  - ARIA-first locators (already verified in visual inspection)

📸 VISUAL EVIDENCE REFERENCE:
All locators above were verified in ${visualContext.screenshots.full_page}
Test should interact with elements that ACTUALLY EXIST on the page.
`
})

````

2. **Agent generates test with visual confidence**:
- Uses verified locators (not guesses)
- Follows observed user flow
- Includes timing considerations from visual inspection
- Adds visual assertions (toasts, element appearances)

### Phase 6: Test Enhancement (with Visual Verification)

1. Agent generates base test code
2. Enhance with project-specific patterns:
- Add test isolation headers: `X-Test-DB-Path`
- Use login helper: `await login(page, email, password)`
- Apply proper tagging: `test.describe.configure({ tag: '@smoke' })`
- Add test correlation: `x-test-id` header
- Include data cleanup in `afterEach`

3. **📸 Add visual regression checks**:
```typescript
// After critical UI actions, capture baseline screenshots
test('should create node', async ({ page }) => {
  // ... test steps ...

  // 📸 Visual verification: Capture success state
  await expect(page).toHaveScreenshot('node-created-success.png', {
    fullPage: false,
    clip: { x: 0, y: 0, width: 800, height: 600 } // Keimenon area
  });
});
````

4. **Add visual evidence comments**:

   ```typescript
   // Related: apps/api/src/routes/nodes.ts:POST /api/v1/nodes
   // Schema: ai_context/schemas/Node.json
   // 📸 Visual verification: .agent/test-generation/2025-11-01/nodes-create-page.png
   // Verified locators from live UI inspection (2025-11-01 12:00)
   // TODO: Add edge case for invalid node kinds
   ```

5. Validate test follows `CLAUDE.md` standards

### Phase 7: Account Type Variation

If endpoint supports multiple account types, generate variants with **visual verification for each account view**:

**Client Account Test** (with visual context):

```typescript
test.describe('Nodes API - Client Account', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'client@example.com', 'password');
  });

  test('should create node in own account', async ({ page }) => {
    // 📸 Visual verification: Client sees "Create" button
    await expect(page.getByRole('button', { name: /create source/i })).toBeVisible();

    // Click button (locator verified in Phase 2.5)
    await page.getByRole('button', { name: /create source node/i }).click();

    // 📸 Visual verification: Dialog opens
    await expect(page.getByRole('dialog')).toBeVisible();

    // ... rest of test with verified locators
  });

  test('should not access other account nodes', async ({ page }) => {
    // Multi-tenant isolation test with visual verification
  });
});
```

**Admin Account Test** (with admin-specific visual verification):

```typescript
test.describe('Nodes API - Admin Account', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin@example.com', 'admin123');
  });

  test('should access all nodes across accounts', async ({ page }) => {
    // 📸 Visual verification: Admin sees "All Accounts" filter
    await expect(page.getByLabel('Account Filter')).toBeVisible();

    // Admin-specific UI verified in Phase 2.5 (admin session)
  });
});
```

### Phase 8: Test File Organization

1. Determine file location:
   - Resource CRUD: `tests/e2e/${resource}-crud.spec.ts`
   - Auth flows: `tests/e2e/auth-${flow}.spec.ts`
   - Workflows: `tests/e2e/workflow-${feature}.spec.ts`
   - Multi-tenant: `tests/e2e/multi-tenant-${resource}.spec.ts`
2. Group related tests in `describe` blocks
3. Ensure proper imports and fixtures

### Phase 9: Validation (with Visual Testing)

1. **Syntax check**: Run TypeScript compiler
2. **Lint check**: `eslint tests/e2e/${filename}`
3. **📸 Dry run with visual capture**: Execute test in headed mode

   ```typescript
   // Run generated test once to verify it works
   const dryRunResult =
     (await mcp__playwright) -
     e2e__pw_run({
       grep: testFileName,
       headed: true,
       project: 'chromium',
     });

   if (!dryRunResult.passed) {
     // Test failed on first run - this shouldn't happen with visual verification
     console.error(`❌ Generated test failed dry run:
       File: ${testFileName}
       Error: ${dryRunResult.error}
   
       This indicates visual reconnaissance didn't match actual app behavior.
       Possible causes:
       - Timing issue (need more waits)
       - Dynamic content (need better selectors)
       - Multi-step flow (missing intermediate steps)
   
       🔧 Auto-healing...
     `);

     // Invoke healer to fix generated test
     await invokeAutoHealer(testFileName);
   }
   ```

4. **📸 Compare generated test behavior to visual reconnaissance**:

   ```typescript
   // Verify test follows the observed user flow
   const testBehaviorMatch = await compareTestToVisualFlow(generatedTest, visualContext.user_flow);

   if (!testBehaviorMatch.aligned) {
     console.warn(`⚠️ Generated test deviates from observed visual flow:
       ${testBehaviorMatch.differences.map((d) => `- ${d}`).join('\n')}
     `);
   }
   ```

5. **Coverage verification**: Confirm endpoint is now tested

## Output Format

**Generated Test File** (`tests/e2e/nodes-crud-client.spec.ts`) with visual verification:

```typescript
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';

// Related: apps/api/src/routes/nodes.ts:POST /api/v1/nodes
// Schema: ai_context/schemas/Node.json
// 📸 Visual verification: .agent/test-generation/2025-11-01/nodes-create-verification.png
// Verified locators from live UI (2025-11-01 12:00:00)
// All selectors tested in actual browser before test generation
// TODO: Add edge case for invalid node kinds

test.describe('Nodes CRUD - Client Account', () => {
  test.describe.configure({ tag: '@smoke' });

  test.beforeEach(async ({ page }) => {
    await login(page, 'client@test.com', '123456');
    await page.goto('/keimenon');
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ page, request }) => {
    // Cleanup test data
    await request.delete('/api/v1/nodes', {
      params: { data_tag: 'test' },
    });
  });

  test('should create a Source node successfully', async ({ page }) => {
    // 📸 Verified: Button exists and is visible (see visual-evidence/create-button.png)
    // 1. Click create button (locator verified in visual reconnaissance)
    await page.getByRole('button', { name: /create source/i }).click();

    // 📸 Verified: Dialog opens with ~300ms animation
    // 2. Wait for dialog to open (timing observed in live app)
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // 📸 Verified: Form fields exist in dialog (see visual-evidence/node-form.png)
    // 3. Fill in node properties (fields verified to exist)
    await page.getByLabel(/title/i).fill('Test Source Node');
    await page.getByLabel(/content/i).fill('This is test content');

    // 4. Submit form (button verified in dialog)
    await page.getByRole('button', { name: /submit|create/i }).click();

    // 📸 Verified: Success toast appears (observed pattern in live app)
    // 5. Wait for success feedback
    await expect(page.getByText(/created successfully/i)).toBeVisible({ timeout: 10000 });

    // 📸 Visual verification: New node should appear in keimenon
    // 6. Verify node appears in keimenon
    await expect(page.getByText('Test Source Node')).toBeVisible();

    // 📸 Capture success state for baseline
    await expect(page).toHaveScreenshot('node-created-keimenon-state.png', {
      fullPage: false,
      clip: { x: 0, y: 0, width: 1200, height: 800 },
    });

    // 7. Verify node in database via API
    const response = await page.request.get('/api/v1/nodes', {
      params: { kind: 'Source', limit: 1 },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0].properties.title).toBe('Test Source Node');
  });

  test('should not access nodes from other accounts', async ({ page, request }) => {
    // Multi-tenant test with visual verification...
    // (Similar enhancements with visual comments)
  });
});
```

**Summary Report** (JSON) with visual evidence:

```json
{
  "generated": true,
  "test_file": "tests/e2e/nodes-crud-client.spec.ts",
  "endpoint": "/api/v1/nodes",
  "method": "POST",
  "visual_verification": {
    "performed": true,
    "page_url": "/keimenon",
    "screenshot_evidence": [
      ".agent/test-generation/2025-11-01/nodes-create-verification.png",
      ".agent/test-generation/2025-11-01/create-button.png",
      ".agent/test-generation/2025-11-01/node-form.png"
    ],
    "elements_verified": 4,
    "locators_confidence": "high",
    "visual_flow_observed": true
  },
  "scenarios_covered": ["Create node with valid data", "Multi-tenant isolation verification"],
  "account_types": ["client"],
  "tags": ["@smoke"],
  "estimated_runtime": "15s",
  "dependencies": ["tests/e2e/helpers/login.ts", "tests/e2e/fixtures/testId.ts"],
  "validation": {
    "syntax_check": "passed",
    "lint_check": "passed",
    "dry_run": "passed",
    "visual_alignment": "passed"
  },
  "baseline_screenshots": ["tests/e2e/__screenshots__/node-created-keimenon-state.png"]
}
```

## Integration with Other Skills

- **autonomous-test-discoverer**: Receives list of untested endpoints
- **autonomous-test-healer**: Passes generated tests for validation (with visual evidence)
- **pipeline-verifier**: Verifies end-to-end coverage
- **mcp-integration-expert**: Uses all MCP servers for data and validation
- **mcp-visual-feedback**: NEW - Uses for screenshot analysis and element verification

## Visual Verification Tools Reference

### MCP Playwright E2E Tools

```typescript
// Start application servers
mcp__playwright - e2e__app_start({ env: 'local' });

// Run tests in headed mode for visual inspection
mcp__playwright - e2e__pw_run({ grep: 'pattern', headed: true });

// List available tests
mcp__playwright - e2e__pw_listTests({ grep: 'pattern' });
```

### MCP Visual Feedback Tools (New)

```typescript
// Extract element properties from live page
mcp__visual -
  feedback__extract_element_properties({
    screenshot_path: 'path/to/screenshot.png',
    locator: "button:has-text('Create')",
  });
// Returns: { found: true, visible: true, text: "Create Source Node", ... }

// Analyze page layout
mcp__visual -
  feedback__analyze_layout({
    screenshot_path: 'path/to/screenshot.png',
  });
// Returns: { elements: [...], spacing_issues: [], alignment_issues: [] }
```

### Playwright Test Planner Agent (for Visual Reconnaissance)

```typescript
// Navigate and inspect page
Task({
  subagent_type: 'playwright-test-planner',
  prompt: 'Navigate to /keimenon and list all interactive elements',
});
// Returns: List of elements with locators, screenshots, page structure
```

## Best Practices (Enhanced with Visual Verification)

1. **📸 Always perform visual reconnaissance**: Never generate tests from code analysis alone
2. **Follow existing patterns**: Study similar tests before generating
3. **Test isolation**: Always use worker-specific databases
4. **Realistic data**: Use Faker.js, not hardcoded "test123"
5. **Multiple scenarios**: Cover happy path + edge cases + errors
6. **Account types**: Generate separate tests for client and admin (with visual verification for each)
7. **Cleanup**: Always clean up test data in `afterEach`
8. **ARIA-first**: Use semantic locators verified in live browser
9. **Tags**: Apply @smoke for critical paths, @full for comprehensive
10. **Documentation**: Add visual evidence references in comments
11. **📸 Capture baselines**: After generating test, create screenshot baselines
12. **📸 Validate before commit**: Run generated test at least once to verify visual accuracy

## Success Metrics (Enhanced)

- Generated tests have **95%+ pass rate on first run** (up from previous baseline, thanks to visual verification)
- **100% of generated locators verified in live browser** (new metric)
- Tests follow all project conventions
- Coverage gaps identified by discoverer are filled
- Tests are maintainable and well-documented
- Multi-account scenarios are comprehensive
- **Visual evidence attached** to all generated tests
- **Baseline screenshots created** for visual regression testing

## Example Usage (with Visual Verification)

**User**: "Generate E2E tests for the groups batch operations endpoint"

**Skill Response (Enhanced)**:

1. Analyzes `POST /api/v1/groups/:id/members:batch` endpoint
2. Extracts Zod schema for request validation
3. Queries database for existing Group and node types
4. **📸 Launches browser and navigates to /groups page**
5. **📸 Captures screenshot of groups UI**
6. **📸 Inspects and verifies batch operation UI elements**:
   - "Add Members" button → Found ✅ (locator: `page.getByRole('button', { name: /add members/i })`)
   - Multi-select node picker → Found ✅ (locator: `page.getByLabel('Select nodes')`)
   - "Remove Members" button → Found ✅ (locator: `page.getByRole('button', { name: /remove members/i })`)
   - Batch operation form → Found ✅
7. **📸 Observes user flow in live app**:
   - Click group to select
   - Click "Add Members" button
   - Dialog opens with node picker
   - Multi-select nodes
   - Click "Add" to submit
   - Success toast appears
   - Members list updates
8. Generates test data: 1 group, 10 member nodes
9. Creates test spec with scenarios **and visual evidence**
10. Invokes Playwright Generator agent with **full visual context**
11. Enhances generated code with project patterns
12. **📸 Adds visual regression checks**
13. Saves to `tests/e2e/groups-batch-operations.spec.ts`
14. Runs validation checks **including visual alignment**
15. **📸 Captures baseline screenshots**
16. Returns success report **with visual evidence**

**Visual Evidence Delivered**:

- Screenshot of /groups page
- Screenshot of "Add Members" dialog
- Screenshot of success state
- 3 baseline screenshots for regression testing
- Visual context attached to generated test file

## Common Patterns (with Visual Verification)

### CRUD Test Structure (Visually Verified)

```typescript
describe('Resource CRUD', () => {
  // 📸 Before generating these tests, verify:
  // - Create button/form exists
  // - List view displays items
  // - Edit button/form exists
  // - Delete button/confirmation exists

  test('Create', () => {
    // Use verified locators from Phase 2.5
  });

  test('Read - Single', () => {
    // Verify detail view layout from screenshot
  });

  test('Read - List', () => {
    // Verify list layout from screenshot
  });

  test('Update', () => {
    // Use verified edit form locators
  });

  test('Delete', () => {
    // Use verified delete button locator
  });
});
```

### Multi-Tenant Test Structure (with Visual Isolation Verification)

```typescript
describe('Multi-Tenant Isolation', () => {
  // 📸 Visual verification performed for BOTH accounts
  // - Account A's view of data (screenshot A)
  // - Account B's view of data (screenshot B)
  // - Verified: Account B does NOT see Account A's data visually

  test.beforeEach(() => {
    // Create data in account A
  });

  test('Account B cannot read account A data', () => {
    // Visual + API verification
  });

  test('Account B cannot update account A data', () => {
    // Visual + API verification
  });

  test('Account B cannot delete account A data', () => {
    // Visual + API verification
  });
});
```

### Workflow Test Structure (with Visual Flow Observation)

```typescript
describe('Import Workflow', () => {
  // 📸 Entire workflow observed visually in Phase 2.5:
  // 1. File upload UI
  // 2. Progress bar/spinner
  // 3. SSE updates (visual feedback)
  // 4. Completion state
  // 5. Nodes appearing in keimenon

  test('End-to-end import flow', async () => {
    // 1. Upload file (verified file input exists)
    // 2. Monitor progress via SSE (verified progress UI exists)
    // 3. Verify nodes created (verified keimenon updates)
    // 4. Verify edges created (verified edge rendering)
    // 5. Verify organization (verified folder/group UI)
    // 📸 Capture each major state for baseline
  });
});
```

## Notes

- **📸 Visual reconnaissance is CRITICAL**: Prevents generating tests with invalid selectors
- Visual evidence stored in `.agent/test-generation/YYYY-MM-DD/`
- Baseline screenshots stored in `tests/e2e/__screenshots__/` (tracked in git)
- Generated tests include visual regression checks by default
- If UI doesn't exist for endpoint, tests are API-only (with warning)
- Visual verification adds ~2-3 minutes per endpoint (worth it for reliability)
- Servers must be running for visual reconnaissance (auto-started if needed)

## When to Use

As directed by workflows.

## When NOT to Use

Without decider approval.

## Inputs

Domain specific parameters.

## Outputs

Execution evidence.

## Safety Constraints

Do not violate local-first boundaries.

## Workflows that use it

Defined in registry.yml.
