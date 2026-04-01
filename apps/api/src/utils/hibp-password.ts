import { createHash } from 'crypto';

const HIBP_RANGE_API = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = Number.parseInt(process.env.HIBP_TIMEOUT_MS || '5000', 10);

export interface PasswordCompromiseCheckResult {
  compromised: boolean;
  count: number;
  checked: boolean;
}

function sha1Uppercase(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex').toUpperCase();
}

export async function checkPasswordCompromised(
  password: string
): Promise<PasswordCompromiseCheckResult> {
  if (process.env.HIBP_ENABLED === 'false') {
    return { compromised: false, count: 0, checked: false };
  }

  const fullHash = sha1Uppercase(password);
  const prefix = fullHash.slice(0, 5);
  const suffix = fullHash.slice(5);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);

  try {
    const response = await fetch(`${HIBP_RANGE_API}${prefix}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Keimenon/0.1',
        'Add-Padding': 'true',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HIBP request failed with status ${response.status}`);
    }

    const body = await response.text();
    const lines = body.split('\n');

    for (const line of lines) {
      const [hashSuffix, countText] = line.trim().split(':');
      if (!hashSuffix || !countText) {
        continue;
      }

      if (hashSuffix.toUpperCase() === suffix) {
        const count = Number.parseInt(countText, 10);
        return {
          compromised: Number.isFinite(count) && count > 0,
          count: Number.isFinite(count) ? count : 0,
          checked: true,
        };
      }
    }

    return { compromised: false, count: 0, checked: true };
  } catch (error) {
    if (process.env.HIBP_ENFORCE === 'true') {
      throw new Error('Password compromise check unavailable');
    }

    return { compromised: false, count: 0, checked: false };
  } finally {
    clearTimeout(timeout);
  }
}
