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
  const { getLiteRTBindings } = require('../../packages/litert-node-bindings');
  const bindings = getLiteRTBindings();

  const status = bindings.status();
  if (status.state !== 'runtime_binding_incomplete') {
    console.error('FAILED: status() returned unexpected state:', status.state);
    process.exit(1);
  }

  let loadThrew = false;
  try {
    bindings.loadModel('fake-path');
  } catch (e) {
    if (e.message.includes('RUNTIME_BINDING_INCOMPLETE')) {
      loadThrew = true;
    }
  }
  if (!loadThrew) {
    console.error('FAILED: loadModel did not throw RUNTIME_BINDING_INCOMPLETE.');
    process.exit(1);
  }

  let generateThrew = false;
  try {
    bindings.generate('hello');
  } catch (e) {
    if (e.message.includes('RUNTIME_BINDING_INCOMPLETE')) {
      generateThrew = true;
    }
  }
  if (!generateThrew) {
    console.error('FAILED: generate did not throw RUNTIME_BINDING_INCOMPLETE.');
    process.exit(1);
  }

  console.log('SUCCESS: litert-node-bindings packaged and behaves correctly.');
} catch (err) {
  console.error('FAILED: Error executing bindings:', err.message);
  process.exit(1);
}
