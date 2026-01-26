# MCP Server Integration Guide

**Purpose**: Enable Claude Desktop to control and monitor Playwright E2E tests

**Status**: ✅ Server tested and functional

## Quick Start

### 1. Prerequisites

- Claude Desktop installed
- Node.js v20+ installed
- MCP server dependencies installed:
  ```bash
  cd .mcp/servers/playwright-e2e
  npm install
  ```

### 2. Configuration

#### Find Your Claude Desktop Config

**macOS**:

```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows**:

```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux**:

```bash
~/.config/Claude/claude_desktop_config.json
```

#### Add MCP Server

Copy the example config and update the path:

```json
{
  "mcpServers": {
    "playwright-e2e": {
      "command": "node",
      "args": ["/absolute/path/to/ai_convo_parser/.mcp/servers/playwright-e2e/index.js"],
      "env": {
        "BASE_URL": "http://localhost:3000",
        "API_BASE_URL": "http://localhost:4001",
        "TEST_USER_EMAIL": "admin@admin.com",
        "TEST_USER_PASSWORD": "admin123"
      }
    }
  }
}
```

**Update the path** in `args` to match your project location!

### 3. Restart Claude Desktop

After updating the config, restart Claude Desktop for changes to take effect.

### 4. Verify Integration

In Claude Desktop, ask:

```
Can you list the available Playwright tests?
```

Claude should use the `pw.listTests` tool and show you all tests.

## Available Tools

The MCP server provides 8 tools to Claude:

### 1. `pw.listTests` - List Available Tests

Lists all Playwright tests with optional filtering.

**Example prompts**:

- "List all smoke tests"
- "Show me the authentication tests"
- "What E2E tests are available?"

### 2. `pw.run` - Execute Tests

Runs tests with various options (requires your approval).

**Example prompts**:

- "Run the smoke tests"
- "Run all tests on Firefox"
- "Run the login flow test in headed mode"

**Parameters**:

- `grep`: Filter by pattern
- `project`: Browser (chromium, firefox, webkit)
- `tag`: Filter by tag (@smoke, @full)
- `headed`: Show browser window
- `retries`: Number of retries

### 3. `pw.lastFailures` - Get Failure Details

Shows details of the most recent test failures.

**Example prompts**:

- "Show me the last test failures"
- "What tests failed recently?"
- "Get details on failed tests"

**Returns**:

- Test names
- Failure reasons
- Screenshot paths
- Video paths
- Error context files

### 4. `app.start` - Start Servers

Starts the web and API servers (requires approval).

**Example prompts**:

- "Start the application servers"
- "Launch the test environment"

### 5. `app.stop` - Stop Servers

Stops running servers (requires approval).

**Example prompts**:

- "Stop the servers"
- "Shut down the test environment"

### 6. `artifacts.list` - List Test Artifacts

Shows all available test artifacts.

**Example prompts**:

- "List all test screenshots"
- "Show me test artifacts"
- "What test videos are available?"

**Returns**:

- Screenshots (.png)
- Videos (.webm)
- Traces (.zip)
- Reports (HTML, JUnit)

### 7. `artifacts.read` - Read Artifact Content

Reads content of specific artifacts.

**Example prompts**:

- "Show me the JUnit report"
- "Read the error context for the login test"

### 8. `env.info` - Environment Information

Shows environment details.

**Example prompts**:

- "What version of Playwright is installed?"
- "Show environment info"

## Example Workflows

### Workflow 1: Run Tests and Debug Failures

```
You: "Run the smoke tests on Chromium"
Claude: [Uses pw.run tool, asks for approval]
You: [Approve]
Claude: [Runs tests, shows results]

You: "What failed?"
Claude: [Uses pw.lastFailures to show details]

You: "Show me the screenshot from the login test failure"
Claude: [Uses artifacts.read to show screenshot path]
```

### Workflow 2: Check Test Coverage

```
You: "List all available tests"
Claude: [Uses pw.listTests]

You: "How many authentication tests do we have?"
Claude: [Filters results, counts auth tests]

You: "Run just the authentication tests"
Claude: [Uses pw.run with grep filter]
```

### Workflow 3: Monitor CI/CD

```
You: "Did the latest test run have any failures?"
Claude: [Uses pw.lastFailures]

You: "Show me the JUnit report"
Claude: [Uses artifacts.read for junit.xml]

You: "What's the test pass rate?"
Claude: [Parses report, calculates percentage]
```

## Security & Permissions

### User Approval Required

These tools require your explicit approval before running:

- `pw.run` - Executes tests
- `app.start` - Starts servers
- `app.stop` - Stops servers

Claude will ask for permission before executing these.

### Read-Only Tools

These tools are read-only and don't require approval:

- `pw.listTests` - Lists tests
- `pw.lastFailures` - Shows failures
- `artifacts.list` - Lists artifacts
- `artifacts.read` - Reads artifacts
- `env.info` - Shows environment

### Command Whitelisting

The MCP server only allows specific, safe Playwright commands. No arbitrary shell execution is possible.

### Path Validation

All file paths are validated to prevent directory traversal attacks.

## Troubleshooting

### Issue: MCP Server Not Showing Up

**Symptom**: Claude doesn't recognize Playwright tools

**Fixes**:

1. Check config file path is correct
2. Restart Claude Desktop
3. Verify JSON syntax is valid (no trailing commas)
4. Check Node.js is in PATH

**Test manually**:

```bash
node .mcp/servers/playwright-e2e/index.js
```

If you see errors, the server won't work in Claude Desktop.

### Issue: Tests Not Running

**Symptom**: `pw.run` tool fails

**Fixes**:

1. Ensure servers are running (or use `app.start`)
2. Check environment variables in config
3. Verify Playwright browsers are installed
4. Run tests manually first: `npm run e2e`

### Issue: Artifacts Not Found

**Symptom**: `artifacts.list` shows no files

**Fixes**:

1. Run tests first to generate artifacts
2. Check `test-results/` directory exists
3. Verify tests have failures (artifacts only saved on failure)

### Issue: Permission Denied

**Symptom**: Tools fail with permission errors

**Fixes**:

1. Ensure Node.js can read project files
2. Check file permissions on `.mcp/servers/playwright-e2e/`
3. Run Claude Desktop with appropriate permissions

## Advanced Configuration

### Multiple Environments

You can configure different environments:

```json
{
  "mcpServers": {
    "playwright-e2e-local": {
      "command": "node",
      "args": ["/path/to/project/.mcp/servers/playwright-e2e/index.js"],
      "env": {
        "BASE_URL": "http://localhost:3000",
        "API_BASE_URL": "http://localhost:4001"
      }
    },
    "playwright-e2e-staging": {
      "command": "node",
      "args": ["/path/to/project/.mcp/servers/playwright-e2e/index.js"],
      "env": {
        "BASE_URL": "https://staging.example.com",
        "API_BASE_URL": "https://api-staging.example.com"
      }
    }
  }
}
```

### Custom Test Filters

Set default filters in the environment:

```json
{
  "env": {
    "DEFAULT_GREP": "@smoke",
    "DEFAULT_PROJECT": "chromium"
  }
}
```

### Debug Mode

Enable verbose logging:

```json
{
  "env": {
    "DEBUG": "true",
    "LOG_LEVEL": "verbose"
  }
}
```

## MCP Server Resources

The server also provides 3 resources that Claude can reference:

### 1. `playwright://config`

Current Playwright configuration

### 2. `playwright://tests`

List of all available tests

### 3. `playwright://latest-results`

Most recent test run results

These are automatically available to Claude without explicit prompts.

## Benefits

### For Developers

- **Faster debugging**: Ask Claude to run tests and analyze failures
- **Better insights**: Claude can correlate test failures with code changes
- **Automation**: Claude can run tests as part of code review
- **Documentation**: Claude can explain what tests do

### For QA

- **Test triage**: Claude can categorize and prioritize failures
- **Reporting**: Ask Claude to generate test summaries
- **Coverage analysis**: Claude can identify untested areas
- **Flakiness detection**: Claude can analyze test stability over time

### For Team

- **Knowledge sharing**: Everyone can ask Claude about test status
- **Onboarding**: New team members can learn tests via Claude
- **Accessibility**: Non-technical stakeholders can check test results
- **Visibility**: Real-time test insights without CI/CD dashboard

## Example Prompts

### Running Tests

- "Run all smoke tests"
- "Test the login flow on all browsers"
- "Run tests for the canvas component"
- "Execute webkit tests in headed mode"

### Debugging

- "Why did the authentication test fail?"
- "Show me the screenshot from the last failure"
- "What's in the error context file?"
- "Compare the last two test runs"

### Analysis

- "Which tests are failing most often?"
- "How long do tests take to run?"
- "What's our test coverage for authentication?"
- "Suggest tests we should add"

### Maintenance

- "Start the development servers"
- "List all test artifacts"
- "Clean up old test results"
- "Check Playwright version"

## Best Practices

### 1. Keep Servers Running

For best results, keep your development servers running when using the MCP tools.

### 2. Run Tests Regularly

The MCP server works best when test results are fresh. Run tests frequently.

### 3. Use Tags

Tag your tests (@smoke, @critical, etc.) for easier filtering.

### 4. Review Failures Promptly

Ask Claude to analyze failures right after they occur for best context.

### 5. Clean Up Artifacts

Periodically clean up old test artifacts to keep the project lean.

## Updating the Server

If you modify the MCP server code:

```bash
cd .mcp/servers/playwright-e2e
npm install  # If you changed dependencies
```

Then restart Claude Desktop to reload the server.

## Support

### Documentation

- Main guide: `E2E_TESTING_GUIDE.md`
- MCP server README: `.mcp/servers/playwright-e2e/README.md`
- Server code: `.mcp/servers/playwright-e2e/index.js`

### Testing Locally

```bash
# Test the MCP server
node scripts/test-mcp-server.js

# Test Playwright directly
npm run e2e
```

### Getting Help

If issues persist:

1. Check the MCP server logs
2. Run tests manually to isolate the issue
3. Review the server source code
4. Check Claude Desktop logs

---

**Version**: 1.0.0
**Last Updated**: October 26, 2025
**Status**: Production Ready
