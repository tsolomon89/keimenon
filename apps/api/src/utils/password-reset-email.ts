export interface PasswordResetEmailInput {
  to: string;
  token: string;
  expiresAt: number;
}

function getResetBaseUrl(): string {
  return (
    process.env.PASSWORD_RESET_BASE_URL ||
    process.env.WEB_BASE_URL ||
    process.env.APP_BASE_URL ||
    'http://localhost:3000'
  );
}

export async function dispatchPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const resetUrl = `${getResetBaseUrl().replace(/\/$/, '')}/forgot-password?token=${encodeURIComponent(input.token)}`;
  const emailSubject = 'Reset your Keimenon password';
  const emailText = [
    'You requested a password reset for your Keimenon account.',
    '',
    `Reset link: ${resetUrl}`,
    '',
    `This link expires at ${new Date(input.expiresAt).toISOString()}.`,
    '',
    'If you did not request this reset, you can ignore this email.',
  ].join('\n');

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const from = process.env.RESEND_FROM_EMAIL || 'Keimenon <no-reply@keimenon.local>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: emailSubject,
        text: emailText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend rejected password reset email (${response.status})`);
    }

    return;
  }

  const webhookUrl = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL;
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: input.to,
        subject: emailSubject,
        text: emailText,
        resetUrl,
        expiresAt: input.expiresAt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Password reset webhook rejected request (${response.status})`);
    }

    return;
  }

  throw new Error(
    'Password reset email provider is not configured (set RESEND_API_KEY or PASSWORD_RESET_EMAIL_WEBHOOK_URL)'
  );
}
