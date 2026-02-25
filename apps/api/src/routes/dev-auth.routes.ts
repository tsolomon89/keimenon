import { Router, Request, Response } from 'express';
import { AuthServiceV2 } from '../services/auth.service';

export function createDevAuthRoutes(authService: AuthServiceV2): Router {
  const router = Router();

  /**
   * POST /api/v1/auth/dev/login
   * Dev Mode Login: Logs in or registers a dev user without password check.
   * Only enabled if NODE_ENV=development or ENABLE_DEV_AUTH=true
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      // Security check
      if (process.env.NODE_ENV !== 'development' && process.env.ENABLE_DEV_AUTH !== 'true') {
        return res.status(403).json({ error: 'Dev auth disabled' });
      }

      const email = req.body.email || 'dev@keimenon.local';
      const name = req.body.name || 'Developer';
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Check if user exists (using private access workaround or public API)
      // Since getUserById is public (via existing usage in auth routes 'me'), let's assume methods exist.
      // Wait, auth.service.ts doesn't show getUserById in the snippet I saw?
      // It showed getAccountById at line 372.
      // Let's assume we can query DB directly or add methods.
      // But authService has db client.
      
      // We will try to register first. If it fails with "already exists", we force login.
      // But register requires password.
      const defaultPass = 'DevPass123!';

      try {
        const result = await authService.register(
            email,
            defaultPass,
            name,
            'Dev Workspace',
            'admin',
            'business',
            ipAddress
        );
        return res.json(result);
      } catch (err: any) {
        if (err.message && err.message.includes('already exists')) {
             // User exists. Try login with default password.
             try {
                 const result = await authService.login(email, defaultPass, ipAddress);
                 return res.json(result);
             } catch (loginErr) {
                 // Password might have changed. Force generate token.
                 // We need to fetch the user and account manually.
                 // Since we don't have easy public methods to get user by email exposed on AuthService (it's private inner logic),
                 // we will rely on `generateToken` but we need valid IDs.
                 
                 // Ideally we should extend AuthService to support 'impersonate' or similar.
                 // Or just access the DB if we can. 
                 // We don't have direct DB access here easily unless we pass it or expose it from authService.
                 
                 // BUT, for V1 refactor, let's keep it simple.
                 // If password mismatch, just fail and tell dev to reset DB or use correct user.
                 return res.status(401).json({ error: 'User exists but password mismatch. Reset DB or use correct credentials.' });
             }
        }
        throw err;
      }

    } catch (error: any) {
      console.error('Dev login error:', error);
      return res.status(500).json({ error: error.message || 'Dev login failed' });
    }
  });

  return router;
}
