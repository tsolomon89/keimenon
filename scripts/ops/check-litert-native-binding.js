const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '../../packages/litert-node-bindings/package.json');
if (!fs.existsSync(packagePath)) {
  console.error('FAILED: @keimenon/litert-node-bindings package missing.');
  process.exit(1);
}

const nodeArtifactPath = path.join(
  __dirname,
  '../../apps/desktop/resources/native/win32-x64/litert-node-bindings.node'
);
if (!fs.existsSync(nodeArtifactPath)) {
  console.error(
    'FAILED: litert-node-bindings.node artifact missing from apps/desktop/resources/native/win32-x64.'
  );
  process.exit(1);
}
try {
  const manifestPath = path.join(
    __dirname,
    '../../packages/litert-node-bindings/native/dependency-manifest.json'
  );
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`Verified manifest exists for runtime: ${manifest.runtime}`);
  } else {
    console.warn('WARNING: dependency-manifest.json not found in native directory.');
  }

  const { getLiteRTBindings } = require('../../packages/litert-node-bindings');
  const bindings = getLiteRTBindings();

  const status = bindings.status();

  if (status.dependencies) {
    status.dependencies.forEach((dep) => {
      console.log(
        `Dependency check: ${dep.filename} (Required: ${dep.required}) - Present: ${dep.present}`
      );
    });
  }

  if (
    status.state !== 'runtime_dependency_missing' &&
    status.state !== 'runtime_dependency_partial' &&
    status.state !== 'runtime_binding_incomplete'
  ) {
    console.error('FAILED: status() returned unexpected state:', status.state);
    process.exit(1);
  }

  let loadThrew = false;
  try {
    bindings.loadModel('fake-path');
  } catch (e) {
    if (e.message.includes('MODEL_INVALID') || e.message.includes('MODEL_MISSING')) {
      loadThrew = true;
    }
  }
  if (!loadThrew) {
    console.error('FAILED: loadModel did not throw MODEL_INVALID or MODEL_MISSING on bad path.');
    process.exit(1);
  }

  let generateThrew = false;
  try {
    bindings.generate('hello');
  } catch (e) {
    if (e.message.includes('MODEL_NOT_LOADED')) {
      generateThrew = true;
    }
  }
  if (!generateThrew) {
    console.error('FAILED: generate did not throw MODEL_NOT_LOADED.');
    process.exit(1);
  }

  console.log('SUCCESS: litert-node-bindings packaged and behaves correctly.');
} catch (err) {
  console.error('FAILED: Error executing bindings:', err.message);
  process.exit(1);
}
