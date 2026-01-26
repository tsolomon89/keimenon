---
name: autonomous-test-discoverer
description: Discovers testable endpoints and user flows, analyzes E2E coverage, generates coverage matrix. Use when assessing test coverage or planning test implementation.
allowed-tools: Read, Glob, Grep, mcp__canvas-database__query_nodes, mcp__canvas-docs__search_docs, mcp__playwright-e2e__pw_listTests
context: fork
agent: Explore
---

# Autonomous Test Discoverer

---**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):- **Context Consolidation**: Automatic, not optional (Section 13.0)- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)- **Full-Scope Traversal**: Address all layers (Section 13.3)- **Recursive Intelligence**: Enrich system with every run (Section 13.4)---

## Purpose

Automatically discovers all testable endpoints and user flows in the Canvas Memory OS application, analyzes existing E2E test coverage, and generates a comprehensive coverage matrix identifying gaps that need test implementation.

## Usage

Invoke this skill when you need to:

- Assess current E2E test coverage
- Identify untested endpoints and flows
- Prioritize test implementation efforts
- Generate a test roadmap
- Audit testing completeness

## Tools Available

- **Read**: Read API route files and test files
- **Glob**: Find all route and test files
- **Grep**: Search for patterns in code
- **MCP Database**: Query node/edge types for data-driven tests
- **MCP Docs**: Search documentation for feature specifications
- **MCP API Testing**: Test endpoint accessibility

## Workflow

### Phase 1: API Surface Discovery

1. Scan `apps/api/src/routes/**/*.ts` for all route definitions
2. Extract:
   - HTTP method (GET, POST, PUT, DELETE, PATCH)
   - Route path (e.g., `/api/v1/nodes/:id`)
   - Auth requirements (from middleware)
   - Request/response schemas (Zod validators)
   - RBAC permission levels
3. Categorize by resource type (nodes, edges, users, accounts, jobs, settings, groups, import)

### Phase 2: Frontend Flow Discovery (Static Analysis)

1. Scan `apps/web/src/components/**/*.tsx` for user-facing components
2. Identify interactive elements:
   - Buttons with onClick handlers
   - Forms with onSubmit handlers
   - Links and navigation
   - Modal triggers
   - API calls (useQuery, useMutation)
3. Map components to API endpoints they call

### Phase 2.5: Visual Crawling & UI Reconnaissance 📸 (NEW)

**Purpose**: Visually inspect the running application to discover UI elements and workflows that may not be obvious from static code analysis.

#### Setup

1. Launch test application using MCP Playwright server:
   ```typescript
   (await mcp__playwright) - e2e__app_start({ env: 'local' });
   ```
2. Wait for servers to be ready (web on :3000, API on :4001)
3. Create browser context with default viewport (1920x1080)

#### Crawl Strategy

For each major page/route, perform visual reconnaissance:

**Pages to Crawl**:

- `/` - Landing/home page
- `/login` - Authentication
- `/canvas` - Main workspace/dashboard
- `/settings` - User settings
- `/settings/account` - Account settings
- `/settings/crm` - CRM dashboard (admin only)
- `/groups` - Groups management
- `/import` - Import workflows
- `/jobs` - Background jobs

#### Per-Page Visual Inspection

For each page, use the **Playwright Test Planner** subagent to:

1. **Navigate & Capture**:

   ```typescript
   await page.goto(pageUrl);
   await page.waitForLoadState('networkidle');

   // Capture full-page screenshot
   const screenshotPath = `visual-crawl/${pageName}-full.png`;
   await page.screenshot({ path: screenshotPath, fullPage: true });
   ```

2. **Extract UI Element Inventory**:

   ```typescript
   // Find all interactive elements
   const buttons = await page.locator('button, [role="button"]').all();
   const links = await page.locator('a[href]').all();
   const forms = await page.locator('form').all();
   const inputs = await page.locator('input, textarea, select').all();

   // For each element, capture:
   const uiInventory = [];
   for (const button of buttons) {
     const text = await button.textContent();
     const ariaLabel = await button.getAttribute('aria-label');
     const dataTestId = await button.getAttribute('data-testid');
     const bbox = await button.boundingBox();

     uiInventory.push({
       type: 'button',
       text: text?.trim(),
       ariaLabel,
       dataTestId,
       locator: generateRobustLocator(button), // e.g., "getByRole('button', { name: /create/i })"
       position: bbox ? { x: bbox.x, y: bbox.y } : null,
       visible: await button.isVisible(),
       enabled: await button.isEnabled(),
     });
   }
   ```

3. **Map to API Endpoints**:

   ```typescript
   // Listen to network requests while interacting
   const apiCalls = [];
   page.on('request', (request) => {
     if (request.url().includes('/api/')) {
       apiCalls.push({
         method: request.method(),
         url: request.url(),
         timestamp: Date.now(),
       });
     }
   });

   // Click each button and observe API calls
   for (const button of buttons) {
     const beforeCount = apiCalls.length;
     try {
       await button.click({ timeout: 2000 });
       await page.waitForTimeout(500); // Wait for API calls

       // New API calls since click
       const newCalls = apiCalls.slice(beforeCount);
       if (newCalls.length > 0) {
         button.triggersEndpoints = newCalls.map((c) => `${c.method} ${c.url}`);
       }
     } catch (e) {
       // Button might open modal or navigate - that's fine
     }
   }
   ```

4. **Identify Hidden Flows**:
   - Hover menus (`:hover` states)
   - Context menus (right-click)
   - Keyboard shortcuts (data-kbd attributes)
   - Conditional UI (admin-only, permission-gated)

5. **Capture Modal Dialogs**:

   ```typescript
   // For each button that might open a modal
   for (const button of createButtons) {
     await button.click();

     // Wait for dialog
     const dialog = page.locator('[role="dialog"]');
     if (await dialog.isVisible()) {
       // Capture modal screenshot
       await dialog.screenshot({ path: `visual-crawl/${pageName}-modal-${buttonText}.png` });

       // Inventory modal fields
       const modalInputs = await dialog.locator('input').all();
       const modalButtons = await dialog.locator('button').all();

       // Close modal
       await page.keyboard.press('Escape');
     }
   }
   ```

#### Visual Output Structure

```typescript
interface VisualCrawlResult {
  page: string;
  url: string;
  screenshot: string; // Path to full-page screenshot
  timestamp: string;
  uiElements: {
    buttons: UIElement[];
    links: UIElement[];
    forms: FormElement[];
    inputs: InputElement[];
    modals: ModalElement[];
  };
  apiEndpoints: {
    discovered: string[]; // Endpoints called during crawl
    mapped: { element: string; endpoint: string }[]; // Element → Endpoint mapping
  };
  visualFeatures: {
    navigationMenu: boolean;
    sidebar: boolean;
    searchBar: boolean;
    userProfile: boolean;
    notifications: boolean;
  };
}
```

#### Account Type Coverage

Crawl as **both** account types:

1. **Client Account** (`client@test.com`):
   - Normal user flows
   - Limited permissions
   - Standard UI elements

2. **Admin Account** (`admin@admin.com`):
   - Admin-specific pages (CRM, analytics)
   - Additional controls
   - Admin-only endpoints

Save separate visual inventories:

- `visual-crawl-client.json`
- `visual-crawl-admin.json`

#### Visual Coverage Metrics

Calculate:

- **Page coverage**: % of routes visually inspected
- **Element coverage**: % of discovered UI elements with test locators
- **Endpoint mapping**: % of API calls linked to UI triggers
- **Screenshot completeness**: All major pages captured

#### Integration with Static Analysis

Merge visual discoveries with Phase 2 static analysis:

```typescript
{
  "endpoint": "POST /api/v1/nodes",
  "discovered_by": ["static_analysis", "visual_crawl"],
  "ui_triggers": [
    {
      "component": "NodeCreateButton.tsx", // From static
      "locator": "getByRole('button', { name: /create node/i })", // From visual
      "page": "/canvas",
      "screenshot": "visual-crawl/canvas-full.png"
    }
  ]
}
```

#### Benefits of Visual Crawling

1. **Discovers dynamic content**: Elements loaded via JavaScript
2. **Validates locators**: Confirms elements actually exist in browser
3. **Finds hidden flows**: Hover menus, modals, conditional UI
4. **Screenshot evidence**: Visual proof of UI state
5. **Cross-reference**: Validates static analysis findings
6. **Account-specific UI**: Admin vs client differences

### Phase 3: Existing Test Analysis

1. Scan `tests/e2e/**/*.spec.ts` for all test files
2. Extract test coverage:
   - Which endpoints are tested
   - Which user flows are covered
   - Test tags (@smoke, @full, @skip)
   - Browser coverage (Chromium, Firefox, WebKit)
3. Analyze test patterns and quality

### Phase 4: Coverage Gap Analysis

1. Compare API endpoints vs. tested endpoints
2. Identify:
   - **Critical gaps**: Auth, CRUD operations, multi-tenant isolation
   - **High priority**: Data management, import pipeline, settings
   - **Medium priority**: Analytics, exports, advanced features
   - **Low priority**: Admin-only features, deprecated endpoints
3. Calculate coverage percentage by category

### Phase 5: Test Priority Matrix

Generate a prioritized list considering:

- **Business criticality**: Auth > CRUD > Features > Admin
- **User impact**: High-traffic flows first
- **Risk level**: Security, data integrity, multi-tenancy
- **Complexity**: Simple CRUD before complex workflows
- **Account types**: Client account tests before admin tests

### Phase 6: Test Roadmap Generation

Output a structured report:

```markdown
# E2E Test Coverage Report

Generated: YYYY-MM-DD

## Executive Summary

- Total API Endpoints: X
- Tested Endpoints: Y (Z%)
- Coverage by Category:
  - Authentication: 90%
  - Nodes CRUD: 75%
  - Edges CRUD: 60%
  - Users/Accounts: 80%
  - Import Pipeline: 85%
  - Settings: 50%
  - Jobs: 70%
  - Groups: 40%

## Critical Gaps (Must Fix)

1. **Multi-tenant isolation** - No tests verify account A cannot access account B data
2. **Settings inheritance** - No tests for multi-scope resolution
3. **CRM operating context** - No tests for admin managing client accounts

## High Priority Gaps

1. **Group batch operations** - POST /groups/:id/members:batch not tested
2. **Job pause/resume** - State transitions not covered
3. **Import progress SSE** - Real-time updates not verified

## Test Roadmap

### Sprint 1: Critical Security & Data Integrity

- [ ] Multi-tenant isolation tests (2 days)
- [ ] RBAC enforcement tests (1 day)
- [ ] Data validation tests (1 day)

### Sprint 2: Core CRUD Operations

- [ ] Complete nodes CRUD for all types (3 days)
- [ ] Complete edges CRUD for all types (2 days)
- [ ] User/account management (2 days)

### Sprint 3: Complex Workflows

- [ ] Full import pipeline end-to-end (3 days)
- [ ] Job lifecycle (create → run → pause → resume → complete) (2 days)
- [ ] Settings inheritance and overrides (2 days)

## Detailed Endpoint Inventory

[Table with: Endpoint, Method, Tested, Priority, Account Type, Notes]
```

## Output Format

Return a JSON object with:

```json
{
  "summary": {
    "total_endpoints": 45,
    "tested_endpoints": 32,
    "coverage_percentage": 71.1,
    "last_updated": "2025-10-31T12:00:00Z",
    "visual_crawl_completed": true,
    "pages_crawled": 9,
    "ui_elements_discovered": 156
  },
  "by_category": {
    "auth": { "total": 7, "tested": 6, "coverage": 85.7 },
    "nodes": { "total": 8, "tested": 6, "coverage": 75.0 },
    "edges": { "total": 5, "tested": 3, "coverage": 60.0 },
    "users": { "total": 4, "tested": 3, "coverage": 75.0 },
    "accounts": { "total": 6, "tested": 5, "coverage": 83.3 },
    "import": { "total": 2, "tested": 2, "coverage": 100.0 },
    "jobs": { "total": 7, "tested": 5, "coverage": 71.4 },
    "settings": { "total": 5, "tested": 2, "coverage": 40.0 },
    "groups": { "total": 8, "tested": 3, "coverage": 37.5 }
  },
  "visual_coverage": {
    "pages_analyzed": [
      {
        "page": "/canvas",
        "screenshot": "visual-crawl/canvas-full.png",
        "ui_elements_count": 42,
        "api_calls_observed": 8,
        "tested_elements": 35,
        "untested_elements": 7,
        "coverage_percentage": 83.3
      },
      {
        "page": "/settings",
        "screenshot": "visual-crawl/settings-full.png",
        "ui_elements_count": 28,
        "api_calls_observed": 5,
        "tested_elements": 18,
        "untested_elements": 10,
        "coverage_percentage": 64.3
      }
    ],
    "ui_element_inventory": [
      {
        "type": "button",
        "text": "Create Node",
        "locator": "page.getByRole('button', { name: /create node/i })",
        "page": "/canvas",
        "triggers_endpoint": "POST /api/v1/nodes",
        "has_test": true,
        "test_file": "tests/e2e/nodes/create-node.spec.ts",
        "screenshot": "visual-crawl/canvas-full.png",
        "position": { "x": 850, "y": 120 }
      },
      {
        "type": "button",
        "text": "Batch Add Members",
        "locator": "page.getByRole('button', { name: /batch add/i })",
        "page": "/groups",
        "triggers_endpoint": "POST /api/v1/groups/:id/members:batch",
        "has_test": false,
        "screenshot": "visual-crawl/groups-full.png",
        "position": { "x": 720, "y": 340 }
      }
    ],
    "account_specific_ui": {
      "client_only": [{ "element": "Import Chat History", "page": "/import" }],
      "admin_only": [
        { "element": "CRM Dashboard", "page": "/settings/crm" },
        { "element": "Switch Account", "page": "/settings" }
      ],
      "shared": [
        { "element": "Canvas Workspace", "page": "/canvas" },
        { "element": "User Settings", "page": "/settings" }
      ]
    }
  },
  "untested_endpoints": [
    {
      "path": "/api/v1/groups/:id/members:batch",
      "method": "POST",
      "category": "groups",
      "priority": "high",
      "reason": "Batch operations are critical for UX",
      "discovered_by": "visual_crawl",
      "ui_trigger": {
        "locator": "page.getByRole('button', { name: /batch add/i })",
        "page": "/groups",
        "screenshot": "visual-crawl/groups-full.png"
      }
    }
  ],
  "untested_flows": [
    {
      "flow": "Admin CRM: Manage Client Account",
      "components": ["CRMDashboard", "AccountSwitcher"],
      "endpoints": ["/api/v1/auth/switch-account", "/api/v1/admin/accounts"],
      "priority": "critical",
      "reason": "Multi-tenant security boundary",
      "discovered_by": ["static_analysis", "visual_crawl"],
      "visual_evidence": {
        "screenshots": ["visual-crawl/settings-crm-full.png"],
        "ui_elements": [
          {
            "element": "Switch Account Button",
            "locator": "page.getByRole('button', { name: /switch account/i })",
            "visible_to": ["admin"]
          }
        ]
      }
    }
  ],
  "untested_visual_elements": [
    {
      "element": "Context Menu: Delete Multiple",
      "type": "contextmenu",
      "page": "/canvas",
      "trigger": "right-click on selected nodes",
      "endpoints": ["DELETE /api/v1/nodes:batch"],
      "priority": "medium",
      "reason": "Power user feature, not discoverable from static analysis",
      "screenshot": "visual-crawl/canvas-contextmenu.png"
    }
  ],
  "test_roadmap": [
    {
      "sprint": 1,
      "focus": "Critical Security & Data Integrity",
      "tasks": [
        {
          "task": "Multi-tenant isolation tests",
          "duration": "2 days",
          "endpoints": ["/api/v1/auth/switch-account"],
          "visual_reference": "visual-crawl/settings-crm-full.png"
        }
      ]
    }
  ]
}
```

## Example Usage

**User**: "Analyze our E2E test coverage and tell me what's missing"

**Skill Response**:

1. Scans all 45 API endpoints across 9 route files
2. Analyzes 18 existing E2E test files
3. Discovers 13 untested endpoints (28.9% gap)
4. Identifies 5 critical gaps requiring immediate attention
5. Generates prioritized test roadmap with 3 sprints
6. Returns comprehensive JSON report + markdown summary

**User**: "What tests do we need for admin account functionality?"

**Skill Response**:

1. Filters endpoints by account_type === 'admin'
2. Finds 12 admin-specific endpoints
3. Checks existing tests tagged with @admin
4. Identifies 7 untested admin endpoints
5. Prioritizes by: security > CRM > analytics > settings
6. Returns focused roadmap for admin testing

## Integration with Other Skills

- **mcp-integration-expert**: Uses MCP servers to validate endpoint accessibility
- **e2e-test-generator**: Passes untested endpoints to generate new tests
- **pipeline-verifier**: Validates that generated tests actually cover the gaps
- **autonomous-test-runner**: Orchestrates the discover → generate → test → verify cycle

## Best Practices

1. **Run regularly**: Execute after every major feature addition
2. **Track trends**: Compare coverage over time
3. **Automate**: Integrate into CI/CD to prevent coverage regressions
4. **Prioritize wisely**: Focus on business-critical paths first
5. **Update tests**: When endpoints change, mark tests for healing

## Success Metrics

- Coverage percentage > 90% for critical endpoints
- All CRUD operations tested for each resource
- Multi-tenant isolation verified
- Auth flows 100% covered
- No high-priority gaps older than 1 sprint

## Notes

- Account types (client vs admin) must both be tested
- Test isolation (worker databases) ensures parallel execution
- Tags (@smoke, @full) enable subset testing
- Cross-browser coverage (Chromium, Firefox, WebKit) required
