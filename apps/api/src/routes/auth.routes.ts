import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

export function createAuthRoutes(authService: AuthService): Router {
  const router = Router();

  /**
   * POST /api/v1/auth/login
   * Login with email and password
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const result = await authService.login(email, password);

      if (!result) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      return res.json({
        user: result.user,
        account: result.account,
        token: result.token,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      return res.status(500).json({ error: error.message || 'Login failed' });
    }
  });

  /**
   * POST /api/v1/auth/register
   * Register a new account with email and password
   */
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { email, password, name, accountType, accountClass } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name required' });
      }

      const result = await authService.register(
        email,
        password,
        name,
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
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.message && error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message || 'Registration failed' });
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

      const result = await authService.registerWithGoogle(googleId, email, name);

      return res.json({
        user: result.user,
        account: result.account,
        token: result.token,
      });
    } catch (error: any) {
      console.error('Google register error:', error);
      return res.status(500).json({ error: error.message || 'Registration failed' });
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
      console.error('Logout error:', error);
      return res.status(500).json({ error: error.message || 'Logout failed' });
    }
  });

  /**
   * GET /api/v1/auth/me
   * Get current user and account info
   */
  router.get('/me', requireAuth(authService), async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const user = await authService.getUserById(req.user.userId);
      const account = await authService.getAccountById(req.user.accountId);

      if (!user || !account) {
        return res.status(404).json({ error: 'User or account not found' });
      }

      return res.json({ user, account });
    } catch (error: any) {
      console.error('Get current user error:', error);
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
      console.error('Token verify error:', error);
      return res.status(500).json({ error: error.message || 'Verification failed' });
    }
  });

  return router;
}
