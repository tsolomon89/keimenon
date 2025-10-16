# Configuration Guide

**Complete reference for configuring Canvas Memory OS**

This guide covers all configuration options including environment variables, storage modes, authentication settings, and limits.

---

## Table of Contents

- [Configuration Files](#configuration-files)
- [Storage Configuration](#storage-configuration)
- [Authentication Configuration](#authentication-configuration)
- [Server Configuration](#server-configuration)
- [Feature Limits](#feature-limits)
- [Frontend Configuration](#frontend-configuration)
- [Advanced Configuration](#advanced-configuration)

---

## Configuration Files

Canvas Memory OS uses environment variables for configuration. Configuration is split between API and frontend:

```
apps/api/.env          # Backend API configuration
apps/web/.env.local    # Frontend configuration
```

### Creating Configuration Files

```bash
# Backend
cd apps/api
cp .env.example .env
# Edit .env with your values

# Frontend
cd apps/web
cp .env.example .env.local
# Edit .env.local with your values
```

---

## Storage Configuration

### Storage Modes

Canvas Memory OS supports three storage modes:

| Mode     | Description         | Use Case                             |
| -------- | ------------------- | ------------------------------------ |
| `local`  | SQLite only         | Development, personal use, Free tier |
| `canvas` | Neo4j only          | Production, large datasets           |
| `hybrid` | Both SQLite + Neo4j | Pro/Business tier, best of both      |

### Local Mode (SQLite)

**Best for**: Development, testing, personal use, Free tier

```env
# apps/api/.env
STORAGE_MODE=local

# SQLite database location
SQLITE_PATH=~/.canvas-memory/canvas.db

# Document storage location
LOCAL_DOCS_PATH=~/.canvas-memory
```

**Database location by platform:**

- **Windows**: `C:\Users\<YourName>\.canvas-memory\canvas.db`
- **Mac/Linux**: `~/.canvas-memory/canvas.db`

**To use a custom location:**

```env
SQLITE_PATH=/custom/path/canvas.db
LOCAL_DOCS_PATH=/custom/path/docs
```

### Canvas Mode (Neo4j)

**Best for**: Production, advanced graph queries, team collaboration

```env
# apps/api/.env
STORAGE_MODE=canvas

# Neo4j Connection
NEO4J_URI=bolt://localhost:7687
# For Neo4j Aura (cloud):
# NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io

NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

### Hybrid Mode

**Best for**: Pro/Business tier, combining local speed with cloud features

```env
# apps/api/.env
STORAGE_MODE=hybrid

# SQLite Configuration
SQLITE_PATH=~/.canvas-memory/canvas.db
LOCAL_DOCS_PATH=~/.canvas-memory

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
```

**How hybrid mode works:**

- **Writes**: Saved to both SQLite and Neo4j
- **Reads**: Served from SQLite (faster)
- **Graph queries**: Use Neo4j when needed
- **Automatic sync**: Changes replicated in real-time

---

## Authentication Configuration

### JWT Settings

```env
# apps/api/.env

# JWT Secret - CHANGE THIS IN PRODUCTION!
# Must be at least 32 characters
JWT_SECRET=change-this-in-production-minimum-32-characters-for-security

# Token expiration time
JWT_EXPIRES_IN=7d  # 7 days
# Other valid values: 1h, 24h, 30d, etc.
```

**⚠️ Security Warning:**

- **NEVER** use the default `JWT_SECRET` in production
- Generate a strong random secret: `openssl rand -base64 32`
- Store secrets in environment variables, not in code
- Rotate secrets periodically (every 90 days recommended)

### Permission Levels

The system supports 4 permission levels:

| Level    | Permissions            | API Access             |
| -------- | ---------------------- | ---------------------- |
| `junior` | Read-only              | GET requests only      |
| `senior` | Read + Create          | GET, POST              |
| `leader` | Read + Create + Delete | GET, POST, DELETE      |
| `admin`  | Full access            | All methods + settings |

**Default behavior:**

- First user in an account gets `admin` permission automatically
- Additional users can be assigned any level

**Configuration:**

```env
# apps/api/.env

# Default permission level for new users
DEFAULT_PERMISSION_LEVEL=senior  # junior|senior|leader|admin
```

### Account Types and Classes

**Account Types:**

- `client` - Regular tenant account (multi-tenant isolation)
- `admin` - System-level account (sees all data)

**Account Classes (Tiers):**

- `free` - Basic features
- `professional` - Advanced features
- `business` - Enterprise features

```env
# apps/api/.env

# Default account class for registrations
DEFAULT_ACCOUNT_CLASS=free  # free|professional|business
```

---

## Server Configuration

### Basic Server Settings

```env
# apps/api/.env

# Server port
PORT=4001

# Environment
NODE_ENV=development  # development|production|test

# Host binding
HOST=0.0.0.0  # Bind to all interfaces
# HOST=127.0.0.1  # Localhost only
```

### CORS Configuration

```env
# apps/api/.env

# Allowed origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# In production, specify your domains:
# CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

### File Upload Settings

```env
# apps/api/.env

# Maximum file size (in MB)
MAX_FILE_SIZE_MB=10

# Maximum number of files per upload
MAX_FILES_PER_UPLOAD=10

# Allowed file types
ALLOWED_FILE_TYPES=.pdf,.txt,.md,.json,.csv,.png,.jpg,.jpeg
```

### Logging

```env
# apps/api/.env

# Log level
LOG_LEVEL=info  # error|warn|info|debug

# Log format
LOG_FORMAT=json  # json|pretty

# Log file location
LOG_FILE=./logs/api.log
```

---

## Feature Limits

Configure tier-based limits:

### Free Tier Limits

```env
# apps/api/.env

FREE_MAX_SOURCES=500
FREE_MAX_NODES=20000
FREE_MAX_GROUPS=50
FREE_STORAGE_GB=5
FREE_MAX_BOARDS=3
FREE_MAX_API_CALLS_PER_DAY=10000
```

### Professional Tier Limits

```env
# apps/api/.env

PRO_MAX_SOURCES=5000
PRO_MAX_NODES=200000
PRO_MAX_GROUPS=500
PRO_STORAGE_GB=50
PRO_MAX_BOARDS=20
PRO_MAX_API_CALLS_PER_DAY=100000
```

### Business Tier Limits

```env
# apps/api/.env

BUSINESS_MAX_SOURCES=unlimited
BUSINESS_MAX_NODES=unlimited
BUSINESS_MAX_GROUPS=unlimited
BUSINESS_STORAGE_GB=unlimited
BUSINESS_MAX_BOARDS=unlimited
BUSINESS_MAX_API_CALLS_PER_DAY=unlimited
```

---

## Frontend Configuration

### API Connection

```env
# apps/web/.env.local

# API URL (backend endpoint)
NEXT_PUBLIC_API_URL=http://localhost:4001

# In production:
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### Feature Flags

```env
# apps/web/.env.local

# Enable Pro features
NEXT_PUBLIC_ENABLE_PRO_FEATURES=false

# Enable Business features
NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES=false

# Enable beta features
NEXT_PUBLIC_ENABLE_BETA_FEATURES=false
```

### UI Configuration

```env
# apps/web/.env.local

# Theme
NEXT_PUBLIC_DEFAULT_THEME=dark  # light|dark|system

# Canvas settings
NEXT_PUBLIC_CANVAS_MAX_NODES=1000
NEXT_PUBLIC_CANVAS_MAX_EDGES=2000

# Pagination
NEXT_PUBLIC_DEFAULT_PAGE_SIZE=50
```

---

## Advanced Configuration

### Database Tuning (SQLite)

```env
# apps/api/.env

# WAL mode (recommended for concurrent access)
SQLITE_WAL_MODE=true

# Busy timeout (milliseconds)
SQLITE_BUSY_TIMEOUT=5000

# Cache size (pages, negative = KB)
SQLITE_CACHE_SIZE=-2000  # 2MB cache

# Journal mode
SQLITE_JOURNAL_MODE=WAL  # DELETE|TRUNCATE|PERSIST|MEMORY|WAL|OFF
```

### Database Tuning (Neo4j)

```env
# apps/api/.env

# Connection pool size
NEO4J_MAX_CONNECTION_POOL_SIZE=50

# Connection timeout (milliseconds)
NEO4J_CONNECTION_TIMEOUT=30000

# Max transaction retry time
NEO4J_MAX_TRANSACTION_RETRY_TIME=30000
```

### Performance Tuning

```env
# apps/api/.env

# Enable query caching
ENABLE_QUERY_CACHE=true

# Cache TTL (seconds)
CACHE_TTL=300

# Enable compression
ENABLE_COMPRESSION=true

# Worker threads
WORKER_THREADS=4
```

### Import Configuration

```env
# apps/api/.env

# Streaming buffer size
STREAM_BUFFER_SIZE=65536

# Batch size for bulk imports
IMPORT_BATCH_SIZE=1000

# Enable parallel processing
ENABLE_PARALLEL_IMPORT=true

# Max parallel workers
MAX_IMPORT_WORKERS=4
```

### Security Configuration

```env
# apps/api/.env

# Rate limiting
ENABLE_RATE_LIMIT=true
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# HTTPS only (production)
FORCE_HTTPS=false

# Helmet security headers
ENABLE_HELMET=true

# CSRF protection
ENABLE_CSRF=false  # Set to true in production with forms
```

---

## Environment-Specific Configuration

### Development

```env
# apps/api/.env
NODE_ENV=development
LOG_LEVEL=debug
ENABLE_RATE_LIMIT=false
CORS_ORIGINS=*
```

### Production

```env
# apps/api/.env
NODE_ENV=production
LOG_LEVEL=warn
ENABLE_RATE_LIMIT=true
FORCE_HTTPS=true
CORS_ORIGINS=https://yourdomain.com
JWT_SECRET=<strong-random-secret>
```

### Testing

```env
# apps/api/.env.test
NODE_ENV=test
LOG_LEVEL=error
SQLITE_PATH=:memory:  # Use in-memory database
ENABLE_RATE_LIMIT=false
```

---

## Configuration Validation

### Validate Configuration

```bash
# Run validation script
npm run validate

# With verbose output
npm run validate --verbose
```

The validator checks:

- Node.js and npm versions
- Required environment variables
- Database connectivity
- Port availability
- File permissions
- JWT secret strength

### Example Output

```
✓ Node.js version: 18.17.0
✓ npm version: 9.6.7
✓ Environment file exists: apps/api/.env
✓ Required variables present
✓ SQLite path writable
✓ Port 4001 available
⚠ JWT_SECRET is default value (change in production)
✓ All checks passed!
```

---

## Configuration Examples

### Minimal Configuration (Local Development)

```env
# apps/api/.env
STORAGE_MODE=local
JWT_SECRET=dev-secret-change-in-production
```

That's it! Everything else uses defaults.

### Production Configuration (SQLite)

```env
# apps/api/.env
NODE_ENV=production
STORAGE_MODE=local
SQLITE_PATH=/var/lib/canvas-memory/canvas.db
LOCAL_DOCS_PATH=/var/lib/canvas-memory/docs

PORT=4001
HOST=0.0.0.0

JWT_SECRET=<generate-with: openssl rand -base64 32>
JWT_EXPIRES_IN=7d

CORS_ORIGINS=https://yourdomain.com

LOG_LEVEL=warn
LOG_FILE=/var/log/canvas-memory/api.log

ENABLE_RATE_LIMIT=true
FORCE_HTTPS=true
```

### Production Configuration (Neo4j Aura)

```env
# apps/api/.env
NODE_ENV=production
STORAGE_MODE=canvas

NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=<your-secure-password>

PORT=4001
JWT_SECRET=<generate-with: openssl rand -base64 32>
CORS_ORIGINS=https://yourdomain.com

LOG_LEVEL=warn
ENABLE_RATE_LIMIT=true
FORCE_HTTPS=true
```

---

## Troubleshooting Configuration

### Check Current Configuration

```bash
# View parsed configuration (sensitive values hidden)
curl http://localhost:4001/api/v1/config

# Check storage mode
curl http://localhost:4001/health | grep storageMode
```

### Common Configuration Issues

**Problem:** "JWT_SECRET must be at least 32 characters"

**Solution:**

```bash
# Generate a strong secret
openssl rand -base64 32

# Add to .env
echo "JWT_SECRET=$(openssl rand -base64 32)" >> apps/api/.env
```

**Problem:** "Cannot connect to database"

**Solution:**

- Check `STORAGE_MODE` is set correctly
- Verify Neo4j credentials if using `canvas` or `hybrid`
- Check database service is running: `docker ps | grep neo4j`

**Problem:** "Port already in use"

**Solution:**

```bash
# Change port
PORT=4002 npm run dev

# Or kill existing process
npm run kill-ports
```

For more troubleshooting, see the [Troubleshooting Guide](TROUBLESHOOTING.md).

---

## Next Steps

- **Test your configuration**: Run `npm run validate`
- **Start the server**: Follow the [Quick Start Guide](QUICK_START.md)
- **Secure for production**: See [Production Deployment](../deployment/PRODUCTION.md)
- **Understand authentication**: Read [Authentication Guide](../architecture/AUTHENTICATION.md)

---

## Reference

### All Environment Variables

Complete list of all available environment variables with defaults:

| Variable           | Default                      | Description                            |
| ------------------ | ---------------------------- | -------------------------------------- |
| `STORAGE_MODE`     | `local`                      | Storage backend: local\|canvas\|hybrid |
| `SQLITE_PATH`      | `~/.canvas-memory/canvas.db` | SQLite database file                   |
| `LOCAL_DOCS_PATH`  | `~/.canvas-memory`           | Document storage path                  |
| `NEO4J_URI`        | -                            | Neo4j connection URI                   |
| `NEO4J_USER`       | `neo4j`                      | Neo4j username                         |
| `NEO4J_PASSWORD`   | -                            | Neo4j password                         |
| `PORT`             | `4001`                       | API server port                        |
| `HOST`             | `0.0.0.0`                    | Server host binding                    |
| `NODE_ENV`         | `development`                | Environment mode                       |
| `JWT_SECRET`       | -                            | JWT signing secret (required)          |
| `JWT_EXPIRES_IN`   | `7d`                         | JWT expiration time                    |
| `CORS_ORIGINS`     | `*`                          | Allowed CORS origins                   |
| `LOG_LEVEL`        | `info`                       | Logging level                          |
| `MAX_FILE_SIZE_MB` | `10`                         | Max upload size                        |
| `FREE_MAX_SOURCES` | `500`                        | Free tier source limit                 |
| `FREE_MAX_NODES`   | `20000`                      | Free tier node limit                   |

See `.env.example` for the complete list.

---

**Last Updated**: 2025-10-15
**Related Docs**: [Quick Start](QUICK_START.md) | [Installation](INSTALLATION.md) | [Troubleshooting](TROUBLESHOOTING.md)
