# Troubleshooting Guide

**Common issues and solutions for Canvas Memory OS**

Quick reference for diagnosing and fixing common problems. For installation issues, see the [Installation Guide](INSTALLATION.md).

---

## Quick Diagnostics

Run these commands first to diagnose issues:

```bash
# Check system requirements
node --version  # Should be >= 18.0.0
npm --version   # Should be >= 9.0.0

# Validate environment
npm run validate

# Check ports are available
npm run check-ports

# Test API health
curl http://localhost:4001/health
```

---

## Common Issues

### Server Won't Start

**Symptoms:**

- "Port already in use"
- "EADDRINUSE"
- Server exits immediately

**Solutions:**

```bash
# Kill processes on ports 3000 and 4001
npm run kill-ports

# Start server
npm run dev

# Or change port
PORT=4002 npm run dev
```

**Check what's using the port:**

```bash
# Windows
netstat -ano | findstr :4001

# Mac/Linux
lsof -i :4001
```

---

### Database Connection Errors

#### SQLite Issues

**Symptoms:**

- "SQLITE_BUSY: database is locked"
- "EACCES: permission denied"
- "unable to open database file"

**Solutions:**

```bash
# Check database location
ls -la ~/.canvas-memory/canvas.db  # Mac/Linux
dir %USERPROFILE%\.canvas-memory\canvas.db  # Windows

# Fix permissions
mkdir -p ~/.canvas-memory
chmod 755 ~/.canvas-memory

# Delete corrupted database (WARNING: loses data)
rm ~/.canvas-memory/canvas.db
npm run dev  # Recreates fresh database

# Backup before deleting
npm run backup
```

#### Neo4j Issues

**Symptoms:**

- "Failed to connect to Neo4j"
- "ServiceUnavailable"
- "Connection timeout"

**Solutions:**

```bash
# Check Neo4j is running
docker ps | grep neo4j

# Check Neo4j logs
docker logs neo4j

# Restart Neo4j
docker restart neo4j

# Test connection
curl http://localhost:7474

# Verify credentials
# Check apps/api/.env has correct NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
```

---

### Authentication Errors

#### "Unauthorized" (401)

**Causes:**

- Missing Authorization header
- Invalid or expired token
- Malformed token

**Solutions:**

```bash
# Check you registered an account
curl -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!","name":"Test"}'

# Check token format
# Must be: Authorization: Bearer <token>

# Token might be expired (default 7 days) - login again
curl -X POST http://localhost:4001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}'
```

#### "Forbidden" (403)

**Causes:**

- Insufficient permissions
- Trying to access another account's data

**Solutions:**

```bash
# Check your permission level
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4001/api/v1/auth/me

# First user in account gets admin automatically
# Request permission upgrade from account admin
```

#### JWT Secret Issues

**Symptoms:**

- "JWT_SECRET must be at least 32 characters"
- "JsonWebTokenError: invalid signature"

**Solutions:**

```bash
# Generate strong secret
openssl rand -base64 32

# Add to apps/api/.env
JWT_SECRET=<generated-secret>

# Restart server
npm run dev
```

---

### Module Resolution Errors

**Symptoms:**

- "Cannot find module '@canvas-memory/types'"
- "Module not found"
- TypeScript compilation errors

**Solutions:**

```bash
# Clear all caches
rm -rf node_modules .turbo
npm install

# Build packages in dependency order
cd packages/types && npm run build
cd ../db && npm run build
cd ../ui && npm run build

# Or build all at once
npm run build
```

---

### Import / Upload Errors

#### "File too large"

**Solution:**

```env
# apps/api/.env
MAX_FILE_SIZE_MB=50  # Increase limit
```

#### "Unsupported file type"

**Solution:**

```env
# apps/api/.env
ALLOWED_FILE_TYPES=.pdf,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.zip
```

#### Import hangs or times out

**Solutions:**

```bash
# Check file is valid JSON
cat your-file.json | python -m json.tool

# Use streaming import for large files
curl -X POST http://localhost:4001/api/v1/import/stream \
  -F "file=@large-file.json"

# Check server logs
# Server logs appear in terminal where you ran npm run dev
```

---

### Performance Issues

#### Slow queries

**Solutions:**

```bash
# For SQLite: Vacuum and optimize
sqlite3 ~/.canvas-memory/canvas.db "VACUUM; ANALYZE;"

# For Neo4j: Check indexes
# In Neo4j Browser: SHOW INDEXES

# Enable query caching
# In apps/api/.env:
ENABLE_QUERY_CACHE=true
CACHE_TTL=300
```

#### High memory usage

**Solutions:**

```bash
# Reduce batch size
# In apps/api/.env:
IMPORT_BATCH_SIZE=500  # Default is 1000

# Limit concurrent operations
MAX_IMPORT_WORKERS=2  # Default is 4
```

---

### Frontend Issues

#### "Failed to fetch"

**Causes:**

- API server not running
- CORS configuration
- Wrong API URL

**Solutions:**

```bash
# Check API is running
curl http://localhost:4001/health

# Check API URL in apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4001

# Check CORS in apps/api/.env
CORS_ORIGINS=http://localhost:3000

# Restart both servers
npm run kill-ports
npm run dev
```

#### Canvas not rendering

**Solutions:**

```bash
# Check browser console for errors
# Open DevTools (F12) -> Console tab

# Verify data exists
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4001/api/v1/nodes

# Check network tab shows successful API calls
```

---

## Platform-Specific Issues

### Windows

**PowerShell script execution policy:**

```powershell
# If you see "cannot be loaded because running scripts is disabled"
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**Path issues:**

```bash
# Use forward slashes or double backslashes
SQLITE_PATH=C:/Users/YourName/.canvas-memory/canvas.db
# OR
SQLITE_PATH=C:\\Users\\YourName\\.canvas-memory\\canvas.db
```

### Mac

**Node installed via Homebrew:**

```bash
# May need to set paths
export PATH="/usr/local/bin:$PATH"

# Or use nvm
nvm install 18
nvm use 18
```

### Linux

**Permission errors:**

```bash
# Don't run as root
# If you accidentally did:
sudo chown -R $USER:$USER ~/.canvas-memory
sudo chown -R $USER:$USER ./node_modules
```

---

## Advanced Diagnostics

### Enable Debug Logging

```env
# apps/api/.env
LOG_LEVEL=debug
```

Restart server and check detailed logs.

### Check Database Integrity

**SQLite:**

```bash
sqlite3 ~/.canvas-memory/canvas.db "PRAGMA integrity_check;"
```

**Neo4j:**

```cypher
// In Neo4j Browser
CALL dbms.queryJmx("org.neo4j:instance=kernel#0,name=Store file sizes")
```

### Network Diagnostics

```bash
# Check if API is responding
curl -v http://localhost:4001/health

# Test with different tool
wget http://localhost:4001/health

# Check firewall
# Windows: Check Windows Defender Firewall settings
# Mac: System Preferences -> Security & Privacy -> Firewall
# Linux: sudo ufw status
```

---

## Getting Help

If you've tried everything and still have issues:

1. **Check logs**: Server logs are in the terminal where you ran `npm run dev`

2. **Run full diagnostics**:

   ```bash
   npm run validate --verbose
   npm run check-ports
   npm run test:auth
   ```

3. **Gather information**:
   - Node.js version: `node --version`
   - npm version: `npm --version`
   - Operating system
   - Error messages (exact text)
   - Steps to reproduce

4. **Search existing issues**: Check GitHub issues for similar problems

5. **Create new issue**: If not found, create a new issue with:
   - Description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment information
   - Relevant logs (remove sensitive data)

---

## Preventive Maintenance

### Regular Checks

```bash
# Weekly: Update dependencies
npm update

# Monthly: Clear old data
npm run backup
sqlite3 ~/.canvas-memory/canvas.db "VACUUM;"

# Check disk space
df -h ~/.canvas-memory  # Mac/Linux
dir %USERPROFILE%\.canvas-memory  # Windows
```

### Backup Strategy

```bash
# Manual backup
npm run backup

# Compressed backup
npm run backup:compress

# Restore from backup
npm run restore -- --file=backup-2025-10-15.db

# Automated backups (cron/Task Scheduler)
# Add to crontab:
# 0 2 * * * cd /path/to/project && npm run backup:compress
```

---

## Related Documentation

- [Installation Guide](INSTALLATION.md) - Setup instructions
- [Configuration Guide](CONFIGURATION.md) - All configuration options
- [Development Scripts](../development/SCRIPTS.md) - Available commands
- [API Reference](../specifications/API_REFERENCE.md) - API documentation

---

**Last Updated**: 2025-10-15
**Related Docs**: [Quick Start](QUICK_START.md) | [Installation](INSTALLATION.md) | [Configuration](CONFIGURATION.md)
