import { Router, Request, Response } from 'express';
import { AuthServiceV2 } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { authRateLimiter, registrationRateLimiter } from '../middleware/rate-limit.middleware';
import { getDbClient } from '../utils/get-db-client';

export function createAuthRoutes(authService: AuthServiceV2): Router {
  const router = Router();

  const getLoginErrorStatus = (errorMessage: string): number => {
    const normalized = errorMessage.toLowerCase();
    if (
      normalized.includes('invalid password') ||
      normalized.includes('user not found') ||
      normalized.includes('invalid credentials')
    ) {
      return 401;
    }
    if (normalized.includes('locked') || normalized.includes('too many failed attempts')) {
      return 423;
    }
    return 500;
  };

  const isExpectedAuthError = (errorMessage: string): boolean => {
    const normalized = errorMessage.toLowerCase();
    return (
      normalized.includes('invalid password') ||
      normalized.includes('invalid credentials') ||
      normalized.includes('user not found') ||
      normalized.includes('account not found') ||
      normalized.includes('already exists') ||
      normalized.includes('no active accounts found') ||
      normalized.includes('you do not have access to this account') ||
      normalized.includes('account password required') ||
      normalized.includes('invalid account password') ||
      normalized.includes('invalid or expired token')
    );
  };

  const getAuthErrorStatus = (errorMessage: string): number => {
    const normalized = errorMessage.toLowerCase();
    if (normalized.includes('already exists') || normalized.includes('conflict')) {
      return 409;
    }
    if (
      normalized.includes('invalid') ||
      normalized.includes('not found') ||
      normalized.includes('no active accounts')
    ) {
      return 401;
    }
    if (normalized.includes('forbidden') || normalized.includes('do not have access')) {
      return 403;
    }
    if (normalized.includes('required') || normalized.includes('missing')) {
      return 400;
    }
    if (normalized.includes('locked') || normalized.includes('too many failed attempts')) {
      return 423;
    }
    return 500;
  };

  const logAuthRouteError = (operation: string, error: unknown, statusCode: number): void => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const expected = statusCode < 500 || isExpectedAuthError(errorMessage);
    if (expected && process.env.NODE_ENV === 'test') {
      return;
    }
    if (expected) {
      console.warn(`[AuthRoutes] ${operation}: ${errorMessage}`);
      return;
    }
    console.error(`[AuthRoutes] ${operation} failed:`, error);
  };

  /**
   * POST /api/v1/auth/login
   * Login with email and password
   * Returns either direct login (single account) or account selection (multiple accounts)
   */
  router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Extract IP address and user agent for lockout tracking
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'];

      const result = await authService.login(email, password, ipAddress, userAgent);

      if (!result) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if account selection is required
      if (result.requiresAccountSelection) {
        return res.json({
          requiresAccountSelection: true,
          availableAccounts: result.availableAccounts,
          tempToken: result.tempToken,
        });
      }

      // Direct login (single account)
      return res.json({
        user: result.user,
        account: result.account,
        token: result.token,
        membership: result.membership,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Login failed';
      const status = getLoginErrorStatus(errorMessage);
      logAuthRouteError('login', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/v1/auth/register
   * Register a new account with email and password
   */
  router.post('/register', registrationRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password, name, accountName, accountType, accountClass } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name required' });
      }

      // Password strength validation (matches client-side rules)
      if (password.length < 8) {
        return res
          .status(400)
          .json({ error: 'Password is too short - at least 8 characters required' });
      }
      const hasLetter = /[a-zA-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      if (!hasLetter || !hasNumber) {
        return res
          .status(400)
          .json({ error: 'Password is too weak - must contain both letters and numbers' });
      }

      const result = await authService.register(
        email,
        password,
        name,
        accountName || name, // Use user's name as account name if not provided
        accountType || 'client',
        accountClass || 'free'
      );

      if (!result) {
        return res.status(409).json({ error: 'Account already exists' });
      }

      return res.status(201).json({
        user: result.user,
        account: result.account,
        token: result.token,
        membership: result.membership,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Registration failed';
      const status = getAuthErrorStatus(errorMessage);
      logAuthRouteError('register', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/v1/auth/reset-password/request
   * Request a password reset token (secure flow)
   */
  router.post('/reset-password/request', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await authService.requestPasswordReset(email, ipAddress, userAgent);

      // Always return success to prevent email enumeration
      // In production, send email with token. For development, return token in response.
      if (result) {
        // Development/testing: return token in response
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
          return res.json({
            message: 'Password reset token generated. Check your email for reset instructions.',
            token: result.token, // Only in dev/test!
            expiresAt: result.expiresAt,
          });
        }

        // Production: don't return token (send via email instead)
        return res.json({
          message: 'If an account exists with this email, you will receive reset instructions.',
        });
      }

      // User not found - still return success to prevent enumeration
      return res.json({
        message: 'If an account exists with this email, you will receive reset instructions.',
      });
    } catch (error: any) {
      logAuthRouteError('reset-password/request', error, 500);
      return res.status(500).json({ error: error.message || 'Password reset request failed' });
    }
  });

  /**
   * POST /api/v1/auth/reset-password/confirm
   * Reset password using a valid token (secure flow)
   */
  router.post('/reset-password/confirm', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password required' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await authService.resetPasswordWithToken(
        token,
        newPassword,
        ipAddress,
        userAgent
      );

      if (!result) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      return res.json({
        message: 'Password reset successful. You can now log in with your new password.',
        updatedAt: result.updatedAt,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Password reset failed';
      const status = getAuthErrorStatus(errorMessage);
      logAuthRouteError('reset-password/confirm', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/v1/auth/reset-password-debug
   * DEBUG ONLY: Insecure debug helper to reset password by email.
   *
   * WARNING: This endpoint bypasses the secure token flow.
   * Only use in development/testing. Disable or remove in production!
   */
  router.post('/reset-password-debug', authRateLimiter, async (req: Request, res: Response) => {
    try {
      // Reject in production
      if (process.env.NODE_ENV === 'production') {
        return res
          .status(403)
          .json({ error: 'Debug endpoint disabled in production for security' });
      }

      const { email, newPassword } = req.body;

      if (!email || !newPassword) {
        return res.status(400).json({ error: 'Email and new password required' });
      }

      const result = await authService.debugResetPassword(email, newPassword);

      if (!result) {
        return res.status(404).json({ error: 'User not found for that email' });
      }

      // HACK(auth): Temporary insecure reset endpoint - remove once real flow ships.
      return res.json({
        message:
          'Password updated (DEBUG MODE). Please log in with the new password. This endpoint is disabled in production.',
        updatedAt: result.updatedAt,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Password reset failed';
      const status = getAuthErrorStatus(errorMessage);
      logAuthRouteError('reset-password-debug', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/v1/auth/select-account
   * Select an account after multi-account login
   */
  router.post('/select-account', async (req: Request, res: Response) => {
    try {
      const { tempToken, accountId, accountPassword } = req.body;

      if (!tempToken || !accountId) {
        return res.status(400).json({ error: 'Temp token and account ID required' });
      }

      // Verify temporary token
      const tempPayload = await authService.verifyTempToken(tempToken);
      if (!tempPayload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Select the account
      const result = await authService.selectAccount(
        tempPayload.userId,
        accountId,
        accountPassword
      );

      return res.json({
        user: result.user,
        account: result.account,
        token: result.token,
        membership: result.membership,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Account selection failed';
      const status = getAuthErrorStatus(errorMessage);
      logAuthRouteError('select-account', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/v1/auth/switch-account
   * Switch to a different account without re-authentication
   * Accepts both camelCase (accountId) and snake_case (account_id) for compatibility
   */
  router.post('/switch-account', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      // Support both naming conventions: accountId (camelCase) and account_id (snake_case)
      const accountId = req.body.accountId || req.body.account_id;
      const accountPassword = req.body.accountPassword || req.body.account_password;

      if (!accountId) {
        return res.status(400).json({ error: 'Account ID required' });
      }

      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Check if user has access to this account
      const userAccounts = await authService.getUserAccounts(req.user.userId);
      const hasAccess = userAccounts.some((a) => a.accountId === accountId);

      if (!hasAccess) {
        return res.status(403).json({ error: 'Forbidden: Account not accessible' });
      }

      // Switch to the account
      const result = await authService.switchAccount(
        req.user.userId,
        accountId,
        accountPassword,
        req.user.accountId, // fromAccountId for audit logging
        req.ip || req.socket.remoteAddress, // ipAddress
        req.headers['user-agent'] // userAgent
      );

      return res.json({
        user: result.user,
        account: result.account,
        token: result.token,
        membership: result.membership,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Account switch failed';
      const status = getAuthErrorStatus(errorMessage);
      logAuthRouteError('switch-account', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/v1/auth/register/google
   * Register or login with Google OAuth
   */
  router.post('/register/google', async (req: Request, res: Response) => {
    try {
      const { googleId, email, name } = req.body;

      if (!googleId || !email || !name) {
        return res.status(400).json({ error: 'Google ID, email, and name required' });
      }

      // TODO: Implement registerWithGoogle method in AuthServiceV2
      throw new Error('Google registration not yet implemented');

      // return res.json({
      //   user: result.user,
      //   account: result.account,
      //   token: result.token,
      // });
    } catch (error: any) {
      const errorMessage = error?.message || 'Registration failed';
      const status = getAuthErrorStatus(errorMessage);
      logAuthRouteError('register/google', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  /**
   * POST /api/v1/auth/logout
   * Logout and invalidate session
   */
  router.post('/logout', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        await authService.logout(token);
      }

      return res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      const errorMessage = error?.message || 'Logout failed';
      const status = getAuthErrorStatus(errorMessage);
      logAuthRouteError('logout', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  /**
   * GET /api/v1/auth/me
   * Get current user and account info
   * Returns flattened structure for compatibility with E2E tests
   */
  router.get('/me', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const dbClient = await getDbClient(req);
      const db =
        typeof (dbClient as any).getDatabase === 'function'
          ? (dbClient as any).getDatabase()
          : (dbClient as any).db;

      const userRow = db?.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId) as
        | any
        | undefined;
      const accountRow = db
        ?.prepare('SELECT * FROM accounts WHERE id = ?')
        .get(req.user.accountId) as any | undefined;
      const membershipRow = db
        ?.prepare(
          `SELECT * FROM user_accounts WHERE user_id = ? AND account_id = ? AND status = 'active'`
        )
        .get(req.user.userId, req.user.accountId) as any | undefined;

      // If database lookup misses (e.g. transient account-context skew), return JWT-derived identity
      // instead of 404 so authenticated sessions remain usable.
      const user = userRow
        ? {
            id: userRow.id,
            email: userRow.email,
            name: userRow.name,
            user_class: userRow.user_class,
            is_active: userRow.is_active === 1,
            created_at: userRow.created_at,
            updated_at: userRow.updated_at,
          }
        : {
            id: req.user.userId,
            email: req.user.email,
            name: req.user.email,
            user_class: 'human',
            is_active: true,
            created_at: 0,
            updated_at: 0,
          };

      const account = accountRow
        ? {
            id: accountRow.id,
            account_type: accountRow.account_type,
            account_class: accountRow.account_class,
            email: accountRow.email,
            name: accountRow.name,
            owner_user_id: accountRow.owner_user_id,
            require_account_password: accountRow.require_account_password === 1,
            created_at: accountRow.created_at,
            updated_at: accountRow.updated_at,
          }
        : {
            id: req.user.accountId,
            account_type: req.user.accountType,
            account_class: req.user.accountClass,
            email: null,
            name: null,
            owner_user_id: null,
            require_account_password: false,
            created_at: 0,
            updated_at: 0,
          };

      // Return both nested and flattened structure for compatibility
      return res.json({
        user,
        account,
        membership: membershipRow
          ? {
              user_id: membershipRow.user_id,
              account_id: membershipRow.account_id,
              permission_level: membershipRow.permission_level,
              role_rank: membershipRow.role_rank,
              role_overrides: (() => {
                if (!membershipRow.role_overrides) return undefined;
                try {
                  return JSON.parse(membershipRow.role_overrides);
                } catch {
                  return undefined;
                }
              })(),
              status: membershipRow.status,
              joined_at: membershipRow.joined_at,
            }
          : undefined,
        // Flattened fields for easier access
        id: user.id,
        user_id: user.id,
        email: user.email,
        name: user.name,
        account_id: account.id,
        selected_account_id: account.id,
        account_type: account.account_type,
        account_class: account.account_class,
      });
    } catch (error: any) {
      logAuthRouteError('me', error, 500);
      return res.status(500).json({ error: error.message || 'Failed to get user' });
    }
  });

  /**
   * POST /api/v1/auth/verify
   * Verify JWT token
   */
  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Token required' });
      }

      const payload = await authService.verifyToken(token);

      if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      return res.json({ valid: true, payload });
    } catch (error: any) {
      const errorMessage = error?.message || 'Verification failed';
      const status = getAuthErrorStatus(errorMessage);
      logAuthRouteError('verify', error, status);
      return res.status(status).json({ error: errorMessage });
    }
  });

  return router;
}
