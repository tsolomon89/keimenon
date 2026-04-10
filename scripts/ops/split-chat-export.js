#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_INPUT = path.join('agent_context', 'test_data', 'conversations.json');
const DEFAULT_OUTPUT_DIR = path.join('agent_context', 'test_data', 'splits');
const DEFAULT_PARTS = 10;
const PART_FILE_PATTERN = /^conversations\.part-\d+-of-\d+\.json$/;
const MANIFEST_FILE_NAME = 'conversations.split-manifest.json';

function printUsage() {
  console.log(`Usage:
  node scripts/ops/split-chat-export.js [--input <path>] [--output-dir <path>] [--parts <n>] [--verify]

Options:
  --input <path>       Input JSON file (default: ${DEFAULT_INPUT})
  --output-dir <path>  Output directory (default: ${DEFAULT_OUTPUT_DIR})
  --parts <n>          Number of split files to generate (default: ${DEFAULT_PARTS})
  --verify             Re-parse outputs and reconcile totals
  --help               Show this help text
`);
}

function parseCliArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    parts: DEFAULT_PARTS,
    verify: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (token === '--verify') {
      args.verify = true;
      continue;
    }

    if (token === '--input' || token.startsWith('--input=')) {
      const value = token.includes('=') ? token.split('=').slice(1).join('=') : argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --input');
      }
      if (!token.includes('=')) {
        index += 1;
      }
      args.input = value;
      continue;
    }

    if (token === '--output-dir' || token.startsWith('--output-dir=')) {
      const value = token.includes('=') ? token.split('=').slice(1).join('=') : argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --output-dir');
      }
      if (!token.includes('=')) {
        index += 1;
      }
      args.outputDir = value;
      continue;
    }

    if (token === '--parts' || token.startsWith('--parts=')) {
      const rawValue = token.includes('=') ? token.split('=').slice(1).join('=') : argv[index + 1];
      if (!rawValue) {
        throw new Error('Missing value for --parts');
      }
      if (!token.includes('=')) {
        index += 1;
      }
      const parsedParts = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsedParts) || parsedParts < 1) {
        throw new Error(`Invalid --parts value "${rawValue}". Expected an integer >= 1.`);
      }
      args.parts = parsedParts;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function resolveConversationId(conversation, fallbackIndex) {
  if (!conversation || typeof conversation !== 'object') {
    return `index-${fallbackIndex}`;
  }

  const candidates = [
    conversation.uuid,
    conversation.id,
    conversation.conversation_id,
    conversation.chat_id,
    conversation.title,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  if (typeof conversation.id === 'number') {
    return String(conversation.id);
  }

  return `index-${fallbackIndex}`;
}

function countConversationMessages(conversation) {
  if (!conversation || typeof conversation !== 'object') {
    return 0;
  }

  if (Array.isArray(conversation.chat_messages)) {
    return conversation.chat_messages.length;
  }

  if (Array.isArray(conversation.messages)) {
    return conversation.messages.length;
  }

  if (conversation.mapping && typeof conversation.mapping === 'object') {
    let count = 0;
    for (const value of Object.values(conversation.mapping)) {
      if (value && typeof value === 'object' && value.message) {
        count += 1;
      }
    }
    return count;
  }

  return 0;
}

function sum(values, start = 0, end = values.length) {
  let total = 0;
  for (let index = start; index < end; index += 1) {
    total += values[index];
  }
  return total;
}

function buildContiguousRanges(sizes, requestedParts) {
  const conversationCount = sizes.length;

  if (conversationCount === 0) {
    return {
      effectiveParts: 1,
      ranges: [{ start: 0, end: 0 }],
      totalBytes: 0,
      targetBytesPerPart: 0,
    };
  }

  const effectiveParts = Math.min(requestedParts, conversationCount);
  const totalBytes = sum(sizes);
  const targetBytesPerPart = totalBytes / effectiveParts;
  const ranges = [];
  let cursor = 0;

  for (let partIndex = 0; partIndex < effectiveParts; partIndex += 1) {
    const isLastPart = partIndex === effectiveParts - 1;
    const start = cursor;

    if (isLastPart) {
      ranges.push({ start, end: conversationCount });
      cursor = conversationCount;
      continue;
    }

    let currentBytes = 0;
    let conversationsInPart = 0;

    while (cursor < conversationCount) {
      const remainingParts = effectiveParts - partIndex;
      const mustLeaveForFutureParts = remainingParts - 1;
      const remainingConversations = conversationCount - cursor;

      if (conversationsInPart > 0 && remainingConversations <= mustLeaveForFutureParts) {
        break;
      }

      const nextSize = sizes[cursor];

      if (conversationsInPart === 0) {
        currentBytes += nextSize;
        cursor += 1;
        conversationsInPart += 1;
        continue;
      }

      const bytesWithNext = currentBytes + nextSize;
      const wouldImproveTargetDistance =
        Math.abs(targetBytesPerPart - bytesWithNext) < Math.abs(targetBytesPerPart - currentBytes);
      const canTakeAndKeepGuardrail = conversationCount - (cursor + 1) >= mustLeaveForFutureParts;

      if (
        (bytesWithNext <= targetBytesPerPart || wouldImproveTargetDistance) &&
        canTakeAndKeepGuardrail
      ) {
        currentBytes = bytesWithNext;
        cursor += 1;
        conversationsInPart += 1;
        continue;
      }

      break;
    }

    if (cursor === start) {
      cursor += 1;
    }

    ranges.push({ start, end: cursor });
  }

  return {
    effectiveParts,
    ranges,
    totalBytes,
    targetBytesPerPart,
  };
}

function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function clearPreviousOutputs(outputDirectoryPath) {
  await fsp.mkdir(outputDirectoryPath, { recursive: true });
  const entries = await fsp.readdir(outputDirectoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const shouldRemove = entry.name === MANIFEST_FILE_NAME || PART_FILE_PATTERN.test(entry.name);

    if (shouldRemove) {
      await fsp.rm(path.join(outputDirectoryPath, entry.name), { force: true });
    }
  }
}

function createManifest({
  inputPath,
  inputBytes,
  inputSha256,
  requestedParts,
  effectiveParts,
  conversationCount,
  messageCounts,
  conversationIds,
  files,
}) {
  const totalMessages = sum(messageCounts);
  const emptyConversations = messageCounts.filter((count) => count === 0).length;

  return {
    generated_at: new Date().toISOString(),
    input: {
      path: inputPath,
      size_bytes: inputBytes,
      sha256: inputSha256,
    },
    requested_parts: requestedParts,
    parts: effectiveParts,
    totals: {
      conversations: conversationCount,
      messages: totalMessages,
      empty_conversations: emptyConversations,
      non_empty_conversations: conversationCount - emptyConversations,
    },
    files,
    uuid_bounds: {
      first: conversationIds[0] ?? null,
      last: conversationIds[conversationIds.length - 1] ?? null,
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyOutputs({
  outputDirectoryPath,
  manifest,
  conversationIds,
  messageCounts,
  sourceHashBefore,
  inputPath,
}) {
  let seenConversations = 0;
  let seenMessages = 0;
  const mergedConversationIds = [];

  for (const fileInfo of manifest.files) {
    const absoluteFilePath = path.join(outputDirectoryPath, fileInfo.file_name);
    const payload = await fsp.readFile(absoluteFilePath, 'utf8');
    const parsed = JSON.parse(payload);

    assert(Array.isArray(parsed), `[verify] ${fileInfo.file_name} is not a top-level array.`);
    assert(
      Buffer.byteLength(payload, 'utf8') === fileInfo.size_bytes,
      `[verify] ${fileInfo.file_name} byte size mismatch.`
    );
    assert(
      parsed.length === fileInfo.conversations,
      `[verify] ${fileInfo.file_name} conversation count mismatch.`
    );

    const localMessages = parsed.reduce(
      (count, conversation) => count + countConversationMessages(conversation),
      0
    );

    assert(
      localMessages === fileInfo.messages,
      `[verify] ${fileInfo.file_name} message count mismatch.`
    );

    for (let index = 0; index < parsed.length; index += 1) {
      mergedConversationIds.push(
        resolveConversationId(parsed[index], fileInfo.start_index + index)
      );
    }

    seenConversations += parsed.length;
    seenMessages += localMessages;
  }

  assert(
    seenConversations === manifest.totals.conversations,
    '[verify] Total conversation count does not reconcile.'
  );
  assert(
    seenMessages === manifest.totals.messages,
    '[verify] Total message count does not reconcile.'
  );

  const expectedIds = conversationIds;
  assert(
    mergedConversationIds.length === expectedIds.length,
    '[verify] Concatenated output length mismatch.'
  );

  for (let index = 0; index < expectedIds.length; index += 1) {
    if (mergedConversationIds[index] !== expectedIds[index]) {
      throw new Error(
        `[verify] Conversation order drift at index ${index}. Expected "${expectedIds[index]}", got "${mergedConversationIds[index]}".`
      );
    }
  }

  const expectedMessages = sum(messageCounts);
  assert(expectedMessages === manifest.totals.messages, '[verify] Manifest message total drift.');

  const sourceHashAfter = await computeSha256(inputPath);
  assert(
    sourceHashAfter === sourceHashBefore,
    '[verify] Source file hash changed unexpectedly during split run.'
  );
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));

  if (cli.help) {
    printUsage();
    return;
  }

  const cwd = process.cwd();
  const inputPath = path.resolve(cwd, cli.input);
  const outputDirectoryPath = path.resolve(cwd, cli.outputDir);

  const inputStat = await fsp.stat(inputPath).catch(() => null);
  if (!inputStat || !inputStat.isFile()) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  console.log(`[split-chat-export] input: ${inputPath}`);
  console.log(`[split-chat-export] output: ${outputDirectoryPath}`);
  console.log(`[split-chat-export] requested parts: ${cli.parts}`);

  const sourceHashBefore = await computeSha256(inputPath);
  const raw = await fsp.readFile(inputPath, 'utf8');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse input JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Input JSON must be a top-level array of conversations.');
  }

  const conversations = parsed;
  const conversationCount = conversations.length;
  const messageCounts = conversations.map((conversation) =>
    countConversationMessages(conversation)
  );
  const conversationIds = conversations.map((conversation, index) =>
    resolveConversationId(conversation, index)
  );
  const serializedConversationSizes = conversations.map((conversation) =>
    Buffer.byteLength(JSON.stringify(conversation), 'utf8')
  );

  const { effectiveParts, ranges, totalBytes, targetBytesPerPart } = buildContiguousRanges(
    serializedConversationSizes,
    cli.parts
  );

  if (cli.parts > effectiveParts) {
    console.log(
      `[split-chat-export] requested ${cli.parts} parts but only ${conversationCount} conversations available; using ${effectiveParts} parts.`
    );
  }

  await clearPreviousOutputs(outputDirectoryPath);

  const width = Math.max(2, String(effectiveParts).length);
  const files = [];

  for (let partIndex = 0; partIndex < ranges.length; partIndex += 1) {
    const range = ranges[partIndex];
    const partConversations = conversations.slice(range.start, range.end);
    const payload = JSON.stringify(partConversations);
    const fileName = `conversations.part-${String(partIndex + 1).padStart(width, '0')}-of-${String(effectiveParts).padStart(width, '0')}.json`;
    const destinationPath = path.join(outputDirectoryPath, fileName);
    await fsp.writeFile(destinationPath, payload);

    const conversationTotal = partConversations.length;
    const messageTotal = sum(messageCounts, range.start, range.end);
    const sizeBytes = Buffer.byteLength(payload, 'utf8');
    const firstId = conversationTotal > 0 ? conversationIds[range.start] : null;
    const lastId = conversationTotal > 0 ? conversationIds[range.end - 1] : null;

    files.push({
      part: partIndex + 1,
      file_name: fileName,
      path: destinationPath,
      conversations: conversationTotal,
      messages: messageTotal,
      size_bytes: sizeBytes,
      first_conversation_uuid: firstId,
      last_conversation_uuid: lastId,
      start_index: range.start,
      end_index_exclusive: range.end,
    });
  }

  const manifest = createManifest({
    inputPath,
    inputBytes: inputStat.size,
    inputSha256: sourceHashBefore,
    requestedParts: cli.parts,
    effectiveParts,
    conversationCount,
    messageCounts,
    conversationIds,
    files,
  });

  const manifestPath = path.join(outputDirectoryPath, MANIFEST_FILE_NAME);
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (cli.verify) {
    await verifyOutputs({
      outputDirectoryPath,
      manifest,
      conversationIds,
      messageCounts,
      sourceHashBefore,
      inputPath,
    });
    console.log('[split-chat-export] verification passed');
  }

  const averageTargetMb = targetBytesPerPart / (1024 * 1024);
  const outputTotalMb = totalBytes / (1024 * 1024);

  console.log('[split-chat-export] complete');
  console.log(`- conversations: ${manifest.totals.conversations}`);
  console.log(`- messages: ${manifest.totals.messages}`);
  console.log(`- empty conversations: ${manifest.totals.empty_conversations}`);
  console.log(`- parts generated: ${effectiveParts}`);
  console.log(
    `- estimated total serialized bytes: ${totalBytes} (${outputTotalMb.toFixed(2)} MiB)`
  );
  console.log(
    `- target per part: ${Math.round(targetBytesPerPart)} bytes (${averageTargetMb.toFixed(2)} MiB)`
  );
  console.log(`- manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(
    `[split-chat-export] failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
