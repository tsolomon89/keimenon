#!/usr/bin/env node
const major = Number.parseInt(process.versions.node.split('.')[0], 10);
const required = 22;
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
  console.error('[node-check] Install/use Node 22 (see .nvmrc) and rerun the command.');
  process.exit(1);
}

process.exit(0);
