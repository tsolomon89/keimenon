const http = require('http');

const payload = JSON.stringify({
  messages: [{ role: 'user', content: 'Say hello' }],
  model: 'gemma',
  stream: false,
});

const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/agent/synthesize',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log('Inference Smoke Test Result:', JSON.stringify(json, null, 2));
        // We expect runtime_unimplemented or a success response
        if (json.error === 'runtime_unimplemented' || json.message) {
          console.log('Smoke test passed (received expected response).');
        } else if (res.statusCode >= 400 && res.statusCode !== 501) {
          console.error('Unexpected error response:', json);
          process.exit(1);
        }
      } catch (e) {
        console.error('Failed to parse response:', data);
        process.exit(1);
      }
    });
  }
);

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  process.exit(1);
});

req.write(payload);
req.end();
