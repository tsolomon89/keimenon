import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

export interface TestUser {
  id: string;
  accountId: string;
  email: string;
  name: string;
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
  rank: number;
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin';
}

/**
 * Generate a valid JWT token for testing
 */
export function generateTestToken(user: TestUser): string {
  return jwt.sign(
    {
      userId: user.id,
      accountId: user.accountId,
      email: user.email,
      permissionLevel: user.permissionLevel,
      accountType: user.accountType,
      accountClass: user.accountClass,
      rank: user.rank,
    },
    TEST_JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Verify a JWT token (for testing token validation)
 */
export function verifyTestToken(token: string): any {
  try {
    return jwt.verify(token, TEST_JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Hash a password (for testing password hashing)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Compare password with hash (for testing authentication)
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a mock user object for testing
 */
export function createMockUser(overrides?: Partial<TestUser>): TestUser {
  return {
    id: nanoid(),
    accountId: nanoid(),
    email: `test${nanoid(6)}@test.com`,
    name: 'Test User',
    accountType: 'client',
    accountClass: 'professional',
    rank: 2, // Senior by default
    permissionLevel: 'senior',
    ...overrides,
  };
}

/**
 * Create a mock admin user
 */
export function createMockAdminUser(overrides?: Partial<TestUser>): TestUser {
  return createMockUser({
    accountType: 'admin',
    accountClass: 'business',
    rank: 4,
    permissionLevel: 'admin',
    ...overrides,
  });
}

/**
 * Create a mock junior user
 */
export function createMockJuniorUser(overrides?: Partial<TestUser>): TestUser {
  return createMockUser({
    rank: 1,
    permissionLevel: 'junior',
    ...overrides,
  });
}

/**
 * Create a mock leader user
 */
export function createMockLeaderUser(overrides?: Partial<TestUser>): TestUser {
  return createMockUser({
    rank: 3,
    permissionLevel: 'leader',
    ...overrides,
  });
}

/**
 * Get JWT secret for testing (used by auth service in tests)
 */
export function getTestJwtSecret(): string {
  return TEST_JWT_SECRET;
}
