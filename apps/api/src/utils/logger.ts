export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<AppLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getConfiguredLevel(): AppLogLevel {
  const raw = String(process.env.LOG_LEVEL || 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function shouldLog(level: AppLogLevel): boolean {
  return ORDER[level] >= ORDER[getConfiguredLevel()];
}

function emit(level: AppLogLevel, message: string, metadata?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(metadata ? { metadata } : {}),
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }
  if (level === 'debug') {
    console.debug(JSON.stringify(payload));
    return;
  }
  console.info(JSON.stringify(payload));
}

export const appLogger = {
  debug: (message: string, metadata?: Record<string, unknown>) => emit('debug', message, metadata),
  info: (message: string, metadata?: Record<string, unknown>) => emit('info', message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => emit('warn', message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => emit('error', message, metadata),
};
