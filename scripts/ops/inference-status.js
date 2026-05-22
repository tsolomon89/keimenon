const path = require('path');
const fs = require('fs');

async function main() {
  try {
    const adapterPath = path.resolve(
      __dirname,
      '../../apps/inference-helper/dist/litert-adapter.js'
    );
    if (!fs.existsSync(adapterPath)) {
      console.error(
        'FAILED: dist/litert-adapter.js not found. Please compile/build the project first.'
      );
      process.exit(1);
    }

    const { LiteRTGemmaRuntimeAdapter } = require(adapterPath);
    const adapter = new LiteRTGemmaRuntimeAdapter();
    const status = await adapter.status();

    console.log('Inference Status:', JSON.stringify(status, null, 2));

    if (status.state === 'error') {
      process.exit(1);
    }
  } catch (err) {
    console.error('FAILED: Error querying status:', err.message);
    process.exit(1);
  }
}

main();
