/**
 * Standalone test runner for job control tests only
 * Run with: node test-job-control.js
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = [
  'src/modules/jobs/__tests__/Job.test.ts',
  'src/modules/workers/__tests__/WorkerPool.test.ts',
];

console.log('🧪 Running Job Control Tests\n');
console.log('='.repeat(60));

const proc = spawn('node', ['--import', 'tsx', '--test', ...testFiles], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
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
