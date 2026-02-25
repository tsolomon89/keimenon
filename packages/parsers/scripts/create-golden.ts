
import { ChatGPTParser } from '../src/parsers/chatgpt';
import { ContentProcessor } from '../src/services/content-processor';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const samplePath = path.join(__dirname, 'samples/chatgpt-export.json');
  const snapshotPath = path.join(__dirname, '__snapshots__/golden.json');

  if (!fs.existsSync(samplePath)) {
    console.error('Sample file not found:', samplePath);
    // Create a dummy sample if not exists
    const dummyData = {
        title: "Golden Sample",
        create_time: 1672531200,
        mapping: {
            "msg_1": {
                id: "msg_1",
                message: {
                    id: "msg_1",
                    author: { role: "user" },
                    content: { parts: ["Hello world"] },
                    create_time: 1672531200
                }
            },
            "msg_2": {
                id: "msg_2",
                parent: "msg_1",
                message: {
                    id: "msg_2",
                    author: { role: "assistant" },
                    content: { parts: ["Hi there!"] },
                    create_time: 1672531201
                }
            }
        }
    };
    fs.mkdirSync(path.dirname(samplePath), { recursive: true });
    fs.writeFileSync(samplePath, JSON.stringify(dummyData, null, 2));
    console.log('Created dummy sample at', samplePath);
  }

  const rawData = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  
  console.log('Parsing...');
  const parser = new ChatGPTParser();
  const parseResult = await parser.parse(rawData, 'golden-test');
  
  console.log('Processing...');
  const processor = new ContentProcessor({
    extractTokens: true,
    extractPhrases: true,
    extractSentences: true,
    extractBlocks: true,
    extractSections: true,
    generateSignatures: true,
    minHashPermutations: 16
  });

  const processed = await processor.processConversation(parseResult.conversations[0]);

  // sanitize for snapshot (remove varying timestamps/IDs if necessary, though we want deterministic IDs)
  const snapshot = {
    conversations: parseResult.conversations.map(c => ({
        ...c,
        messages: c.messages.map(m => ({
            ...m,
            // sanitize varying fields if any
        }))
    })),
    processedBlobs: processed.map(p => ({
        blobHash: p.blob.hash,
        spanCount: p.spans.length,
        signatureCount: p.signatures.length
    }))
  };

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log('Snapshot written to', snapshotPath);
}

main().catch(console.error);
