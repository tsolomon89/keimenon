# Production Deployment Guide

**Last Updated**: October 21, 2025
**Status**: ✅ Ready for Production

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Setup](#environment-setup)
4. [Deployment Options](#deployment-options)
5. [Database Setup](#database-setup)
6. [Security Hardening](#security-hardening)
7. [Monitoring & Logging](#monitoring--logging)
8. [Backup & Recovery](#backup--recovery)
9. [Scaling Guide](#scaling-guide)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Canvas Memory OS is designed as a **local-first** application that runs entirely on the user's machine. This guide covers deployment scenarios:

- **Free Tier**: Fully local deployment (no server required)
- **Pro Tier**: Local deployment with optional cloud sync
- **Business Tier**: Self-hosted deployment with team access

---

## Pre-Deployment Checklist

### Critical Requirements

- [ ] **Node.js 18+** installed
- [ ] **npm 9+** or compatible package manager
- [ ] **SQLite 3.35+** (included with better-sqlite3)
- [ ] **SSL/TLS certificate** (production only)
- [ ] **Firewall configured** (if network-accessible)
- [ ] **Backup strategy** in place
- [ ] **Monitoring solution** configured

### Security Checklist

- [ ] `JWT_SECRET` changed from default
- [ ] `NODE_ENV=production` set
- [ ] CORS origins configured (`ALLOWED_ORIGINS`)
- [ ] Rate limiting enabled
- [ ] Account lockout configured
- [ ] Audit logging enabled
- [ ] Error tracking configured (optional)

### Performance Checklist

- [ ] Database indexes verified
- [ ] WAL mode enabled (SQLite)
- [ ] File upload limits configured
- [ ] Memory limits set (Node.js)
- [ ] Log rotation configured

---

## Environment Setup

### 1. Backend Environment Variables

Create `apps/api/.env`:

```bash
# =============================================================================
# SERVER CONFIGURATION
# =============================================================================
PORT=4001
NODE_ENV=production

# =============================================================================
# STORAGE MODE
# =============================================================================
STORAGE_MODE=local  # Options: local, canvas (neo4j), hybrid
LOCAL_DOCS_PATH=/var/lib/canvas-memory
SQLITE_PATH=/var/lib/canvas-memory/canvas.db
STORAGE_PATH=/var/lib/canvas-memory/storage
MAX_FILE_SIZE_MB=10

# =============================================================================
# SECURITY (CRITICAL!)
# =============================================================================
# Generate with: openssl rand -base64 32
JWT_SECRET=YOUR_PRODUCTION_SECRET_HERE_CHANGE_THIS

# Comma-separated list of allowed origins
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# =============================================================================
# RATE LIMITING
# =============================================================================
AUTH_RATE_LIMIT=5           # Login attempts per 15 min
REGISTRATION_RATE_LIMIT=5   # Registration attempts per hour
API_RATE_LIMIT=100          # API requests per minute

# =============================================================================
# ACCOUNT LOCKOUT
# =============================================================================
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30
LOGIN_ATTEMPT_WINDOW_MINUTES=15

# =============================================================================
# LOGGING & MONITORING
# =============================================================================
LOG_LEVEL=info              # error, warn, info, debug
REQUEST_LOGGING=true
AUDIT_LOG_RETENTION_DAYS=90

# =============================================================================
# ERROR TRACKING (Optional - Sentry)
# =============================================================================
# SENTRY_DSN=https://your-dsn@sentry.io/project-id
# SENTRY_ENVIRONMENT=production
# SENTRY_SAMPLE_RATE=1.0
# SENTRY_TRACES_SAMPLE_RATE=0.1

# =============================================================================
# TIER LIMITS
# =============================================================================
FREE_MAX_SOURCES=500
FREE_MAX_NODES=20000
FREE_MAX_GROUPS=50
FREE_STORAGE_GB=5
```

### 2. Frontend Environment Variables

Create `apps/web/.env.production`:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Storage Mode (must match backend)
NEXT_PUBLIC_STORAGE_MODE=local

# Feature Flags
NEXT_PUBLIC_ENABLE_PRO_FEATURES=false
NEXT_PUBLIC_ENABLE_BUSINESS_FEATURES=false

# Error Tracking (Optional)
# NEXT_PUBLIC_SENTRY_DSN=https://your-frontend-dsn@sentry.io/project-id
# NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
# NEXT_PUBLIC_SENTRY_SAMPLE_RATE=1.0
```

### 3. Generate JWT Secret

```bash
# Option 1: OpenSSL
openssl rand -base64 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Add result to JWT_SECRET in .env
```

---

## Deployment Options

### Option 1: Local Desktop App (Free Tier)

**Best For**: Individual users, no network access needed

**Steps**:

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Build Backend**:

   ```bash
   cd apps/api
   npm run build
   ```

3. **Build Frontend**:

   ```bash
   cd apps/web
   npm run build
   ```

4. **Start Production Servers**:

   ```bash
   # Terminal 1 (Backend)
   cd apps/api
   npm start

   # Terminal 2 (Frontend)
   cd apps/web
   npm start
   ```

5. **Access Application**:
   - Open browser: `http://localhost:3000`

**Data Location**: `~/.canvas-memory/`

---

### Option 2: Self-Hosted Server (Business Tier)

**Best For**: Teams, network access required

#### Using PM2 (Recommended)

1. **Install PM2**:

   ```bash
   npm install -g pm2
   ```

2. **Create PM2 Ecosystem File** (`ecosystem.config.js`):

   ```javascript
   module.exports = {
     apps: [
       {
         name: 'canvas-api',
         cwd: './apps/api',
         script: 'npm',
         args: 'start',
         env: {
           NODE_ENV: 'production',
           PORT: 4001,
         },
         instances: 2,
         exec_mode: 'cluster',
         max_memory_restart: '500M',
         error_file: '/var/log/canvas-memory/api-error.log',
         out_file: '/var/log/canvas-memory/api-out.log',
         log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
       },
       {
         name: 'canvas-web',
         cwd: './apps/web',
         script: 'npm',
         args: 'start',
         env: {
           NODE_ENV: 'production',
           PORT: 3000,
         },
         instances: 1,
         max_memory_restart: '1G',
         error_file: '/var/log/canvas-memory/web-error.log',
         out_file: '/var/log/canvas-memory/web-out.log',
         log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
       },
     ],
   };
   ```

3. **Build and Start**:

   ```bash
   # Build
   npm run build

   # Start with PM2
   pm2 start ecosystem.config.js

   # Save PM2 configuration
   pm2 save

   # Setup PM2 to start on boot
   pm2 startup
   ```

4. **Verify Status**:
   ```bash
   pm2 status
   pm2 logs
   ```

#### Using Systemd (Alternative)

1. **Create Service File** (`/etc/systemd/system/canvas-api.service`):

   ```ini
   [Unit]
   Description=Canvas Memory OS API Server
   After=network.target

   [Service]
   Type=simple
   User=canvas
   WorkingDirectory=/opt/canvas-memory/apps/api
   Environment="NODE_ENV=production"
   Environment="PORT=4001"
   ExecStart=/usr/bin/npm start
   Restart=on-failure
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

2. **Enable and Start**:
   ```bash
   sudo systemctl enable canvas-api
   sudo systemctl start canvas-api
   sudo systemctl status canvas-api
   ```

---

### Option 3: Docker Deployment

#### Docker Compose Setup

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - '4001:4001'
    environment:
      - NODE_ENV=production
      - PORT=4001
      - SQLITE_PATH=/data/canvas.db
    volumes:
      - canvas-data:/data
      - ./apps/api/.env:/app/.env
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:4001/health']
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://api:4001
    depends_on:
      - api
    restart: unless-stopped

volumes:
  canvas-data:
    driver: local
```

#### Dockerfiles

**Backend** (`apps/api/Dockerfile`):

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY apps/api ./apps/api
COPY packages ./packages

# Build
WORKDIR /app/apps/api
RUN npm run build

# Expose port
EXPOSE 4001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node healthcheck.js || exit 1

# Start
CMD ["npm", "start"]
```

**Frontend** (`apps/web/Dockerfile`):

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY apps/web ./apps/web

# Build
WORKDIR /app/apps/web
RUN npm run build

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "start"]
```

**Start Docker Deployment**:

```bash
docker-compose up -d
docker-compose logs -f
```

---

## Database Setup

### SQLite Configuration

1. **Create Data Directory**:

   ```bash
   sudo mkdir -p /var/lib/canvas-memory
   sudo chown -R canvas:canvas /var/lib/canvas-memory
   sudo chmod 750 /var/lib/canvas-memory
   ```

2. **Initialize Database** (automatic on first run):
   - Database schema is embedded in `packages/db/src/sqlite/schema.sql`
   - Migrations run automatically on startup

3. **Verify Database**:

   ```bash
   sqlite3 /var/lib/canvas-memory/canvas.db

   # Check tables
   .tables

   # Check schema version
   SELECT * FROM schema_info;

   # Exit
   .quit
   ```

4. **Database Permissions**:
   ```bash
   sudo chmod 640 /var/lib/canvas-memory/canvas.db
   sudo chown canvas:canvas /var/lib/canvas-memory/canvas.db
   ```

### WAL Mode (Write-Ahead Logging)

Enable WAL mode for better concurrency:

```bash
sqlite3 /var/lib/canvas-memory/canvas.db "PRAGMA journal_mode=WAL;"
```

---

## Security Hardening

### 1. Firewall Configuration

```bash
# Allow SSH (if needed)
sudo ufw allow 22/tcp

# Allow HTTPS only (behind reverse proxy)
sudo ufw allow 443/tcp

# Block direct access to API/Web ports (use reverse proxy)
sudo ufw deny 3000/tcp
sudo ufw deny 4001/tcp

# Enable firewall
sudo ufw enable
```

### 2. Reverse Proxy (Nginx)

Create `/etc/nginx/sites-available/canvas-memory`:

```nginx
# API Server
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req zone=api_limit burst=20 nodelay;

    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # SSE endpoints need longer timeouts
    location /api/v1/stream/ {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}

# Web App
server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com app.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/canvas-memory /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. SSL/TLS Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificates
sudo certbot --nginx -d api.yourdomain.com -d app.yourdomain.com

# Auto-renewal (already configured by Certbot)
sudo systemctl status certbot.timer
```

### 4. File Permissions

```bash
# Application files
sudo chown -R canvas:canvas /opt/canvas-memory
sudo chmod -R 750 /opt/canvas-memory

# Data directory
sudo chown -R canvas:canvas /var/lib/canvas-memory
sudo chmod 750 /var/lib/canvas-memory
sudo chmod 640 /var/lib/canvas-memory/canvas.db

# Logs
sudo mkdir -p /var/log/canvas-memory
sudo chown -R canvas:canvas /var/log/canvas-memory
sudo chmod 750 /var/log/canvas-memory
```

---

## Monitoring & Logging

### Health Check Endpoint

**Backend**: `GET /health`

Response:

```json
{
  "status": "healthy",
  "database": "connected",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Log Rotation

Create `/etc/logrotate.d/canvas-memory`:

```
/var/log/canvas-memory/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 canvas canvas
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Monitoring with PM2

```bash
# Real-time monitoring
pm2 monit

# Web dashboard
pm2 plus
```

### Sentry Integration

See [ERROR_TRACKING_SENTRY.md](ERROR_TRACKING_SENTRY.md) for detailed setup.

---

## Backup & Recovery

### Automated Backup Script

Create `/usr/local/bin/backup-canvas.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/canvas-memory"
DB_PATH="/var/lib/canvas-memory/canvas.db"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup database
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/canvas_$TIMESTAMP.db'"

# Compress
gzip "$BACKUP_DIR/canvas_$TIMESTAMP.db"

# Remove old backups
find "$BACKUP_DIR" -name "canvas_*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $BACKUP_DIR/canvas_$TIMESTAMP.db.gz"
```

Make executable:

```bash
sudo chmod +x /usr/local/bin/backup-canvas.sh
```

### Cron Schedule

Add to crontab:

```bash
# Daily backup at 2 AM
0 2 * * * /usr/local/bin/backup-canvas.sh >> /var/log/canvas-memory/backup.log 2>&1
```

### Restore from Backup

```bash
# Stop services
pm2 stop all

# Restore database
gunzip -c /var/backups/canvas-memory/canvas_20250101_020000.db.gz > /var/lib/canvas-memory/canvas.db

# Fix permissions
sudo chown canvas:canvas /var/lib/canvas-memory/canvas.db
sudo chmod 640 /var/lib/canvas-memory/canvas.db

# Start services
pm2 start all
```

---

## Scaling Guide

### Vertical Scaling

**Recommended Specs by Tier**:

| Tier     | CPU      | RAM   | Storage | Users |
| -------- | -------- | ----- | ------- | ----- |
| Free     | 1 core   | 512MB | 5GB     | 1     |
| Pro      | 2 cores  | 2GB   | 50GB    | 1-5   |
| Business | 4+ cores | 8GB+  | 500GB+  | 100+  |

**Node.js Memory Limits**:

```bash
# Set in PM2 config
max_memory_restart: '1G'

# Or via environment
NODE_OPTIONS="--max-old-space-size=2048"
```

### Horizontal Scaling

**Backend** (stateless, can run multiple instances):

```javascript
// PM2 cluster mode
{
  instances: 4,  // Or 'max' for all CPU cores
  exec_mode: 'cluster'
}
```

**Frontend** (stateless):

- Use load balancer (Nginx, HAProxy)
- Multiple Next.js instances behind reverse proxy

**Database** (SQLite limitations):

- SQLite is single-writer
- For high write loads, consider PostgreSQL migration
- Use read replicas for analytics queries

---

## Troubleshooting

### Common Issues

#### 1. Database Locked

**Symptoms**: "database is locked" errors

**Solutions**:

```bash
# Check WAL mode
sqlite3 /var/lib/canvas-memory/canvas.db "PRAGMA journal_mode;"

# Enable WAL if not set
sqlite3 /var/lib/canvas-memory/canvas.db "PRAGMA journal_mode=WAL;"

# Increase busy timeout in code
PRAGMA busy_timeout = 5000;
```

#### 2. Out of Memory

**Symptoms**: Node.js crashes, PM2 restarts

**Solutions**:

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=2048"

# Reduce PM2 instances
pm2 scale canvas-api 2
```

#### 3. High CPU Usage

**Symptoms**: Slow responses, high load average

**Solutions**:

- Check for infinite loops in logs
- Profile with `node --prof`
- Optimize database queries
- Add indexes

#### 4. SSL Certificate Renewal Failed

**Symptoms**: HTTPS not working, certificate expired

**Solutions**:

```bash
# Check certificate status
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal

# Check auto-renewal timer
sudo systemctl status certbot.timer
```

---

## Next Steps

After deployment:

1. ✅ Test all critical flows
2. ✅ Configure monitoring alerts
3. ✅ Set up backup verification
4. ✅ Document incident response procedures
5. ✅ Train team on operations

---

## Related Documentation

- [ERROR_TRACKING_SENTRY.md](ERROR_TRACKING_SENTRY.md) - Error tracking setup
- [../architecture/ERROR_HANDLING.md](../architecture/ERROR_HANDLING.md) - Error handling architecture
- [../architecture/OVERVIEW.md](../architecture/OVERVIEW.md) - System architecture

---

**Status**: ✅ **Ready for production deployment**
