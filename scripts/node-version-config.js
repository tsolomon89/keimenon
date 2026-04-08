#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const FALLBACK_NODE_MAJOR = 24;

function safeReadPackageJson() {
  try {
    const root = path.resolve(__dirname, '..');
    const pkgPath = path.join(root, 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeVersion(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().replace(/^v/i, '');
  return trimmed.length > 0 ? trimmed : null;
}

function parseMajor(value) {
  if (!value) {
    return null;
  }
  const match = value.match(/\d+/);
  if (!match) {
    return null;
  }
  const major = Number.parseInt(match[0], 10);
  return Number.isFinite(major) ? major : null;
}

const packageJson = safeReadPackageJson();
const REQUIRED_NODE_VERSION = normalizeVersion(packageJson?.volta?.node);
const REQUIRED_NODE_MAJOR =
  parseMajor(REQUIRED_NODE_VERSION) ??
  parseMajor(normalizeVersion(packageJson?.engines?.node)) ??
  FALLBACK_NODE_MAJOR;

module.exports = {
  REQUIRED_NODE_VERSION,
  REQUIRED_NODE_MAJOR,
};
