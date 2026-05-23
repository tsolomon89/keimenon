import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRoutes } from '../auth.routes';
import { checkPasswordCompromised } from '../../utils/hibp-password';

vi.mock('../../utils/hibp-password', () => ({
  checkPasswordCompromised: vi.fn().mockResolvedValue({ compromised: false, count: 0 }),
}));

vi.mock('../../middleware/auth.middleware', () => ({
  requireAuth: (authService: any) => async (req: any, _res: any, next: any) => {
    const payload = await authService.verifyToken('valid-token');
    req.user = payload;
    next();
  },
}));

describe('Auth routes password change', () => {
  const authService = {
    verifyToken: vi.fn().mockResolvedValue({
      userId: 'user_1',
      accountId: 'acc_1',
      email: 'user@example.com',
      permissionLevel: 'admin',
      accountType: 'client',
      accountClass: 'professional',
      rank: 4,
      sessionId: 'sess_1',
      allAccounts: ['acc_1'],
    }),
    changePassword: vi.fn().mockResolvedValue({
      userId: 'user_1',
      updatedAt: Date.now(),
    }),
  } as any;

  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRoutes(authService));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPasswordCompromised).mockResolvedValue({ compromised: false, count: 0 });
  });

  it('changes password when current password is valid and not compromised', async () => {
    const response = await request(app)
      .post('/api/v1/auth/password/change')
      .set('Authorization', 'Bearer valid-token')
      .send({ currentPassword: 'OldPass123!', newPassword: 'NewPass123!' })
      .expect(200);

    expect(authService.changePassword).toHaveBeenCalledTimes(1);
    const [userId, accountId, currentPassword, newPassword] =
      authService.changePassword.mock.calls[0];
    expect(userId).toBe('user_1');
    expect(accountId).toBe('acc_1');
    expect(currentPassword).toBe('OldPass123!');
    expect(newPassword).toBe('NewPass123!');
    expect(response.body.message).toContain('Password updated successfully');
  });

  it('rejects compromised passwords', async () => {
    vi.mocked(checkPasswordCompromised).mockResolvedValue({
      compromised: true,
      count: 42,
    });

    const response = await request(app)
      .post('/api/v1/auth/password/change')
      .set('Authorization', 'Bearer valid-token')
      .send({ currentPassword: 'OldPass123!', newPassword: 'Compromised123!' })
      .expect(400);

    expect(response.body.code).toBe('PASSWORD_COMPROMISED');
    expect(authService.changePassword).not.toHaveBeenCalled();
  });
});
