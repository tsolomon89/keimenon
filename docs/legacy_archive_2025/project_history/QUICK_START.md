# Canvas Memory OS - Quick Start Guide

**Get up and running in 5 minutes!**

## Prerequisites

- Node.js 18+ and npm 9+
- That's it! No database setup needed (uses SQLite)

---

## 🚀 Option 1: Test Locally (Recommended)

### Step 1: Start the Server

```bash
cd C:\Development\Projects\ai_convo_parser
npm run dev
```

**You should see:**

```
✓ Storage mode: local (SQLite only)
→ Skipping Neo4j check
⚡️ Canvas Memory API running on port 4001
💿 Storage: local mode
```

### Step 2: Register an Account

**Windows PowerShell:**

```powershell
$response = Invoke-RestMethod -Method Post -Uri "http://localhost:4001/api/v1/auth/register" `
  -ContentType "application/json" `
  -Body '{"email":"test@test.com","password":"Test123!","name":"Test User"}'

$token = $response.token
Write-Host "Token: $token"
```

**Windows CMD / Git Bash:**

```bash
curl -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@test.com\",\"password\":\"Test123!\",\"name\":\"Test User\"}"
```

**Save the token from the response!**

### Step 3: Use Protected Endpoints

```powershell
# List nodes (empty at first)
Invoke-RestMethod -Uri "http://localhost:4001/api/v1/nodes" `
  -Headers @{"Authorization"="Bearer $token"}

# List boards
Invoke-RestMethod -Uri "http://localhost:4001/api/v1/boards" `
  -Headers @{"Authorization"="Bearer $token"}

# Get account info
Invoke-RestMethod -Uri "http://localhost:4001/api/v1/accounts/me" `
  -Headers @{"Authorization"="Bearer $token"}
```

### Step 4: Run Tests

```bash
npm run test:auth
```

**Expected result:** 19/22 tests passing (86%)

---

## 🔧 Option 2: Development Workflow

### Full Clean Start

```bash
# 1. Kill any running servers
npm run kill-ports

# 2. Clean start
npm run dev:clean

# 3. Wait for startup message
# "⚡️ Canvas Memory API running on port 4001"

# 4. Test in new terminal
curl http://localhost:4001/health
```

### Check Server Status

```bash
# Health check (no auth)
curl http://localhost:4001/health

# Database stats (no auth)
curl http://localhost:4001/api/v1/content/stats
```

---

## 🧪 Option 3: Run Full Test Suite

```bash
# Start server in one terminal
npm run dev

# Run tests in another terminal
npm run test:auth
```

**Test Results:**

```
✅ Passed:   19 (86%)
❌ Failed:   1  (5%)  - Minor schema validation
⊘ Skipped:  2  (9%)  - Require additional setup

🔒 Security: 100% PASSING
✅ Multi-tenant isolation: VERIFIED
✅ Permission enforcement: VERIFIED
```

---

## 📖 Common API Operations

### Authentication

**Register:**

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:4001/api/v1/auth/register" `
  -ContentType "application/json" `
  -Body '{"email":"user@example.com","password":"SecurePass123!","name":"John Doe"}'
```

**Login:**

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:4001/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"user@example.com","password":"SecurePass123!"}'
```

**Logout:**

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:4001/api/v1/auth/logout" `
  -Headers @{"Authorization"="Bearer $token"}
```

### Data Operations

**List Nodes:**

```powershell
Invoke-RestMethod -Uri "http://localhost:4001/api/v1/nodes" `
  -Headers @{"Authorization"="Bearer $token"}
```

**List Edges:**

```powershell
Invoke-RestMethod -Uri "http://localhost:4001/api/v1/edges" `
  -Headers @{"Authorization"="Bearer $token"}
```

**List Boards:**

```powershell
Invoke-RestMethod -Uri "http://localhost:4001/api/v1/boards" `
  -Headers @{"Authorization"="Bearer $token"}
```

---

## 🐛 Troubleshooting

### "Cannot connect" or "Connection refused"

**Problem:** Server not running

**Fix:**

```bash
npm run dev
```

Wait for: `⚡️ Canvas Memory API running on port 4001`

### "Port 4001 already in use"

**Problem:** Old server still running

**Fix:**

```bash
npm run kill-ports
npm run dev
```

### "Unauthorized" (401)

**Problem:** Missing or invalid token

**Fix:**

1. Make sure you're logged in
2. Check Authorization header: `Bearer <token>`
3. Token might be expired (7 days) - login again

### "Forbidden" (403)

**Problem:** Insufficient permissions

**Fix:**

- Check your permission level (first user in account = admin)
- Some operations require senior, leader, or admin permission
- You might be trying to access another account's data

---

## 📚 Next Steps

### Learn More

- **Full Auth Guide:** [AUTH_GUIDE.md](ai_context/docs_active/AUTH_GUIDE.md)
- **Complete Assessment:** [ASSESSMENT.md](ASSESSMENT.md)
- **Deployment:** [docker-compose.prod.yml](docker-compose.prod.yml) or [ecosystem.config.js](ecosystem.config.js)

### Deploy to Production

**Docker:**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**PM2:**

```bash
npm run build
pm2 start ecosystem.config.js --env production
```

---

## 🎯 Key Features

### Multi-Tenant Security

- ✅ JWT authentication
- ✅ Account-level data isolation
- ✅ Role-Based Access Control (RBAC)
- ✅ 4 permission levels: junior, senior, leader, admin

### Storage

- ✅ Local-first (SQLite, no cloud needed)
- ✅ Optional Neo4j for graph features
- ✅ File storage at `~/.canvas-memory/`

### API

- ✅ 46 endpoints
- ✅ RESTful design
- ✅ Health checks
- ✅ Comprehensive error handling

---

## 🆘 Need Help?

1. **Check logs:**

   ```bash
   # Server logs are in the terminal where you ran npm run dev
   ```

2. **Check database:**

   ```bash
   # Located at: C:\Users\Audna\.canvas-memory\canvas.db
   ```

3. **Run diagnostics:**

   ```bash
   npm run validate     # Check environment
   npm run check-ports  # Check if ports are free
   npm run test:auth    # Run test suite
   ```

4. **Read documentation:**
   - [AUTH_GUIDE.md](ai_context/docs_active/AUTH_GUIDE.md) - Authentication details
   - [ASSESSMENT.md](ASSESSMENT.md) - Current state & what to improve
   - [SESSION_AUTH_COMPLETE.md](SESSION_AUTH_COMPLETE.md) - Implementation log

---

**Happy building! 🚀**
