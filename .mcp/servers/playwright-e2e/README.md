# Playwright E2E MCP Server

Model Context Protocol server for controlling Playwright E2E tests. Enables Claude to list, run, and monitor tests, manage test artifacts, and control the application under test.

## Features

- **Test Control**: List and run tests with filters (grep, tags, browser projects)
- **App Management**: Start/stop web and API servers with intelligent process registry
- **Health Checking**: Cached server health checks (30s TTL) to reduce token usage
- **Artifact Access**: Read test reports, traces, videos, and screenshots
- **Test Correlation**: Access backend logs via test IDs
- **Environment Info**: Check versions and configuration
- **Token Optimization**: Process registry and health cache reduce redundant HTTP checks by ~3000 tokens per autonomous test run

## Installation

```bash
cd .mcp/servers/playwright-e2e
npm install
```

## Usage

### Running the Server

```bash
# Standalone
node index.js

# Via npm
npm run dev
```

### Claude Desktop Configuration

Add to your Claude Desktop MCP settings (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "playwright-e2e": {
      "command": "node",
      "args": ["/path/to/ai_convo_parser/.mcp/servers/playwright-e2e/index.js"],
      "env": {
        "BASE_URL": "http://localhost:3000",
        "API_BASE_URL": "http://localhost:4001"
      }
    }
  }
}
```

## Available Tools

### `pw.listTests`

List all available Playwright tests with optional grep filter.

**Parameters:**

- `grep` (string, optional): Filter tests by pattern (e.g., "login", "@smoke")

**Example:**

```
List all smoke tests
→ pw.listTests({ grep: "@smoke" })
```

**Returns:**

```json
{
  "success": true,
  "count": 4,
  "tests": [{ "file": "tests/e2e/smoke.spec.ts:8" }, { "file": "tests/e2e/smoke.spec.ts:18" }],
  "grep": "@smoke"
}
```

### `pw.run`

Execute Playwright tests with options. **Requires user approval.**

**Parameters:**

- `grep` (string, optional): Filter tests by pattern
- `project` (string, optional): Browser to test (chromium, firefox, webkit)
- `shard` (string, optional): Shard specification (e.g., "1/3")
- `retries` (number, optional): Number of retries for failed tests (default: 0)
- `headed` (boolean, optional): Run in headed mode (default: false)
- `tag` (string, optional): Filter by tag (e.g., "@smoke")

**Example:**

```
Run smoke tests in Chromium
→ pw.run({ tag: "@smoke", project: "chromium" })
```

**Returns:**

```json
{
  "success": true,
  "duration": 12450,
  "summary": {
    "passed": 4,
    "failed": 0,
    "skipped": 0,
    "total": 4
  },
  "output": "...",
  "artifactsPath": "/path/to/test-results",
  "reportPath": "/path/to/playwright-report"
}
```

### `pw.lastFailures`

Get details of the last test run failures with trace file paths.

**Example:**

```
Show me the last test failures
→ pw.lastFailures()
```

**Returns:**

```json
{
  "success": true,
  "count": 2,
  "failures": [
    {
      "test": "flow-auth-keimenon-chromium-login-test",
      "tracePath": "/path/to/test-results/.../trace.zip",
      "relativeTracePath": "test-results/.../trace.zip"
    }
  ],
  "viewCommand": "npx playwright show-trace <tracePath>"
}
```

### `app.start`

Start web and API servers for testing. **Requires user approval.**

**Parameters:**

- `env` (string, optional): Environment to start ("local" or "ci", default: "local")

**Example:**

```
Start the development servers
→ app.start({ env: "local" })
```

**Returns:**

```json
{
  "success": true,
  "servers": {
    "web": { "url": "http://localhost:3000", "port": 3000, "running": true },
    "api": { "url": "http://localhost:4001", "port": 4001, "running": true }
  }
}
```

### `app.stop`

Stop running servers. **Requires user approval.**

**Example:**

```
Stop all servers
→ app.stop()
```

**Returns:**

```json
{
  "success": true,
  "message": "All servers stopped"
}
```

### `app.health`

Check server health status. **Results are cached for 30 seconds to reduce token usage.**

This tool provides a lightweight way to check if servers are running without repeatedly making HTTP requests. The cache can be forced to refresh if needed.

**Parameters:**

- `force_refresh` (boolean, optional): Force refresh cache (default: false)

**Example:**

```
Check if servers are healthy
→ app.health()
```

**Example (force refresh):**

```
Get fresh health status
→ app.health({ force_refresh: true })
```

**Returns:**

```json
{
  "success": true,
  "cached": false,
  "timestamp": 1705320000000,
  "api": {
    "running": true,
    "healthy": true,
    "url": "http://localhost:4001",
    "port": 4001,
    "pid": 12345,
    "started_at": 1705319900000
  },
  "web": {
    "running": true,
    "healthy": true,
    "url": "http://localhost:3000",
    "port": 3000,
    "pid": 12346,
    "started_at": 1705319900000
  },
  "database": {
    "accessible": true,
    "path": "/Users/username/.keimenon/keimenon.db"
  }
}
```

**Cached Response:**

When returning a cached result, the response includes additional fields:

```json
{
  "success": true,
  "cached": true,
  "cache_age_seconds": 15,
  ...
}
```

**Benefits:**

- **Token Efficiency**: Avoids redundant HTTP health checks
- **Fast Response**: Cached results return in < 10ms
- **Process Registry**: Tracks PIDs and start times for accurate state
- **Auto-Correction**: Detects when processes die and updates registry

**Use Cases:**

1. **Before running tests**: Quickly verify servers are ready
2. **Autonomous testing**: Reduce token waste in multi-step workflows
3. **Debugging**: Check server status without side effects

### `artifacts.list`

List available test artifacts (reports, traces, videos, screenshots).

**Parameters:**

- `kind` (string, optional): Filter by type (report, trace, video, screenshot)
- `limit` (number, optional): Maximum results (default: 20)

**Example:**

```
Show me the latest trace files
→ artifacts.list({ kind: "trace", limit: 5 })
```

**Returns:**

```json
{
  "success": true,
  "count": 3,
  "artifacts": [
    {
      "kind": "trace",
      "path": "test-results/flow-auth-keimenon-chromium/trace.zip",
      "size": 524288,
      "modified": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

### `artifacts.read`

Read artifact file contents (text or base64 for binary).

**Parameters:**

- `path` (string, required): Relative path to artifact file
- `base64` (boolean, optional): Return as base64 for binary files (default: false)
- `maxSize` (number, optional): Max file size in bytes (default: 1MB)

**Example:**

```
Read the test report summary
→ artifacts.read({ path: "playwright-report/index.html" })
```

**Returns:**

```json
{
  "success": true,
  "path": "playwright-report/index.html",
  "size": 45678,
  "content": "<!DOCTYPE html>...",
  "encoding": "utf-8"
}
```

### `env.info`

Get environment and version information.

**Example:**

```
What's the current environment?
→ env.info()
```

**Returns:**

```json
{
  "success": true,
  "environment": {
    "node": "v20.10.0",
    "playwright": "Version 1.56.1",
    "gitCommit": "abc123def456",
    "platform": "darwin",
    "arch": "arm64"
  },
  "urls": {
    "web": "http://localhost:3000",
    "api": "http://localhost:4001"
  }
}
```

## Resources

### `playwright://reports`

Latest HTML test report.

### `playwright://traces`

List of all trace files from recent test runs.

### `playwright://artifacts`

JSON list of all test artifacts.

## Security

### User Approval Required

The following tools require user approval in Claude:

- `pw.run` - Executes test suite
- `app.start` - Starts application servers
- `app.stop` - Stops application servers

### Command Whitelisting

Only the following commands are allowed:

- `npx playwright test [options]`
- `npm run dev` (in apps/web and apps/api)
- `git rev-parse HEAD`

No arbitrary shell commands can be executed.

### Path Validation

File reads via `artifacts.read` are restricted to the repository root. Paths are validated to prevent directory traversal attacks.

### Rate Limiting

Long-running operations (test runs, server starts) have timeouts to prevent resource exhaustion.

## Example Workflows

### Debug a Failed CI Test

```
1. pw.lastFailures()
   → Shows trace files for failed tests

2. artifacts.read({ path: "test-results/.../trace.zip", base64: true })
   → Download trace file

3. Local: npx playwright show-trace trace.zip
   → View in trace viewer
```

### Run Quick Smoke Tests

```
1. Check if app is running
   → env.info()

2. Start app if needed
   → app.start()

3. Run smoke tests
   → pw.run({ tag: "@smoke", project: "chromium" })

4. View results
   → artifacts.list({ kind: "report" })
```

### Correlate Test Failure with Backend Logs

```
1. Run test and capture test ID
   → pw.run({ grep: "login" })

2. Note the test ID from response headers (x-test-id)

3. Search backend logs
   → grep "testId=abc-123-def" apps/api/api-server.log

4. Analyze correlated logs
```

## Troubleshooting

### Server Won't Start

**Error**: "Address already in use"

**Solution**: Check for existing processes on ports 3000/4001

```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:4001 | xargs kill -9
```

### Tests Timeout

**Error**: "Test timeout of 30000ms exceeded"

**Solution**: Check that servers are running and accessible

```
1. env.info()
   → Verify URLs are correct

2. curl http://localhost:3000
   → Test connectivity

3. app.start()
   → Restart servers if needed
```

### Artifacts Not Found

**Error**: "No such file or directory"

**Solution**: Run tests first to generate artifacts

```
1. pw.run({ project: "chromium" })
   → Generate test results

2. artifacts.list()
   → Verify artifacts were created
```

## Development

### Adding New Tools

1. Add tool definition to `ListToolsRequestSchema` handler
2. Implement tool function
3. Add case to `CallToolRequestSchema` handler
4. Update this README

### Testing the Server

```bash
# Run server
npm run dev

# In another terminal, use MCP CLI
npx @modelcontextprotocol/inspector

# Or use Claude Desktop with MCP configuration
```

## Architecture

```
┌─────────────────┐
│  Claude Client  │
│  (MCP Host)     │
└────────┬────────┘
         │ stdio
         ▼
┌─────────────────┐      ┌──────────────┐
│  MCP Server     │──────▶│  Playwright  │
│  (Node.js)      │      │  CLI         │
└────────┬────────┘      └──────────────┘
         │
         ├──────────────▶ Start/Stop Apps
         │               (spawn processes)
         │
         └──────────────▶ Read Artifacts
                         (filesystem access)
```

## Related Documentation

- [E2E Tests README](../../../tests/e2e/README.md)
- [Playwright Config](../../../playwright.config.ts)
- [Test Correlation Middleware](../../../apps/api/src/middleware/test-correlation.middleware.ts)
- [MCP Protocol Docs](https://modelcontextprotocol.io)

## License

Same as parent project (Keimenon).
