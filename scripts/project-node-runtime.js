#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const REQUIRED_NODE_MAJOR = 22;

function getCurrentNodeMajor(version = process.versions.node) {
  return Number.parseInt(version.split('.')[0], 10);
}

function isRequiredNodeVersion(version = process.versions.node) {
  return getCurrentNodeMajor(version) === REQUIRED_NODE_MAJOR;
}

function getNodePackageSpec() {
  return `node@${REQUIRED_NODE_MAJOR}`;
}

function getNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function withProjectNodeEnv(extraEnv = {}) {
  return {
    ...process.env,
    ...(isRequiredNodeVersion() ? {} : { KEIMENON_BYPASS_NODE_CHECK: '1' }),
    ...extraEnv,
  };
}

function resolveNode22NodeCommand(nodeArgs = [], extraEnv = {}) {
  if (isRequiredNodeVersion()) {
    return {
      command: process.execPath,
      args: nodeArgs,
      env: withProjectNodeEnv(extraEnv),
      shell: false,
    };
  }

  return {
    command: process.platform === 'win32' ? 'npx' : getNpxCommand(),
    args: ['-y', '-p', getNodePackageSpec(), 'node', ...nodeArgs],
    env: withProjectNodeEnv(extraEnv),
    shell: process.platform === 'win32',
  };
}

function spawnNode22(nodeArgs = [], options = {}) {
  const { command, args, env, shell } = resolveNode22NodeCommand(nodeArgs, options.env);
  return spawn(command, args, {
    ...options,
    env,
    shell,
  });
}

function spawnNode22Sync(nodeArgs = [], options = {}) {
  const { command, args, env, shell } = resolveNode22NodeCommand(nodeArgs, options.env);
  return spawnSync(command, args, {
    ...options,
    env,
    shell,
  });
}

function runShellCommandUnderNode22(command, options = {}) {
  const runnerPath = path.join(__dirname, 'node22-shell-runner.js');
  return spawnNode22Sync([runnerPath, command], options);
}

module.exports = {
  REQUIRED_NODE_MAJOR,
  getCurrentNodeMajor,
  isRequiredNodeVersion,
  resolveNode22NodeCommand,
  spawnNode22,
  spawnNode22Sync,
  runShellCommandUnderNode22,
  withProjectNodeEnv,
};
