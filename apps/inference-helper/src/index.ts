import * as readline from 'readline';
import { LiteRTGemmaRuntimeAdapter } from './litert-adapter';

// Simple JSON-RPC 2.0 over stdio prototype shell
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(id: number | string | null, result: any) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ok: true, result, id }) + '\n');
}

function sendError(id: number | string | null, code: number | string, message: string) {
  process.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', ok: false, error: { code, message }, id }) + '\n'
  );
}

// Instantiate the actual adapter
const adapter = new LiteRTGemmaRuntimeAdapter();

rl.on('line', async (line) => {
  if (!line.trim()) return;

  try {
    const req = JSON.parse(line);

    if (req.jsonrpc !== '2.0' || !req.method) {
      sendError(req.id || null, 'INVALID_REQUEST', 'Invalid Request');
      return;
    }

    switch (req.method) {
      case 'status':
        const statusRes = await adapter.status();
        sendResponse(req.id, statusRes);
        break;

      case 'validate_model':
        if (!req.params || typeof req.params.model_path !== 'string') {
          sendError(req.id, 'INVALID_PARAMS', 'Missing or invalid model_path parameter');
          return;
        }
        const valRes = await adapter.validateModelFile(req.params.model_path);
        sendResponse(req.id, valRes);
        break;

      case 'load_model':
        if (!req.params || typeof req.params.model_path !== 'string') {
          sendError(req.id, 'INVALID_PARAMS', 'Missing or invalid model_path parameter');
          return;
        }
        const loadRes = await adapter.loadModel(req.params.model_path);
        sendResponse(req.id, loadRes);
        break;

      case 'generate':
        if (!req.params || typeof req.params.prompt !== 'string') {
          sendError(req.id, 'INVALID_PARAMS', 'Missing or invalid prompt parameter');
          return;
        }
        const genRes = await adapter.generate(req.params);
        if (!genRes.success) {
          sendError(req.id, 'RUNTIME_UNIMPLEMENTED', genRes.error || 'Generation failed');
        } else {
          sendResponse(req.id, genRes);
        }
        break;

      case 'unload_model':
        await adapter.unloadModel();
        sendResponse(req.id, { success: true });
        break;

      case 'shutdown':
        await adapter.unloadModel();
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
