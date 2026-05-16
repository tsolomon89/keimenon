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

function sendError(id: number | string | null, code: number | string, message: string) {
  process.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', ok: false, error: { code, message }, id }) + '\n'
  );
}

rl.on('line', (line) => {
  if (!line.trim()) return;

  try {
    const req = JSON.parse(line);

    if (req.jsonrpc !== '2.0' || !req.method) {
      sendError(req.id || null, 'INVALID_REQUEST', 'Invalid Request');
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
        sendError(
          req.id,
          'RUNTIME_UNIMPLEMENTED',
          'Native Gemma generation is not implemented yet.'
        );
        break;

      case 'shutdown':
        sendResponse(req.id, { success: true });
        process.exit(0);
        break;

      default:
        sendError(req.id, 'METHOD_NOT_FOUND', 'Method not found');
        break;
    }
  } catch (err) {
    sendError(null, 'PARSE_ERROR', 'Parse error');
  }
});
