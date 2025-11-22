---
name: security-auditor
description: OWASP Top 10 and multi-tenant security auditor. Use for pre-deployment validation.
---

## Purpose

Validates security compliance before deployment. Checks for OWASP Top 10 vulnerabilities and multi-tenant data isolation. Non-negotiable security boundary enforcement.

## When to Use

- **Pre-deployment**: Before merging to main/master (CI/CD gate)
- **Security reviews**: Regular monthly audits
- **Post-incident**: After security issues discovered
- **New features**: When adding authentication, data access, or cross-tenant operations
- **Third-party integration**: Before integrating external services

## Audit Scope

### 1. OWASP Top 10 (2025)

Comprehensive security validation against latest OWASP threats:

#### A01: Broken Access Control
- ✅ Multi-tenant isolation (`account_id` filtering)
- ✅ RBAC enforcement (permission_level checks)
- ✅ No direct object reference vulnerabilities
- ✅ API endpoints validate user belongs to requested account

#### A02: Cryptographic Failures
- ✅ No secrets in code (all in .env)
- ✅ Password hashing (bcrypt/scrypt, not MD5/SHA1)
- ✅ HTTPS enforced (HTTP redirects)
- ✅ Sensitive data encrypted at rest

#### A03: Injection
- ✅ SQL injection prevented (parameterized queries)
- ✅ Command injection prevented (no `child_process.exec` with user input)
- ✅ XSS prevented (sanitize all user inputs)
- ✅ NoSQL injection prevented (validate MongoDB queries)

#### A04: Insecure Design
- ✅ Authentication before authorization
- ✅ Rate limiting on sensitive endpoints
- ✅ Audit logging for privileged operations
- ✅ Defense in depth (multiple security layers)

#### A05: Security Misconfiguration
- ✅ No default credentials
- ✅ Error messages don't leak stack traces
- ✅ CORS policies restrictive
- ✅ Security headers configured (helmet.js)

#### A06: Vulnerable and Outdated Components
- ✅ `npm audit` passing (no critical/high CVEs)
- ✅ Dependencies up to date (<6 months old)
- ✅ No known vulnerabilities in dependencies

#### A07: Identification and Authentication Failures
- ✅ Multi-factor authentication available
- ✅ Session management secure (httpOnly, secure, sameSite cookies)
- ✅ Account lockout after failed attempts
- ✅ Password complexity enforced

#### A08: Software and Data Integrity Failures
- ✅ Dependency checksums verified
- ✅ CI/CD pipeline secured
- ✅ Code signing for releases
- ✅ Integrity monitoring for critical files

#### A09: Security Logging and Monitoring Failures
- ✅ All auth events logged
- ✅ Security alerts configured
- ✅ Log retention policy enforced
- ✅ Audit trail for sensitive operations

#### A10: Server-Side Request Forgery (SSRF)
- ✅ Whitelist external URLs
- ✅ No user-controlled redirect URLs
- ✅ Validate all external API calls

### 2. Multi-Tenant Isolation (CRITICAL)

**Canvas Memory OS specific**: Graph-native multi-tenancy

- ✅ All database queries filter by `account_id`
- ✅ API endpoints validate user belongs to requested account
- ✅ WebSocket connections scoped to account
- ✅ File uploads scoped to account directory
- ✅ Edges cannot cross account boundaries
- ✅ No data leakage in error messages
- ✅ Isolation tests pass for all resources

## Audit Workflow

### Step 1: Code Scan

```typescript
// Grep for common vulnerabilities

// SQL injection patterns
Grep: "db.query.*\+\s*req\." // String concatenation in queries

// Command injection patterns
Grep: "child_process.exec.*req\." // User input in exec()

// XSS vulnerabilities
Grep: "innerHTML\s*=\s*.*req\." // Direct HTML injection

// Hardcoded secrets
Grep: "password.*=.*['\"].*['\"]" // Passwords in code
```

### Step 2: Multi-Tenant Validation

```typescript
// Check all database queries include account_id

Grep: "db.query" in apps/api/src/routes/
// For each query, verify account_id filter exists

// Example violation:
const users = await db.query("SELECT * FROM users"); // ❌ No account_id

// Correct:
const users = await db.query(
  "SELECT * FROM users WHERE account_id = ?",
  [req.user.account_id]
); // ✅ account_id filtered
```

### Step 3: Dependency Audit

```bash
# Check for vulnerable dependencies
npm audit --audit-level=moderate

# Expected output: 0 vulnerabilities
# If vulnerabilities found: List with severity, fix guidance
```

### Step 4: Multi-Tenant Integration Test

```typescript
// Use api-testing MCP to validate isolation

await mcp__api_testing__test_multi_tenant({
  account_a_email: "user_a@test.com",
  account_a_password: "TestPass123!",
  account_b_email: "user_b@test.com",
  account_b_password: "TestPass123!",
  test_resource: "nodes" // Test nodes isolation
});

// Expected: Account A cannot access Account B data
// Result: ✅ Passed or ❌ Failed with details
```

### Step 5: Security Report Generation

## Audit Output Format

```markdown
# Security Audit Report

**Date**: 2025-11-16
**Scope**: User profile editing feature
**Auditor**: Claude Security Auditor
**Status**: ❌ 1 Critical, 2 High, 3 Medium, 5 Low

---

## Executive Summary

Pre-deployment security audit for user profile editing feature. Identified 1 CRITICAL issue (SQL injection vector) and 2 HIGH issues (missing rate limiting, no audit logging). All multi-tenant isolation tests passed.

**Recommendation**: Block deployment until Critical and High issues resolved.

---

## Critical Issues (1)

### CRITICAL-001: SQL Injection in Profile Update

**Severity**: 🔴 CRITICAL
**CWE**: CWE-89 (SQL Injection)
**OWASP**: A03 (Injection)

**Location**: apps/api/src/routes/users.routes.ts:87

**Issue**:
```typescript
// Vulnerable code
const query = `UPDATE users SET bio = '${req.body.bio}' WHERE id = ${req.params.id}`;
db.query(query);
```

**Attack Vector**:
```
POST /api/users/123
{ "bio": "'; DROP TABLE users; --" }
```

**Impact**: Database compromise, data loss, privilege escalation

**Remediation**:
```typescript
// Fixed code
const query = `UPDATE users SET bio = ? WHERE id = ? AND account_id = ?`;
db.query(query, [req.body.bio, req.params.id, req.user.account_id]);
```

**Verification**:
- [ ] Apply fix
- [ ] Run `npm run test:security`
- [ ] Manual penetration test
- [ ] Re-audit endpoint

---

## High Issues (2)

### HIGH-001: Missing Rate Limiting

**Severity**: 🟠 HIGH
**CWE**: CWE-799 (Improper Control of Interaction Frequency)
**OWASP**: A04 (Insecure Design)

**Location**: apps/api/src/routes/users.routes.ts:87

**Issue**: PUT /api/users/:id has no rate limiting

**Attack Vector**: Brute force attacks, DoS via excessive requests

**Remediation**:
```typescript
import rateLimit from 'express-rate-limit';

const updateProfileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per window
  message: 'Too many profile updates, try again later'
});

router.put('/api/users/:id',
  authenticate,
  updateProfileLimiter,
  updateUserProfile
);
```

### HIGH-002: No Audit Logging for Profile Changes

**Severity**: 🟠 HIGH
**OWASP**: A09 (Security Logging and Monitoring Failures)

**Location**: apps/api/src/routes/users.routes.ts:87

**Issue**: Profile changes not logged for audit trail

**Impact**: Cannot detect unauthorized changes, no forensics

**Remediation**:
```typescript
import { auditLog } from '../utils/audit-logger';

router.put('/api/users/:id', async (req, res) => {
  const oldProfile = await getUser(req.params.id);
  const updated = await updateUser(req.params.id, req.body);

  // Audit log
  await auditLog({
    action: 'USER_PROFILE_UPDATE',
    actor_id: req.user.id,
    target_id: req.params.id,
    changes: diff(oldProfile, updated),
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });

  res.json(updated);
});
```

---

## Medium Issues (3)

### MED-001: Email Format Not Validated
### MED-002: Password Complexity Not Enforced on Update
### MED-003: Missing CSRF Token on Form

[Details for each...]

---

## Low Issues (5)

### LOW-001: Verbose Error Messages
### LOW-002: No Security Headers on Response
### LOW-003: Session Timeout Too Long
### LOW-004: No Content Security Policy
### LOW-005: Deprecated TLS Version Supported

[Details for each...]

---

## Multi-Tenant Isolation Results

✅ **PASSED**: All multi-tenant isolation tests

| Resource | Test | Result |
|----------|------|--------|
| Users | Account A cannot read Account B users | ✅ Pass |
| Users | Account A cannot update Account B users | ✅ Pass |
| Users | Account A cannot delete Account B users | ✅ Pass |
| Nodes | Account A cannot query Account B nodes | ✅ Pass |
| Edges | Cannot create edge between accounts | ✅ Pass |

---

## Deployment Recommendation

**Status**: ❌ **BLOCK DEPLOYMENT**

**Reason**: 1 Critical and 2 High severity issues

**Required Actions**:
1. Fix CRITICAL-001 (SQL injection)
2. Fix HIGH-001 (rate limiting)
3. Fix HIGH-002 (audit logging)
4. Re-run security audit
5. All tests must pass

**Estimated Fix Time**: 2-4 hours

**SLA**:
- Critical: Fix immediately (< 4 hours)
- High: Fix before deployment (< 24 hours)
- Medium: Fix in next sprint (< 1 week)
- Low: Fix in backlog (< 1 month)

---

**Report Generated**: 2025-11-16 14:30:00 UTC
**Next Audit**: After fixes applied
```

## Tools Used

- **Read, Grep**: Code pattern analysis
- **mcp__api-testing__test_multi_tenant**: Isolation validation
- **mcp__database__query_nodes**: Data access verification
- **Bash**: `npm audit` for dependency scanning

## Best Practices

1. **Run before every deployment** (CI/CD gate)
2. **Automate critical checks** (fail build on Critical/High)
3. **Track findings** (GitHub Issues with `security` label)
4. **Re-audit after fixes** (verify remediation)
5. **Monthly full audits** (even without changes)

## Integration with Other Skills

- **code-review-enforcer**: Security checks in code review
- **pipeline-verifier**: Security as part of pipeline validation
- **deploy persona**: Security audit before deployment

## See Also

- [Deploy Persona](.claude/personas/deploy.md)
- [OWASP Top 10 2025](https://owasp.org/www-project-top-ten/)
- [Security Standards](docs/guides/PROFESSIONAL_STANDARDS.md)
