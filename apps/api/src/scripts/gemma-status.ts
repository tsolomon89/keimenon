import { gemmaProvider } from '../services/agent/gemma-local-provider';

async function main() {
  console.log('--- Keimenon Gemma Local Runtime Status ---');
  console.log(`GEMMA_LOCAL_BASE_URL: ${process.env.GEMMA_LOCAL_BASE_URL || 'Not set'}`);
  console.log(
    `GEMMA_LOCAL_RUNTIME_KIND: ${process.env.GEMMA_LOCAL_RUNTIME_KIND || 'openai-compatible (default)'}`
  );
  console.log(`GEMMA_LOCAL_MODEL: ${process.env.GEMMA_LOCAL_MODEL || 'gemma-4-e4b-it (default)'}`);
  console.log(`GEMMA_LOCAL_THINKING: ${process.env.GEMMA_LOCAL_THINKING || 'off (default)'}`);
  console.log('');
  console.log('Checking status...');

  const status = await gemmaProvider.checkStatus();
  console.log(JSON.stringify(status, null, 2));

  if (status.status !== 'online') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
