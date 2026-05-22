const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../');

const FILE_PATHS_TO_CHECK = [
  'apps/api/src/services/agent/gemma-model-source-registry.ts',
  'apps/api/src/services/agent/__tests__/gemma-model-source-registry.test.ts',
  'apps/api/src/services/agent/model-manager.ts',
];

const FORBIDDEN_STRINGS = [
  'gemma-2',
  'Gemma 2',
  'gemma-2-2b-it',
  '2B IT',
  'Docker',
  'Ollama',
  'LM Studio',
];

let failed = false;

for (const relPath of FILE_PATHS_TO_CHECK) {
  const absolutePath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(absolutePath)) {
    console.warn(`[WARN] File not found: ${relPath}`);
    continue;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');

  for (const forbidden of FORBIDDEN_STRINGS) {
    if (content.includes(forbidden)) {
      console.error(`[ERROR] Forbidden string "${forbidden}" found in active path: ${relPath}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\n[FAILED] Gemma 4 active target guard check failed. Found legacy references.');
  process.exit(1);
} else {
  console.log('\n[OK] Gemma 4 active target guard check passed.');
  process.exit(0);
}
