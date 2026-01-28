# Installation Guide

**Complete installation instructions for Keimenon**

This guide covers all installation scenarios: local development, cloud deployment, and hybrid modes. For a quick 5-minute setup, see the [Quick Start Guide](QUICK_START.md).

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
  - [Local-First (SQLite)](#option-a-local-first-sqlite-recommended)
  - [Neo4j Cloud](#option-b-neo4j-cloud)
  - [Hybrid Mode](#option-c-hybrid-mode)
- [Post-Installation](#post-installation)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- **Node.js 18.0.0+** - [Download](https://nodejs.org/)
- **npm 9.0.0+** - Comes with Node.js

### Optional (depending on storage mode)

- **Docker** - For running Neo4j locally
- **Neo4j Aura Account** - For cloud Neo4j ($65-200/month)

### Check Your System

```bash
# Check Node.js version
node --version  # Should print v18.0.0 or higher

# Check npm version
npm --version   # Should print 9.0.0 or higher

# Check Docker (optional)
docker --version
```

---

## Installation Methods

Choose the installation method that best fits your needs:

| Method                   | Cost       | Setup Time | Best For                                   |
| ------------------------ | ---------- | ---------- | ------------------------------------------ |
| **Local-First (SQLite)** | Free       | 5 minutes  | Development, personal use, testing         |
| **Neo4j Cloud**          | $65-200/mo | 15 minutes | Production, large datasets, graph features |
| **Hybrid Mode**          | $65-200/mo | 20 minutes | Best of both worlds, Pro tier              |

---

## Option A: Local-First (SQLite) ⭐ Recommended

**Benefits:**

- ✅ Zero ongoing costs ($0/month)
- ✅ Complete data ownership
- ✅ No internet required
- ✅ Privacy by default
- ✅ Fast local queries
- ✅ Simple backups (copy `.db` file)

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd ai_convo_parser

# Install all dependencies
npm install
```

This installs dependencies for all workspaces in the monorepo.

### 2. Configure Environment (Optional)

The system works out-of-the-box with sensible defaults. Optionally customize:

```bash
# Create environment file
cd apps/api
cp .env.example .env
```

Edit `apps/api/.env`:

```env
# Storage Configuration
STORAGE_MODE=local              # Use SQLite
SQLITE_PATH=~/.keimenon/keimenon.db
LOCAL_DOCS_PATH=~/.keimenon

# Server Configuration
PORT=4001
NODE_ENV=development

# Authentication
JWT_SECRET=change-this-in-production-minimum-32-characters
JWT_EXPIRES_IN=7d

# Limits (Free tier defaults)
FREE_MAX_SOURCES=500
FREE_MAX_NODES=20000
FREE_MAX_GROUPS=50
FREE_STORAGE_GB=5
```

### 3. Start the Server

```bash
# From project root
npm run dev
```

**✅ Success indicators:**

```
✓ Storage mode: local (SQLite only)
→ Skipping Neo4j check
⚡️ Keimenon API running on port 4001
💿 Storage: local mode
📁 Database: ~/.keimenon/keimenon.db
```

### 4. Register Your First Account

See [Quick Start - Step 3](QUICK_START.md#step-3-register-an-account) for authentication setup.

---

## Option B: Neo4j Cloud

**When to use:**

- Large datasets (>50k nodes)
- Advanced graph queries
- Team collaboration features
- Production deployment

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd ai_convo_parser

# Install dependencies
npm install
```

### 2. Set Up Neo4j

#### Option B1: Neo4j Aura (Cloud) 💵

1. Sign up at [neo4j.com/cloud/aura](https://neo4j.com/cloud/aura/)
2. Create a new instance (Free tier available for testing)
3. Note your credentials:
   - **URI**: `neo4j+s://xxxxx.databases.neo4j.io`
   - **Username**: `neo4j`
   - **Password**: (generated password)

#### Option B2: Local Neo4j (Docker) 🐳

```bash
# Start Neo4j with Docker
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/testpassword \
  -e NEO4J_PLUGINS='["apoc"]' \
  neo4j:5.19

# Verify it's running
docker ps | grep neo4j

# Access Neo4j Browser at http://localhost:7474
```

#### Option B3: Using Docker Compose

```bash
# Start all services including Neo4j
docker-compose -f docker-compose.dev.yml up -d neo4j

# View logs
docker-compose logs -f neo4j
```

### 3. Configure Environment

```bash
cd apps/api
cp .env.example .env
```

Edit `apps/api/.env`:

```env
# Storage Configuration
STORAGE_MODE=keimenon             # Use Neo4j
NEO4J_URI=bolt://localhost:7687 # Or neo4j+s://... for Aura
NEO4J_USER=neo4j
NEO4J_PASSWORD=testpassword     # Your password

# Server Configuration
PORT=4001
NODE_ENV=development

# Authentication
JWT_SECRET=change-this-in-production-minimum-32-characters
JWT_EXPIRES_IN=7d
```

### 4. Start the Server

```bash
# From project root
npm run dev
```

**✅ Success indicators:**

```
✓ Connected to Neo4j
✓ Storage mode: keimenon (Neo4j)
⚡️ Keimenon API running on port 4001
💿 Storage: Neo4j mode
🔌 Neo4j: bolt://localhost:7687
```

### 5. Verify Neo4j Connection

```bash
# Test Neo4j Browser
open http://localhost:7474  # Mac
start http://localhost:7474  # Windows

# Or check via API
curl http://localhost:4001/health
```

---

## Option C: Hybrid Mode

**When to use:**

- Want local-first benefits with Neo4j graph features
- Professional/Business tier
- Background sync to Neo4j for advanced queries

### 1. Set Up Both Databases

Follow steps from both Option A and Option B to:

1. Install dependencies
2. Set up Neo4j (Aura or local)

### 2. Configure Hybrid Mode

Edit `apps/api/.env`:

```env
# Hybrid Storage Configuration
STORAGE_MODE=hybrid                      # Use both!

# SQLite Configuration
SQLITE_PATH=~/.keimenon/keimenon.db
LOCAL_DOCS_PATH=~/.keimenon

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=testpassword

# Server Configuration
PORT=4001
NODE_ENV=development

# Authentication
JWT_SECRET=change-this-in-production-minimum-32-characters
JWT_EXPIRES_IN=7d
```

### 3. Start the Server

```bash
npm run dev
```

**✅ Success indicators:**

```
✓ Connected to Neo4j
✓ Storage mode: hybrid (SQLite + Neo4j)
⚡️ Keimenon API running on port 4001
💿 Primary: SQLite (reads/writes)
🔄 Secondary: Neo4j (sync for graph queries)
```

**How it works:**

- **Writes**: Go to both SQLite and Neo4j
- **Reads**: Served from SQLite (faster)
- **Graph queries**: Use Neo4j when needed
- **Best of both worlds**: Local speed + cloud features

---

## Post-Installation

### Initialize Database Schema

The database schema is automatically initialized on first start. For manual initialization:

```bash
# SQLite mode - automatic on startup

# Neo4j mode - run constraints manually
cd apps/api
npm run db:init
```

### Set Up Frontend (Optional)

The API works independently, but you can also run the web UI:

```bash
# Install frontend dependencies
npm install --workspace=@keimenon/web

# Configure frontend
cd apps/web
cp .env.example .env.local
```

Edit `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4001

# Feature Flags
NEXT_PUBLIC_ENABLE_PRO_FEATURES=false
NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES=false
```

Start the frontend:

```bash
# From apps/web directory
npm run dev

# Or from project root
npm run dev  # Starts both API and frontend
```

Access at http://localhost:3000

---

## Verification

### 1. Check API Health

```bash
curl http://localhost:4001/health
```

**Expected response:**

```json
{
  "status": "healthy",
  "storageMode": "local",
  "database": "sqlite",
  "version": "0.1.0",
  "timestamp": "2025-10-15T..."
}
```

### 2. Check Database

**SQLite:**

```bash
# Database file location
ls ~/.keimenon/keimenon.db  # Mac/Linux
dir %USERPROFILE%\.keimenon\keimenon.db  # Windows

# Query the database
sqlite3 ~/.keimenon/keimenon.db "SELECT COUNT(*) FROM nodes;"
```

**Neo4j:**

```bash
# Open Neo4j Browser
open http://localhost:7474

# Run test query
# MATCH (n) RETURN COUNT(n) as node_count
```

### 3. Run Test Suite

```bash
# Authentication tests
npm run test:auth

# Expected: 26/28 tests passing (93%)
```

### 4. Test API Endpoints

```bash
# Register an account
curl -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!","name":"Test User"}'

# Save the token from response, then:
TOKEN="your-token-here"

# Test authenticated endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4001/api/v1/nodes

# Check database stats
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4001/api/v1/content/stats
```

---

## Troubleshooting

### Module Resolution Errors

```bash
# Clear caches and reinstall
rm -rf node_modules .turbo
npm install

# Build packages in order
cd packages/types && npm run build
cd ../db && npm run build
cd ../../apps/api
```

### Neo4j Connection Issues

**Problem:** Can't connect to Neo4j

**Solutions:**

```bash
# Check Neo4j is running
docker ps | grep neo4j

# Check Neo4j logs
docker logs neo4j

# Test connection
curl http://localhost:7474

# Verify credentials in .env match Neo4j
```

### Port Conflicts

**Problem:** "Port 4001 already in use"

**Solutions:**

```bash
# Kill processes on ports 3000 and 4001
npm run kill-ports

# Or change the port
PORT=4002 npm run dev
```

### Database Initialization Failed

**Problem:** Schema not created

**Solutions:**

```bash
# SQLite: Delete and recreate
rm ~/.keimenon/keimenon.db
npm run dev  # Recreates on startup

# Neo4j: Manually run constraints
# See apps/api/src/db/neo4j-client.ts for constraint definitions
```

### TypeScript Compilation Errors

**Problem:** "Cannot find module @keimenon/types"

**Solutions:**

```bash
# Build all packages
npm run build

# Or build packages individually in order
cd packages/types && npm run build
cd ../db && npm run build
cd ../ui && npm run build
```

### Permission Errors (SQLite)

**Problem:** "EACCES: permission denied"

**Solutions:**

```bash
# Check directory permissions
ls -la ~/.keimenon/

# Create directory with correct permissions
mkdir -p ~/.keimenon
chmod 755 ~/.keimenon

# Or set custom path
SQLITE_PATH=/tmp/keimenon.db npm run dev
```

For more troubleshooting, see the [Troubleshooting Guide](TROUBLESHOOTING.md).

---

## Next Steps

✅ **Installation complete!** Now you can:

1. **Learn the basics**: Read the [Quick Start Guide](QUICK_START.md)
2. **Import data**: See the [Chat Import Guide](../features/CHAT_IMPORT.md)
3. **Configure the system**: Check [Configuration Guide](CONFIGURATION.md)
4. **Understand architecture**: Read [System Overview](../architecture/OVERVIEW.md)
5. **Deploy to production**: See [Production Deployment](../deployment/PRODUCTION.md)

---

## Additional Resources

- [Quick Start Guide](QUICK_START.md) - 5-minute setup
- [Configuration Guide](CONFIGURATION.md) - Environment variables
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues
- [Development Scripts](../development/SCRIPTS.md) - Dev commands
- [API Reference](../specifications/API_REFERENCE.md) - Complete API docs

---

**Last Updated**: 2025-10-15
**Related Docs**: [Quick Start](QUICK_START.md) | [Configuration](CONFIGURATION.md) | [Troubleshooting](TROUBLESHOOTING.md)
