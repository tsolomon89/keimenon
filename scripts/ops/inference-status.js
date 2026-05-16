const http = require('http');

const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/runtime/local-inference/status',
    method: 'GET',
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log('Inference Status:', JSON.stringify(json, null, 2));
        if (json.state === 'error') {
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

req.end();
