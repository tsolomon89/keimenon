# Authentication & Authorization Guide

**Canvas Memory OS - Multi-Tenant Security Architecture**

## Overview

Canvas Memory OS implements a comprehensive multi-tenant authentication and authorization system with:

- **JWT-based authentication** (JSON Web Tokens)
- **Multi-tenant data isolation** (account-level segregation)
- **Role-Based Access Control** (RBAC with 4 permission levels)
- **Account type hierarchies** (admin vs client tenants)
- **Session management** (database-backed token storage)
- **Password security** (bcrypt hashing with 10 rounds)

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    Client Request                        │
│           GET /api/v1/nodes + Authorization: Bearer JWT  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Express Middleware Chain                    │
│  1. requireAuth() - Extract & verify JWT                │
│  2. requirePermission(level) - Check RBAC               │
│  3. isolateByAccount() - Filter by tenant               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Route Handler                               │
│  - req.user contains: { userId, accountId, ...}        │
│  - Apply account filtering to SQL queries               │
│  - Return only tenant's data                            │
└─────────────────────────────────────────────────────────┘
```

### Database Schema (SQLite)

```sql
-- Accounts table (tenants)
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,                              -- UUID
  account_type TEXT NOT NULL,                        -- 'admin' | 'client'
  account_class TEXT NOT NULL,                       -- 'free' | 'professional' | 'business'
  email TEXT NOT NULL UNIQUE,                        -- Account owner email
  name TEXT NOT NULL,                                -- Account display name
  created_at INTEGER NOT NULL,                       -- Unix timestamp
  updated_at INTEGER NOT NULL
);

-- Users table (account members)
CREATE TABLE users (
  id TEXT PRIMARY KEY,                              -- UUID
  account_id TEXT NOT NULL,                         -- FK to accounts
  email TEXT NOT NULL UNIQUE,                       -- User login email
  password_hash TEXT,                               -- bcrypt hash (nullable for OAuth)
  google_id TEXT UNIQUE,                            -- Google OAuth ID (optional)
  name TEXT NOT NULL,                               -- User display name
  permission_level TEXT NOT NULL,                   -- 'junior' | 'senior' | 'leader' | 'admin'
  user_class TEXT NOT NULL,                         -- 'person' | 'agent'
  is_active INTEGER NOT NULL DEFAULT 1,             -- 1=active, 0=disabled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Sessions table (JWT token store)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                              -- UUID
  user_id TEXT NOT NULL,                            -- FK to users
  account_id TEXT NOT NULL,                         -- FK to accounts
  token TEXT NOT NULL UNIQUE,                       -- JWT token
  expires_at INTEGER NOT NULL,                      -- Unix timestamp (7 days from creation)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Graph tables with account isolation
CREATE TABLE nodes (
  ...
  account_id TEXT NOT NULL,                         -- Which tenant owns this node
  created_by TEXT NOT NULL,                         -- Which user created it
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE edges (
  ...
  account_id TEXT NOT NULL,                         -- Which tenant owns this edge
  created_by TEXT NOT NULL,                         -- Which user created it
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
```

## Account Types & Classes

### Account Types

| Type       | Description          | Data Access             | Use Case                     |
| ---------- | -------------------- | ----------------------- | ---------------------------- |
| **admin**  | System-level account | Can see ALL tenant data | Support staff, system admins |
| **client** | Tenant account       | Can ONLY see own data   | Regular customers, users     |

### Account Classes (Tiers)

| Class            | Features                      | Limits                             | Price     |
| ---------------- | ----------------------------- | ---------------------------------- | --------- |
| **free**         | Basic graph features          | 500 sources, 20K nodes, 50 groups  | $0/month  |
| **professional** | + AI features, API access     | 5K sources, 200K nodes, 500 groups | $29/month |
| **business**     | + PII handling, team features | Unlimited                          | $99/month |

### Permission Levels (RBAC)

| Level      | Read | Create | Delete | Admin Settings | Use Case                       |
| ---------- | ---- | ------ | ------ | -------------- | ------------------------------ |
| **junior** | ✅   | ❌     | ❌     | ❌             | View-only access, reviewers    |
| **senior** | ✅   | ✅     | ❌     | ❌             | Content creators, contributors |
| **leader** | ✅   | ✅     | ✅     | ❌             | Team leads, managers           |
| **admin**  | ✅   | ✅     | ✅     | ✅             | Account owners, full control   |

## Authentication Flow

### 1. Registration

**Endpoint:** `POST /api/v1/auth/register`

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "accountType": "client", // Optional, defaults to "client"
  "accountClass": "free" // Optional, defaults to "free"
}
```

**Response (201 Created):**

```json
{
  "user": {
    "id": "usr_abc123",
    "account_id": "acc_xyz789",
    "email": "user@example.com",
    "name": "John Doe",
    "permission_level": "admin", // First user in account gets admin
    "user_class": "person",
    "is_active": true,
    "created_at": 1697123456789,
    "updated_at": 1697123456789
  },
  "account": {
    "id": "acc_xyz789",
    "account_type": "client",
    "account_class": "free",
    "email": "user@example.com",
    "name": "John Doe",
    "created_at": 1697123456789,
    "updated_at": 1697123456789
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Process:**

1. Validate email format and password strength
2. Check if email already exists (return 409 if duplicate)
3. Hash password with bcrypt (10 rounds)
4. Create account record in transaction
5. Create user record (first user gets admin permission)
6. Generate JWT token (expires in 7 days)
7. Store session in database
8. Return user, account, and token

### 2. Login

**Endpoint:** `POST /api/v1/auth/login`

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**

```json
{
  "user": { ... },
  "account": { ... },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid credentials
- `500 Internal Server Error` - Server error

**Process:**

1. Look up user by email
2. Verify password with bcrypt.compare()
3. Check user is_active status
4. Load account information
5. Delete old sessions for this user (single sign-on enforcement)
6. Generate new JWT token
7. Store new session in database
8. Return user, account, and token

### 3. Logout

**Endpoint:** `POST /api/v1/auth/logout`

**Headers:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Process:**

1. Extract token from Authorization header
2. Delete session record from database
3. Token is now invalid for future requests

## JWT Token Structure

### Payload

```javascript
{
  "userId": "usr_abc123",           // User ID
  "accountId": "acc_xyz789",        // Account ID (tenant)
  "email": "user@example.com",      // User email
  "permissionLevel": "admin",        // RBAC level
  "accountType": "client",           // admin or client
  "accountClass": "professional",    // free, professional, or business
  "iat": 1697123456,                 // Issued at (Unix timestamp)
  "exp": 1697728256                  // Expires at (iat + 7 days)
}
```

### Token Lifecycle

1. **Generation:** Created on registration or login
2. **Storage:** Stored in sessions table with expiration
3. **Validation:** Verified on each protected request
4. **Expiration:** Tokens expire after 7 days
5. **Revocation:** Deleted on logout or when user logs in again

## Authorization Middleware

### 1. requireAuth

Verifies JWT token and attaches user info to request.

**Usage in Route:**

```typescript
router.get('/protected', requireAuth(authService), (req, res) => {
  // req.user is now available
  res.json({ userId: req.user.userId });
});
```

**What it does:**

1. Extract token from `Authorization: Bearer <token>` header
2. Verify JWT signature and expiration
3. Check session exists in database and not expired
4. Attach decoded payload to `req.user`
5. Continue to next middleware or reject with 401

**Attached User Object:**

```typescript
req.user = {
  userId: string;
  accountId: string;
  email: string;
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin';
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
}
```

### 2. requirePermission(level)

Checks if user has required permission level.

**Usage:**

```typescript
// Only senior+ users can create nodes
router.post('/nodes', requireAuth(authService), requirePermission('senior'), (req, res) => {
  // User has senior, leader, or admin permission
});
```

**Permission Hierarchy:**

```
junior < senior < leader < admin
```

If route requires `senior`, these users are allowed:

- ✅ senior
- ✅ leader
- ✅ admin
- ❌ junior

### 3. isolateByAccount

Ensures data access is restricted to user's account.

**Usage:**

```typescript
router.get('/nodes', requireAuth(authService), isolateByAccount, (req, res) => {
  // req.user.accountId will be used to filter results
});
```

**What it provides:**

- Sets `req.accountFilter` for SQL queries
- Admin accounts: `req.accountFilter = null` (see all data)
- Client accounts: `req.accountFilter = accountId` (see only own data)

## Multi-Tenant Data Isolation

### SQL Query Pattern

```typescript
// In route handler after auth middleware:
const accountFilter = req.user && req.user.accountType !== 'admin' ? req.user.accountId : null;

if (accountFilter) {
  // Client account - filter by account_id
  const query = 'SELECT * FROM nodes WHERE account_id = ? LIMIT ?';
  const result = await db.execute(query, [accountFilter, limit]);
} else {
  // Admin account - see all data
  const query = 'SELECT * FROM nodes LIMIT ?';
  const result = await db.execute(query, [limit]);
}
```

### Edge Ownership Verification

Edges connect nodes. Both nodes must belong to the same account:

```typescript
// When creating an edge
const fromNode = await db.getNode(edge.from_id);
const toNode = await db.getNode(edge.to_id);

if (req.user.accountType !== 'admin') {
  // Verify both nodes belong to user's account
  if (fromNode.account_id !== req.user.accountId || toNode.account_id !== req.user.accountId) {
    return res.status(403).json({ error: 'Access denied' });
  }
}
```

## Protected Endpoints

### Authentication Required

All endpoints under `/api/v1/*` require authentication except:

- `/api/v1/auth/login`
- `/api/v1/auth/register`
- `/api/v1/auth/register/google`

### Endpoint Permission Matrix

| Endpoint               | Method | Permission Required | Account Isolation   |
| ---------------------- | ------ | ------------------- | ------------------- |
| `/api/v1/nodes`        | GET    | None (auth only)    | ✅ Yes              |
| `/api/v1/nodes/:id`    | GET    | None (auth only)    | ✅ Yes              |
| `/api/v1/nodes/source` | POST   | **senior**          | ✅ Yes              |
| `/api/v1/nodes/group`  | POST   | **senior**          | ✅ Yes              |
| `/api/v1/nodes/:id`    | DELETE | **leader**          | ✅ Yes              |
| `/api/v1/edges`        | GET    | None (auth only)    | ✅ Yes              |
| `/api/v1/edges`        | POST   | **senior**          | ✅ Yes (both nodes) |
| `/api/v1/edges`        | DELETE | **leader**          | ✅ Yes              |
| `/api/v1/boards`       | GET    | None (auth only)    | ✅ Yes              |
| `/api/v1/boards`       | POST   | **senior**          | ✅ Yes              |
| `/api/v1/boards/:id`   | PUT    | **senior**          | ✅ Yes              |
| `/api/v1/boards/:id`   | DELETE | **leader**          | ✅ Yes              |
| `/api/v1/content/*`    | GET    | None (auth only)    | ✅ Yes              |
| `/api/v1/ingest/files` | POST   | **senior**          | ✅ Yes              |

## API Usage Examples

### Example 1: Register and Create Node

```bash
# 1. Register new account
TOKEN=$(curl -s -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "SecurePass123!",
    "name": "Alice"
  }' | jq -r '.token')

# 2. Create a source node (requires senior+ permission)
# First user in account gets admin, which includes senior permission
curl -X POST http://localhost:4001/api/v1/nodes/source \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "src_123",
    "kind": "Source",
    "fingerprint": "abc123",
    "mime_type": "text/markdown",
    "size_bytes": 1024,
    "title": "My Private Document",
    "created_at": 1697123456789,
    "updated_at": 1697123456789
  }'

# 3. List nodes (will only see nodes from Alice's account)
curl http://localhost:4001/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN"
```

### Example 2: Multi-Tenant Isolation Test

```bash
# Register two separate accounts
ALICE_TOKEN=$(curl -s -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"Pass123!","name":"Alice"}' \
  | jq -r '.token')

BOB_TOKEN=$(curl -s -X POST http://localhost:4001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"Pass123!","name":"Bob"}' \
  | jq -r '.token')

# Alice creates a node
ALICE_NODE=$(curl -s -X POST http://localhost:4001/api/v1/nodes/source \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}' \
  | jq -r '.node.id')

# Bob tries to access Alice's node - should get 403 Forbidden
curl http://localhost:4001/api/v1/nodes/$ALICE_NODE \
  -H "Authorization: Bearer $BOB_TOKEN"
# Response: {"error":"Access denied"}

# Alice lists nodes - sees her node
curl http://localhost:4001/api/v1/nodes \
  -H "Authorization: Bearer $ALICE_TOKEN"
# Response: {"nodes":[{...Alice's nodes...}]}

# Bob lists nodes - doesn't see Alice's node
curl http://localhost:4001/api/v1/nodes \
  -H "Authorization: Bearer $BOB_TOKEN"
# Response: {"nodes":[]} (empty, no cross-contamination)
```

### Example 3: Permission Levels

```bash
# Assuming you have a token for a junior user:
JUNIOR_TOKEN="..."

# Junior can read
curl http://localhost:4001/api/v1/nodes \
  -H "Authorization: Bearer $JUNIOR_TOKEN"
# ✅ Success: 200 OK

# Junior cannot create
curl -X POST http://localhost:4001/api/v1/nodes/source \
  -H "Authorization: Bearer $JUNIOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
# ❌ Error: 403 Forbidden - "Insufficient permissions"
```

## Security Best Practices

### Password Requirements

**Recommended (not enforced by default):**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

**Current Implementation:**

- Bcrypt hashing with 10 rounds
- Passwords stored as hashes, never plaintext
- No password in any log output

### JWT Security

**Current:**

- ✅ Tokens signed with HS256 (HMAC SHA-256)
- ✅ Secret key from environment variable
- ✅ 7-day expiration
- ✅ Database-backed session storage (can be revoked)
- ✅ Single sign-on (old sessions deleted on new login)

**Recommended Enhancements:**

- [ ] Use RS256 (public/private key pairs) for production
- [ ] Implement refresh tokens (longer-lived, can be rotated)
- [ ] Add token fingerprinting (bind to IP/User-Agent)
- [ ] Implement rate limiting on auth endpoints
- [ ] Add MFA for admin accounts

### SQL Injection Protection

**Current:**

- ✅ All queries use parameterized statements
- ✅ No string concatenation in SQL
- ✅ Zod schema validation on inputs

**Example:**

```typescript
// ✅ SAFE: Parameterized query
const query = 'SELECT * FROM nodes WHERE id = ?';
await db.execute(query, [nodeId]);

// ❌ UNSAFE: String concatenation (NOT USED)
const query = `SELECT * FROM nodes WHERE id = '${nodeId}'`;
```

### Account Isolation Testing

Run the comprehensive test suite:

```bash
npm run test:auth
```

**Tests verify:**

- ✅ Client accounts cannot access other clients' data
- ✅ Client accounts cannot create edges to other clients' nodes
- ✅ Admin accounts CAN access all tenant data
- ✅ Protected endpoints require valid JWT
- ✅ Invalid/expired tokens are rejected
- ✅ Permission levels are enforced correctly

## Troubleshooting

### "Unauthorized" (401)

**Causes:**

- Missing Authorization header
- Token expired (> 7 days old)
- Token signature invalid
- Session deleted from database (user logged out)

**Fix:**

1. Check Authorization header: `Authorization: Bearer <token>`
2. Log in again to get fresh token
3. Verify `JWT_SECRET` matches between environments

### "Forbidden" (403)

**Causes:**

- Insufficient permission level (e.g., junior trying to POST)
- Trying to access another tenant's data
- Trying to create edge to another tenant's node

**Fix:**

1. Check user's permission level: decode JWT or call GET /api/v1/users/me
2. Ensure you're accessing your own account's data
3. Request permission level upgrade from account admin

### "Account with this email already exists" (409)

**Cause:**

- Email already registered

**Fix:**

- Use POST /api/v1/auth/login instead
- Use different email address
- Contact support to recover account

## Environment Variables

```bash
# Required
JWT_SECRET=your-strong-random-secret-change-in-production

# Optional (defaults shown)
JWT_EXPIRES_IN=7d              # Token expiration
BCRYPT_ROUNDS=10                # Password hashing rounds (higher = slower but more secure)
```

**Production:**

```bash
# Generate strong secret:
openssl rand -base64 64

# Set in .env:
JWT_SECRET=<generated-secret>
NODE_ENV=production
```

## Advanced Topics

### Adding Users to Account

```typescript
// TODO: Implement POST /api/v1/accounts/:id/users
// Only account admin can add users
// New users start with junior permission
```

### Upgrading Permission Levels

```typescript
// TODO: Implement PATCH /api/v1/users/:id
// Only account admin can change permissions
// Cannot demote yourself
```

### Account Transfer

```typescript
// TODO: Implement POST /api/v1/accounts/:id/transfer
// Transfer ownership to another user
// Requires confirmation from new owner
```

### OAuth Integration

**Google OAuth is supported:**

```typescript
POST /api/v1/auth/register/google
{
  "googleId": "...",
  "email": "user@gmail.com",
  "name": "User Name"
}
```

**Process:**

1. Frontend handles Google OAuth popup
2. Frontend sends Google ID token to backend
3. Backend verifies token with Google API (TODO)
4. Backend creates/finds user with google_id
5. Returns Canvas Memory JWT token

## Migration Guide

### From No Auth to Auth

If you have existing data without `account_id` and `created_by`:

```sql
-- Add default account for existing data
INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
VALUES ('default-account-id', 'admin', 'business', 'legacy@system.local', 'Legacy Data', 1697123456789, 1697123456789);

-- Add default user
INSERT INTO users (id, account_id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at)
VALUES ('default-user-id', 'default-account-id', 'legacy@system.local', NULL, 'Legacy User', 'admin', 'person', 1, 1697123456789, 1697123456789);

-- Update existing nodes
UPDATE nodes
SET account_id = 'default-account-id',
    created_by = 'default-user-id'
WHERE account_id IS NULL;

-- Update existing edges
UPDATE edges
SET account_id = 'default-account-id',
    created_by = 'default-user-id'
WHERE account_id IS NULL;
```

---

**For more information:**

- [SESSION_AUTH_COMPLETE.md](../../SESSION_AUTH_COMPLETE.md) - Implementation details
- [README.md](../../README.md) - General documentation
- API source: [apps/api/src/services/auth.service.ts](../../apps/api/src/services/auth.service.ts)
- Middleware: [apps/api/src/middleware/auth.middleware.ts](../../apps/api/src/middleware/auth.middleware.ts)
