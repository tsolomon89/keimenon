import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import * as readline from 'readline';

// @ts-ignore - Handle JSONStream types gracefully or ensure package installation
import * as JSONStream from 'jsonstream';

// Types for Worker Messages
interface WorkerConfig {
  filePath: string;
  fileSize: number;
  mimeType: string;
  batchSize?: number;
  skipConversations?: number; // Resume optimization: skip N conversations before sending batches
}

interface WorkerMessage {
  type: 'progress' | 'batch' | 'error' | 'done';
  data?: any;
}

type ParserMode = 'json_array' | 'json_object' | 'jsonl';

// Config from parent
const config = (workerData || {}) as WorkerConfig;
const BATCH_SIZE = config.batchSize || 100;
const SKIP_COUNT = config.skipConversations || 0;

// State
let conversationsProcessed = 0;
let conversationsSkipped = 0;

function normalizeErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error && typeof value.message === 'string') {
    return value.message;
  }
  if (value == null) {
    return 'Unknown stream error';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isMalformedInputMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid json') ||
    normalized.includes('unexpected token') ||
    normalized.includes('unexpected end of json input') ||
    normalized.includes('state stop')
  );
}

export function detectParserMode(filePath: string, mimeType?: string): ParserMode {
  const lowerPath = filePath.toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (
    lowerPath.endsWith('.jsonl') ||
    lowerPath.endsWith('.ndjson') ||
    lowerMime.includes('ndjson') ||
    lowerMime.includes('jsonl')
  ) {
    return 'jsonl';
  }

  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    const prefix = buffer.toString('utf8', 0, bytesRead).trimStart();
    if (prefix.startsWith('[')) {
      return 'json_array';
    }
    if (prefix.startsWith('{')) {
      return 'json_object';
    }
  } catch (error) {
    console.error('[import.worker] Failed to detect parser mode:', normalizeErrorMessage(error));
  }

  return 'json_array';
}

export function expandJsonObjectPayload(payload: any): any[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.conversations)) {
      return payload.conversations;
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    return [payload];
  }
  return [];
}

// Main execution
(async () => {
  if (!parentPort || !config || typeof config.filePath !== 'string') {
    return;
  }

  try {
    postMessage({
      type: 'progress',
      data: { stage: 'starting', percent: 0, message: 'Worker started' },
    });

    const parserMode = detectParserMode(config.filePath, config.mimeType);
    const stream = fs.createReadStream(config.filePath, { encoding: 'utf8' });

    let batch: any[] = [];
    let terminalErrorEmitted = false;

    const emitTerminalError = (errorMessage: string) => {
      if (terminalErrorEmitted) {
        return;
      }
      terminalErrorEmitted = true;
      postMessage({ type: 'error', data: errorMessage });
      try {
        stream.destroy();
      } catch {
        // ignore teardown errors
      }
    };

    const currentProgressPercent = () => {
      if (!config.fileSize || config.fileSize <= 0) {
        return 0;
      }
      return Math.round((stream.bytesRead / config.fileSize) * 100);
    };

    const flushBatch = () => {
      if (batch.length > 0) {
        postMessage({ type: 'batch', data: batch });
        batch = [];
      }
    };

    const emitDone = () => {
      if (terminalErrorEmitted) {
        return;
      }
      flushBatch();
      postMessage({ type: 'done', data: { total: conversationsProcessed } });
    };

    if (SKIP_COUNT > 0) {
      console.log(`[import.worker] Resuming: will skip first ${SKIP_COUNT} conversations`);
    }

    const handleConversation = (rawData: any) => {
      conversationsProcessed++;

      if (conversationsSkipped < SKIP_COUNT) {
        conversationsSkipped++;
        if (conversationsSkipped % 1000 === 0) {
          postMessage({
            type: 'progress',
            data: {
              stage: 'skipping',
              percent: currentProgressPercent(),
              message: `Skipping ${conversationsSkipped}/${SKIP_COUNT} (resuming)`,
            },
          });
        }
        return;
      }

      batch.push({ raw: rawData, index: conversationsProcessed });

      if (batch.length >= BATCH_SIZE) {
        flushBatch();
        const actualProcessed = conversationsProcessed - SKIP_COUNT;
        postMessage({
          type: 'progress',
          data: {
            stage: 'parsing',
            percent: currentProgressPercent(),
            message: `Processed ${actualProcessed} conversations${SKIP_COUNT > 0 ? ` (resumed from ${SKIP_COUNT})` : ''}`,
          },
        });
      }
    };

    if (parserMode === 'json_array') {
      const parser = JSONStream.parse('*');
      stream.pipe(parser);

      parser.on('data', (data: any) => {
        handleConversation(data);
      });

      parser.on('error', (err: any) => {
        const errorMessage = normalizeErrorMessage(err);
        if (!isMalformedInputMessage(errorMessage)) {
          console.error('[import.worker] Stream parser error:', errorMessage);
        }
        emitTerminalError(errorMessage);
      });

      parser.on('end', () => {
        emitDone();
      });
    } else if (parserMode === 'jsonl') {
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        if (terminalErrorEmitted) {
          return;
        }

        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }

        try {
          const parsed = JSON.parse(trimmed);
          handleConversation(parsed);
        } catch (error) {
          emitTerminalError(`Invalid JSONL line: ${normalizeErrorMessage(error)}`);
        }
      });

      rl.on('close', () => {
        emitDone();
      });

      rl.on('error', (err: any) => {
        emitTerminalError(normalizeErrorMessage(err));
      });
    } else {
      let jsonPayload = '';

      stream.on('data', (chunk: string | Buffer) => {
        jsonPayload += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      });

      stream.on('end', () => {
        if (terminalErrorEmitted) {
          return;
        }

        try {
          const parsed = JSON.parse(jsonPayload);
          const items = expandJsonObjectPayload(parsed);
          for (const item of items) {
            handleConversation(item);
          }
          postMessage({
            type: 'progress',
            data: {
              stage: 'parsing',
              percent: 100,
              message: `Processed ${Math.max(0, conversationsProcessed - SKIP_COUNT)} conversations`,
            },
          });
          emitDone();
        } catch (error) {
          emitTerminalError(normalizeErrorMessage(error));
        }
      });
    }

    stream.on('error', (err: any) => {
      const errorMessage = normalizeErrorMessage(err);
      console.error('[import.worker] Read stream error:', errorMessage);
      emitTerminalError(errorMessage);
    });
  } catch (error: any) {
    postMessage({ type: 'error', data: normalizeErrorMessage(error) });
  }
})();

function postMessage(msg: WorkerMessage) {
  parentPort?.postMessage(msg);
}
