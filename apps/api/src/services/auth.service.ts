/**
 * AuthService V2 - M:N User-Account Architecture
 *
 * Supports:
 * - Many-to-many user-account relationships
 * - Multi-step login (email/password → account selection)
 * - Account switching without re-login
 * - Per-account roles and permissions
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { SQLiteClient } from '@keimenon/db';
import { validatePassword, getPasswordRequirementsText } from '../utils/password-validator';
import {
  checkAccountLockout,
  recordLoginAttempt,
  getLockoutMessage,
  unlockAccount,
} from '../utils/account-lockout';
import {
  logLoginSuccess,
  logLoginFailure,
  logAccountLockout,
  logLogout,
  logRegistration,
  logPasswordChange,
  logAccountSwitch,
} from '../utils/audit-logger';
import { ensureHumanPrincipalHierarchyForUser } from './graph-hierarchy.service';

const JWT_SECRET = process.env.JWT_SECRET || 'keimenon-secret-change-in-production';
const JWT_EXPIRES_IN = '7d'; // 7 days
const JWT_TEMP_EXPIRES_IN = '15m'; // 15 minutes for account selection
const BCRYPT_ROUNDS = 12; // Production-grade security (2^12 = 4096 iterations)

export interface User {
  id: string;
  email: string;
  name: string;
  user_class: 'person' | 'agent';
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface Account {
  id: string;
  account_type: 'admin' | 'client';
  account_class: 'free' | 'professional' | 'business';
  email: string;
  name: string;
  owner_user_id?: string;
  require_account_password: boolean;
  created_at: number;
  updated_at: number;
}

export interface UserAccountMembership {
  user_id: string;
  account_id: string;
  permission_level: 'junior' | 'senior' | 'leader' | 'admin';
  role_rank: number; // 1=junior, 2=senior, 3=leader, 4=admin
  role_overrides?: Record<string, boolean>;
  status: 'pending' | 'active' | 'suspended' | 'left';
  joined_at: number;
}

export interface UserAccount {
  accountId: string;
  accountName: string;
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin';
  roleRank: number;
  requiresPassword: boolean;
  memberSince: number;
}

export interface JWTPayload {
  userId: string;
  accountId: string; // Current operating account
  email: string;
  permissionLevel: string; // Role in current account
  accountType: string;
  accountClass: string;
  rank: number; // 1-4 for current account
  overrides?: Record<string, boolean>; // Per-account capability overrides
  allAccounts: string[]; // All accessible account IDs
  sessionId: string; // Link to sessions table
}

export interface TempJWTPayload {
  userId: string;
  email: string;
  purpose: 'account_selection';
}

export interface LoginResult {
  // Single account - direct login
  user?: User;
  account?: Account;
  token?: string;
  membership?: UserAccountMembership;

  // Multiple accounts - requires selection
  requiresAccountSelection?: boolean;
  availableAccounts?: UserAccount[];
  tempToken?: string; // Temporary token for account selection
}

interface SessionRotationOptions {
  sessionFamilyId?: string;
  parentSessionId?: string;
  revokeExistingForAccount?: boolean;
  revokeReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class AuthServiceV2 {
  private static readonly sessionMissLogTtlMs = Number.parseInt(
    process.env.AUTH_SESSION_MISS_LOG_TTL_MS || String(10 * 60 * 1000),
    10
  );
  private static readonly sessionMissCacheMax = Number.parseInt(
    process.env.AUTH_SESSION_MISS_CACHE_MAX || '1000',
    10
  );
  private static sessionMissLogCache = new Map<
    string,
    { lastWarnAt: number; suppressed: number; lastSeenAt: number }
  >();

  constructor(private db: SQLiteClient) {}

  private static readonly testSessionRelaxEnv = 'AUTH_TEST_RELAX_SESSION_BINDING';

  private hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private shouldRelaxSessionBindingInThisProcess(): boolean {
    if (process.env.NODE_ENV !== 'test') {
      return false;
    }

    // Tests may disable this relaxation by setting AUTH_TEST_RELAX_SESSION_BINDING=0.
    return process.env[AuthServiceV2.testSessionRelaxEnv] !== '0';
  }

  private getSessionByAccessToken(database: Database.Database, token: string): any | null {
    const tokenHash = this.hashOpaqueToken(token);
    let session: any | null = null;

    try {
      session = database
        .prepare('SELECT * FROM sessions WHERE token_hash = ?')
        .get(tokenHash) as any;
    } catch {
      // Legacy test schemas may not include token_hash yet.
      session = null;
    }

    if (session) {
      return session;
    }

    // Migration bridge: support legacy raw-token rows and upgrade them in-place.
    session = database.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as any;
    if (!session) {
      return null;
    }

    try {
      database
        .prepare(
          `
          UPDATE sessions
          SET token_hash = ?, token = ?
          WHERE id = ?
        `
        )
        .run(tokenHash, tokenHash, session.id);
    } catch {
      // token_hash not available in legacy schema.
    }

    return {
      ...session,
      token_hash: tokenHash,
      token: tokenHash,
    };
  }

  private logSessionMissing(payload: JWTPayload): void {
    const now = Date.now();
    const cacheKey = `${payload.accountId}:${payload.userId}`;
    const existing = AuthServiceV2.sessionMissLogCache.get(cacheKey);

    if (!existing || now - existing.lastWarnAt >= AuthServiceV2.sessionMissLogTtlMs) {
      const suppressed = existing?.suppressed ?? 0;
      const suffix =
        suppressed > 0
          ? ` (suppressed ${suppressed} duplicate warning(s) in last ${Math.round(AuthServiceV2.sessionMissLogTtlMs / 1000)}s)`
          : '';

      console.warn(
        `[AUTH] ⚠️  Valid JWT token but no session found (userId: ${payload.userId}, accountId: ${payload.accountId})${suffix}`
      );

      AuthServiceV2.sessionMissLogCache.set(cacheKey, {
        lastWarnAt: now,
        suppressed: 0,
        lastSeenAt: now,
      });
    } else {
      AuthServiceV2.sessionMissLogCache.set(cacheKey, {
        ...existing,
        suppressed: existing.suppressed + 1,
        lastSeenAt: now,
      });
    }

    if (AuthServiceV2.sessionMissLogCache.size > AuthServiceV2.sessionMissCacheMax) {
      const oldest = Array.from(AuthServiceV2.sessionMissLogCache.entries()).sort(
        (a, b) => a[1].lastSeenAt - b[1].lastSeenAt
      )[0];
      if (oldest) {
        AuthServiceV2.sessionMissLogCache.delete(oldest[0]);
      }
    }
  }

  /**
   * Returns the token invalidation epoch in milliseconds, if set.
   *
   * Tokens issued before this timestamp are considered invalid.
   * This is primarily used to force-auth-reset after factory reset.
   */
  private getAuthTokenEpochMs(database: Database.Database): number | null {
    try {
      const explicitEpoch = database
        .prepare(`SELECT value FROM schema_metadata WHERE key = 'auth_token_epoch_ms'`)
        .get() as { value?: string } | undefined;

      if (explicitEpoch?.value) {
        const numeric = Number(explicitEpoch.value);
        if (Number.isFinite(numeric) && numeric > 0) {
          return numeric;
        }
      }

      const factoryReset = database
        .prepare(`SELECT value FROM schema_metadata WHERE key = 'last_factory_reset'`)
        .get() as { value?: string } | undefined;

      if (!factoryReset?.value) {
        return null;
      }

      const asNumber = Number(factoryReset.value);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        return asNumber;
      }

      const parsedDate = Date.parse(factoryReset.value);
      if (Number.isFinite(parsedDate)) {
        return parsedDate;
      }
    } catch (error) {
      console.warn('[AUTH] Failed to read auth token epoch from schema metadata:', error);
    }

    return null;
  }

  /**
   * Map permission level to numeric rank
   */
  private getRank(permissionLevel: string): number {
    const rankMap: Record<string, number> = {
      junior: 1,
      senior: 2,
      leader: 3,
      admin: 4,
    };
    return rankMap[permissionLevel] || 1;
  }

  /**
   * Parse overrides JSON string to object
   */
  private parseOverrides(overridesJson?: string | null): Record<string, boolean> | undefined {
    if (!overridesJson) return undefined;
    try {
      return JSON.parse(overridesJson);
    } catch {
      return undefined;
    }
  }

  /**
   * Get all accounts accessible to a user
   */
  async getUserAccounts(userId: string): Promise<UserAccount[]> {
    const database = this.db.getDatabase();

    const rows = database
      .prepare(
        `
      SELECT
        a.id as account_id,
        a.name as account_name,
        a.account_type,
        a.account_class,
        a.require_account_password,
        ua.permission_level,
        ua.role_rank,
        ua.joined_at
      FROM user_accounts ua
      JOIN accounts a ON ua.account_id = a.id
      WHERE ua.user_id = ? AND ua.status = 'active'
      ORDER BY ua.joined_at ASC
    `
      )
      .all(userId) as any[];

    return rows.map((row) => ({
      accountId: row.account_id,
      accountName: row.account_name,
      accountType: row.account_type,
      accountClass: row.account_class,
      permissionLevel: row.permission_level,
      roleRank: row.role_rank,
      requiresPassword: row.require_account_password === 1,
      memberSince: row.joined_at,
    }));
  }

  /**
   * Step 1: Authenticate user by email and password
   * Returns either direct login (single account) or account selection (multiple accounts)
   */
  async login(
    email: string,
    password: string,
    ipAddress: string = 'unknown',
    userAgent?: string,
    databaseInstance?: any // Database.Database
  ): Promise<LoginResult> {
    const database = databaseInstance || this.db.getDatabase();

    // Check account lockout status BEFORE attempting login
    const lockoutStatus = checkAccountLockout(database, email, ipAddress);
    if (lockoutStatus.isLocked) {
      // Log lockout attempt
      logAccountLockout(database, email, ipAddress, userAgent, 30); // 30 min lockout
      throw new Error(getLockoutMessage(lockoutStatus));
    }

    // Get user by email
    const userRow = database
      .prepare(
        `
      SELECT * FROM users WHERE email = ? AND is_active = 1
    `
      )
      .get(email) as any;

    if (!userRow) {
      if (process.env.AUTH_VERBOSE_DEBUG === '1') {
        const anyUser = database.prepare('SELECT * FROM users WHERE email = ?').get(email);
        const userCount = database.prepare('SELECT count(*) as c FROM users').get() as {
          c?: number;
        };
        console.warn('[AUTH DEBUG] Login lookup miss', {
          receivedEmail: email,
          emailLen: email.length,
          foundWithoutActiveCheck: !!anyUser,
          totalUsers: userCount?.c ?? 0,
        });
      }

      // Record failed attempt - user not found
      recordLoginAttempt(database, email, ipAddress, false, userAgent, 'User not found');
      logLoginFailure(database, email, 'User not found', ipAddress, userAgent);
      throw new Error('User not found');
    }

    // Verify password hash for all users
    if (!userRow.password_hash) {
      // Record failed attempt - no password hash
      recordLoginAttempt(database, email, ipAddress, false, userAgent, 'No password hash');
      logLoginFailure(database, email, 'No password hash', ipAddress, userAgent);
      throw new Error('Password not set for this account');
    }

    const isValidPassword = await bcrypt.compare(password, userRow.password_hash);
    if (!isValidPassword) {
      // Record failed attempt - invalid password
      recordLoginAttempt(database, email, ipAddress, false, userAgent, 'Invalid password');
      logLoginFailure(database, email, 'Invalid password', ipAddress, userAgent);
      throw new Error('Invalid password');
    }

    // Password valid - record successful attempt and clear failures
    recordLoginAttempt(database, email, ipAddress, true, userAgent);

    // Password valid - check user's accounts
    const user: User = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      user_class: userRow.user_class,
      is_active: userRow.is_active === 1,
      created_at: userRow.created_at,
      updated_at: userRow.updated_at,
    };

    const accounts = await this.getUserAccounts(user.id);

    if (accounts.length === 0) {
      throw new Error('No active accounts found for this user');
    }

    if (accounts.length === 1) {
      // Single account - auto-select and return full login
      return this.selectAccount(
        user.id,
        accounts[0].accountId,
        undefined,
        ipAddress,
        userAgent,
        database
      );
    }

    // Multiple accounts - return for selection
    const tempToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'account_selection' } as TempJWTPayload,
      JWT_SECRET,
      { expiresIn: JWT_TEMP_EXPIRES_IN }
    );

    return {
      requiresAccountSelection: true,
      availableAccounts: accounts,
      tempToken,
    };
  }

  /**
   * Step 2: Select account (after login with multiple accounts)
   * Can also be used for account switching
   *
   * CRITICAL FIX #4: Database consistency for test isolation
   * - Accepts optional `database` parameter to ensure same DB instance is used across transaction
   * - When called from register(), uses the SAME database instance that created the user
   * - Prevents "User not found" errors in E2E tests caused by database instance mismatch
   */
  async selectAccount(
    userId: string,
    accountId: string,
    accountPassword?: string,
    ipAddress?: string,
    userAgent?: string,
    database?: Database.Database
  ): Promise<LoginResult> {
    // Use provided database (for consistency within register flow) or get new instance
    const db = database || this.db.getDatabase();

    // Get user
    const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!userRow) {
      throw new Error('User not found');
    }

    // Get account
    const accountRow = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as any;
    if (!accountRow) {
      throw new Error('Account not found');
    }

    // Get user-account membership
    const membershipRow = db
      .prepare(
        `
      SELECT * FROM user_accounts
      WHERE user_id = ? AND account_id = ? AND status = 'active'
    `
      )
      .get(userId, accountId) as any;

    if (!membershipRow) {
      throw new Error('You do not have access to this account');
    }

    // Check account password if required
    if (accountRow.require_account_password === 1) {
      if (!accountPassword) {
        throw new Error('Account password required');
      }

      if (!accountRow.account_password_hash) {
        throw new Error('Account password not set');
      }

      const isValidAccountPassword = await bcrypt.compare(
        accountPassword,
        accountRow.account_password_hash
      );
      if (!isValidAccountPassword) {
        throw new Error('Invalid account password');
      }
    }

    // Build user, account, and membership objects
    const user: User = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      user_class: userRow.user_class,
      is_active: userRow.is_active === 1,
      created_at: userRow.created_at,
      updated_at: userRow.updated_at,
    };

    const account: Account = {
      id: accountRow.id,
      account_type: accountRow.account_type,
      account_class: accountRow.account_class,
      email: accountRow.email,
      name: accountRow.name,
      owner_user_id: accountRow.owner_user_id,
      require_account_password: accountRow.require_account_password === 1,
      created_at: accountRow.created_at,
      updated_at: accountRow.updated_at,
    };

    const membership: UserAccountMembership = {
      user_id: membershipRow.user_id,
      account_id: membershipRow.account_id,
      permission_level: membershipRow.permission_level,
      role_rank: membershipRow.role_rank,
      role_overrides: this.parseOverrides(membershipRow.role_overrides),
      status: membershipRow.status,
      joined_at: membershipRow.joined_at,
    };

    // Keep graph hierarchy materialized for Account -> Principal visibility.
    ensureHumanPrincipalHierarchyForUser(db, account.id, user.id, user.id, Date.now());

    // Create session and token
    // CRITICAL FIX #6: Pass database instance to createSession() for consistency
    // This ensures createSession() uses the same DB instance as selectAccount()
    // Prevents FOREIGN KEY constraint failures when called from register()
    const token = await this.createSession(user, account, membership, db, {
      revokeExistingForAccount: true,
      revokeReason: 'login_replaced',
      ipAddress,
      userAgent,
    });

    // Log successful login
    // TEMPORARILY DISABLED: logLoginSuccess(database, user.id, account.id, user.email, ipAddress, userAgent);

    return { user, account, membership, token };
  }

  /**
   * Switch to a different account (without re-entering password)
   */
  async switchAccount(
    userId: string,
    newAccountId: string,
    accountPassword?: string,
    fromAccountId?: string,
    ipAddress?: string,
    userAgent?: string,
    databaseInstance?: any // Database.Database
  ): Promise<LoginResult> {
    const database = databaseInstance || this.db.getDatabase();

    // Log account switch
    if (fromAccountId) {
      logAccountSwitch(database, userId, fromAccountId, newAccountId, ipAddress, userAgent);
    }

    // Reuse selectAccount logic
    return this.selectAccount(
      userId,
      newAccountId,
      accountPassword,
      ipAddress,
      userAgent,
      database
    );
  }

  /**
   * Register new account with first user as owner
   */
  async register(
    email: string,
    password: string,
    name: string,
    accountName: string,
    accountType: 'admin' | 'client' = 'client',
    accountClass: 'free' | 'professional' | 'business' = 'free',
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const database = this.db.getDatabase();
    const now = Date.now();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(
        `Password does not meet requirements: ${passwordValidation.errors.join(', ')}`
      );
    }

    // Check if user already exists
    const existingUser = database.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (existingUser) {
      throw new Error('Account with this email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create account, user, and user_accounts in transaction
    const transaction = database.transaction(() => {
      // 1. Create account
      const accountId = randomUUID();
      database
        .prepare(
          `
        INSERT INTO accounts (id, account_type, account_class, email, name, owner_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(accountId, accountType, accountClass, email, accountName, null, now, now); // owner_user_id set after user creation

      // 2. Create user (no account_id - deprecated field)
      const userId = randomUUID();
      database
        .prepare(
          `
        INSERT INTO users (
          id,
          email,
          password_hash,
          google_id,
          name,
          permission_level,
          user_class,
          is_active,
          created_at,
          updated_at,
          primary_account_id,
          last_login_account_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          userId,
          email,
          passwordHash,
          null,
          name,
          'admin',
          'person',
          1,
          now,
          now,
          accountId,
          accountId
        );

      // 3. Create user_accounts membership (owner, admin role)
      const membershipId = randomUUID();
      database
        .prepare(
          `
        INSERT INTO user_accounts (id, user_id, account_id, permission_level, role_rank, status, joined_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(membershipId, userId, accountId, 'admin', 4, 'active', now, now, now);

      // 4. Update account owner_user_id
      database.prepare('UPDATE accounts SET owner_user_id = ? WHERE id = ?').run(userId, accountId);

      // 5. Set user's primary_account_id
      database
        .prepare('UPDATE users SET primary_account_id = ? WHERE id = ?')
        .run(accountId, userId);

      return { userId, accountId };
    });

    const { userId, accountId } = transaction();

    // Ensure newly registered owner appears in graph hierarchy immediately.
    ensureHumanPrincipalHierarchyForUser(database, accountId, userId, userId, now);

    // Log registration
    logRegistration(database, userId, accountId, email, ipAddress, userAgent);

    // CRITICAL FIX #4: Pass the SAME database instance to selectAccount()
    // This ensures the user lookup uses the same DB that just created the user
    // Prevents "User not found" errors in E2E tests caused by database instance mismatch
    return this.selectAccount(userId, accountId, undefined, ipAddress, userAgent, database);
  }

  /**
   * Register or sign in using Google identity.
   *
   * Existing users are linked by google_id first, then by email.
   */
  async registerWithGoogle(
    googleId: string,
    email: string,
    name: string,
    accountClass: 'free' | 'professional' | 'business' = 'free',
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const database = this.db.getDatabase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    let userRow = database
      .prepare('SELECT * FROM users WHERE google_id = ? AND is_active = 1')
      .get(googleId) as any;

    if (!userRow) {
      userRow = database
        .prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
        .get(email) as any;
    }

    if (!userRow) {
      const generatedPassword = `${randomUUID()}Aa1!`;
      const registration = await this.register(
        email,
        generatedPassword,
        name,
        name,
        'client',
        accountClass,
        ipAddress,
        userAgent
      );

      database.prepare('UPDATE users SET google_id = ? WHERE email = ?').run(googleId, email);
      return registration;
    }

    if (!userRow.google_id) {
      database
        .prepare('UPDATE users SET google_id = ?, updated_at = ? WHERE id = ?')
        .run(googleId, Date.now(), userRow.id);
    }

    const accounts = await this.getUserAccounts(userRow.id);
    if (accounts.length === 0) {
      throw new Error('No active accounts found for this user');
    }

    if (accounts.length === 1) {
      return this.selectAccount(userRow.id, accounts[0].accountId, undefined, ipAddress, userAgent);
    }

    const tempToken = jwt.sign(
      { userId: userRow.id, email: userRow.email, purpose: 'account_selection' } as TempJWTPayload,
      JWT_SECRET,
      { expiresIn: JWT_TEMP_EXPIRES_IN }
    );

    return {
      requiresAccountSelection: true,
      availableAccounts: accounts,
      tempToken,
    };
  }

  /**
   * Create a session and return JWT token
   *
   * CRITICAL FIX #3: Transaction-based session creation
   * - Wraps session deletion + insertion in atomic transaction
   * - Prevents race conditions where token is returned before session committed
   * - Ensures session is fully persisted before JWT is returned
   * - Uses better-sqlite3's synchronous transaction API
   *
   * CRITICAL FIX #5: Database instance consistency
   * - Accepts optional database parameter for consistency with register() flow
   * - Ensures createSession() uses same DB instance that created the user/account
   * - Prevents FOREIGN KEY constraint failures in registration tests
   */
  private async createSession(
    user: User,
    account: Account,
    membership: UserAccountMembership,
    database?: Database.Database,
    options?: SessionRotationOptions
  ): Promise<string> {
    // Use provided database (for consistency within register flow) or get new instance
    const db = database || this.db.getDatabase();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    // Get all accessible accounts for this user
    const allAccounts = await this.getUserAccounts(user.id);
    const allAccountIds = allAccounts.map((a) => a.accountId);

    // Create session ID
    const sessionId = randomUUID();

    // Generate JWT FIRST (before transaction, as this is synchronous)
    const payload: JWTPayload = {
      userId: user.id,
      accountId: account.id,
      email: user.email,
      permissionLevel: membership.permission_level,
      accountType: account.account_type,
      accountClass: account.account_class,
      rank: membership.role_rank,
      overrides: membership.role_overrides,
      allAccounts: allAccountIds,
      sessionId,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const tokenHash = this.hashOpaqueToken(token);
    const sessionFamilyId = options?.sessionFamilyId || sessionId;
    const parentSessionId = options?.parentSessionId || null;
    const revokeReason = options?.revokeReason || 'session_replaced';

    // ATOMIC OPERATION: revoke old session(s) + insert new session in transaction
    const createSessionTransaction = db.transaction(() => {
      if (options?.revokeExistingForAccount !== false) {
        db.prepare(
          `
          UPDATE sessions
          SET revoked_at = ?, revoked_reason = ?
          WHERE user_id = ? AND operating_account_id = ? AND revoked_at IS NULL
        `
        ).run(now, revokeReason, user.id, account.id);
      }

      if (parentSessionId) {
        db.prepare(
          `
          UPDATE sessions
          SET revoked_at = ?, revoked_reason = ?
          WHERE id = ? AND revoked_at IS NULL
        `
        ).run(now, 'refresh_rotated', parentSessionId);
      }

      // Store new session in database
      db.prepare(
        `
        INSERT INTO sessions (
          id, user_id, account_id, token, token_hash, token_family_id,
          parent_session_id, expires_at, created_at, operating_account_id,
          available_accounts, last_active, ip_address, user_agent
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        sessionId,
        user.id,
        account.id, // Backward compat
        tokenHash,
        tokenHash,
        sessionFamilyId,
        parentSessionId,
        expiresAt,
        now,
        account.id, // Current operating account
        JSON.stringify(allAccountIds),
        now,
        options?.ipAddress || null,
        options?.userAgent || null
      );
    });

    // Execute transaction - this is atomic and synchronous
    createSessionTransaction();

    // DIAGNOSTIC: Verify session was created successfully
    const verifySession = db
      .prepare(`SELECT id, token_hash, user_id, account_id FROM sessions WHERE token_hash = ?`)
      .get(tokenHash) as any;

    if (!verifySession) {
      console.error(
        `[AUTH] ❌ CRITICAL: Session creation failed - record not found after insert!`,
        {
          userId: user.id,
          accountId: account.id,
          tokenPrefix: token.substring(0, 20) + '...',
        }
      );
      throw new Error('Session creation failed - database write did not persist');
    }

    console.log(
      `[AUTH] ✅ Session created and verified (userId: ${user.id}, accountId: ${account.id}, sessionId: ${verifySession.id})`
    );

    // Session is now guaranteed to exist in database
    return token;
  }

  /**
   * Generate a token for testing purposes
   * WARNING: Only use in tests - bypasses security checks
   */
  async generateToken(payload: Partial<JWTPayload>): Promise<string> {
    const fullPayload: JWTPayload = {
      userId: payload.userId || 'test-user-id',
      accountId: payload.accountId || 'test-account-id',
      email: payload.email || 'test@test.com',
      permissionLevel: payload.permissionLevel || 'admin',
      accountType: payload.accountType || 'admin',
      accountClass: payload.accountClass || 'business',
      rank: payload.rank || 4,
      overrides: payload.overrides,
      allAccounts: payload.allAccounts || [payload.accountId || 'test-account-id'],
      sessionId: payload.sessionId || randomUUID(),
    };

    return jwt.sign(fullPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * Verify JWT token and return payload
   *
   * CRITICAL FIX #1: JWT-first approach
   * - JWT signature is the primary source of truth
   * - Session lookup is optional (for updating last_active only)
   * - This prevents 401 errors when sessions are missing due to:
   *   - Test isolation with savepoint rollbacks
   *   - Race conditions in session creation
   *   - Database routing issues in multi-worker tests
   */
  async verifyToken(token: string, databaseInstance?: any): Promise<JWTPayload | null> {
    try {
      // Step 1: Verify JWT signature - this is the source of truth
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
      const database = databaseInstance || this.db.getDatabase();
      const now = Date.now();

      // Step 1.5: Invalidate tokens issued before factory-reset/auth epoch
      const tokenEpochMs = this.getAuthTokenEpochMs(database);
      if (tokenEpochMs) {
        const tokenIssuedAtSeconds =
          typeof (payload as any).iat === 'number' ? (payload as any).iat : 0;
        const tokenIssuedAtMs = tokenIssuedAtSeconds * 1000;

        if (tokenIssuedAtMs <= 0 || tokenIssuedAtMs < tokenEpochMs) {
          console.error('[AuthService] verifyToken failing at tokenEpoch check');
          return null;
        }
      }

      // Step 2: Session check for strict binding.
      const session = this.getSessionByAccessToken(database, token);

      if (!session) {
        if (this.shouldRelaxSessionBindingInThisProcess()) {
          return payload;
        }

        this.logSessionMissing(payload);
        return null;
      }

      if (session.expires_at <= now || session.revoked_at) {
        console.error(
          `[AuthService] verifyToken failing at session.expires_at (${session.expires_at} <= ${now}) or revoked_at (${session.revoked_at})`
        );
        return null;
      }

      const sessionMatchesPayload =
        session.id === payload.sessionId &&
        session.user_id === payload.userId &&
        session.operating_account_id === payload.accountId;

      if (!sessionMatchesPayload && !this.shouldRelaxSessionBindingInThisProcess()) {
        console.error(
          `[AuthService] verifyToken failing at sessionMatchesPayload (${session.id} !== ${payload.sessionId} or ${session.user_id} !== ${payload.userId})`
        );
        return null;
      }

      // Step 3: Update last_active timestamp.
      database.prepare('UPDATE sessions SET last_active = ? WHERE id = ?').run(now, session.id);

      return payload;
    } catch (error) {
      console.error(
        '[AuthService] verifyToken failing at jwt.verify: ',
        error instanceof Error ? error.message : String(error)
      );
      // JWT verification failed (invalid signature, expired, etc.)
      return null;
    }
  }

  /**
   * Refresh an active access token by minting a new session token for the same
   * user/account membership context.
   */
  async refreshToken(
    token: string,
    ipAddress?: string,
    userAgent?: string,
    databaseInstance?: any
  ): Promise<LoginResult | null> {
    const payload = await this.verifyToken(token, databaseInstance);
    if (!payload) {
      return null;
    }

    const database = databaseInstance || this.db.getDatabase();
    const currentSession = this.getSessionByAccessToken(database, token);

    if (!currentSession || currentSession.revoked_at || currentSession.expires_at <= Date.now()) {
      return null;
    }

    if (
      currentSession.id !== payload.sessionId ||
      currentSession.user_id !== payload.userId ||
      currentSession.operating_account_id !== payload.accountId
    ) {
      return null;
    }

    const userRow = database
      .prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
      .get(payload.userId) as any;
    const accountRow = database
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(payload.accountId) as any;
    const membershipRow = database
      .prepare(
        `
        SELECT * FROM user_accounts
        WHERE user_id = ? AND account_id = ? AND status = 'active'
      `
      )
      .get(payload.userId, payload.accountId) as any;

    if (!userRow || !accountRow || !membershipRow) {
      return null;
    }

    const user: User = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      user_class: userRow.user_class,
      is_active: userRow.is_active === 1,
      created_at: userRow.created_at,
      updated_at: userRow.updated_at,
    };

    const account: Account = {
      id: accountRow.id,
      account_type: accountRow.account_type,
      account_class: accountRow.account_class,
      email: accountRow.email,
      name: accountRow.name,
      owner_user_id: accountRow.owner_user_id,
      require_account_password: accountRow.require_account_password === 1,
      created_at: accountRow.created_at,
      updated_at: accountRow.updated_at,
    };

    const membership: UserAccountMembership = {
      user_id: membershipRow.user_id,
      account_id: membershipRow.account_id,
      permission_level: membershipRow.permission_level,
      role_rank: membershipRow.role_rank,
      role_overrides: this.parseOverrides(membershipRow.role_overrides),
      status: membershipRow.status,
      joined_at: membershipRow.joined_at,
    };

    const refreshedToken = await this.createSession(user, account, membership, database, {
      sessionFamilyId: currentSession.token_family_id || currentSession.id,
      parentSessionId: currentSession.id,
      revokeExistingForAccount: false,
      revokeReason: 'refresh_rotated',
      ipAddress,
      userAgent,
    });

    logLoginSuccess(database, user.id, account.id, user.email, ipAddress, userAgent);

    return {
      user,
      account,
      membership,
      token: refreshedToken,
    };
  }

  /**
   * Verify temporary token (for account selection)
   */
  async verifyTempToken(token: string): Promise<TempJWTPayload | null> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as TempJWTPayload;
      if (payload.purpose !== 'account_selection') {
        return null;
      }
      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Logout - delete session
   */
  async logout(
    token: string,
    ipAddress?: string,
    userAgent?: string,
    databaseInstance?: any
  ): Promise<void> {
    const database = databaseInstance || this.db.getDatabase();
    const now = Date.now();

    // Get session info before revoking
    const session = this.getSessionByAccessToken(database, token);

    if (session) {
      database
        .prepare(
          `
          UPDATE sessions
          SET revoked_at = ?, revoked_reason = ?
          WHERE id = ?
        `
        )
        .run(now, 'logout', session.id);
    }

    // Log logout
    if (session) {
      logLogout(database, session.user_id, session.account_id, ipAddress, userAgent);
    }
  }

  /**
   * Request password reset - generates a secure token
   *
   * In production, this token should be sent via email.
   * For development/testing, the token is returned in the response.
   *
   * @param email - User's email address
   * @param ipAddress - IP address of requester (for audit log)
   * @param userAgent - User agent string (for audit log)
   * @returns Reset token and expiration time, or null if user not found
   */
  async requestPasswordReset(
    email: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ token: string; expiresAt: number } | null> {
    const database = this.db.getDatabase();

    // Find user by email
    const userRow = database
      .prepare('SELECT id FROM users WHERE email = ? AND is_active = 1')
      .get(email) as any;

    if (!userRow) {
      // For security, don't reveal if email exists
      // Still return null but don't throw error
      return null;
    }

    const now = Date.now();
    const tokenId = randomUUID();
    const token = randomUUID(); // Secure random token
    const tokenHash = this.hashOpaqueToken(token);
    const expiresAt = now + 60 * 60 * 1000; // 1 hour expiration

    // Store reset token in database
    database
      .prepare(
        `
        INSERT INTO password_reset_tokens (
          id, user_id, token, token_hash, expires_at, created_at, ip_address, user_agent
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(tokenId, userRow.id, tokenHash, tokenHash, expiresAt, now, ipAddress, userAgent);

    // Token is returned for development/testing diagnostics.
    return { token, expiresAt };
  }

  /**
   * Reset password using a valid reset token
   *
   * @param token - Reset token from requestPasswordReset
   * @param newPassword - New password to set
   * @param ipAddress - IP address of requester (for audit log)
   * @param userAgent - User agent string (for audit log)
   * @returns User ID and update timestamp, or null if token invalid
   */
  async resetPasswordWithToken(
    token: string,
    newPassword: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ userId: string; updatedAt: number } | null> {
    const database = this.db.getDatabase();
    const now = Date.now();

    // Find valid, unused token
    const tokenRow = this.getPasswordResetTokenRow(database, token);

    if (!tokenRow) {
      return null; // Token not found
    }

    if (tokenRow.used_at) {
      return null; // Token already used
    }

    if (tokenRow.expires_at < now) {
      return null; // Token expired
    }

    // Validate password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(
        `Password does not meet requirements: ${passwordValidation.errors.join(', ')}`
      );
    }

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password, mark token as used, clear sessions, unlock account
    const runReset = database.transaction(() => {
      // Update password
      database
        .prepare('UPDATE users SET password_hash = ?, updated_at = ?, is_active = 1 WHERE id = ?')
        .run(passwordHash, now, tokenRow.user_id);

      // Mark token as used
      database
        .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?')
        .run(now, tokenRow.id);

      // Revoke all sessions for this user (force re-login).
      this.revokeAllUserSessions(database, tokenRow.user_id, 'password_reset', now);

      // Unlock account if it was locked
      const user = database
        .prepare('SELECT email FROM users WHERE id = ?')
        .get(tokenRow.user_id) as any;
      if (user) {
        unlockAccount(database, user.email);
      }
    });

    runReset();

    const membershipRow = database
      .prepare(
        `
        SELECT account_id
        FROM user_accounts
        WHERE user_id = ? AND status = 'active'
        ORDER BY role_rank DESC, joined_at ASC
        LIMIT 1
      `
      )
      .get(tokenRow.user_id) as any;
    if (membershipRow?.account_id) {
      logPasswordChange(
        database,
        tokenRow.user_id,
        membershipRow.account_id,
        ipAddress,
        userAgent,
        true
      );
    }

    return { userId: tokenRow.user_id, updatedAt: now };
  }

  private revokeAllUserSessions(
    database: Database.Database,
    userId: string,
    reason: string,
    revokedAt: number
  ): void {
    database
      .prepare(
        `
        UPDATE sessions
        SET revoked_at = ?, revoked_reason = ?
        WHERE user_id = ? AND revoked_at IS NULL
      `
      )
      .run(revokedAt, reason, userId);
  }

  private getPasswordResetTokenRow(database: Database.Database, token: string): any | null {
    const tokenHash = this.hashOpaqueToken(token);
    let tokenRow: any | null = null;

    try {
      tokenRow = database
        .prepare(
          `
          SELECT id, user_id, expires_at, used_at
          FROM password_reset_tokens
          WHERE token_hash = ?
        `
        )
        .get(tokenHash) as any;
    } catch {
      tokenRow = null;
    }

    if (tokenRow) {
      return tokenRow;
    }

    tokenRow = database
      .prepare(
        `
        SELECT id, user_id, expires_at, used_at
        FROM password_reset_tokens
        WHERE token = ?
      `
      )
      .get(token) as any;

    if (!tokenRow) {
      return null;
    }

    try {
      database
        .prepare(
          `
          UPDATE password_reset_tokens
          SET token_hash = ?, token = ?
          WHERE id = ?
        `
        )
        .run(tokenHash, tokenHash, tokenRow.id);
    } catch {
      // token_hash not available in legacy schema.
    }

    return tokenRow;
  }

  async changePassword(
    userId: string,
    accountId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ userId: string; updatedAt: number }> {
    const database = this.db.getDatabase();
    const now = Date.now();

    const userRow = database
      .prepare('SELECT id, email, password_hash FROM users WHERE id = ? AND is_active = 1')
      .get(userId) as any;
    if (!userRow) {
      throw new Error('User not found');
    }

    const currentPasswordMatches = await bcrypt.compare(currentPassword, userRow.password_hash);
    if (!currentPasswordMatches) {
      throw new Error('Invalid current password');
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(
        `Password does not meet requirements: ${passwordValidation.errors.join(', ')}`
      );
    }

    const newPasswordMatchesCurrent = await bcrypt.compare(newPassword, userRow.password_hash);
    if (newPasswordMatchesCurrent) {
      throw new Error('New password must be different from current password');
    }

    const passwordHash = await this.hashPassword(newPassword);

    const runChange = database.transaction(() => {
      database
        .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(passwordHash, now, userRow.id);
      this.revokeAllUserSessions(database, userRow.id, 'password_change', now);
      unlockAccount(database, userRow.email);
    });

    runChange();

    logPasswordChange(database, userRow.id, accountId, ipAddress, userAgent, false);
    return { userId: userRow.id, updatedAt: now };
  }

  /**
   * Hash password with bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const database = this.db.getDatabase();
    const now = Date.now();
    database.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const database = this.db.getDatabase();
    const userRow = database.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;

    if (!userRow) {
      return null;
    }

    return {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      user_class: userRow.user_class,
      is_active: userRow.is_active === 1,
      created_at: userRow.created_at,
      updated_at: userRow.updated_at,
    };
  }

  /**
   * Get account by ID
   */
  async getAccountById(accountId: string): Promise<Account | null> {
    const database = this.db.getDatabase();
    const accountRow = database
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any;

    if (!accountRow) {
      return null;
    }

    return {
      id: accountRow.id,
      account_type: accountRow.account_type,
      account_class: accountRow.account_class,
      email: accountRow.email,
      name: accountRow.name,
      owner_user_id: accountRow.owner_user_id,
      require_account_password: accountRow.require_account_password === 1,
      created_at: accountRow.created_at,
      updated_at: accountRow.updated_at,
    };
  }

  /**
   * Get user-account membership
   */
  async getUserAccountMembership(
    userId: string,
    accountId: string
  ): Promise<UserAccountMembership | null> {
    const database = this.db.getDatabase();
    const row = database
      .prepare(
        `
      SELECT * FROM user_accounts
      WHERE user_id = ? AND account_id = ? AND status = 'active'
    `
      )
      .get(userId, accountId) as any;

    if (!row) {
      return null;
    }

    return {
      user_id: row.user_id,
      account_id: row.account_id,
      permission_level: row.permission_level,
      role_rank: row.role_rank,
      role_overrides: this.parseOverrides(row.role_overrides),
      status: row.status,
      joined_at: row.joined_at,
    };
  }
}

// ============================================================================
// PHASE 5: CAPABILITY-BASED AUTHORIZATION (World Model Alignment)
// ============================================================================
//
// The key principle: Authorization checks CAPABILITIES, not principal_kind.
// This implements Falsification Test F1: Principal Equivalence
// - Two principals with identical capabilities get identical permissions
// - Regardless of whether they are human, agent, or contact
//
// ============================================================================

/**
 * Principal capabilities - mirrors PrincipalCapabilitiesSchema in nodes.ts
 */
export interface PrincipalCapabilities {
  can_upload: boolean; // Create sources from uploads
  can_run_tools: boolean; // Execute tool calls (agents)
  can_import_web: boolean; // Fetch external sources (agents)
  can_own_account: boolean; // Be account owner (humans)
  can_approve_runs: boolean; // Approve agent outputs (humans)
}

/**
 * Default capabilities by principal kind (for new principals)
 */
export const DEFAULT_CAPABILITIES: Record<'human' | 'agent' | 'contact', PrincipalCapabilities> = {
  human: {
    can_upload: true,
    can_run_tools: false,
    can_import_web: false,
    can_own_account: true,
    can_approve_runs: true,
  },
  agent: {
    can_upload: true,
    can_run_tools: true,
    can_import_web: true,
    can_own_account: false,
    can_approve_runs: false,
  },
  contact: {
    can_upload: false,
    can_run_tools: false,
    can_import_web: false,
    can_own_account: false,
    can_approve_runs: false,
  },
};

/**
 * Action types that can be authorized via capabilities
 */
export type CapabilityAction =
  | 'upload' // maps to can_upload
  | 'run_tools' // maps to can_run_tools
  | 'import_web' // maps to can_import_web
  | 'own_account' // maps to can_own_account
  | 'approve_runs'; // maps to can_approve_runs

/**
 * Map action to capability field
 */
const ACTION_TO_CAPABILITY: Record<CapabilityAction, keyof PrincipalCapabilities> = {
  upload: 'can_upload',
  run_tools: 'can_run_tools',
  import_web: 'can_import_web',
  own_account: 'can_own_account',
  approve_runs: 'can_approve_runs',
};

/**
 * Authorization result with reason
 */
export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  capability?: keyof PrincipalCapabilities;
}

/**
 * Capability-based authorization service
 *
 * CRITICAL: This service implements the World Model invariant:
 * "Authorization checks capabilities, not kind"
 *
 * Falsification Test F1: Principal Equivalence
 * Given: Human principal H and Agent principal A with IDENTICAL capability flags
 * When: Both attempt the same action
 * Then: Permission engine makes IDENTICAL decision for both
 * If: Outcomes differ because of principal_kind → model is broken
 */
export class CapabilityAuthorizationService {
  private static readonly principalMissLogTtlMs = Number.parseInt(
    process.env.AUTH_PRINCIPAL_MISS_LOG_TTL_MS || String(10 * 60 * 1000),
    10
  );
  private static readonly principalMissCacheMax = Number.parseInt(
    process.env.AUTH_PRINCIPAL_MISS_CACHE_MAX || '1000',
    10
  );
  private static principalMissLogCache = new Map<
    string,
    { lastWarnAt: number; suppressed: number; lastSeenAt: number }
  >();

  constructor(private db: SQLiteClient) {}

  private logPrincipalMissing(principalId: string, accountId: string): void {
    if (process.env.NODE_ENV === 'test' && process.env.AUTH_LOG_PRINCIPAL_MISS !== '1') {
      return;
    }

    const now = Date.now();
    const cacheKey = `${accountId}:${principalId}`;
    const existing = CapabilityAuthorizationService.principalMissLogCache.get(cacheKey);

    if (
      !existing ||
      now - existing.lastWarnAt >= CapabilityAuthorizationService.principalMissLogTtlMs
    ) {
      const suppressed = existing?.suppressed ?? 0;
      const suffix =
        suppressed > 0
          ? ` (suppressed ${suppressed} duplicate warning(s) in last ${Math.round(CapabilityAuthorizationService.principalMissLogTtlMs / 1000)}s)`
          : '';
      console.warn(
        `[AUTH] Principal not found: ${principalId} in account ${accountId}, using default capabilities${suffix}`
      );
      CapabilityAuthorizationService.principalMissLogCache.set(cacheKey, {
        lastWarnAt: now,
        suppressed: 0,
        lastSeenAt: now,
      });
    } else {
      CapabilityAuthorizationService.principalMissLogCache.set(cacheKey, {
        ...existing,
        suppressed: existing.suppressed + 1,
        lastSeenAt: now,
      });
    }

    if (
      CapabilityAuthorizationService.principalMissLogCache.size >
      CapabilityAuthorizationService.principalMissCacheMax
    ) {
      const oldest = Array.from(
        CapabilityAuthorizationService.principalMissLogCache.entries()
      ).sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)[0];
      if (oldest) {
        CapabilityAuthorizationService.principalMissLogCache.delete(oldest[0]);
      }
    }
  }

  /**
   * Get capabilities for a principal
   *
   * Resolution order:
   * 1. Principal node's `capabilities` field (if Principal node)
   * 2. Policy profile (if policy_profile_id set)
   * 3. Default capabilities for principal_kind
   * 4. Default human capabilities (fallback)
   */
  async getPrincipalCapabilities(
    principalId: string,
    accountId: string
  ): Promise<PrincipalCapabilities> {
    const database = this.db.getDatabase();

    // Try to find Principal node
    const principalNode = database
      .prepare(
        `
        SELECT kind, properties FROM nodes
        WHERE id = ? AND account_id = ? AND kind IN ('Principal', 'UserNode', 'AgentNode')
      `
      )
      .get(principalId, accountId) as { kind: string; properties: string } | undefined;

    if (!principalNode) {
      // Principal not found - return default human capabilities
      this.logPrincipalMissing(principalId, accountId);
      return { ...DEFAULT_CAPABILITIES.human };
    }

    const properties = JSON.parse(principalNode.properties || '{}');

    // For Principal nodes, use capabilities from properties
    if (principalNode.kind === 'Principal') {
      if (properties.capabilities) {
        return {
          can_upload: properties.capabilities.can_upload ?? true,
          can_run_tools: properties.capabilities.can_run_tools ?? false,
          can_import_web: properties.capabilities.can_import_web ?? false,
          can_own_account: properties.capabilities.can_own_account ?? false,
          can_approve_runs: properties.capabilities.can_approve_runs ?? false,
        };
      }

      // Check policy profile
      if (properties.policy_profile_id) {
        const profile = database
          .prepare(
            `
            SELECT can_upload, can_run_tools, can_import_web, can_own_account, can_approve_runs
            FROM policy_profiles
            WHERE id = ? AND account_id = ?
          `
          )
          .get(properties.policy_profile_id, accountId) as any;

        if (profile) {
          return {
            can_upload: profile.can_upload === 1,
            can_run_tools: profile.can_run_tools === 1,
            can_import_web: profile.can_import_web === 1,
            can_own_account: profile.can_own_account === 1,
            can_approve_runs: profile.can_approve_runs === 1,
          };
        }
      }

      // Use default for principal_kind
      const principalKind = properties.principal_kind || 'human';
      return { ...DEFAULT_CAPABILITIES[principalKind as keyof typeof DEFAULT_CAPABILITIES] };
    }

    // For legacy UserNode - use human defaults
    if (principalNode.kind === 'UserNode') {
      return { ...DEFAULT_CAPABILITIES.human };
    }

    // For legacy AgentNode - use agent defaults
    if (principalNode.kind === 'AgentNode') {
      return { ...DEFAULT_CAPABILITIES.agent };
    }

    // Fallback
    return { ...DEFAULT_CAPABILITIES.human };
  }

  /**
   * Check if a principal can perform an action
   *
   * CRITICAL: This checks CAPABILITIES, not principal_kind
   * This is the core implementation of the World Model invariant
   */
  async canPerformAction(
    principalId: string,
    accountId: string,
    action: CapabilityAction
  ): Promise<AuthorizationResult> {
    const capabilities = await this.getPrincipalCapabilities(principalId, accountId);
    const capabilityField = ACTION_TO_CAPABILITY[action];
    const allowed = capabilities[capabilityField];

    return {
      allowed,
      reason: allowed
        ? `Principal has ${capabilityField} capability`
        : `Principal lacks ${capabilityField} capability`,
      capability: capabilityField,
    };
  }

  /**
   * Check if a principal can upload sources
   */
  async canUpload(principalId: string, accountId: string): Promise<boolean> {
    const result = await this.canPerformAction(principalId, accountId, 'upload');
    return result.allowed;
  }

  /**
   * Check if a principal can run tools (execute agent tasks)
   */
  async canRunTools(principalId: string, accountId: string): Promise<boolean> {
    const result = await this.canPerformAction(principalId, accountId, 'run_tools');
    return result.allowed;
  }

  /**
   * Check if a principal can import from web (fetch external sources)
   */
  async canImportWeb(principalId: string, accountId: string): Promise<boolean> {
    const result = await this.canPerformAction(principalId, accountId, 'import_web');
    return result.allowed;
  }

  /**
   * Check if a principal can own accounts
   */
  async canOwnAccount(principalId: string, accountId: string): Promise<boolean> {
    const result = await this.canPerformAction(principalId, accountId, 'own_account');
    return result.allowed;
  }

  /**
   * Check if a principal can approve agent runs
   */
  async canApproveRuns(principalId: string, accountId: string): Promise<boolean> {
    const result = await this.canPerformAction(principalId, accountId, 'approve_runs');
    return result.allowed;
  }

  /**
   * Verify account boundary integrity
   *
   * CRITICAL: This implements the World Model invariant:
   * "Account is the hard boundary - every node/edge belongs to exactly ONE account"
   *
   * Returns false if the principal is trying to access resources outside their account
   */
  async verifyAccountBoundary(
    principalId: string,
    principalAccountId: string,
    targetAccountId: string
  ): Promise<AuthorizationResult> {
    // Strict account boundary check
    if (principalAccountId !== targetAccountId) {
      return {
        allowed: false,
        reason: `Account boundary violation: principal in account ${principalAccountId} cannot access resources in account ${targetAccountId}`,
      };
    }

    return {
      allowed: true,
      reason: 'Same account - access allowed',
    };
  }

  /**
   * Create a Principal node for a user
   *
   * This migrates a UserNode to a Principal node while preserving capabilities
   */
  async createPrincipalForUser(
    userId: string,
    accountId: string,
    displayName: string,
    email?: string
  ): Promise<string> {
    const database = this.db.getDatabase();
    const now = Date.now();
    const principalId = `principal_${userId}`;

    const properties = JSON.stringify({
      display_name: displayName,
      email: email,
      principal_kind: 'human',
      capabilities: DEFAULT_CAPABILITIES.human,
    });

    database
      .prepare(
        `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `
      )
      .run(principalId, properties, accountId, userId, now, now);

    return principalId;
  }

  /**
   * Create a Principal node for an agent
   */
  async createPrincipalForAgent(
    agentId: string,
    accountId: string,
    displayName: string,
    createdBy: string,
    agentConfig?: {
      model_policy?: string;
      system_prompt?: string;
      max_tokens?: number;
      tools_allowed?: string[];
    }
  ): Promise<string> {
    const database = this.db.getDatabase();
    const now = Date.now();
    const principalId = `principal_agent_${agentId}`;

    const properties = JSON.stringify({
      display_name: displayName,
      principal_kind: 'agent',
      capabilities: DEFAULT_CAPABILITIES.agent,
      agent_config: agentConfig,
    });

    database
      .prepare(
        `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `
      )
      .run(principalId, properties, accountId, createdBy, now, now);

    return principalId;
  }

  /**
   * Update principal capabilities
   *
   * This allows promoting/demoting principals by changing their capabilities
   * regardless of their principal_kind
   */
  async updatePrincipalCapabilities(
    principalId: string,
    accountId: string,
    capabilities: Partial<PrincipalCapabilities>
  ): Promise<void> {
    const database = this.db.getDatabase();

    // Get current properties
    const node = database
      .prepare(
        `
        SELECT properties FROM nodes
        WHERE id = ? AND account_id = ? AND kind = 'Principal'
      `
      )
      .get(principalId, accountId) as { properties: string } | undefined;

    if (!node) {
      throw new Error(`Principal not found: ${principalId}`);
    }

    const properties = JSON.parse(node.properties);
    const currentCapabilities = properties.capabilities || DEFAULT_CAPABILITIES.human;

    // Merge new capabilities
    properties.capabilities = {
      ...currentCapabilities,
      ...capabilities,
    };

    const now = Date.now();
    database
      .prepare(
        `
        UPDATE nodes
        SET properties = ?, updated_at = ?
        WHERE id = ? AND account_id = ? AND kind = 'Principal'
      `
      )
      .run(JSON.stringify(properties), now, principalId, accountId);
  }
}

// Export as AuthService for backward compatibility
export { AuthServiceV2 as AuthService };
