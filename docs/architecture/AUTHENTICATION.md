# Authentication & Authorization

**Canvas Memory OS - Multi-Tenant Security Architecture**

This document describes the authentication and authorization system, including JWT-based auth, multi-tenant isolation, role-based access control (RBAC), and security best practices.

---

## Table of Contents

- [Overview](#overview)
- [Account Structure](#account-structure)
- [Authentication Flow](#authentication-flow)
- [JWT Token System](#jwt-token-system)
- [Authorization & RBAC](#authorization--rbac)
- [Multi-Tenant Isolation](#multi-tenant-isolation)
- [Session Management](#session-management)
- [Security Best Practices](#security-best-practices)
- [API Integration](#api-integration)

---

## Overview

Canvas Memory OS implements a **production-ready, multi-tenant authentication system** with:

- ✅ **JWT-based authentication** with bcrypt password hashing
- ✅ **Multi-tenant data isolation** (complete separation between accounts)
- ✅ **4 permission levels**: junior (read), senior (create), leader (delete), admin (full)
- ✅ **2 account types**: admin (system-level) vs client (tenant-level)
- ✅ **3 account classes**: free, professional, business
- ✅ **Session management**: 7-day token expiration, database-backed revocation
- ✅ **Google OAuth support**: Optional OAuth integration
- ✅ **46 protected endpoints**: All API endpoints require authentication

### Security Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Request                        │
│        GET /api/v1/nodes + Authorization: Bearer JWT        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express Middleware Chain                    │
│  1. requireAuth()            → Extract & verify JWT         │
│  2. requirePermission(level) → Check RBAC                   │
│  3. isolateByAccount()       → Filter by tenant             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Route Handler                             │
│  • req.user contains: { userId, accountId, ...}            │
│  • Apply account filtering to database queries              │
│  • Return only tenant's data                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Account Structure

### Three-Level Hierarchy

Canvas Memory OS uses a three-level account structure:

```
Account (Tenant)
  └── User (Account Member)
      └── Session (JWT Token)
```

**Example**:

- **Account**: Acme Corp (acc_acme123)
  - **User 1**: alice@acme.com (admin permission)
  - **User 2**: bob@acme.com (senior permission)
  - **User 3**: charlie@acme.com (junior permission)

### Account Types

| Type       | Description          | Data Access             | Use Case                             |
| ---------- | -------------------- | ----------------------- | ------------------------------------ |
| **admin**  | System-level account | Can see ALL tenant data | Support staff, system administrators |
| **client** | Tenant account       | Can ONLY see own data   | Regular customers, users             |

**Example**:

- Admin account: `support@canvas-memory.com` (can debug all accounts)
- Client account: `alice@acme.com` (can only see Acme Corp data)

### Account Classes (Tiers)

| Class            | Features                      | Limits                             | Monthly Price |
| ---------------- | ----------------------------- | ---------------------------------- | ------------- |
| **free**         | Basic graph features          | 500 sources, 20K nodes, 50 groups  | $0            |
| **professional** | + AI features, API access     | 5K sources, 200K nodes, 500 groups | $29           |
| **business**     | + PII handling, team features | Unlimited                          | $99           |

**Feature Matrix**:

| Feature              | Free | Professional | Business       |
| -------------------- | ---- | ------------ | -------------- |
| Local SQLite storage | ✅   | ✅           | ✅             |
| File uploads         | ✅   | ✅           | ✅             |
| Chat import          | ✅   | ✅           | ✅             |
| Code extraction      | ✅   | ✅           | ✅             |
| 2D canvas            | ✅   | ✅           | ✅             |
| AI chat (BYO key)    | ❌   | ✅           | ✅             |
| Claim extraction     | ❌   | ✅           | ✅             |
| Verifiers            | ❌   | ✅           | ✅             |
| Multi-seat           | ❌   | ✅ (5 seats) | ✅ (unlimited) |
| SSO/SAML             | ❌   | ❌           | ✅             |
| Audit logs           | ❌   | ❌           | ✅             |

### Permission Levels (RBAC)

| Level      | Read | Create | Delete | Admin Settings | Use Case                                   |
| ---------- | ---- | ------ | ------ | -------------- | ------------------------------------------ |
| **junior** | ✅   | ❌     | ❌     | ❌             | View-only access, reviewers, analysts      |
| **senior** | ✅   | ✅     | ❌     | ❌             | Content creators, contributors, developers |
| **leader** | ✅   | ✅     | ✅     | ❌             | Team leads, project managers               |
| **admin**  | ✅   | ✅     | ✅     | ✅             | Account owners, full control               |

**Permission Hierarchy**:

```
junior < senior < leader < admin
```

If a route requires `senior` permission:

- ✅ senior, leader, admin → Allowed
- ❌ junior → Forbidden (403)

---

## Authentication Flow

### 1. Registration

**Endpoint**: `POST /api/v1/auth/register`

**Request**:

```json
{
  "email": "alice@example.com",
  "password": "SecurePassword123!",
  "name": "Alice Smith",
  "accountType": "client", // Optional (default: "client")
  "accountClass": "professional" // Optional (default: "free")
}
```

**Process**:

1. Validate email format and password strength
2. Check if email already exists (return 409 if duplicate)
3. Hash password with bcrypt (10 rounds)
4. Create account record in database
5. Create user record (first user gets admin permission)
6. Generate JWT token (expires in 7 days)
7. Store session in database
8. Return user, account, and token

**Response** (201 Created):

```json
{
  "success": true,
  "user": {
    "id": "usr_abc123",
    "account_id": "acc_xyz789",
    "email": "alice@example.com",
    "name": "Alice Smith",
    "permission_level": "admin",
    "user_class": "person",
    "is_active": true,
    "created_at": 1697123456789,
    "updated_at": 1697123456789
  },
  "account": {
    "id": "acc_xyz789",
    "account_type": "client",
    "account_class": "professional",
    "email": "alice@example.com",
    "name": "Alice Smith",
    "created_at": 1697123456789,
    "updated_at": 1697123456789
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Database Changes**:

```sql
-- Insert account
INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
VALUES ('acc_xyz789', 'client', 'professional', 'alice@example.com', 'Alice Smith', 1697123456789, 1697123456789);

-- Insert user (first user = admin)
INSERT INTO users (id, account_id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at)
VALUES ('usr_abc123', 'acc_xyz789', 'alice@example.com', '$2b$10$...', 'Alice Smith', 'admin', 'person', 1, 1697123456789, 1697123456789);

-- Insert session
INSERT INTO sessions (id, user_id, account_id, token, expires_at, created_at)
VALUES ('sess_123', 'usr_abc123', 'acc_xyz789', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', 1697728256789, 1697123456789);
```

### 2. Login

**Endpoint**: `POST /api/v1/auth/login`

**Request**:

```json
{
  "email": "alice@example.com",
  "password": "SecurePassword123!"
}
```

**Process**:

1. Look up user by email
2. Verify password with bcrypt.compare()
3. Check user is_active status
4. Load account information
5. Delete old sessions for this user (single sign-on enforcement)
6. Generate new JWT token
7. Store new session in database
8. Return user, account, and token

**Response** (200 OK):

```json
{
  "success": true,
  "user": { ... },
  "account": { ... },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses**:

- `401 Unauthorized` - Invalid email or password
- `401 Unauthorized` - User account is inactive

### 3. Logout

**Endpoint**: `POST /api/v1/auth/logout`

**Headers**:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Process**:

1. Extract token from Authorization header
2. Delete session record from database
3. Token is now invalid for future requests

**Response** (200 OK):

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 4. Get Current User

**Endpoint**: `GET /api/v1/auth/me`

**Headers**:

```
Authorization: Bearer <token>
```

**Response** (200 OK):

```json
{
  "success": true,
  "user": {
    "id": "usr_abc123",
    "account_id": "acc_xyz789",
    "email": "alice@example.com",
    "name": "Alice Smith",
    "permission_level": "admin",
    "account_type": "client",
    "account_class": "professional"
  }
}
```

---

## JWT Token System

### Token Structure

JWT tokens contain user identity and permissions:

```javascript
{
  // Header (auto-generated)
  "alg": "HS256",
  "typ": "JWT",

  // Payload (custom claims)
  "userId": "usr_abc123",
  "accountId": "acc_xyz789",
  "email": "alice@example.com",
  "permissionLevel": "admin",
  "accountType": "client",
  "accountClass": "professional",

  // Standard claims
  "iat": 1697123456,    // Issued at (Unix timestamp)
  "exp": 1697728256     // Expires at (iat + 7 days)
}
```

### Token Lifecycle

```
1. User logs in
   ↓
2. Server generates JWT (signed with JWT_SECRET)
   ↓
3. Server stores session in database (token + expires_at)
   ↓
4. Server returns token to client
   ↓
5. Client stores token (localStorage, memory, cookies)
   ↓
6. Client includes token in every request (Authorization header)
   ↓
7. Server verifies token on each request:
   - Check JWT signature
   - Check expiration (exp claim)
   - Check session exists in database
   ↓
8. Token expires after 7 days OR user logs out
```

### Token Generation

```typescript
// apps/api/src/services/auth.service.ts
import jwt from 'jsonwebtoken';

export function generateToken(user: User, account: Account): string {
  const payload = {
    userId: user.id,
    accountId: user.account_id,
    email: user.email,
    permissionLevel: user.permission_level,
    accountType: account.account_type,
    accountClass: account.account_class,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  });

  return token;
}
```

### Token Verification

```typescript
export function verifyToken(token: string): JwtPayload {
  try {
    // Verify signature and expiration
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

    // Check session exists in database
    const session = db
      .prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?')
      .get(token, Date.now());

    if (!session) {
      throw new Error('Session not found or expired');
    }

    return payload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}
```

### Token Security

**Secrets**:

```bash
# .env
JWT_SECRET=your-secret-key-minimum-32-characters-change-in-production
```

**⚠️ Important**: Use a strong, random secret in production!

```bash
# Generate secure secret
openssl rand -base64 64
```

**Token Storage** (Client-Side):

| Location                 | Security  | Persistence | XSS Risk | CSRF Risk |
| ------------------------ | --------- | ----------- | -------- | --------- |
| **localStorage**         | ⚠️ Medium | ✅ Yes      | ⚠️ High  | ✅ Low    |
| **sessionStorage**       | ⚠️ Medium | ❌ No       | ⚠️ High  | ✅ Low    |
| **Memory (React state)** | ✅ High   | ❌ No       | ✅ Low   | ✅ Low    |
| **httpOnly cookie**      | ✅ High   | ✅ Yes      | ✅ Low   | ⚠️ High   |

**Recommendation**: Use memory (React state) for SPA, httpOnly cookies for SSR.

---

## Authorization & RBAC

### Permission Middleware

Check if user has required permission level:

```typescript
// apps/api/src/middleware/auth.middleware.ts
export function requirePermission(level: 'junior' | 'senior' | 'leader' | 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    const hierarchy = { junior: 1, senior: 2, leader: 3, admin: 4 };

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const userLevel = hierarchy[req.user.permissionLevel];
    const requiredLevel = hierarchy[level];

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: {
          required: level,
          current: req.user.permissionLevel,
        },
      });
    }

    next();
  };
}
```

### Endpoint Permission Matrix

| Endpoint                  | Method | Permission Required | Notes                |
| ------------------------- | ------ | ------------------- | -------------------- |
| `/api/v1/nodes`           | GET    | None (auth only)    | Read-only, all users |
| `/api/v1/nodes/:id`       | GET    | None (auth only)    | Read-only, all users |
| `/api/v1/nodes/source`    | POST   | **senior**          | Create content       |
| `/api/v1/nodes/group`     | POST   | **senior**          | Create content       |
| `/api/v1/nodes/:id`       | PUT    | **senior**          | Edit content         |
| `/api/v1/nodes/:id`       | DELETE | **leader**          | Delete content       |
| `/api/v1/edges`           | POST   | **senior**          | Create relationships |
| `/api/v1/edges`           | DELETE | **leader**          | Delete relationships |
| `/api/v1/boards`          | POST   | **senior**          | Create workspace     |
| `/api/v1/boards/:id`      | PUT    | **senior**          | Edit workspace       |
| `/api/v1/boards/:id`      | DELETE | **leader**          | Delete workspace     |
| `/api/v1/ingest/files`    | POST   | **senior**          | Upload files         |
| `/api/v1/import/enhanced` | POST   | **senior**          | Import chats         |

**Usage in Routes**:

```typescript
// Read-only endpoint (all authenticated users)
router.get('/', requireAuth(authService), async (req, res) => {
  // Anyone authenticated can read
});

// Create endpoint (senior+ only)
router.post('/source', requireAuth(authService), requirePermission('senior'), async (req, res) => {
  // Only senior, leader, admin can create
});

// Delete endpoint (leader+ only)
router.delete('/:id', requireAuth(authService), requirePermission('leader'), async (req, res) => {
  // Only leader, admin can delete
});
```

---

## Multi-Tenant Isolation

### Data Isolation Strategy

Every node and edge in the database includes `account_id` and `created_by` fields:

```sql
-- Nodes table
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  properties TEXT NOT NULL,
  account_id TEXT NOT NULL,      -- 🔒 Which tenant owns this node
  created_by TEXT NOT NULL,       -- 👤 Which user created it
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Edges table
CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  properties TEXT,
  account_id TEXT NOT NULL,      -- 🔒 Which tenant owns this edge
  created_by TEXT NOT NULL,       -- 👤 Which user created it
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
```

### Isolation Middleware

Enforces account filtering on all queries:

```typescript
// apps/api/src/middleware/auth.middleware.ts
export function isolateByAccount(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  // Admin accounts can see all data (for support/debugging)
  if (req.user.accountType === 'admin') {
    req.accountFilter = null;
  } else {
    // Client accounts only see their own data
    req.accountFilter = req.user.accountId;
  }

  next();
}
```

### Query Filtering

Apply account filter in every query:

```typescript
// Route handler
router.get('/', async (req, res) => {
  const db = global.dbClient;

  let query = 'SELECT * FROM nodes WHERE 1=1';
  const params: any[] = [];

  // Apply account isolation
  if (req.accountFilter) {
    query += ' AND account_id = ?';
    params.push(req.accountFilter);
  }

  // Add other filters
  if (req.query.kind) {
    query += ' AND kind = ?';
    params.push(req.query.kind);
  }

  const result = await db.execute(query, params);
  res.json({ success: true, nodes: result.records });
});
```

### Edge Ownership Verification

Edges connect nodes. Both nodes must belong to the same account:

```typescript
// When creating an edge
router.post('/', async (req, res) => {
  const db = global.dbClient;
  const { from_id, to_id, kind } = req.body;

  // Verify both nodes exist and belong to user's account
  const fromNode = await db.getNode(from_id);
  const toNode = await db.getNode(to_id);

  if (!fromNode || !toNode) {
    return res.status(404).json({
      success: false,
      error: 'Node not found',
    });
  }

  // Admin can create edges between any nodes
  if (req.user.accountType !== 'admin') {
    // Client must own both nodes
    if (fromNode.account_id !== req.user.accountId || toNode.account_id !== req.user.accountId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'CROSS_ACCOUNT_EDGE',
      });
    }
  }

  // Create edge
  await db.createEdge({
    id: generateId('edge'),
    kind,
    from_id,
    to_id,
    account_id: req.user.accountId,
    created_by: req.user.userId,
    created_at: Date.now(),
  });

  res.json({ success: true, message: 'Edge created' });
});
```

### Multi-Tenant Test

Verify isolation between accounts:

```bash
# 1. Register two accounts
ALICE_TOKEN=$(curl -s -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Pass123!","name":"Alice"}' \
  | jq -r '.token')

BOB_TOKEN=$(curl -s -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"Pass123!","name":"Bob"}' \
  | jq -r '.token')

# 2. Alice creates a node
ALICE_NODE=$(curl -s -X POST http://localhost:4001/api/v1/nodes/source \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "src_alice1",
    "kind": "Source",
    "title": "Alice Private Doc",
    "created_at": '$(date +%s000)',
    "updated_at": '$(date +%s000)'
  }' | jq -r '.node.id')

# 3. Bob tries to access Alice's node
curl http://localhost:4001/api/v1/nodes/$ALICE_NODE \
  -H "Authorization: Bearer $BOB_TOKEN"
# ❌ Expected: 403 Forbidden - "Access denied"

# 4. Alice lists nodes (sees her node)
curl http://localhost:4001/api/v1/nodes \
  -H "Authorization: Bearer $ALICE_TOKEN"
# ✅ Expected: 200 OK - [{"id":"src_alice1",...}]

# 5. Bob lists nodes (does NOT see Alice's node)
curl http://localhost:4001/api/v1/nodes \
  -H "Authorization: Bearer $BOB_TOKEN"
# ✅ Expected: 200 OK - [] (empty array)
```

---

## Session Management

### Session Storage

Sessions are stored in the database (not in-memory):

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,    -- 7 days from creation
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
```

**Benefits**:

- Revocable tokens (delete session to invalidate)
- Single sign-on (delete old sessions on new login)
- Audit trail (track login history)
- Scalable (works with load balancers)

### Session Lifecycle

**1. Create Session** (Login/Register):

```typescript
const token = generateToken(user, account);
const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

await db.execute(
  'INSERT INTO sessions (id, user_id, account_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  [generateId('sess'), user.id, user.account_id, token, expiresAt, Date.now()]
);
```

**2. Verify Session** (Every Request):

```typescript
const session = await db.execute('SELECT * FROM sessions WHERE token = ? AND expires_at > ?', [
  token,
  Date.now(),
]);

if (session.records.length === 0) {
  throw new Error('Session not found or expired');
}
```

**3. Delete Session** (Logout):

```typescript
await db.execute('DELETE FROM sessions WHERE token = ?', [token]);
```

**4. Single Sign-On** (New Login):

```typescript
// Delete all existing sessions for this user
await db.execute('DELETE FROM sessions WHERE user_id = ?', [user.id]);

// Create new session
await createSession(user, account);
```

**5. Cleanup Expired Sessions** (Periodic Job):

```typescript
// Run daily
setInterval(
  () => {
    db.execute('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  },
  24 * 60 * 60 * 1000
);
```

---

## Security Best Practices

### Implemented

✅ **Password Security**:

- bcrypt hashing with 10 rounds
- No plaintext passwords in logs or responses
- Password not returned in API responses

✅ **Token Security**:

- JWT signed with HS256 (HMAC SHA-256)
- Secret key from environment variable
- 7-day expiration
- Database-backed sessions (revocable)

✅ **SQL Injection Protection**:

- All queries use parameterized statements
- No string concatenation in SQL
- Zod schema validation on inputs

✅ **CORS Protection**:

- Whitelist allowed origins
- Credentials support (for cookies)

✅ **Helmet Security Headers**:

- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block

✅ **Account Isolation**:

- Every resource has account_id
- Middleware enforces filtering
- Foreign key cascade deletes

### Recommended Enhancements

🚀 **Token Security**:

- [ ] Use RS256 (public/private key pairs) for production
- [ ] Implement refresh tokens (longer-lived, can be rotated)
- [ ] Add token fingerprinting (bind to IP/User-Agent)
- [ ] Implement token blacklist for revocation before expiry

🚀 **Rate Limiting**:

- [ ] 5 failed login attempts → 15-minute lockout
- [ ] 100 requests/minute per IP
- [ ] 1,000 requests/hour per account

🚀 **Multi-Factor Authentication (MFA)**:

- [ ] TOTP (Time-based One-Time Password)
- [ ] SMS verification
- [ ] Email verification
- [ ] Backup codes

🚀 **Password Policy**:

- [ ] Minimum 12 characters
- [ ] Uppercase + lowercase + number + special char
- [ ] Check against leaked password database (HaveIBeenPwned)
- [ ] Prevent password reuse (store hashes of previous passwords)

🚀 **Audit Logging**:

- [ ] Log all authentication attempts
- [ ] Log permission changes
- [ ] Log data access (GDPR compliance)
- [ ] Anomaly detection (unusual login locations)

### Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to strong random value (min 32 chars)
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS (TLS 1.2+)
- [ ] Configure CORS whitelist (remove wildcard)
- [ ] Set up rate limiting
- [ ] Enable audit logging
- [ ] Test account isolation (multi-tenant tests)
- [ ] Review error messages (don't leak info)
- [ ] Set up monitoring (failed logins, suspicious activity)
- [ ] Implement password reset flow
- [ ] Add email verification
- [ ] Configure session timeout (consider shorter than 7 days)

---

## API Integration

### Client-Side Integration (React)

**1. Store Token**:

```typescript
// After successful login/register
const { token, user, account } = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());

// Store token (choose storage method)
localStorage.setItem('token', token);
// OR
sessionStorage.setItem('token', token);
// OR
setToken(token); // React state
```

**2. Include Token in Requests**:

```typescript
// Fetch with auth
const response = await fetch('/api/v1/nodes', {
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

// Axios interceptor (global)
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**3. Handle Auth Errors**:

```typescript
// Global error handler
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

**4. Protected Routes**:

```typescript
// React Router protected route
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Usage
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />
```

### Backend Integration (Express)

**1. Apply Auth Middleware**:

```typescript
// apps/api/src/index.ts
app.use(
  '/api/v1/nodes',
  requireAuth(authService), // Verify JWT
  isolateByAccount, // Enforce multi-tenant
  nodesRoutes // Route handlers
);
```

**2. Access User in Route**:

```typescript
router.post('/', async (req, res) => {
  // req.user is available (attached by requireAuth)
  const userId = req.user.userId;
  const accountId = req.user.accountId;
  const permissionLevel = req.user.permissionLevel;

  // Use in business logic
  await db.createNode({
    ...req.body,
    account_id: accountId,
    created_by: userId,
  });
});
```

**3. Check Permissions**:

```typescript
// Require specific permission
router.post(
  '/',
  requireAuth(authService),
  requirePermission('senior'), // Only senior+ can create
  async (req, res) => {
    // User has senior, leader, or admin permission
  }
);

// Manual permission check
if (req.user.permissionLevel !== 'admin') {
  return res.status(403).json({
    success: false,
    error: 'Admin access required',
  });
}
```

---

## Related Documentation

- [System Overview](OVERVIEW.md) - High-level architecture
- [Database Architecture](DATABASE.md) - Multi-tenant database design
- [API Design](API_DESIGN.md) - REST API patterns
- [Quick Start](../getting-started/QUICK_START.md) - Get running in 5 minutes

---

**Last Updated**: 2025-10-15
**Related Docs**: [Overview](OVERVIEW.md) | [Database](DATABASE.md) | [API Design](API_DESIGN.md)
