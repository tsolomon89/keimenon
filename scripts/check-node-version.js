#!/usr/bin/env node
const { REQUIRED_NODE_MAJOR, REQUIRED_NODE_VERSION } = require('./node-version-config');

const major = Number.parseInt(process.versions.node.split('.')[0], 10);
const required = REQUIRED_NODE_MAJOR;
const bypassRequested = process.env.KEIMENON_BYPASS_NODE_CHECK === '1';

if (major !== required) {
  if (bypassRequested) {
    console.warn(
      `[node-check] Bypassing Node.js version check (found v${process.versions.node}, expected v${required}.x)`
    );
    process.exit(0);
  }

  console.error(
    `[node-check] Unsupported Node.js version v${process.versions.node}. Required: v${required}.x`
  );
  if (REQUIRED_NODE_VERSION) {
    console.error(`[node-check] Recommended pinned version: v${REQUIRED_NODE_VERSION}`);
  }
  console.error(
    `[node-check] Install/use Node ${required} (see .nvmrc or .node-version) and rerun the command.`
  );
  console.error(
    '[node-check] After switching Node, run `npm run runtime:repair` to rebuild native modules.'
  );
  process.exit(1);
}

process.exit(0);
