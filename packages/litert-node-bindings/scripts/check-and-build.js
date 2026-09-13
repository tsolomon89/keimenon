const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('[LiteRtNodeBindings] check-and-build started.');

const requireNativeBuild =
  process.env.KEIMENON_REQUIRE_NATIVE_BUILD === '1' ||
  process.env.RELEASE_BUILD === '1' ||
  process.env.CI_NATIVE === 'true';

const bypassBuild = process.env.KEIMENON_SKIP_NATIVE_BUILD === '1';
const isCI = process.env.CI === 'true';

if (!requireNativeBuild && (bypassBuild || (isCI && process.env.CI_NATIVE !== 'true'))) {
  console.log(
    '[LiteRtNodeBindings] Bypassing native addon build gracefully for non-native CI/unit environment.'
  );
  process.exit(0);
}

try {
  console.log('[LiteRtNodeBindings] Triggering node-gyp rebuild...');
  execSync('npx node-gyp rebuild', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
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
  } else if (requireNativeBuild) {
    throw new Error(`Compiled addon missing at ${srcAddon}`);
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
    if (requireNativeBuild) {
      throw new Error(
        `[LiteRtNodeBindings] FATAL: Vendor prebuilt directory not found: ${vendorDir}. Required native runtime dependencies cannot be shipped.`
      );
    }
    console.warn(
      '[LiteRtNodeBindings] Vendor prebuilt directory not found. DLLs must be provided manually.'
    );
  }

  // Strictly enforce required native runtime DLLs for release builds
  if (requireNativeBuild) {
    const coreDll = path.join(nativeBinDir, 'libLiteRt.dll');
    if (!fs.existsSync(coreDll)) {
      throw new Error(
        `[LiteRtNodeBindings] FATAL: Required runtime DLL missing after build: ${coreDll}`
      );
    }
    console.log('[LiteRtNodeBindings] Verified required native runtime DLLs present for release.');
  }
} catch (err) {
  if (requireNativeBuild) {
    console.error(
      '[LiteRtNodeBindings] FATAL: Native C++ compilation failed in required native release gate.'
    );
    console.error('[LiteRtNodeBindings] Error details:', err.message);
    process.exit(1);
  } else {
    console.warn(
      '[LiteRtNodeBindings] Native C++ compilation failed in non-native environment. Proceeding with caution.'
    );
    console.warn('[LiteRtNodeBindings] Warning details:', err.message);
    process.exit(0);
  }
}
