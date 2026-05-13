---
name: autonomous-test-healer
description: Detects and fixes failing E2E tests using visual feedback. Analyzes failure screenshots, identifies root causes, applies fixes, and verifies stability.
allowed-tools: Read, Edit, Grep, mcp__playwright-e2e__pw_run, mcp__playwright-e2e__pw_lastFailures, mcp__playwright-e2e__artifacts_read, mcp__visual-feedback__compare_screenshots, mcp__keimenon-api-testing__test_endpoint
context: fork
agent: general-purpose
---

# Autonomous Test Healer (with Visual Feedback)

---**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):- **Context Consolidation**: Automatic, not optional (Section 13.0)- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)- **Full-Scope Traversal**: Address all layers (Section 13.3)- **Recursive Intelligence**: Enrich system with every run (Section 13.4)---

## Purpose

Automatically detects, analyzes, and fixes failing Playwright E2E tests using **visual feedback loops** combined with the Playwright Healer agent and project-specific knowledge from MCP servers. Implements Level 4 autonomy by iteratively diagnosing and repairing tests until they pass, using screenshots and visual evidence at every step.

**Visual Feedback Integration**: Following Anthropic's Agent SDK pattern, this skill uses visual verification to understand UI state, verify fixes, and ensure no regressions.

## Usage

Invoke this skill when you need to:

- Fix failing E2E tests after code changes
- Heal flaky tests that pass/fail intermittently
- Update tests after UI/API changes
- Resolve selector issues automatically (with visual confirmation)
- Restore test suite health
- Detect visual regressions in test fixes

## Tools Available

- **Read**: Read test files and implementation code
- **Edit**: Fix test code
- **Grep**: Search for similar patterns
- **Task (Playwright Healer Agent)**: Debug and fix tests with visual tools
- **MCP Playwright E2E**: Run tests, analyze failures, access screenshots
- **MCP Visual Feedback**: Screenshot comparison, layout analysis, visual regression detection
- **MCP API Testing**: Verify backend still works
- **MCP Database**: Check data state
- **MCP Docs**: Reference architectural decisions

## Workflow (Enhanced with Visual Feedback)

### Phase 1: Failure Detection (with Visual Capture)

1. **Run full test suite** via `mcp__playwright-e2e__pw_run({ grep: undefined })`

2. **Collect failure report with visual evidence**:

   ```json
   {
     "passed": 45,
     "failed": 8,
     "skipped": 2,
     "failures": [
       {
         "test": "Nodes CRUD - should create node",
         "file": "tests/e2e/nodes-crud.spec.ts:42",
         "error": "Timeout 30000ms exceeded waiting for selector",
         "selector": "button:has-text('Create')",
         "screenshot": "test-results/.../failure.png",
         "trace": "test-results/.../trace.zip"
       }
     ]
   }
   ```

3. **📸 Capture visual context for each failure**:

   ```typescript
   // For each failing test:
   const failures = (await mcp__playwright) - e2e__pw_lastFailures();

   for (const failure of failures.failures) {
     // Get screenshot from test artifacts
     const screenshotPath = failure.screenshot;

     // Read screenshot for visual analysis
     const screenshotData =
       (await mcp__playwright) -
       e2e__artifacts_read({
         path: screenshotPath,
         base64: true, // For visual inspection
       });

     // Store with failure data for analysis
     failure.visual_evidence = {
       screenshot_path: screenshotPath,
       screenshot_data: screenshotData,
       trace_path: failure.trace,
       captured_at: failure.timestamp,
     };
   }
   ```

4. **Prioritize failures by criticality**:
   - **Critical**: @smoke tagged tests (block deployment)
   - **High**: CRUD operations, auth flows
   - **Medium**: Settings, analytics
   - **Low**: Edge cases, admin-only features

5. **📸 Create visual failure inventory**:
   ```typescript
   const visualInventory = {
     total_failures: 8,
     with_screenshots: 8, // Should be 100%
     failure_screenshots: [
       { test: 'nodes-crud.spec.ts:42', path: '...' },
       // ... all failures with screenshot paths
     ],
   };
   ```

### Phase 2: Root Cause Analysis (with Visual Inspection)

For each failing test, perform **visual-first analysis**:

#### **A. Selector Issues (WITH VISUAL VERIFICATION)**

1. **Read test file**, extract failing selector

   ```typescript
   const testCode = await Read({ file_path: failedTest.file });
   const failingSelector = extractSelector(testCode, failedTest.line);
   ```

2. **📸 Analyze failure screenshot visually**:

   ```typescript
   // Get the failure screenshot
   const screenshot =
     (await mcp__playwright) -
     e2e__artifacts_read({
       path: failure.visual_evidence.screenshot_path,
       base64: true,
     });

   // VISUAL ANALYSIS QUESTIONS:
   // - Does the target element exist on the page?
   // - Is it visible to the user?
   // - What does it look like? (button, form, link)
   // - What text is actually displayed?
   // - Is it hidden, covered, or off-screen?
   ```

3. **Compare expected vs actual visual state**:

   ```typescript
   // Expected (from test code):
   const expectedElement = "button:has-text('Create')";

   // Actual (from visual inspection of screenshot):
   // 📸 Looking at screenshot, I see:
   // - Button exists at position (X, Y)
   // - Button text is "Add New" (NOT "Create")
   // - Button is visible and enabled
   // - Button has role="button"

   const visualAnalysis = {
     element_exists: true,
     element_visible: true,
     element_text_actual: 'Add New',
     element_text_expected: 'Create',
     mismatch_type: 'text_changed',
     confidence: 'high', // Based on clear visual evidence
   };
   ```

4. **📸 Use visual feedback service for detailed analysis**:

   ```typescript
   // Extract element properties from screenshot
   const elementProps =
     (await mcp__visual) -
     feedback__extract_element_properties({
       screenshot_path: failure.visual_evidence.screenshot_path,
       locator_attempted: failingSelector,
     });

   // Returns:
   // {
   //   found: true,
   //   visible: true,
   //   actual_text: "Add New",
   //   role: "button",
   //   color: "#007bff",
   //   size: { width: 120, height: 40 },
   //   position: { x: 850, y: 120 }
   // }
   ```

5. **Determine root cause with visual evidence**:
   ```typescript
   if (elementProps.found && elementProps.actual_text !== expectedText) {
     rootCause = {
       type: 'selector_text_mismatch',
       issue: `Button text changed from "${expectedText}" to "${elementProps.actual_text}"`,
       visual_proof: screenshot,
       confidence: 0.95,
     };
   } else if (!elementProps.found) {
     rootCause = {
       type: 'element_not_found',
       issue: 'Element does not exist in DOM at time of failure',
       visual_proof: screenshot,
       confidence: 0.9,
     };
   } else if (!elementProps.visible) {
     rootCause = {
       type: 'element_hidden',
       issue: 'Element exists but hidden (CSS display:none or visibility:hidden)',
       visual_proof: screenshot,
       confidence: 0.85,
     };
   }
   ```

#### **B. Timing Issues (with Visual State Tracking)**

1. Check if error mentions "timeout", "not visible", "detached"

2. **📸 Analyze visual state at failure time**:

   ```typescript
   // Look for visual indicators of loading/transition state
   const visualState = analyzeScreenshotForTimingIssues(screenshot);
   // - Is there a loading spinner visible?
   // - Is the page in a transition state?
   // - Are elements partially rendered?
   // - Is content still loading?
   ```

3. Analyze test for missing waits (network, animations, data loading)

4. **📸 Compare screenshots across multiple runs** (if available):

   ```typescript
   // Run test 3 times, capture screenshot at failure point each time
   // Compare to see if UI state is consistent or variable
   const stateConsistency =
     (await mcp__visual) -
     feedback__compare_screenshots({
       screenshots: [run1Screenshot, run2Screenshot, run3Screenshot],
       mode: 'consistency_check',
     });

   if (stateConsistency.similarity < 0.8) {
     rootCause.timing_flakiness = true;
     rootCause.issue += ' - UI state varies across runs (timing-dependent)';
   }
   ```

#### **C. Data Issues**

1. Query `keimenon-database` MCP for expected test data
2. Check if data setup in `beforeEach` is correct
3. Verify test isolation (worker database) is working
4. Look for leftover data from previous runs

#### **D. API Changes**

1. Use `keimenon-api-testing` MCP to verify endpoint still works
2. Check if request/response schema changed
3. Verify auth requirements didn't change
4. Look for new required fields

#### **E. Browser-Specific Issues**

1. Check which browser failed (Chromium, Firefox, WebKit)
2. **📸 Compare screenshots across browsers** (if multi-browser failure)
3. Look for browser-specific rendering differences
4. Check for timing differences between browsers

### Phase 3: Fix Strategy Selection (with Visual Evidence)

Based on root cause **with visual confirmation**, select appropriate fix:

#### **Selector Fix Strategies (Visually Verified)**

```typescript
// Example: Visual evidence shows button text changed

// ❌ Old (broken - from test code):
await page.click('button:has-text("Create")');

// ✅ New (based on VISUAL inspection of screenshot):
await page.getByRole('button', { name: /add new/i }).click();

// Why this fix?
// 📸 Screenshot shows:
//   - Button with text "Add New" at coordinates (850, 120)
//   - Button has role="button" (ARIA verified)
//   - Button is visible and enabled
//   - Using ARIA role selector is more robust

// Document the visual evidence:
// FIXED: Updated selector based on visual inspection of failure screenshot
// Visual evidence: test-results/nodes-crud-failure.png
// Button text changed: "Create" → "Add New"
// Fix applied: Use ARIA role selector with updated text pattern
```

#### **Timing Fix Strategies (with Visual Confirmation)**

```typescript
// Example: Visual evidence shows loading spinner at failure

// 📸 Screenshot analysis: Loading spinner visible at (960, 540)
// Indicates: API request still in progress when test expected completion

// Add explicit wait for API response:
await page.waitForResponse((resp) => resp.url().includes('/api/v1/nodes') && resp.status() === 200);

// Verify UI updated:
await expect(page.getByText('Success')).toBeVisible({ timeout: 10000 });
```

### Phase 4: Automated Fixing (with Visual Feedback Loop)

1. **📸 Capture "before" state**:

   ```typescript
   const beforeFix = {
     test_code: await Read({ file_path: testFile }),
     last_failure_screenshot: failure.visual_evidence.screenshot_path,
     failure_reason: rootCause.issue,
   };
   ```

2. **Invoke Playwright Healer agent with visual context**:
   ```typescript
   const healingResult = await Task({
     subagent_type: "playwright-test-healer",
     prompt: `Fix failing test: ${testFile}
   ```

📸 VISUAL CONTEXT:

- Failure screenshot: ${failure.visual_evidence.screenshot_path}
- Visual analysis: ${JSON.stringify(visualAnalysis, null, 2)}
- Element found: ${elementProps.found}
- Element visible: ${elementProps.visible}
- Actual text on screen: "${elementProps.actual_text}"
- Expected text in test: "${expectedText}"

ROOT CAUSE (with visual evidence):
${rootCause.issue}

SUGGESTED FIX (based on visual inspection):
${fixStrategy}

VISUAL VERIFICATION REQUIRED:

1. Apply the fix
2. Re-run the test
3. Capture screenshot at the fixed step
4. Verify the fix interacted with the CORRECT element visually
5. Compare before/after screenshots to ensure no regression

Use these tools:

- browser_snapshot: See current UI state
- browser_console_messages: Check for JS errors
- browser_network_requests: Verify API calls
- test_debug: Step through test execution

Apply the fix and re-run until passing.
Max iterations: 3
Provide visual evidence of success.
`
});

````

3. **📸 Capture "after" state**:
```typescript
// After fix applied and test re-run
const afterFix = {
  test_code_modified: await Read({ file_path: testFile }),
  test_passed: healingResult.success,
  success_screenshot: healingResult.screenshot_path,  // Screenshot of passing test
  iterations_required: healingResult.iterations
};
````

4. **📸 Visual verification of fix quality**:

   ```typescript
   // Compare before/after screenshots
   const visualComparison =
     (await mcp__visual) -
     feedback__compare_screenshots({
       baseline: beforeFix.last_failure_screenshot,
       current: afterFix.success_screenshot,
       threshold: 0.95,
     });

   // Verify fix didn't cause visual regression
   const regressionCheck =
     (await mcp__visual) -
     feedback__detect_visual_regression({
       baseline: beforeFix.last_failure_screenshot,
       current: afterFix.success_screenshot,
       threshold: 0.9,
     });

   if (regressionCheck.has_regression) {
     console.warn(`⚠️ Visual regression detected in fix:
       Severity: ${regressionCheck.severity}
       Affected areas: ${regressionCheck.details.map((d) => d.region).join(', ')}
   
       Fix may have unintended visual side effects.
       Review: ${regressionCheck.diff_image_path}
     `);
   }
   ```

5. **Document fix with visual evidence**:
   ```typescript
   const fixDocumentation = {
     test_file: testFile,
     root_cause: rootCause.issue,
     fix_applied: fixStrategy,
     visual_evidence: {
       before: beforeFix.last_failure_screenshot,
       after: afterFix.success_screenshot,
       diff: visualComparison.diff_image,
       regression_check: regressionCheck,
     },
     iterations: afterFix.iterations_required,
     confidence: visualComparison.similarity >= 0.95 ? 'high' : 'medium',
   };
   ```

### Phase 5: Verification (with Visual Stability)

1. **Run fixed test 10 times with visual capture**:

   ```typescript
   const stabilityTest = {
     runs: [],
     screenshots: [],
   };

   for (let i = 0; i < 10; i++) {
     const result = await runTest(testFile);
     stabilityTest.runs.push({
       passed: result.passed,
       duration: result.duration,
     });

     // Capture screenshot at critical step
     if (result.screenshot) {
       stabilityTest.screenshots.push(result.screenshot);
     }
   }
   ```

2. **Calculate pass rate AND visual stability**:

   ```typescript
   const passRate = (stabilityTest.runs.filter((r) => r.passed).length / 10) * 100;

   // 📸 Check visual consistency across all runs
   const visualStability =
     (await mcp__visual) -
     feedback__compare_screenshots({
       screenshots: stabilityTest.screenshots,
       mode: 'multi_compare',
     });

   const stabilityAnalysis = {
     pass_rate: passRate,
     visual_similarity_avg: visualStability.average_similarity,
     visual_variance: visualStability.variance,
     verdict: determineVerdict(passRate, visualStability),
   };

   function determineVerdict(passRate, visualStability) {
     if (passRate === 100 && visualStability.average_similarity >= 0.95) {
       return {
         status: 'fully_fixed',
         icon: '✅',
         message: 'Test passes consistently with stable visual state',
       };
     } else if (passRate >= 80 && visualStability.average_similarity >= 0.85) {
       return {
         status: 'improved_but_flaky',
         icon: '⚠️',
         message: 'Test mostly passes but visual state varies across runs',
       };
     } else {
       return {
         status: 'fix_insufficient',
         icon: '❌',
         message: 'Test still unreliable - try different fix strategy',
       };
     }
   }
   ```

3. **If flaky, analyze visual variance**:

   ```typescript
   if (stabilityAnalysis.verdict.status === 'improved_but_flaky') {
     // Find which screenshots differ most
     const outliers = visualStability.outlier_runs;

     console.log(`📸 Visual flakiness detected:
       - ${outliers.length} runs show different visual state
       - Avg similarity: ${visualStability.average_similarity}
       - Variance: ${visualStability.variance}
   
       Likely causes:
       - Timing-dependent UI state (animations, loading)
       - Random data affecting layout
       - Browser rendering inconsistencies
   
       Suggested fixes:
       - Add waitForLoadState('domcontentloaded')
       - Wait for specific UI state before interaction
       - Use deterministic test data
     `);

     // Apply additional stability fixes
     await applyStabilityFixes(testFile, outliers);
   }
   ```

### Phase 6: Regression Prevention (with Visual Baseline)

1. **Add test improvement markers with visual references**:

   ```typescript
   // FIXED: Changed selector from text to ARIA role (2025-11-01)
   // Previously: await page.click('button:has-text("Create")')
   // Issue: Text changed from "Create" to "Add New"
   // Visual evidence: test-results/nodes-crud-failure.png
   // Verified fix: test-results/nodes-crud-success.png
   await page.getByRole('button', { name: /add new/i }).click();
   ```

2. **Create visual regression baseline**:

   ```typescript
   // After successful fix, capture baseline screenshot
   await expect(page).toHaveScreenshot('nodes-crud-create-button.png');

   // This baseline will be used in future runs to detect unintended changes
   // Stored in: tests/e2e/__screenshots__/nodes-crud-create-button.png
   ```

3. **Update test documentation with visual evidence**:
   ```typescript
   /**
    * Test: Create Source Node
    * Related: apps/api/src/routes/nodes.ts:POST /api/v1/nodes
    * Last healed: 2025-11-01
    * Visual baseline: tests/e2e/__screenshots__/nodes-crud-create-button.png
    *
    * Common issues:
    * - Selector breaks when button text changes
    *   Fix: Use ARIA role selector (resilient to text changes)
    *   Visual proof: test-results/healing-session-2025-11-01/
    *
    * - Needs network idle wait for API response
    *   Fix: waitForResponse for /api/v1/nodes endpoint
    *
    * - WebKit requires explicit form submission
    *   Fix: press('Enter') instead of click('Submit')
    */
   ```

### Phase 7: Reporting (with Visual Evidence Gallery)

Generate detailed fix report **with visual evidence**:

```json
{
  "healing_session": {
    "timestamp": "2025-11-01T12:00:00Z",
    "total_failures": 8,
    "fixed": 6,
    "still_failing": 2,
    "duration_minutes": 15,
    "visual_evidence_dir": ".agent/healing-sessions/2025-11-01-120000/"
  },
  "fixes_applied": [
    {
      "test": "nodes-crud.spec.ts:Create node",
      "root_cause": "Selector outdated (button text changed)",
      "fix": "Changed to ARIA role selector",
      "iterations": 1,
      "pass_rate_after": 100,
      "visual_stability": 0.98,
      "status": "fully_fixed",
      "visual_evidence": {
        "before": "nodes-crud-before.png",
        "after": "nodes-crud-after.png",
        "diff": "nodes-crud-diff.png",
        "baseline_created": "nodes-crud-baseline.png"
      }
    },
    {
      "test": "import-workflow.spec.ts:Upload and process",
      "root_cause": "Timing issue (SSE connection not established)",
      "fix": "Added waitForResponse for SSE endpoint",
      "iterations": 2,
      "pass_rate_after": 90,
      "visual_stability": 0.87,
      "status": "improved_but_flaky",
      "visual_evidence": {
        "before": "import-workflow-before.png",
        "after": "import-workflow-after.png",
        "variance_screenshots": ["run1.png", "run5.png", "run8.png"],
        "note": "Visual state varies slightly due to async SSE updates"
      }
    }
  ],
  "still_failing": [
    {
      "test": "settings-inheritance.spec.ts:Multi-scope resolution",
      "attempts": 3,
      "last_error": "Backend API changed - new field required",
      "visual_evidence": {
        "all_attempts": ["attempt1.png", "attempt2.png", "attempt3.png"],
        "issue": "API returns 400 Bad Request - not a UI issue"
      },
      "recommended_action": "Update test data schema, may need manual intervention"
    }
  ],
  "visual_analysis_summary": {
    "screenshots_captured": 47,
    "visual_regressions_detected": 0,
    "baseline_screenshots_created": 6,
    "visual_comparisons_performed": 23,
    "average_fix_confidence": 0.94
  },
  "recommendations": [
    "Consider adding data-testid attributes for frequently broken selectors",
    "Review API versioning strategy to prevent schema breaking changes",
    "Increase WebKit timeout for form submissions (known slow)",
    "📸 Visual baselines created - enable visual regression testing in CI"
  ]
}
```

**Visual Evidence Gallery** (HTML report):

```html
<!-- Generated at: .agent/healing-sessions/2025-11-01-120000/report.html -->
<div class="healing-report">
  <h2>Healing Session: 2025-11-01 12:00:00</h2>

  <div class="fix" id="fix-1">
    <h3>✅ nodes-crud.spec.ts:Create node</h3>
    <p><strong>Root Cause:</strong> Selector outdated (button text changed)</p>
    <p><strong>Fix:</strong> Changed to ARIA role selector</p>

    <div class="visual-evidence">
      <div class="screenshot">
        <img src="nodes-crud-before.png" />
        <caption>
          Before: Button not found
        </caption>
      </div>
      <div class="screenshot">
        <img src="nodes-crud-diff.png" />
        <caption>
          Diff: Text changed "Create" → "Add New"
        </caption>
      </div>
      <div class="screenshot">
        <img src="nodes-crud-after.png" />
        <caption>
          After: Test passed ✅
        </caption>
      </div>
    </div>

    <details>
      <summary>View Code Changes</summary>
      <pre><code>
// Before:
await page.click('button:has-text("Create")');

// After:
await page.getByRole('button', { name: /add new/i }).click();
      </code></pre>
    </details>
  </div>

  <!-- More fixes... -->
</div>
```

## Integration with Other Skills

- **autonomous-test-discoverer**: Runs healer on newly discovered gaps
- **autonomous-test-generator**: Heals generated tests before committing (with visual verification)
- **continuous-test-maintainer**: Scheduled healing runs with visual regression checks
- **pipeline-verifier**: Validates fixes didn't break other tests (visual comparison)

## Visual Feedback Tools Reference

### MCP Playwright E2E Tools

```typescript
// Get failure information with screenshot paths
mcp__playwright - e2e__pw_lastFailures();
// Returns: { failures: [{ screenshot: "path", trace: "path", ... }] }

// Read screenshot artifact
mcp__playwright - e2e__artifacts_read({ path: 'test-results/.../screenshot.png', base64: true });

// List all screenshots
mcp__playwright - e2e__artifacts_list({ kind: 'screenshot' });
```

### MCP Visual Feedback Tools (New)

```typescript
// Compare two screenshots
mcp__visual -
  feedback__compare_screenshots({
    baseline: 'path/to/before.png',
    current: 'path/to/after.png',
    threshold: 0.95,
  });
// Returns: { similarity: 0.97, diff_regions: [], diff_image: "path/to/diff.png" }

// Analyze layout from screenshot
mcp__visual -
  feedback__analyze_layout({
    screenshot_path: 'path/to/screenshot.png',
  });
// Returns: { elements: [...], spacing_issues: [], alignment_issues: [] }

// Detect visual regression
mcp__visual -
  feedback__detect_visual_regression({
    baseline: 'path/to/baseline.png',
    current: 'path/to/current.png',
    threshold: 0.9,
  });
// Returns: { has_regression: false, severity: "none", details: [] }

// Extract element properties from screenshot
mcp__visual -
  feedback__extract_element_properties({
    screenshot_path: 'path/to/screenshot.png',
    locator: "button:has-text('Create')",
  });
// Returns: { found: true, visible: true, text: "Add New", color: "#007bff", ... }
```

### Playwright Test Healer Agent Tools

```typescript
// Live browser snapshot (during debugging)
mcp__playwright - test__browser_snapshot();

// Generate locator from live page
mcp__playwright - test__browser_generate_locator({ selector: '...' });

// Evaluate in browser context
mcp__playwright - test__browser_evaluate({ expression: '...' });
```

## Common Failure Patterns (with Visual Evidence)

### Pattern 1: Button Text Changed

**Before**: `await page.click('button:has-text("Create")')`
**After**: `await page.getByRole('button', { name: /create/i }).click()`
**Prevention**: Always use ARIA roles, not text
**📸 Visual Signature**: Screenshot shows button with different text than expected

### Pattern 2: Element Hidden by Modal

**Visual Evidence**: Screenshot shows target element exists but is covered by a modal/overlay
**Fix**: Close modal first, then interact with element

```typescript
await page.getByRole('button', { name: /close/i }).click();
await page.waitForSelector('.modal', { state: 'hidden' });
await page.getByRole('button', { name: /create/i }).click();
```

### Pattern 3: Timing Race Condition

**Visual Evidence**: Screenshot shows loading spinner or partial content
**Fix**: Wait for complete UI state before interaction

```typescript
await page.waitForResponse((resp) => resp.url().includes('/api/v1/nodes'));
await expect(page.getByTestId('loading')).not.toBeVisible();
await page.getByRole('button', { name: /create/i }).click();
```

### Pattern 4: Element Off-Screen

**Visual Evidence**: Screenshot doesn't show target element (scrolled out of view)
**Fix**: Scroll element into view before interaction

```typescript
await page.getByRole('button', { name: /create/i }).scrollIntoViewIfNeeded();
await page.getByRole('button', { name: /create/i }).click();
```

### Pattern 5: Visual Regression from Fix

**Visual Evidence**: Before/after screenshots show layout shift or styling issue
**Fix**: Revise fix to preserve layout, or flag as acceptable change

```typescript
// If fix causes visual regression, document it:
// FIXED: Selector updated (button text changed)
// NOTE: This fix causes minor layout shift (acceptable)
// Visual diff: healing-sessions/2025-11-01/nodes-crud-diff.png
```

## Best Practices (Enhanced with Visual Feedback)

1. **Iterate carefully**: Fix one issue at a time, capture screenshots at each iteration
2. **Preserve intent**: Don't change what test validates, verify visually that behavior is preserved
3. **Document fixes**: Add comments with screenshot references
4. **Verify stability**: Run 10x with visual consistency check
5. **Learn patterns**: Track common issues with visual signatures
6. **Escalate when stuck**: If 3 visual-confirmed attempts fail, mark for manual review
7. **Update docs**: Include visual baselines in documentation
8. **Regression tests**: Create visual regression tests for common breakages
9. **📸 Always verify visually**: Don't trust pass/fail alone - inspect screenshots
10. **📸 Create baselines**: After successful fix, capture baseline for future regression detection

## Success Metrics (Enhanced)

- Fix success rate > **90%** (up from 75%, with visual feedback)
- Fixed tests have 100% pass rate over 10 runs
- **Visual stability > 95%** across runs (new metric)
- Average fix time < 2 minutes per test
- Zero fixes cause visual regressions (detected and flagged)
- **Visual evidence** attached to 100% of healing sessions
- Documentation updated for all non-trivial fixes (with screenshot refs)

## Example Usage (with Visual Feedback)

**User**: "The E2E tests are failing after I updated the button text. Can you fix them?"

**Skill Response (Enhanced)**:

1. Runs test suite, finds 3 failures
2. **📸 Captures failure screenshots for all 3 tests**
3. **📸 Visually analyzes each failure**:
   - Test A: Screenshot shows button text "Create Node" (expected "Create")
   - Test B: Screenshot shows button text "Save Changes" (expected "Save")
   - Test C: Screenshot shows button text "Remove" (expected "Delete")
4. Identifies pattern: All selector failures due to text changes **(confirmed visually)**
5. Applies fix strategy: Convert all to ARIA role selectors
6. **📸 Captures success screenshots after each fix**
7. **📸 Compares before/after to verify no regressions**
8. Verifies fixes with 10x runs: 100% pass rate, 98% visual similarity
9. **📸 Creates visual baselines for future regression detection**
10. Updates all 3 test files with documented fixes (including screenshot paths)
11. **Generates HTML report with visual evidence gallery**
12. Returns success report with visual proof

**Visual Evidence Delivered**:

- 3 failure screenshots (before)
- 3 success screenshots (after)
- 3 diff images (before vs after)
- 3 baseline screenshots (for regression testing)
- 1 HTML report with visual gallery
- Total: 13 visual artifacts for audit trail

## Emergency Protocols (Enhanced)

### If Healing Fails Repeatedly (with Visual Evidence)

1. Mark test with `test.fixme()` and add explanation **with screenshot reference**:

   ```typescript
   test.fixme('Create node - BLOCKED by API schema change', async ({ page }) => {
     // FIXME: Backend changed required fields, need coordination
     // Issue: https://github.com/org/repo/issues/123
     // Expected fix: 2025-11-05
     // 📸 Visual evidence: healing-sessions/2025-11-01/nodes-crud-attempts.png
     // Shows: API returns 400 Bad Request (not a UI issue)
   });
   ```

2. Create GitHub issue with **full visual context**
3. **Attach screenshot gallery** to issue
4. Notify team via configured channel
5. Continue healing other tests

### If All Tests Fail

1. Check if servers are running
2. Check database state
3. **📸 Capture screenshot of app in current state**
4. Check for breaking changes in dependencies
5. Roll back if necessary, investigate offline

## Notes

- Healing runs automatically on CI failure
- Local healing available via: `claude skill:autonomous-test-healer`
- Healing history tracked in `.agent/healing-history.json`
- **📸 Visual evidence stored in** `.agent/healing-sessions/YYYY-MM-DD-HHMMSS/`
- Monthly healing reports generated for trend analysis **(with visual summaries)**
- **Visual baselines** stored in `tests/e2e/__screenshots__/` (tracked in git)
- **Visual regression testing** enabled by default after healing session

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
