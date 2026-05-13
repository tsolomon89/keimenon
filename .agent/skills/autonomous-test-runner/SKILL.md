---
name: autonomous-test-runner
description: Master orchestrator for autonomous testing lifecycle. Coordinates discovery, generation, execution, and healing to achieve target coverage with minimal human intervention.
allowed-tools: Read, Write, Edit, Glob, Grep, Task, mcp__playwright-e2e__pw_run, mcp__playwright-e2e__pw_listTests, mcp__keimenon-database__get_stats
context: fork
agent: general-purpose
---

# Autonomous Test Runner

---**Operational Ethos Compliance:** This skill operates under the principles defined in [CLAUDE.md Section 13](../../CLAUDE.md#13-operational-ethos--recursive-intelligence):- **Context Consolidation**: Automatic, not optional (Section 13.0)- **Professional Standards**: Security, testing, documentation mandatory (Section 13.1)- **Anticipatory Design**: Think 3 steps ahead (Section 13.2)- **Full-Scope Traversal**: Address all layers (Section 13.3)- **Recursive Intelligence**: Enrich system with every run (Section 13.4)---

## Purpose

Master orchestrator for Level 4 autonomous testing. Coordinates the full testing lifecycle: discover coverage gaps → generate missing tests → execute all tests → heal failures → verify coverage → repeat. Operates with minimal human intervention, requiring only initial scope and approval.

## Usage

Invoke this skill when you need to:

- Achieve 100% E2E test coverage automatically
- Maintain test suite health continuously
- Validate new features end-to-end
- Ensure deployment readiness
- Generate comprehensive test reports

## Tools Available

- **Task**: Invoke specialized skills
  - `autonomous-test-discoverer`
  - `autonomous-test-generator`
  - `autonomous-test-healer`
  - `pipeline-verifier`
- **MCP Playwright E2E**: Execute tests, analyze results
- **MCP API Testing**: Validate backend
- **MCP Database**: Check data integrity
- **MCP Docs**: Reference specifications
- **Read/Write/Edit**: Manage test files and reports

## Workflow

### Phase 1: Initialization

1. **User provides scope**:

   ```
   User: "Run autonomous testing for the entire application"
   OR
   User: "Run autonomous testing for the import pipeline only"
   OR
   User: "Fix and improve all failing tests"
   ```

2. **Parse scope** into targets:
   - **Full**: All endpoints, all flows, all account types
   - **Module**: Specific feature area (auth, import, settings, etc.)
   - **Heal-only**: Fix existing tests, don't generate new ones
   - **Coverage-driven**: Focus on gaps until X% coverage achieved

3. **Set execution parameters**:
   ```json
   {
     "scope": "full",
     "target_coverage": 95,
     "max_iterations": 5,
     "auto_commit": false,
     "notification_channel": "console",
     "browsers": ["chromium", "firefox", "webkit"],
     "parallel_workers": 2,
     "smoke_only": false
   }
   ```

### Phase 2: Discovery (Iteration Start)

1. **Invoke autonomous-test-discoverer**:

   ```typescript
   const discoveryResult = await Task({
     subagent_type: 'general-purpose',
     prompt: `Invoke the autonomous-test-discoverer skill to analyze current E2E test coverage.
   
     Scope: ${scope}
     Focus areas: ${focusAreas}
   
     Return:
     - Coverage percentages by category
     - List of untested endpoints (priority sorted)
     - List of untested user flows
     - Test roadmap with priorities
     `,
   });
   ```

2. **Analyze results**:
   - Current coverage: 71.1%
   - Gap to target: 23.9%
   - Critical gaps: 5
   - High priority gaps: 12
   - Medium priority gaps: 8

3. **Decision point**:
   - If coverage >= target: **SKIP to Phase 5 (Validation)**
   - If critical gaps exist: **PROCEED to Phase 3 (Generation)**
   - If only low-priority gaps: **ASK user** if they want to continue

### Phase 3: Test Generation

1. **Select top N untested endpoints** (N = 5 for first iteration):

   ```json
   [
     {
       "endpoint": "/api/v1/groups/:id/members:batch",
       "priority": "critical",
       "reason": "Batch operations, no test coverage"
     },
     {
       "endpoint": "/api/v1/jobs/:id/pause",
       "priority": "high",
       "reason": "State management, partially tested"
     }
   ]
   ```

2. **For each endpoint, invoke autonomous-test-generator**:

   ```typescript
   for (const endpoint of selectedEndpoints) {
     const testGenResult = await Task({
       subagent_type: 'general-purpose',
       prompt: `Invoke the autonomous-test-generator skill to create E2E tests for:
   
       Endpoint: ${endpoint.path}
       Method: ${endpoint.method}
       Priority: ${endpoint.priority}
       Account types: ${endpoint.accountTypes}
   
       Generate tests covering:
       - Happy path
       - Error cases
       - Multi-tenant isolation (if applicable)
       - RBAC enforcement
   
       Follow project conventions and use existing patterns.
       `,
     });

     generatedTests.push(testGenResult);
   }
   ```

3. **Report generation progress**:

   ```
   [Autonomous Test Runner] Generated 5 new test files
   - tests/e2e/groups-batch-operations.spec.ts (3 tests)
   - tests/e2e/jobs-pause-resume.spec.ts (4 tests)
   - tests/e2e/settings-inheritance.spec.ts (6 tests)
   - tests/e2e/multi-tenant-edges.spec.ts (5 tests)
   - tests/e2e/crm-operating-context.spec.ts (7 tests)

   Total new tests: 25
   Estimated coverage gain: +8.5%
   ```

### Phase 4: Execution & Healing

1. **Run all tests (existing + newly generated)**:

   ```typescript
   const testRun = await mcp__playwright_e2e__pw_run({
     grep: undefined, // All tests
     project: undefined, // All browsers
     tag: smokeOnly ? '@smoke' : undefined,
   });
   ```

2. **Analyze results**:

   ```json
   {
     "total": 143,
     "passed": 135,
     "failed": 8,
     "skipped": 0,
     "duration_ms": 245000,
     "pass_rate": 94.4
   }
   ```

3. **If failures exist, invoke autonomous-test-healer**:

   ```typescript
   if (testRun.failed > 0) {
     const healResult = await Task({
       subagent_type: 'general-purpose',
       prompt: `Invoke the autonomous-test-healer skill to fix ${testRun.failed} failing tests.
   
       Failures: ${JSON.stringify(testRun.failures)}
   
       Auto-heal all failures. Iterate until:
       - All tests pass, OR
       - Max 3 healing attempts per test reached
   
       For tests that cannot be auto-fixed, mark with test.fixme() and create GitHub issues.
       `,
     });

     // Re-run tests after healing
     testRun = await mcp__playwright_e2e__pw_run({});
   }
   ```

4. **Report healing results**:

   ```
   [Autonomous Test Healer] Healing complete
   - Fixed automatically: 6 tests
   - Still failing: 2 tests (marked as .fixme())
   - New pass rate: 98.6%

   Details:
   ✅ nodes-crud.spec.ts:Create node (selector updated)
   ✅ import-workflow.spec.ts:Upload (added SSE wait)
   ✅ settings-navigation.spec.ts:Update (timing fix)
   ✅ groups-hierarchy.spec.ts:Nested folders (data setup fix)
   ✅ auth-multi-account.spec.ts:Switch (browser-specific handling)
   ✅ edges-crud.spec.ts:Delete cascade (assertion updated)
   ❌ crm-operating-context.spec.ts:Cross-account (API schema changed - Issue #456)
   ❌ jobs-recovery.spec.ts:Orphaned jobs (backend logic changed - Issue #457)
   ```

### Phase 5: Coverage Validation

1. **Re-run discoverer to calculate new coverage**:

   ```typescript
   const finalCoverage = await Task({
     subagent_type: 'general-purpose',
     prompt:
       'Invoke autonomous-test-discoverer to calculate final coverage after generation and healing.',
   });
   ```

2. **Compare to target**:

   ```json
   {
     "iteration": 1,
     "coverage_start": 71.1,
     "coverage_end": 86.4,
     "coverage_gain": 15.3,
     "target_coverage": 95.0,
     "gap_remaining": 8.6,
     "tests_added": 25,
     "tests_fixed": 6
   }
   ```

3. **Decision: Continue or Stop?**
   - If coverage >= target: **STOP, report success**
   - If coverage < target AND iterations < max: **REPEAT Phase 2-5**
   - If coverage < target AND iterations >= max: **STOP, report partial success**

### Phase 6: Pipeline Verification

1. **Invoke pipeline-verifier** to ensure end-to-end correctness:

   ```typescript
   const pipelineResult = await Task({
     subagent_type: 'general-purpose',
     prompt: `Invoke the pipeline-verifier skill to validate complete feature pipelines.
   
     Check all layers:
     - Backend API (all endpoints respond correctly)
     - Frontend integration (components call correct APIs)
     - UI/UX (user interactions work as expected)
     - E2E tests (tests actually cover the functionality)
   
     For any discrepancies, report detailed findings.
     `,
   });
   ```

2. **Validate cross-browser compatibility**:

   ```typescript
   const browsers = ['chromium', 'firefox', 'webkit'];
   const browserResults = {};

   for (const browser of browsers) {
     browserResults[browser] = await mcp__playwright_e2e__pw_run({
       project: browser,
       tag: '@smoke',
     });
   }
   ```

3. **Check for flaky tests**:

   ```typescript
   // Run smoke tests 10 times
   const flakiness = await analyzeFlakiness({
     runs: 10,
     tag: '@smoke',
   });

   // Report any tests with < 100% pass rate
   const flakyTests = flakiness.filter((t) => t.passRate < 100);
   ```

### Phase 7: Reporting & Commit

1. **Generate comprehensive report**:

   ```markdown
   # Autonomous Testing Report

   Generated: 2025-10-31 12:00:00

   ## Summary

   - **Scope**: Full application
   - **Iterations**: 2
   - **Duration**: 45 minutes
   - **Initial Coverage**: 71.1%
   - **Final Coverage**: 95.2% ✅ (Target: 95%)

   ## Tests Generated

   - Iteration 1: 25 tests (8.5% coverage gain)
   - Iteration 2: 12 tests (6.1% coverage gain)
   - **Total**: 37 new tests

   ## Tests Healed

   - Iteration 1: 6 fixed, 2 escalated
   - Iteration 2: 3 fixed, 0 escalated
   - **Total**: 9 fixed, 2 escalated

   ## Final Test Suite

   - **Total Tests**: 180
   - **Pass Rate**: 98.9%
   - **Skipped**: 2 (.fixme() pending manual fix)
   - **Avg Duration**: 3.2 minutes

   ## Coverage by Category

   | Category        | Coverage | Status |
   | --------------- | -------- | ------ |
   | Authentication  | 100%     | ✅     |
   | Nodes CRUD      | 95%      | ✅     |
   | Edges CRUD      | 90%      | ✅     |
   | Users/Accounts  | 100%     | ✅     |
   | Import Pipeline | 100%     | ✅     |
   | Jobs            | 95%      | ✅     |
   | Settings        | 90%      | ✅     |
   | Groups          | 85%      | ⚠️     |
   | CRM/Admin       | 95%      | ✅     |

   ## Browser Compatibility

   - **Chromium**: 100% pass rate
   - **Firefox**: 100% pass rate
   - **WebKit**: 97% pass rate (3 known slow tests)

   ## Flaky Tests

   - 0 tests with < 100% pass rate over 10 runs ✅

   ## Escalated Issues

   1. **Issue #456**: CRM operating context test blocked by API schema change
      - File: tests/e2e/crm-operating-context.spec.ts
      - Action: Marked as .fixme(), manual fix required

   2. **Issue #457**: Job recovery test blocked by backend logic change
      - File: tests/e2e/jobs-recovery.spec.ts
      - Action: Marked as .fixme(), coordinating with backend team

   ## Recommendations

   - ✅ Deploy with confidence - 95% coverage achieved
   - ⚠️ Monitor groups category - lowest coverage at 85%
   - ⚠️ Review WebKit slow tests - may need timeout adjustments
   - ✅ Continue autonomous testing weekly to maintain coverage

   ## Files Changed

   - **New test files**: 37
   - **Modified test files**: 9
   - **Documentation updates**: 5
   - **Total lines added**: 3,245

   ## Next Steps

   1. Review and approve generated tests
   2. Resolve 2 escalated issues (#456, #457)
   3. Consider increasing groups test coverage to 90%
   4. Schedule weekly autonomous test runs
   ```

2. **Create commit (if auto_commit enabled)**:

   ```bash
   git add tests/e2e/*.spec.ts
   git commit -m "test: autonomous test generation and healing

   - Added 37 new E2E tests across 9 categories
   - Fixed 9 failing tests automatically
   - Achieved 95.2% E2E test coverage (from 71.1%)
   - All smoke tests passing in Chromium, Firefox, WebKit

   Generated by: autonomous-test-runner skill
   Duration: 45 minutes
   Pass rate: 98.9%

   🤖 Generated with Claude Code

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

3. **Notify user**:

   ```
   [Autonomous Test Runner] ✅ Complete!

   Coverage: 71.1% → 95.2% (+24.1%)
   Tests: 143 → 180 (+37)
   Pass rate: 98.9%
   Duration: 45 minutes

   📄 Report: .claude/reports/autonomous-testing-2025-10-31.md
   📝 Commit: Ready for review (not auto-committed)

   Next actions:
   1. Review generated tests
   2. Resolve 2 escalated issues
   3. Run `npm run e2e` to verify locally
   4. Create PR when ready
   ```

## Integration with Other Skills

This is the **master orchestrator** that coordinates:

- `autonomous-test-discoverer` → Identifies what to test
- `autonomous-test-generator` → Creates new tests
- `autonomous-test-healer` → Fixes broken tests
- `pipeline-verifier` → Validates end-to-end correctness
- `e2e-test-generator` → (legacy) May still be used for specific patterns
- `mcp-integration-expert` → Provides data and validation

## Configuration

`.claude/config/autonomous-testing.json`:

```json
{
  "default_scope": "full",
  "target_coverage": 95,
  "max_iterations": 5,
  "auto_commit": false,
  "auto_push": false,
  "notification_channels": ["console", "slack"],
  "browsers": ["chromium", "firefox", "webkit"],
  "parallel_workers": 2,
  "flakiness_threshold": 100,
  "healing_max_attempts": 3,
  "report_output_dir": ".claude/reports",
  "escalation_create_issues": true,
  "escalation_notify_team": true,
  "schedule": {
    "enabled": false,
    "cron": "0 0 * * 0",
    "scope": "full"
  }
}
```

## Best Practices

1. **Start with smoke tests**: Run with `smoke_only: true` first
2. **Iterate gradually**: Don't try to go from 50% to 100% in one run
3. **Review generated tests**: Even autonomous tests need human oversight
4. **Monitor resource usage**: Large test suites consume CI/CD minutes
5. **Track trends**: Compare coverage reports over time
6. **Fix escalations promptly**: Don't let .fixme() tests accumulate
7. **Update regularly**: Run weekly to catch regressions early
8. **Coordinate with team**: Notify before large test additions

## Success Metrics

- **Coverage**: Achieve 95%+ coverage in < 3 iterations
- **Quality**: Generated tests have 95%+ pass rate initially
- **Healing**: Fix 75%+ of failures automatically
- **Speed**: Complete full cycle in < 1 hour
- **Stability**: Zero flaky tests after completion
- **Maintenance**: Weekly runs require < 10 minute human intervention

## Example Usage

### Example 1: Achieve Full Coverage

**User**: "Run autonomous testing to achieve 95% E2E coverage"

**Skill**:

1. Discovers current coverage: 71.1%
2. **Iteration 1**:
   - Generates 25 tests for critical gaps
   - Runs all tests: 8 failures
   - Heals 6 failures, escalates 2
   - New coverage: 86.4%
3. **Iteration 2**:
   - Generates 12 tests for remaining gaps
   - Runs all tests: 3 failures
   - Heals all 3 failures
   - New coverage: 95.2% ✅
4. Verifies pipeline, checks flakiness
5. Generates report and commit
6. Duration: 45 minutes

### Example 2: Heal Failing Tests

**User**: "Tests are broken after the recent API changes. Fix them."

**Skill**:

1. Runs current test suite: 15 failures
2. **Healing phase**:
   - Analyzes each failure for root cause
   - Applies appropriate fix strategies
   - Fixes 12 automatically
   - Escalates 3 (API schema changed)
3. Re-runs: 3 failures remain (.fixme())
4. Creates GitHub issues for escalations
5. Reports: 12 fixed, 3 escalated
6. Duration: 20 minutes

### Example 3: Continuous Maintenance

**User**: "Set up weekly autonomous testing runs"

**Skill**:

1. Updates configuration:
   ```json
   {
     "schedule": {
       "enabled": true,
       "cron": "0 0 * * 0",
       "scope": "full"
     }
   }
   ```
2. Every Sunday at midnight:
   - Discovers coverage (should be ~95%)
   - If < 90%, generates missing tests
   - Heals any failures
   - Sends report to Slack
   - Creates PR if tests added/fixed

## Troubleshooting

### "Iterations not improving coverage"

- Check if untested endpoints are deprecated/admin-only
- Review priority rankings (may be focusing on low-value tests)
- Manually review discovery results for accuracy

### "Generated tests failing immediately"

- Backend may have changed without documentation updates
- Test templates may be outdated
- Check if test data setup is correct

### "Healing not working"

- Complex failures may need human intervention
- Check if root cause analysis is accurate
- Review healing strategies (may need updates)

### "Taking too long"

- Reduce parallel_workers if resource-constrained
- Use smoke_only for faster iterations
- Split scope into modules for parallel execution

## Notes

- This skill requires **human approval** before committing
- Escalated issues are **never ignored** - they create GitHub issues
- All autonomous actions are **logged** for audit trail
- Coverage target is **configurable** (default 95%)
- Skill can run **headless** on CI/CD or **interactive** locally
