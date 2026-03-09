import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';

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

// Config from parent
const config = workerData as WorkerConfig;
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

// Main execution
(async () => {
  if (!parentPort) {
    throw new Error('This script must be run as a worker thread');
  }

  try {
    postMessage({
      type: 'progress',
      data: { stage: 'starting', percent: 0, message: 'Worker started' },
    });

    // Stream Setup
    const stream = fs.createReadStream(config.filePath, { encoding: 'utf8' });

    // Choose Parser based on file extension/mime (Simple logic for now: JSON Array or JSONL)
    // TODO: Implement robust parser selection logic similar to `ParserRegistry` if needed here,
    // or keep generic. For now, assuming standard JSON Array of conversations.
    // Use JSONStream to parse every item in the root array
    const parser = JSONStream.parse('*');

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

    // Log skip info if resuming
    if (SKIP_COUNT > 0) {
      console.log(`[import.worker] Resuming: will skip first ${SKIP_COUNT} conversations`);
    }

    // Validating Stream Logic
    stream.pipe(parser);

    parser.on('data', (data: any) => {
      conversationsProcessed++;

      // Resume optimization: skip already-processed conversations
      // This avoids IPC overhead of sending batches that will be discarded
      if (conversationsSkipped < SKIP_COUNT) {
        conversationsSkipped++;
        // Still update progress during skip phase
        if (conversationsSkipped % 1000 === 0) {
          const currentBytes = stream.bytesRead;
          const progress = (currentBytes / config.fileSize) * 100;
          postMessage({
            type: 'progress',
            data: {
              stage: 'skipping',
              percent: Math.round(progress),
              message: `Skipping ${conversationsSkipped}/${SKIP_COUNT} (resuming)`,
            },
          });
        }
        return;
      }

      // Send RAW data to parent thread for proper parsing via ParserRegistry
      // The parent (ImportWorker.ts) will use @keimenon/parsers to:
      // - Auto-detect format (ChatGPT/Claude/Gemini)
      // - Properly traverse ChatGPT mapping trees
      // - Handle nested content structures
      // - Normalize roles correctly
      batch.push({ raw: data, index: conversationsProcessed });

      // Update Progress (Bytes based)
      // Note: `bytesRead` is from file stream, but `fs.ReadStream` updates it.
      const currentBytes = stream.bytesRead;
      const progress = (currentBytes / config.fileSize) * 100;

      if (batch.length >= BATCH_SIZE) {
        // Send Batch
        postMessage({ type: 'batch', data: batch });
        batch = [];

        // Send Progress
        const actualProcessed = conversationsProcessed - SKIP_COUNT;
        postMessage({
          type: 'progress',
          data: {
            stage: 'parsing',
            percent: Math.round(progress),
            message: `Processed ${actualProcessed} conversations${SKIP_COUNT > 0 ? ` (resumed from ${SKIP_COUNT})` : ''}`,
          },
        });
      }
    });

    parser.on('error', (err: any) => {
      const errorMessage = normalizeErrorMessage(err);
      if (!isMalformedInputMessage(errorMessage)) {
        console.error('[import.worker] Stream parser error:', errorMessage);
      }
      emitTerminalError(errorMessage);
    });

    parser.on('end', () => {
      if (terminalErrorEmitted) {
        return;
      }

      // Send remaining batch
      if (batch.length > 0) {
        postMessage({ type: 'batch', data: batch });
      }

      postMessage({ type: 'done', data: { total: conversationsProcessed } });
    });

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
