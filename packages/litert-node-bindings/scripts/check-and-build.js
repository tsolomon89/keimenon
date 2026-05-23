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

  // Create native structure directories
  const win32x64Dir = path.resolve(__dirname, '../native/win32-x64');
  const nativeBinDir = path.join(win32x64Dir, 'bin');
  const releaseBinDir = path.resolve(__dirname, '../build/Release/bin');

  if (!fs.existsSync(nativeBinDir)) {
    fs.mkdirSync(nativeBinDir, { recursive: true });
  }
  if (!fs.existsSync(releaseBinDir)) {
    fs.mkdirSync(releaseBinDir, { recursive: true });
  }

  // Copy compiled addon
  const srcAddon = path.resolve(__dirname, '../build/Release/litert_node_bindings.node');
  const destAddon = path.join(win32x64Dir, 'litert_node_bindings.node');
  if (fs.existsSync(srcAddon)) {
    fs.copyFileSync(srcAddon, destAddon);
    console.log(
      '[LiteRtNodeBindings] Copied compiled litert_node_bindings.node to native/win32-x64/'
    );
  }

  // Copy prebuilt dynamic libraries from vendor
  const vendorDir = path.resolve(__dirname, '../../../vendor/litert-lm/prebuilt/windows_x86_64');
  if (fs.existsSync(vendorDir)) {
    const files = fs.readdirSync(vendorDir);
    for (const file of files) {
      if (file.endsWith('.dll') || file.endsWith('.lib')) {
        const srcFile = path.join(vendorDir, file);

        // Copy to native bin dir
        const destNativeFile = path.join(nativeBinDir, file);
        fs.copyFileSync(srcFile, destNativeFile);

        // Copy to release bin dir
        const destReleaseFile = path.join(releaseBinDir, file);
        fs.copyFileSync(srcFile, destReleaseFile);

        console.log(
          `[LiteRtNodeBindings] Copied ${file} to native/win32-x64/bin/ and build/Release/bin/`
        );
      }
    }
  } else {
    console.warn(
      '[LiteRtNodeBindings] Vendor prebuilt directory not found. DLLs must be provided manually.'
    );
  }
} catch (err) {
  console.warn(
    '[LiteRtNodeBindings] Native C++ compilation failed. This is acceptable in dev/CI if dynamic libraries are mock-only.'
  );
  console.warn('[LiteRtNodeBindings] Warning details:', err.message);
  process.exit(0);
}
