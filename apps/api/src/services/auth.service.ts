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
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { SQLiteClient } from '@canvas-memory/db';
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
  logAccountSwitch,
} from '../utils/audit-logger';

const JWT_SECRET = process.env.JWT_SECRET || 'canvas-memory-secret-change-in-production';
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

export class AuthServiceV2 {
  constructor(private db: SQLiteClient) {}

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
    userAgent?: string
  ): Promise<LoginResult> {
    const database = this.db.getDatabase();

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
      // Record failed attempt - user not found
      recordLoginAttempt(database, email, ipAddress, false, userAgent, 'User not found');
      logLoginFailure(database, email, 'User not found', ipAddress, userAgent);
      throw new Error('Invalid email or password');
    }

    // Verify password hash for all users
    if (!userRow.password_hash) {
      // Record failed attempt - no password hash
      recordLoginAttempt(database, email, ipAddress, false, userAgent, 'No password hash');
      logLoginFailure(database, email, 'No password hash', ipAddress, userAgent);
      throw new Error('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(password, userRow.password_hash);
    if (!isValidPassword) {
      // Record failed attempt - invalid password
      recordLoginAttempt(database, email, ipAddress, false, userAgent, 'Invalid password');
      logLoginFailure(database, email, 'Invalid password', ipAddress, userAgent);
      throw new Error('Invalid email or password');
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
      return this.selectAccount(user.id, accounts[0].accountId, undefined, ipAddress, userAgent);
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
   */
  async selectAccount(
    userId: string,
    accountId: string,
    accountPassword?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const database = this.db.getDatabase();

    // Get user
    const userRow = database.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!userRow) {
      throw new Error('User not found');
    }

    // Get account
    const accountRow = database
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any;
    if (!accountRow) {
      throw new Error('Account not found');
    }

    // Get user-account membership
    const membershipRow = database
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

    // Create session and token
    const token = await this.createSession(user, account, membership);

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
    userAgent?: string
  ): Promise<LoginResult> {
    const database = this.db.getDatabase();

    // Log account switch
    if (fromAccountId) {
      logAccountSwitch(database, userId, fromAccountId, newAccountId, ipAddress, userAgent);
    }

    // Reuse selectAccount logic
    return this.selectAccount(userId, newAccountId, accountPassword, ipAddress, userAgent);
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

    // Log registration
    logRegistration(database, userId, accountId, email, ipAddress, userAgent);

    // Log them in to the newly created account
    return this.selectAccount(userId, accountId, undefined, ipAddress, userAgent);
  }

  /**
   * Create a session and return JWT token
   */
  private async createSession(
    user: User,
    account: Account,
    membership: UserAccountMembership
  ): Promise<string> {
    const database = this.db.getDatabase();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    // Get all accessible accounts for this user
    const allAccounts = await this.getUserAccounts(user.id);
    const allAccountIds = allAccounts.map((a) => a.accountId);

    // Create session ID
    const sessionId = randomUUID();

    // Generate JWT
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

    // Delete old sessions for this user in this account (allow multiple device sessions)
    database
      .prepare(
        `
      DELETE FROM sessions
      WHERE user_id = ? AND operating_account_id = ?
    `
      )
      .run(user.id, account.id);

    // Store new session in database
    database
      .prepare(
        `
      INSERT INTO sessions (
        id, user_id, account_id, token, expires_at, created_at,
        operating_account_id, available_accounts, last_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        sessionId,
        user.id,
        account.id, // Backward compat
        token,
        expiresAt,
        now,
        account.id, // Current operating account
        JSON.stringify(allAccountIds),
        now
      );

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
   */
  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;

      // Check if session exists and is not expired
      const database = this.db.getDatabase();
      const session = database
        .prepare(
          `
        SELECT * FROM sessions
        WHERE token = ? AND expires_at > ?
      `
        )
        .get(token, Date.now()) as any;

      if (!session) {
        return null;
      }

      // Update last_active timestamp
      database
        .prepare('UPDATE sessions SET last_active = ? WHERE id = ?')
        .run(Date.now(), session.id);

      return payload;
    } catch (error) {
      return null;
    }
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
  async logout(token: string, ipAddress?: string, userAgent?: string): Promise<void> {
    const database = this.db.getDatabase();

    // Get session info before deleting
    const session = database
      .prepare('SELECT user_id, account_id FROM sessions WHERE token = ?')
      .get(token) as any;

    // Delete session
    database.prepare('DELETE FROM sessions WHERE token = ?').run(token);

    // Log logout
    if (session) {
      logLogout(database, session.user_id, session.account_id, ipAddress, userAgent);
    }
  }

  /**
   * Insecure debug password reset for local debugging (no email link).
   * Clears sessions and unlocks account so next login succeeds.
   */
  async debugResetPassword(
    email: string,
    newPassword: string
  ): Promise<{ userId: string; updatedAt: number } | null> {
    const database = this.db.getDatabase();
    const userRow = database.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;

    if (!userRow) {
      return null;
    }

    const passwordHash = await this.hashPassword(newPassword);
    const now = Date.now();

    // HACK(auth): Temporary insecure reset - replace with token flow before production.
    const runReset = database.transaction(() => {
      database
        .prepare(
          'UPDATE users SET password_hash = ?, updated_at = ?, is_active = 1 WHERE email = ?'
        )
        .run(passwordHash, now, email);

      database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userRow.id);
      unlockAccount(database, email);
    });

    runReset();

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

// Export as AuthService for backward compatibility
export { AuthServiceV2 as AuthService };
