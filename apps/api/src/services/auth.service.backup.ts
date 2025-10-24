import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { SQLiteClient } from '@canvas-memory/db';

const JWT_SECRET = process.env.JWT_SECRET || 'canvas-memory-secret-change-in-production';
const JWT_EXPIRES_IN = '7d'; // 7 days
const BCRYPT_ROUNDS = 10;

export interface User {
  id: string;
  account_id: string;
  email: string;
  name: string;
  permission_level: 'junior' | 'senior' | 'leader' | 'admin';
  user_class: 'person' | 'agent';
  rank: number; // 1=junior, 2=senior, 3=leader, 4=admin
  overrides?: Record<string, boolean>; // Per-user capability overrides
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
  mode_service: boolean; // Debug mode flag (allows admin nested portal access)
  parent_account_id?: string; // NULL for admin, admin account ID for clients
  membership: 'free' | 'pro' | 'business'; // Display tier (can be simulated)
  created_by?: string; // User who created this account
  created_at: number;
  updated_at: number;
}

export interface Session {
  id: string;
  user_id: string;
  account_id: string;
  token: string;
  expires_at: number;
  created_at: number;
}

export interface JWTPayload {
  userId: string;
  accountId: string;
  email: string;
  permissionLevel: string;
  accountType: string;
  accountClass: string;
  rank: number; // 1-4
  overrides?: Record<string, boolean>; // Per-user capability overrides
}

export class AuthService {
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
  private parseOverrides(overridesJson?: string): Record<string, boolean> | undefined {
    if (!overridesJson) return undefined;
    try {
      return JSON.parse(overridesJson);
    } catch {
      return undefined;
    }
  }

  /**
   * Authenticate user by email and password
   * Special handling for admin@admin.com - accepts any password
   */
  async login(
    email: string,
    password: string
  ): Promise<{ user: User; account: Account; token: string } | null> {
    const database = this.db.getDatabase();

    // Get user by email
    const userRow = database
      .prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
      .get(email) as any;

    if (!userRow) {
      return null;
    }

    // Special case: admin@admin.com accepts any password
    if (email === 'admin@admin.com') {
      // Admin user found - any password is valid
      const user: User = {
        id: userRow.id,
        account_id: userRow.account_id,
        email: userRow.email,
        name: userRow.name,
        permission_level: userRow.permission_level,
        user_class: userRow.user_class,
        rank: userRow.rank || this.getRank(userRow.permission_level),
        overrides: this.parseOverrides(userRow.overrides),
        is_active: userRow.is_active === 1,
        created_at: userRow.created_at,
        updated_at: userRow.updated_at,
      };

      // Get account
      const accountRow = database
        .prepare('SELECT * FROM accounts WHERE id = ?')
        .get(user.account_id) as any;

      if (!accountRow) {
        return null;
      }

      const account: Account = {
        id: accountRow.id,
        account_type: accountRow.account_type,
        account_class: accountRow.account_class,
        email: accountRow.email,
        name: accountRow.name,
        mode_service: accountRow.mode_service === 1,
        parent_account_id: accountRow.parent_account_id,
        membership: accountRow.membership || accountRow.account_class,
        created_by: accountRow.created_by,
        created_at: accountRow.created_at,
        updated_at: accountRow.updated_at,
      };

      // Create session and token
      const token = await this.createSession(user, account);

      return { user, account, token };
    }

    // Regular user - verify password hash
    if (!userRow.password_hash) {
      // User has no password set (maybe Google OAuth only)
      return null;
    }

    const isValidPassword = await bcrypt.compare(password, userRow.password_hash);

    if (!isValidPassword) {
      return null;
    }

    // Password valid - return user, account, and token
    const user: User = {
      id: userRow.id,
      account_id: userRow.account_id,
      email: userRow.email,
      name: userRow.name,
      permission_level: userRow.permission_level,
      user_class: userRow.user_class,
      rank: userRow.rank || this.getRank(userRow.permission_level),
      overrides: this.parseOverrides(userRow.overrides),
      is_active: userRow.is_active === 1,
      created_at: userRow.created_at,
      updated_at: userRow.updated_at,
    };

    const accountRow = database
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(user.account_id) as any;

    if (!accountRow) {
      return null;
    }

    const account: Account = {
      id: accountRow.id,
      account_type: accountRow.account_type,
      account_class: accountRow.account_class,
      email: accountRow.email,
      name: accountRow.name,
      created_at: accountRow.created_at,
      updated_at: accountRow.updated_at,
      mode_service: false, // Default for backup service
      membership: 'free', // Default for backup service
    };

    const token = await this.createSession(user, account);

    return { user, account, token };
  }

  /**
   * Register new account with email and password
   */
  async register(
    email: string,
    password: string,
    name: string,
    accountType: 'admin' | 'client' = 'client',
    accountClass: 'free' | 'professional' | 'business' = 'free'
  ): Promise<{ user: User; account: Account; token: string } | null> {
    const database = this.db.getDatabase();
    const now = Date.now();

    // Check if user already exists
    const existingUser = database.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

    if (existingUser) {
      throw new Error('Account with this email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create new account and user in transaction
    const transaction = database.transaction(() => {
      // Create account
      const accountId = randomUUID();
      database
        .prepare(
          `INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(accountId, accountType, accountClass, email, name, now, now);

      // Create user with admin permission for first user in account
      const userId = randomUUID();
      database
        .prepare(
          `INSERT INTO users (id, account_id, email, password_hash, google_id, name, permission_level, user_class, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(userId, accountId, email, passwordHash, null, name, 'admin', 'person', 1, now, now);

      return { userId, accountId };
    });

    const { userId, accountId } = transaction();

    // Get created user and account
    const userRow = database.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    const accountRow = database
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any;

    const user: User = {
      id: userRow.id,
      account_id: userRow.account_id,
      email: userRow.email,
      name: userRow.name,
      permission_level: userRow.permission_level,
      user_class: userRow.user_class,
      rank: userRow.rank || this.getRank(userRow.permission_level),
      overrides: this.parseOverrides(userRow.overrides),
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
      created_at: accountRow.created_at,
      updated_at: accountRow.updated_at,
      mode_service: false, // Default for backup service
      membership: 'free', // Default for backup service
    };

    const token = await this.createSession(user, account);

    return { user, account, token };
  }

  /**
   * Register new client account with Google OAuth
   */
  async registerWithGoogle(
    googleId: string,
    email: string,
    name: string
  ): Promise<{ user: User; account: Account; token: string }> {
    const database = this.db.getDatabase();
    const now = Date.now();

    // Check if user already exists
    const existingUser = database
      .prepare('SELECT * FROM users WHERE google_id = ?')
      .get(googleId) as any;

    if (existingUser) {
      // User exists - just log them in
      const user: User = {
        id: existingUser.id,
        account_id: existingUser.account_id,
        email: existingUser.email,
        name: existingUser.name,
        permission_level: existingUser.permission_level,
        user_class: existingUser.user_class,
        is_active: existingUser.is_active === 1,
        created_at: existingUser.created_at,
        updated_at: existingUser.updated_at,
        rank: 0, // Default rank for backup service
      };

      const accountRow = database
        .prepare('SELECT * FROM accounts WHERE id = ?')
        .get(user.account_id) as any;

      const account: Account = {
        id: accountRow.id,
        account_type: accountRow.account_type,
        account_class: accountRow.account_class,
        email: accountRow.email,
        name: accountRow.name,
        mode_service: accountRow.mode_service === 1,
        parent_account_id: accountRow.parent_account_id,
        membership: accountRow.membership || accountRow.account_class,
        created_by: accountRow.created_by,
        created_at: accountRow.created_at,
        updated_at: accountRow.updated_at,
      };

      const token = await this.createSession(user, account);

      return { user, account, token };
    }

    // Create new account and user in transaction
    const transaction = database.transaction(() => {
      // Create account
      const accountId = randomUUID();
      database
        .prepare(
          `INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(accountId, 'client', 'free', email, name, now, now);

      // Create user
      const userId = randomUUID();
      database
        .prepare(
          `INSERT INTO users (id, account_id, email, password_hash, google_id, name, permission_level, user_class, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(userId, accountId, email, null, googleId, name, 'admin', 'person', 1, now, now);

      return { userId, accountId };
    });

    const { userId, accountId } = transaction();

    // Get created user and account
    const userRow = database.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    const accountRow = database
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(accountId) as any;

    const user: User = {
      id: userRow.id,
      account_id: userRow.account_id,
      email: userRow.email,
      name: userRow.name,
      permission_level: userRow.permission_level,
      user_class: userRow.user_class,
      rank: userRow.rank || this.getRank(userRow.permission_level),
      overrides: this.parseOverrides(userRow.overrides),
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
      created_at: accountRow.created_at,
      updated_at: accountRow.updated_at,
      mode_service: false, // Default for backup service
      membership: 'free', // Default for backup service
    };

    const token = await this.createSession(user, account);

    return { user, account, token };
  }

  /**
   * Create a session and return JWT token
   */
  async createSession(user: User, account: Account): Promise<string> {
    const database = this.db.getDatabase();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    // Generate JWT with unique timestamp to avoid collisions
    const payload: JWTPayload = {
      userId: user.id,
      accountId: user.account_id,
      email: user.email,
      permissionLevel: user.permission_level,
      accountType: account.account_type,
      accountClass: account.account_class,
      rank: user.rank,
      overrides: user.overrides,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Delete old sessions for this user (invalidate previous logins)
    database.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

    // Store new session in database
    const sessionId = randomUUID();
    database
      .prepare(
        `INSERT INTO sessions (id, user_id, account_id, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(sessionId, user.id, user.account_id, token, expiresAt, now);

    return token;
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
        .prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?')
        .get(token, Date.now()) as any;

      if (!session) {
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
  async logout(token: string): Promise<void> {
    const database = this.db.getDatabase();
    database.prepare('DELETE FROM sessions WHERE token = ?').run(token);
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
      account_id: userRow.account_id,
      email: userRow.email,
      name: userRow.name,
      permission_level: userRow.permission_level,
      user_class: userRow.user_class,
      rank: userRow.rank || this.getRank(userRow.permission_level),
      overrides: this.parseOverrides(userRow.overrides),
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
      mode_service: accountRow.mode_service === 1,
      parent_account_id: accountRow.parent_account_id,
      membership: accountRow.membership || accountRow.account_class,
      created_by: accountRow.created_by,
      created_at: accountRow.created_at,
      updated_at: accountRow.updated_at,
    };
  }
}
