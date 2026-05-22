const path = require('path');
const fs = require('fs');

async function main() {
  console.log('=== LiteRT-LM E2E Standalone Smoke Verification ===');

  // 1. Locate the adapter
  const adapterPath = path.resolve(__dirname, '../../apps/inference-helper/dist/litert-adapter.js');
  if (!fs.existsSync(adapterPath)) {
    console.error(
      'FAILED: dist/litert-adapter.js not found. Please compile/build the project first.'
    );
    process.exit(1);
  }

  const { LiteRTGemmaRuntimeAdapter } = require(adapterPath);
  const adapter = new LiteRTGemmaRuntimeAdapter();

  // 2. Query status
  const status = await adapter.status();
  console.log('\n--- Native Engine Status ---');
  console.log(JSON.stringify(status, null, 2));

  // Check if native dependencies are missing/incomplete
  if (status.state === 'runtime_dependency_missing') {
    console.log('\n[SKIP] Native dependencies are missing. Skipping E2E model load/run.');
    process.exit(0);
  }
  if (status.state === 'runtime_binding_incomplete') {
    console.log('\n[SKIP] Native bindings are incomplete. Skipping E2E model load/run.');
    process.exit(0);
  }

  // 3. Find a .litertlm model file to load
  const modelsDir =
    process.env.KEIMENON_MODELS_DIR || path.resolve(process.cwd(), '.data/models/gemma');
  console.log(`\nSearching for model file in: ${modelsDir}`);

  let modelFile = null;
  if (fs.existsSync(modelsDir)) {
    const files = fs.readdirSync(modelsDir);
    const litertlmFile = files.find((f) => f.endsWith('.litertlm'));
    if (litertlmFile) {
      modelFile = path.join(modelsDir, litertlmFile);
    }
  }

  if (!modelFile) {
    console.log(
      '\n[SKIP] No .litertlm model file found in models directory. Skipping E2E model run.'
    );
    process.exit(0);
  }

  console.log(`Found model file: ${modelFile}`);
  console.log('Loading model...');

  // 4. Load model
  const loadRes = await adapter.loadModel(modelFile);
  console.log('Load Result:', JSON.stringify(loadRes, null, 2));

  if (!loadRes.success) {
    console.error('\nFAILED: Model load failed:', loadRes.message);
    process.exit(1);
  }

  // 5. Generate tiny prompt
  console.log('\nGenerating tiny completion...');
  const prompt = 'Hello';
  const genRes = await adapter.generate({ prompt, max_tokens: 10 });
  console.log('Generation Result:', JSON.stringify(genRes, null, 2));

  if (!genRes.success) {
    console.error('\nFAILED: Generation failed:', genRes.error);
    // Unload before exiting
    await adapter.unloadModel();
    process.exit(1);
  }

  // 6. Unload model
  console.log('\nUnloading model...');
  await adapter.unloadModel();

  // Final check
  const finalStatus = await adapter.status();
  console.log('\n--- Final Native Engine Status ---');
  console.log(JSON.stringify(finalStatus, null, 2));

  console.log('\n[SUCCESS] E2E Smoke test completed successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAILED: Unhandled error in smoke test:', err);
  process.exit(1);
});
