# Production Deployment Checklist

**Last Updated**: October 21, 2025
**Purpose**: Ensure nothing is missed before going live

---

## Pre-Deployment

### Code & Build

- [ ] All tests passing (7/7 core tests ✅)
- [ ] No TypeScript errors
- [ ] Frontend builds successfully (`npm run build`)
- [ ] Backend builds successfully (`npm run build`)
- [ ] No console errors or warnings in browser
- [ ] Production environment variables configured
- [ ] `.env.example` files up to date

### Security

- [ ] `JWT_SECRET` generated and set (NOT default value)
- [ ] `NODE_ENV=production` set in all environments
- [ ] CORS origins configured (`ALLOWED_ORIGINS`)
- [ ] Rate limiting enabled and tested
- [ ] Account lockout configured (5 attempts, 30 min lockout)
- [ ] Password requirements enforced (12+ chars, complexity)
- [ ] SQL injection prevention verified (parameterized queries)
- [ ] XSS protection enabled (CSP headers)
- [ ] CSRF protection implemented
- [ ] File upload validation (type, size limits)
- [ ] Audit logging enabled
- [ ] Error messages don't leak sensitive info

### Database

- [ ] Database migrations completed
- [ ] Indexes created and verified
- [ ] WAL mode enabled (`PRAGMA journal_mode=WAL`)
- [ ] Busy timeout set (`PRAGMA busy_timeout = 5000`)
- [ ] Foreign keys enabled (`PRAGMA foreign_keys = ON`)
- [ ] Database backed up before deployment
- [ ] Backup restore process tested
- [ ] Data retention policies configured

### Infrastructure

- [ ] Server provisioned with adequate resources
- [ ] Firewall configured (ports 80, 443 only)
- [ ] SSL/TLS certificate installed (Let's Encrypt)
- [ ] Reverse proxy configured (Nginx/Apache)
- [ ] Process manager configured (PM2/systemd)
- [ ] Log rotation configured
- [ ] Disk space monitoring enabled
- [ ] Backup storage provisioned

---

## Deployment Day

### Pre-Launch

- [ ] Maintenance page ready (if needed)
- [ ] Team notified of deployment schedule
- [ ] Rollback plan documented
- [ ] Database backup completed
- [ ] Old logs archived

### Deployment Steps

- [ ] Pull latest code from `main` branch
- [ ] Install dependencies (`npm ci`)
- [ ] Build backend (`cd apps/api && npm run build`)
- [ ] Build frontend (`cd apps/web && npm run build`)
- [ ] Run database migrations (automatic on first start)
- [ ] Start services (PM2/Docker)
- [ ] Verify health endpoints (`/health`)
- [ ] Check process logs for errors
- [ ] Test critical flows (login, import, canvas)

### Post-Launch Verification

- [ ] Frontend accessible via HTTPS
- [ ] API responds to health check
- [ ] User registration works
- [ ] User login works
- [ ] File import works
- [ ] Canvas navigation works
- [ ] Error handling works (test 404, 500)
- [ ] SSE connections work (job progress)
- [ ] Account switching works (if multi-account)
- [ ] Mobile responsiveness verified

---

## Post-Deployment

### Monitoring

- [ ] Error tracking configured (Sentry)
- [ ] Health check monitoring enabled
- [ ] SSL certificate expiry monitoring
- [ ] Disk space monitoring
- [ ] Database size monitoring
- [ ] Log file size monitoring
- [ ] API response time monitoring
- [ ] Uptime monitoring (UptimeRobot/Pingdom)

### Operations

- [ ] Automated backups configured (daily at 2 AM)
- [ ] Backup verification script running
- [ ] Log rotation working
- [ ] PM2 auto-restart configured
- [ ] PM2 startup script saved
- [ ] Incident response plan documented
- [ ] Team trained on operations

### Documentation

- [ ] Deployment documentation complete
- [ ] Runbook created (common operations)
- [ ] Troubleshooting guide available
- [ ] Admin contact list updated
- [ ] User documentation published

---

## Security Hardening (Business Tier)

### Advanced Security

- [ ] Intrusion detection system (fail2ban)
- [ ] Security scanning (OWASP ZAP)
- [ ] Dependency vulnerability scanning (`npm audit`)
- [ ] Penetration testing completed
- [ ] GDPR compliance verified
- [ ] Data encryption at rest
- [ ] Backup encryption enabled
- [ ] Security incident response plan

### Compliance

- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Cookie consent implemented
- [ ] Data retention policy documented
- [ ] Right to deletion implemented
- [ ] Data export feature implemented

---

## Performance Optimization

### Backend

- [ ] Database query optimization
- [ ] Connection pooling configured
- [ ] Response compression enabled (gzip)
- [ ] Static asset caching (CDN)
- [ ] API response caching (where appropriate)
- [ ] Rate limiting tuned for production load

### Frontend

- [ ] Image optimization (WebP, lazy loading)
- [ ] Code splitting enabled
- [ ] Bundle size optimized (<500KB)
- [ ] Service worker configured (offline support)
- [ ] Browser caching headers set
- [ ] CDN configured for static assets

---

## Tier-Specific Checklists

### Free Tier

- [ ] No Sentry DSN configured (local errors only)
- [ ] No cloud costs
- [ ] Local-first verified (works offline)
- [ ] BYO API keys documented
- [ ] Tier limits enforced (500 sources, 20K nodes)

### Pro Tier

- [ ] Sentry DSN configured (opt-in)
- [ ] Session replay enabled (opt-in)
- [ ] Cloud sync configured (optional)
- [ ] Pro tier limits enforced (5K sources, 200K nodes)

### Business Tier

- [ ] Self-hosted Sentry configured
- [ ] Multi-account support tested
- [ ] Team invitation flow tested
- [ ] Role-based permissions tested
- [ ] Org-wide analytics working
- [ ] Data governance policies enforced
- [ ] SLA monitoring configured

---

## Rollback Plan

### If Issues Occur

1. **Stop new deployments immediately**
2. **Assess impact** (how many users affected?)
3. **Check logs** for error messages
4. **Decide**: Fix forward vs. rollback

### Rollback Steps

```bash
# 1. Stop services
pm2 stop all

# 2. Restore previous code
git checkout <previous-tag>
npm ci
npm run build

# 3. Restore database (if schema changed)
gunzip -c /var/backups/canvas-memory/canvas_YYYYMMDD_HHMMSS.db.gz > /var/lib/canvas-memory/canvas.db

# 4. Restart services
pm2 start all

# 5. Verify health
curl https://api.yourdomain.com/health
```

---

## Success Criteria

### Launch Success

- [ ] ✅ Zero critical errors in first hour
- [ ] ✅ User registration working
- [ ] ✅ User login working
- [ ] ✅ Core features functional
- [ ] ✅ Performance acceptable (<2s page load)
- [ ] ✅ No data loss
- [ ] ✅ Monitoring alerts silent

### First Week

- [ ] Uptime > 99.9%
- [ ] Error rate < 0.1%
- [ ] User satisfaction > 4/5
- [ ] No security incidents
- [ ] Backups completing successfully
- [ ] No critical bugs reported

---

## Emergency Contacts

```
Technical Lead: [Name] [Phone] [Email]
DevOps: [Name] [Phone] [Email]
Security: [Name] [Phone] [Email]
On-Call Rotation: [Link to schedule]
```

---

## Sign-Off

**Deployed By**: ************\_\_\_************ **Date**: ******\_\_\_******

**Reviewed By**: ************\_\_\_************ **Date**: ******\_\_\_******

**Approved By**: ************\_\_\_************ **Date**: ******\_\_\_******

---

**Status**: Ready for Production ✅
