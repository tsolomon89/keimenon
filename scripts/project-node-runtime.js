#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { REQUIRED_NODE_MAJOR, REQUIRED_NODE_VERSION } = require('./node-version-config');

function getCurrentNodeMajor(version = process.versions.node) {
  return Number.parseInt(version.split('.')[0], 10);
}

function isRequiredNodeVersion(version = process.versions.node) {
  return getCurrentNodeMajor(version) === REQUIRED_NODE_MAJOR;
}

function withProjectNodeEnv(extraEnv = {}) {
  return {
    ...process.env,
    ...extraEnv,
  };
}

function getNodeVersionMismatchMessage(version = process.versions.node) {
  const expected = REQUIRED_NODE_VERSION || `${REQUIRED_NODE_MAJOR}.x`;
  return `Unsupported Node.js version v${version}. Required: v${expected}. Switch Node and retry.`;
}

function ensureRequiredNodeVersion(version = process.versions.node) {
  if (!isRequiredNodeVersion(version)) {
    throw new Error(getNodeVersionMismatchMessage(version));
  }
}

function resolveProjectNodeCommand(nodeArgs = [], extraEnv = {}) {
  ensureRequiredNodeVersion();
  return {
    command: process.execPath,
    args: nodeArgs,
    env: withProjectNodeEnv(extraEnv),
    shell: false,
  };
}

function spawnProjectNode(nodeArgs = [], options = {}) {
  const { command, args, env, shell } = resolveProjectNodeCommand(nodeArgs, options.env);
  return spawn(command, args, {
    ...options,
    env,
    shell,
  });
}

function spawnProjectNodeSync(nodeArgs = [], options = {}) {
  const { command, args, env, shell } = resolveProjectNodeCommand(nodeArgs, options.env);
  return spawnSync(command, args, {
    ...options,
    env,
    shell,
  });
}

function runShellCommandUnderProjectNode(command, options = {}) {
  ensureRequiredNodeVersion();
  const runnerPath = path.join(__dirname, 'project-node-shell-runner.js');
  return spawnProjectNodeSync([runnerPath, command], options);
}

module.exports = {
  REQUIRED_NODE_MAJOR,
  REQUIRED_NODE_VERSION,
  getCurrentNodeMajor,
  isRequiredNodeVersion,
  getNodeVersionMismatchMessage,
  ensureRequiredNodeVersion,
  resolveProjectNodeCommand,
  spawnProjectNode,
  spawnProjectNodeSync,
  runShellCommandUnderProjectNode,
  withProjectNodeEnv,
};
