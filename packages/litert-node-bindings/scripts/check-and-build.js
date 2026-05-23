const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('[LiteRtNodeBindings] check-and-build started.');

const isCI = process.env.CI === 'true';
const bypassBuild = process.env.KEIMENON_SKIP_NATIVE_BUILD === '1';

if (bypassBuild || isCI) {
  console.log('[LiteRtNodeBindings] Bypassing native addon build gracefully via env/CI flags.');
  process.exit(0);
}

try {
  console.log('[LiteRtNodeBindings] Triggering node-gyp rebuild...');
  execSync('npx node-gyp rebuild', { stdio: 'inherit' });
  console.log('[LiteRtNodeBindings] C++ native compilation completed successfully.');
} catch (err) {
  console.warn(
    '[LiteRtNodeBindings] Native C++ compilation failed. This is acceptable in dev/CI if dynamic libraries are mock-only.'
  );
  console.warn('[LiteRtNodeBindings] Warning details:', err.message);
  // Exit gracefully (0) to prevent breaking non-inference workspace tests
  process.exit(0);
}
