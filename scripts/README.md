# Scripts Directory

Development and production orchestration scripts for Canvas Memory OS.

## Quick Start

```bash
# Start development servers with auto-orchestration
npm run dev

# Start with automatic port cleanup
npm run dev:clean

# Validate environment
npm run validate

# Check ports
npm run check-ports

# Kill conflicting ports
npm run kill-ports
```

## Scripts

### check-port.js

Check if a port is in use and get process information.

```bash
# CLI usage
node scripts/check-port.js 3001

# Module usage
const { checkPort } = require('./scripts/check-port');
const info = await checkPort(3001);
// Returns: { pid: 12345, command: 'node.exe' } or null
```

### kill-port.js

Kill processes on specific ports gracefully or forcefully.

```bash
# Graceful kill (SIGTERM)
node scripts/kill-port.js 3001

# Force kill (SIGKILL)
node scripts/kill-port.js 3001 --force

# Multiple ports
node scripts/kill-port.js 3000 4001

# Module usage
const { killPort } = require('./scripts/kill-port');
await killPort(3001, { force: false, timeout: 5000 });
```

### wait-for.js

Wait for services to become available before proceeding.

```bash
# Wait for HTTP endpoint
node scripts/wait-for.js http://localhost:4001/health

# Wait for TCP endpoint (Neo4j)
node scripts/wait-for.js bolt://localhost:7687

# With timeout
node scripts/wait-for.js http://localhost:4001 --timeout 30000

# Verbose mode
node scripts/wait-for.js http://localhost:4001 --verbose

# Module usage
const { waitFor } = require('./scripts/wait-for');
await waitFor('http://localhost:4001/health', {
  timeout: 30000,
  interval: 1000,
  verbose: true
});
```

### validate-env.js

Validate environment configuration before starting.

```bash
# Full validation with details
node scripts/validate-env.js --verbose

# Quick check
node scripts/validate-env.js
# Exit code: 0 (valid), 1 (invalid)

# Module usage
const { validateAll } = require('./scripts/validate-env');
const result = await validateAll({ verbose: true });
// Returns: { valid: boolean, errors: string[], warnings: string[] }
```

**Checks**:

- Node.js version (>=18.0.0)
- npm version (>=9.0.0)
- Dependencies installed
- .env files exist and valid
- Neo4j URI format
- Storage path writable
- Port ranges valid

### dev.js

Main orchestrator for development environment.

```bash
# Normal startup
npm run dev
# or: node scripts/dev.js

# Auto-kill port conflicts
npm run dev:clean
# or: node scripts/dev.js --clean

# Skip validation (faster startup)
node scripts/dev.js --skip-validation
```

**Flow**:

1. Pre-flight checks (Node, npm, env)
2. Port conflict detection
3. Neo4j availability check
4. Start API server
5. Wait for API readiness
6. Start Frontend server
7. Beautiful status output
8. Graceful shutdown on Ctrl+C

## Architecture

### Service Startup Order

```
Neo4j (Database)
  ↓ (wait for bolt://localhost:7687)
API Server (port 4001)
  ↓ (wait for http://localhost:4001/health)
Frontend (port 3000)
```

### Port Management

| Port | Service       | Protocol |
| ---- | ------------- | -------- |
| 3000 | Frontend      | HTTP     |
| 3001 | API           | HTTP     |
| 7474 | Neo4j Browser | HTTP     |
| 7687 | Neo4j Bolt    | TCP      |

## Troubleshooting

### Port Conflicts

```bash
# Check what's using ports
npm run check-ports

# Kill conflicting processes
npm run kill-ports

# Or use --clean flag
npm run dev:clean
```

### Neo4j Not Running

```bash
# Start Neo4j with Docker
docker-compose -f docker-compose.dev.yml up -d neo4j

# Or manual Docker
docker run --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/testpassword \
  neo4j:5.19

# Check connection
node scripts/wait-for.js bolt://localhost:7687 --verbose
```

### Environment Issues

```bash
# Validate environment
npm run validate

# Check .env files
ls apps/api/.env
ls apps/web/.env.local

# Fix issues
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit files with correct values
```

## Development Tips

### Fast Restart

```bash
# Kill only app ports (not Neo4j)
npm run kill-ports

# Restart
npm run dev
```

### Debug Mode

```bash
# API with debug logs
cd apps/api && DEBUG=* npm run dev

# Check API health
curl http://localhost:4001/health | jq
curl http://localhost:4001/ready | jq
```

### Monitor Resources

```bash
# Watch API logs
cd apps/api && npm run dev 2>&1 | grep "API"

# Watch memory usage
watch -n 1 'ps aux | grep node'
```

## Production Usage

These scripts are development-focused. For production:

### PM2 (Recommended)

```bash
npm install -g pm2
npm run build
pm2 start ecosystem.config.js
```

### systemd (Linux)

```bash
sudo systemctl enable canvas-api
sudo systemctl start canvas-api
```

### Docker

```bash
docker-compose up -d
```

## Cross-Platform Support

All scripts are cross-platform compatible:

- **Windows**: Uses `netstat`, `taskkill`
- **macOS/Linux**: Uses `lsof`, `kill`

Tested on:

- Windows 10/11
- macOS (Intel & Apple Silicon)
- Ubuntu 20.04+
- Debian 11+

## Contributing

When adding new scripts:

1. Add shebang: `#!/usr/bin/env node`
2. Support both CLI and module usage
3. Include --help flag
4. Return proper exit codes (0=success, 1=error)
5. Use consistent error handling
6. Add to package.json scripts if useful
7. Update this README

## License

Part of Canvas Memory OS - see root LICENSE file.
