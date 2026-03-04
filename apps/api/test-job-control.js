/**
 * Standalone test runner for job control tests only
 * Run with: node test-job-control.js
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { spawnNode22 } = require(path.resolve(__dirname, '../../scripts/project-node-runtime.js'));

const testFiles = [
  'src/modules/jobs/__tests__/Job.test.ts',
  'src/modules/workers/__tests__/WorkerPool.test.ts',
];

console.log('🧪 Running Job Control Tests\n');
console.log('='.repeat(60));

const proc = spawnNode22(['--import', 'tsx', '--test', ...testFiles], {
  cwd: __dirname,
  stdio: 'inherit',
});

proc.on('exit', (code) => {
  console.log('\n' + '='.repeat(60));
  if (code === 0) {
    console.log('✅ All job control tests passed!');
  } else {
    console.log(`❌ Tests failed with exit code ${code}`);
  }
  process.exit(code);
});
