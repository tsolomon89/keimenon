#!/usr/bin/env node

/**
 * Shared runtime config helpers for local dev scripts.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_API_PORT = 4001;
const DEFAULT_WEB_PORT = 3000;

function parsePort(raw, fallback) {
  const value = Number.parseInt(String(raw || ''), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return fallback;
  }
  return value;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const equalIndex = trimmed.indexOf('=');
  if (equalIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, equalIndex).trim();
  const value = trimmed.slice(equalIndex + 1).trim();
  if (!key) {
    return null;
  }

  return { key, value };
}

function loadApiEnv(options = {}) {
  const { overwrite = false } = options;
  const envPath = path.join(__dirname, '../apps/api/.env');

  if (!fs.existsSync(envPath)) {
    return { loaded: false, path: envPath };
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(rawLine);
    if (!parsed) {
      continue;
    }

    if (overwrite || process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }

  return { loaded: true, path: envPath };
}

function resolveDevPorts(options = {}) {
  const { loadApi = true } = options;
  if (loadApi) {
    loadApiEnv({ overwrite: false });
  }

  const apiPort = parsePort(process.env.API_PORT || process.env.PORT, DEFAULT_API_PORT);
  const webPort = parsePort(process.env.WEB_PORT, DEFAULT_WEB_PORT);

  return {
    apiPort,
    webPort,
    defaults: {
      apiPort: DEFAULT_API_PORT,
      webPort: DEFAULT_WEB_PORT,
    },
  };
}

module.exports = {
  DEFAULT_API_PORT,
  DEFAULT_WEB_PORT,
  loadApiEnv,
  resolveDevPorts,
};
