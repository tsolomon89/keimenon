# Quick Start Guide

**Get Canvas Memory OS running in 5 minutes!**

This guide gets you up and running with the fastest path to a working system. For detailed setup instructions, see the [Installation Guide](INSTALLATION.md).

---

## Prerequisites

- **Node.js 18+** and **npm 9+**
- That's it! No cloud services or database setup required (uses local SQLite)

**Check your versions:**

```bash
node --version  # Should be v18.0.0 or higher
npm --version   # Should be 9.0.0 or higher
```

---

## 🚀 Quick Start (Local-First Mode)

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd ai_convo_parser

# Install dependencies
npm install
```

### Step 2: Start the Server

```bash
# Start the API server (local SQLite mode)
npm run dev
```

**✅ You should see:**

```
✓ Storage mode: local (SQLite only)
→ Skipping Neo4j check
⚡️ Canvas Memory API running on port 4001
💿 Storage: local mode
📁 Database: ~/.canvas-memory/canvas.db
```

### Step 3: Register an Account

The system requires authentication. Register your first account:

**On Windows (PowerShell):**

```powershell
$response = Invoke-RestMethod -Method Post -Uri "http://localhost:4001/api/v1/auth/register" `
  -ContentType "application/json" `
  -Body '{"email":"test@test.com","password":"Test123!","name":"Test User"}'

$token = $response.token
Write-Host "Token: $token"
```

**On Windows (CMD) or Git Bash:**

```bash
curl -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@test.com\",\"password\":\"Test123!\",\"name\":\"Test User\"}"
```

**On Mac/Linux:**

```bash
curl -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!","name":"Test User"}'
```

**💾 Save the token from the response!** You'll need it for all API requests.

### Step 4: Test the API

**PowerShell:**

```powershell
# List nodes (empty at first)
Invoke-RestMethod -Uri "http://localhost:4001/api/v1/nodes" `
  -Headers @{"Authorization"="Bearer $token"}

# Get database stats
Invoke-RestMethod -Uri "http://localhost:4001/api/v1/content/stats" `
  -Headers @{"Authorization"="Bearer $token"}
```

**Bash:**

```bash
# List nodes
curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/api/v1/nodes

# Get database stats
curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/api/v1/content/stats
```

### Step 5: (Optional) Start the Frontend

```bash
# In a new terminal window
cd apps/web
npm run dev
```

**Access the UI:**

- 🌐 Web UI: http://localhost:3000
- 🎨 Canvas View: http://localhost:3000/canvas
- 📥 Import UI: http://localhost:3000/ingest

---

## ✅ Verify Everything Works

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
  "timestamp": "2025-10-15T..."
}
```

### 2. Check Database

```bash
# Database is automatically created at:
# Windows: C:\Users\<YourName>\.canvas-memory\canvas.db
# Mac/Linux: ~/.canvas-memory/canvas.db
```

### 3. Run Test Suite

```bash
npm run test:auth
```

**Expected:** 26/28 tests passing (93%)

---

## 🎯 What You Can Do Now

### Import Chat Conversations

```bash
# Import a ChatGPT or Claude export
curl -X POST http://localhost:4001/api/v1/import/enhanced \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@path/to/conversations.json" \
  -F 'config={"sources":{"enabled":true},"code":{"enabled":true}}'
```

### Create Nodes

```powershell
# Create a source node
Invoke-RestMethod -Method Post -Uri "http://localhost:4001/api/v1/nodes/source" `
  -Headers @{"Authorization"="Bearer $token"} `
  -ContentType "application/json" `
  -Body '{"title":"My First Source","content":"Hello World"}'
```

### List Your Data

```bash
# List all nodes
curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/api/v1/nodes

# List all edges
curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/api/v1/edges

# Get analytics
curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/api/v1/analytics/summary
```

---

## 🔧 Alternative: Neo4j Mode

Want to use Neo4j instead of SQLite? See the [Installation Guide](INSTALLATION.md#neo4j-setup) for Neo4j setup instructions.

Quick version:

```bash
# 1. Start Neo4j with Docker
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/testpassword \
  neo4j:5.19

# 2. Configure .env
echo "STORAGE_MODE=canvas" >> apps/api/.env
echo "NEO4J_URI=bolt://localhost:7687" >> apps/api/.env
echo "NEO4J_USER=neo4j" >> apps/api/.env
echo "NEO4J_PASSWORD=testpassword" >> apps/api/.env

# 3. Start server
npm run dev
```

---

## 🐛 Common Issues

### "Cannot connect" or "ECONNREFUSED"

**Problem:** Server not running

**Solution:**

```bash
# Make sure you're in the project directory
cd ai_convo_parser

# Start the server
npm run dev
```

Wait for the startup message: `⚡️ Canvas Memory API running on port 4001`

### "Port 4001 already in use"

**Problem:** Another process is using the port

**Solution:**

```bash
# Kill existing processes on ports 3000 and 4001
npm run kill-ports

# Start again
npm run dev
```

### "Unauthorized" (401)

**Problem:** Missing or invalid auth token

**Solution:**

1. Make sure you registered an account
2. Check your Authorization header: `Bearer <token>`
3. Token might be expired (7 days) - register or login again

### "Forbidden" (403)

**Problem:** Insufficient permissions

**Solution:**

- First user in an account gets admin permission automatically
- Check your permission level: `curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/api/v1/auth/me`
- Some operations require specific permission levels (see [Authentication Guide](../architecture/AUTHENTICATION.md))

### Database Issues

**Problem:** Database errors or corruption

**Solution:**

```bash
# Backup current database
npm run backup

# Reset database (WARNING: deletes all data)
rm ~/.canvas-memory/canvas.db  # Mac/Linux
# OR
del %USERPROFILE%\.canvas-memory\canvas.db  # Windows

# Restart server (creates fresh database)
npm run dev
```

---

## 📚 Next Steps

Now that you're up and running:

1. **Learn about features**: Read the [Chat Import Guide](../features/CHAT_IMPORT.md)
2. **Understand architecture**: Check the [System Overview](../architecture/OVERVIEW.md)
3. **Set up authentication**: See [Authentication Guide](../architecture/AUTHENTICATION.md)
4. **Deploy to production**: Read [Production Deployment](../deployment/PRODUCTION.md)

### More Documentation

- [Installation Guide](INSTALLATION.md) - Detailed setup instructions
- [Configuration](CONFIGURATION.md) - Environment variables and settings
- [Troubleshooting](TROUBLESHOOTING.md) - Comprehensive troubleshooting guide
- [API Reference](../specifications/API_REFERENCE.md) - Complete API documentation

---

## 🆘 Need Help?

1. **Check logs**: Server logs appear in the terminal where you ran `npm run dev`
2. **Run diagnostics**:
   ```bash
   npm run validate     # Check environment
   npm run check-ports  # Check if ports are free
   npm run test:auth    # Run authentication tests
   ```
3. **Check troubleshooting**: See [Troubleshooting Guide](TROUBLESHOOTING.md)
4. **Create an issue**: If you found a bug, create an issue on GitHub

---

## 🎉 Success!

You now have Canvas Memory OS running locally with:

- ✅ Local SQLite database (zero configuration)
- ✅ Multi-tenant authentication
- ✅ REST API on port 4001
- ✅ Complete data ownership
- ✅ No cloud dependencies

**Happy building! 🚀**

---

**Last Updated**: 2025-12-10
**Related Docs**: [Installation](INSTALLATION.md) | [Configuration](CONFIGURATION.md) | [Troubleshooting](TROUBLESHOOTING.md)
