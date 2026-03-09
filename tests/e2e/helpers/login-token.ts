type Credentials = { email: string; password: string };

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.error === 'string' && obj.error.length > 0) return obj.error;
  if (typeof obj.message === 'string' && obj.message.length > 0) return obj.message;
  return fallback;
}

/**
 * API-only login helper for isolation tests.
 * Retries transient "No active accounts" race conditions and handles account-selection flows.
 */
export async function loginTokenWithRetry(
  apiRequest: any,
  credentials: Credentials,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<string> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.delayMs ?? 100;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await apiRequest.post('/api/v1/auth/login', {
      data: credentials,
    });
    const body = await response.json().catch(() => ({}));

    if (response.ok()) {
      if (typeof body?.token === 'string' && body.token.length > 0) {
        return body.token;
      }

      if (
        body?.requiresAccountSelection &&
        typeof body?.tempToken === 'string' &&
        Array.isArray(body?.availableAccounts) &&
        body.availableAccounts.length > 0
      ) {
        const selectResponse = await apiRequest.post('/api/v1/auth/select-account', {
          data: {
            tempToken: body.tempToken,
            accountId: body.availableAccounts[0].accountId,
          },
        });
        const selectBody = await selectResponse.json().catch(() => ({}));
        if (
          selectResponse.ok() &&
          typeof selectBody?.token === 'string' &&
          selectBody.token.length > 0
        ) {
          return selectBody.token;
        }
        const selectError = extractErrorMessage(
          selectBody,
          `status ${selectResponse.status()} during account selection`
        );
        throw new Error(`Login failed: ${selectError}`);
      }
    }

    const errorMessage = extractErrorMessage(body, `status ${response.status()}`);
    const isRetryableNoActiveAccounts = errorMessage.toLowerCase().includes('no active accounts');
    if (attempt < maxAttempts && isRetryableNoActiveAccounts) {
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
      continue;
    }

    throw new Error(`Login failed: ${errorMessage}`);
  }

  throw new Error(`Login failed after ${maxAttempts} attempts`);
}
