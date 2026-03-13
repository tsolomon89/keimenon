import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthRoutes } from '../auth.routes';
import { checkPasswordCompromised } from '../../utils/hibp-password';

vi.mock('../../utils/hibp-password', () => ({
  checkPasswordCompromised: vi.fn().mockResolvedValue({ compromised: false, count: 0 }),
}));

describe('Auth routes password reset flow', () => {
  const authService = {
    requestPasswordReset: vi.fn().mockResolvedValue(null),
    resetPasswordWithToken: vi.fn().mockResolvedValue({ updatedAt: Date.now() }),
  } as any;

  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRoutes(authService));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkPasswordCompromised).mockResolvedValue({ compromised: false, count: 0 });
  });

  it('returns anti-enumeration-safe success when reset is requested for unknown email', async () => {
    authService.requestPasswordReset.mockResolvedValueOnce(null);

    const response = await request(app)
      .post('/api/v1/auth/reset-password/request')
      .send({ email: 'unknown@example.com' })
      .expect(200);

    expect(response.body.message).toBe(
      'If an account exists with this email, you will receive reset instructions.'
    );
  });

  it('returns token in test mode when reset token is generated', async () => {
    authService.requestPasswordReset.mockResolvedValueOnce({
      token: 'reset-token',
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    const response = await request(app)
      .post('/api/v1/auth/reset-password/request')
      .send({ email: 'user@example.com' })
      .expect(200);

    expect(response.body.token).toBe('reset-token');
    expect(typeof response.body.expiresAt).toBe('number');
  });

  it('rejects compromised password on confirm', async () => {
    vi.mocked(checkPasswordCompromised).mockResolvedValueOnce({ compromised: true, count: 5 });

    const response = await request(app)
      .post('/api/v1/auth/reset-password/confirm')
      .send({ token: 'abc', newPassword: 'Compromised123!' })
      .expect(400);

    expect(response.body.code).toBe('PASSWORD_COMPROMISED');
    expect(authService.resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it('confirms password reset with valid token and password', async () => {
    authService.resetPasswordWithToken.mockResolvedValueOnce({ updatedAt: 1234567890 });

    const response = await request(app)
      .post('/api/v1/auth/reset-password/confirm')
      .send({ token: 'valid-token', newPassword: 'SafePass123!' })
      .expect(200);

    expect(authService.resetPasswordWithToken).toHaveBeenCalledTimes(1);
    expect(response.body.updatedAt).toBe(1234567890);
  });
});
