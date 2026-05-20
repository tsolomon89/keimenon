const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const libPath = path.resolve(__dirname, '../native/win32-x64/lib/litert_lm_engine.lib');
const isTurbo = !!process.env.TURBO_HASH;
const initCwd = process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : '';
const packageDir = path.resolve(__dirname, '..');
const isRootWorkspaceBuild = isTurbo || (initCwd && initCwd !== packageDir);

if (!fs.existsSync(libPath)) {
  if (isRootWorkspaceBuild) {
    console.warn(
      '\x1b[33m%s\x1b[0m',
      '\n================================================================================'
    );
    console.warn(
      '\x1b[33m%s\x1b[0m',
      '[Warning] LiteRT-LM static library (litert_lm_engine.lib) is not built/staged.'
    );
    console.warn(
      '\x1b[33m%s\x1b[0m',
      'Since this is a root-level workspace build, we will skip compiling the native'
    );
    console.warn(
      '\x1b[33m%s\x1b[0m',
      'bindings so that other workspace packages build successfully.'
    );
    console.warn(
      '\x1b[33m%s\x1b[0m',
      'To build LiteRT-LM inference bindings for local development or production, run:'
    );
    console.warn('\x1b[33m%s\x1b[0m', '  npm run litert:fetch && npm run litert:build:windows');
    console.warn(
      '\x1b[33m%s\x1b[0m',
      '================================================================================\n'
    );
    process.exit(0);
  } else {
    console.error(
      '\x1b[31m%s\x1b[0m',
      '\n================================================================================'
    );
    console.error('\x1b[31m%s\x1b[0m', '[Error] LiteRT-LM static library is missing!');
    console.error('\x1b[31m%s\x1b[0m', `Expected file at: ${libPath}`);
    console.error(
      '\x1b[31m%s\x1b[0m',
      'Please fetch and build the LiteRT-LM dependencies first by running:'
    );
    console.error('\x1b[31m%s\x1b[0m', '  npm run litert:fetch && npm run litert:build:windows');
    console.error(
      '\x1b[31m%s\x1b[0m',
      '================================================================================\n'
    );
    process.exit(1);
  }
}

console.log('[Build] LiteRT-LM static library found. Starting native build via node-gyp...');
const result = spawnSync('npx', ['node-gyp', 'rebuild'], {
  cwd: packageDir,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 0);
