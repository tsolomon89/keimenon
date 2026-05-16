import * as readline from 'readline';

// Simple JSON-RPC 2.0 over stdio prototype shell
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(id: number | string | null, result: any) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', result, id }) + '\n');
}

function sendError(id: number | string | null, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id }) + '\n');
}

rl.on('line', (line) => {
  if (!line.trim()) return;

  try {
    const req = JSON.parse(line);

    if (req.jsonrpc !== '2.0' || !req.method) {
      sendError(req.id || null, -32600, 'Invalid Request');
      return;
    }

    switch (req.method) {
      case 'status':
        sendResponse(req.id, {
          ok: true,
          runtime: 'native-gemma',
          state: 'runtime_unimplemented',
          message:
            'Helper process prototype shell is running, but real LiteRT inference is unimplemented.',
        });
        break;

      case 'load_model':
        sendResponse(req.id, {
          success: false,
          error: 'Not implemented in prototype shell',
        });
        break;

      case 'generate':
        sendResponse(req.id, {
          text: 'This is a mocked response from the prototype shell.',
          completion_tokens: 10,
          prompt_tokens: 0,
        });
        break;

      case 'shutdown':
        sendResponse(req.id, { success: true });
        process.exit(0);
        break;

      default:
        sendError(req.id, -32601, 'Method not found');
        break;
    }
  } catch (err) {
    sendError(null, -32700, 'Parse error');
  }
});
