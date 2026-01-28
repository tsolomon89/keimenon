# Integration Tests

End-to-end integration tests for Keimenon chat import pipeline.

## Overview

These tests verify the entire backend pipeline using real-world chat data:

1. **Streaming Parser** - Parse large JSON files efficiently
2. **Sources Builder** - Stitch messages into source documents
3. **Code Extractor** - Extract and deduplicate code blocks
4. **Similarity Engine** - Detect duplicate messages
5. **End-to-End Pipeline** - Complete import flow
6. **Neo4j Integrity** - Verify data consistency

## Prerequisites

### 1. Running Services

Make sure the development environment is running:

```bash
# Start Neo4j
docker-compose -f docker-compose.dev.yml up -d neo4j

# Start API server
npm run dev
# Or in apps/api: npm run dev
```

### 2. Test Data

Test data should be in `ai_context/chat_data/test-samples/`:

- `tiny.json` - 5 conversations (~1KB)
- `small.json` - 50 conversations (~10MB)
- `medium.json` - 500 conversations (~135MB)

If missing, generate with:

```bash
cd ai_context/chat_data
python analyze_and_generate.py
```

### 3. Environment Variables

Create `apps/api/.env`:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=testpassword
PORT=3001
```

## Running Tests

### All Tests

```bash
cd apps/api
npm run test:integration
```

### Individual Tests

```bash
# Streaming parser
node tests/integration/test-streaming-parser.js

# Sources builder
node tests/integration/test-sources-builder.js

# End-to-end
node tests/integration/test-e2e-pipeline.js
```

## Test Suites

### 1. Streaming Parser (`test-streaming-parser.js`)

**Tests**:

- Parse tiny.json (5 conversations)
- Parse small.json (50 conversations)
- Memory efficiency (<100MB for small.json)
- Format detection (ChatGPT/Claude)
- Batch processing

**Expected Output**:

```
━━━ Streaming JSON Parser ━━━

→ Testing tiny.json (5 conversations)...
  ✓ Parsed 5 conversations in 1 batch(es)
→ Testing small.json (50 conversations)...
  ✓ Parsed 50 conversations, 487 messages in 5 batches
→ Testing memory efficiency...
  ✓ Memory increase: 15.32MB (acceptable)

✓ Passed (523ms)
```

### 2. Sources Builder (`test-sources-builder.js`)

**Tests**:

- Default configuration
- Role filtering (user/assistant/both)
- Code detection (`code` blocks)
- Minimum length filtering
- Message stitching

**Expected Output**:

```
━━━ Sources Builder ━━━

→ Testing default configuration...
  ✓ Built 2 sources from 2 conversations
→ Testing role filtering...
  ✓ Role filtering works correctly (user/assistant/both)
→ Testing code detection...
  ✓ Code detection found 2 sources with code
→ Testing minimum length filtering...
  ✓ Minimum length filtering works correctly

✓ Passed (87ms)
```

### 3. End-to-End Pipeline (`test-e2e-pipeline.js`)

**Tests**:

- API health check
- Enhanced import endpoint
- File upload with config
- Neo4j data verification

**Expected Output**:

```
━━━ End-to-End Pipeline ━━━

→ Testing end-to-end import pipeline...

  → Checking API health...
    ✓ API is healthy (Neo4j: connected)
  → Testing enhanced import endpoint...
    → Uploading 1483 bytes...
    ✓ Import successful:
      - Conversations: 5
      - Sources: 3
      - Code blocks: 8
      - Duplicates: 0
  → Checking Neo4j data...
    ✓ Found 5 nodes in Neo4j

✓ Passed (1245ms)
```

### 4. Code Extractor (`test-code-extractor.js`)

**Status**: Stub (not yet implemented)

**Will Test**:

- Fenced code block extraction
- Inline code extraction
- Language detection
- SHA-256 deduplication
- Normalization (comment/whitespace removal)

### 5. Similarity Engine (`test-similarity-engine.js`)

**Status**: Stub (not yet implemented)

**Will Test**:

- Jaccard similarity (token overlap)
- Levenshtein distance (edit distance)
- Cosine similarity (vector comparison)
- Threshold-based matching
- Performance with large datasets

### 6. Neo4j Integrity (`test-neo4j-integrity.js`)

**Status**: Stub (not yet implemented)

**Will Test**:

- Conversation node structure
- Message node structure
- Source node structure
- CodeBlock node structure
- Relationship integrity
- Index effectiveness

## Test Data Formats

### Input: Conversation JSON

**ChatGPT Format**:

```json
{
  "id": "conv_123",
  "title": "API Design",
  "create_time": 1704110400,
  "mapping": {
    "node_1": {
      "message": {
        "id": "msg_1",
        "author": { "role": "user" },
        "content": { "parts": ["How do I..."] }
      }
    }
  }
}
```

**Claude Format**:

```json
{
  "uuid": "conv_123",
  "name": "API Design",
  "created_at": "2025-01-01T10:00:00Z",
  "chat_messages": [
    {
      "uuid": "msg_1",
      "text": "How do I...",
      "sender": "user",
      "created_at": "2025-01-01T10:00:00Z"
    }
  ]
}
```

### Output: Source Document

```json
{
  "id": "src_conv_123",
  "conversation_id": "conv_123",
  "conversation_name": "API Design",
  "platform": "claude",
  "content": "User message 1\n\nAssistant response\n\nUser message 2",
  "message_count": 3,
  "char_count": 1250,
  "code_block_count": 2,
  "has_code": true,
  "created_at": "2025-01-09T12:00:00Z"
}
```

## Troubleshooting

### Tests Fail: API Not Running

**Error**:

```
✗ Failed (87ms)
  Error: API health check failed: connect ECONNREFUSED
```

**Solution**:

```bash
# Start API server
cd apps/api
npm run dev

# Or from root
npm run dev
```

### Tests Fail: Neo4j Not Connected

**Error**:

```
✗ Failed (234ms)
  Error: Neo4j status: disconnected
```

**Solution**:

```bash
# Start Neo4j
docker-compose -f docker-compose.dev.yml up -d neo4j

# Check connection
docker logs keimenon-neo4j

# Test connection
node scripts/wait-for.js bolt://localhost:7687
```

### Tests Fail: Test Data Missing

**Error**:

```
✗ Failed (12ms)
  Error: Test data not found: tiny.json
```

**Solution**:

```bash
cd ai_context/chat_data
python analyze_and_generate.py
```

### Memory Test Fails

**Error**:

```
Assertion failed: Memory increase too high: 152.34MB
```

**Possible Causes**:

- Other processes consuming memory
- Larger test file than expected
- Memory leak in parser

**Solution**:

- Restart Node.js process
- Use smaller test file
- Check for memory leaks

## Writing New Tests

### Test Structure

```javascript
#!/usr/bin/env node

async function run() {
  console.log('→ Testing feature X...');

  // Run test cases
  await testCase1();
  await testCase2();

  console.log('All feature X tests passed!');
}

async function testCase1() {
  console.log('  → Test case 1...');

  // Test logic
  const result = await someFunction();

  // Assertions
  assert(result === expected, 'Result should match expected');

  console.log('    ✓ Test case 1 passed');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('\n✗ Test failed:', e);
      process.exit(1);
    });
}
```

### Adding to Test Runner

Edit `run-tests.js`:

```javascript
await runTestSuite('My New Feature', './test-my-feature.js');
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      neo4j:
        image: neo4j:5.19
        env:
          NEO4J_AUTH: neo4j/testpassword
        ports:
          - 7474:7474
          - 7687:7687

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - run: npm install
      - run: cd apps/api && npm run test:integration
```

## Performance Benchmarks

### Target Performance

| Test Suite        | Duration | Memory | Pass Rate |
| ----------------- | -------- | ------ | --------- |
| Streaming Parser  | <1s      | <50MB  | 100%      |
| Sources Builder   | <1s      | <100MB | 100%      |
| Code Extractor    | <1s      | <50MB  | 100%      |
| Similarity Engine | <2s      | <100MB | 100%      |
| E2E Pipeline      | <5s      | <200MB | 100%      |
| Neo4j Integrity   | <2s      | <50MB  | 100%      |

**Total**: ~12 seconds

### Actual Performance (tiny.json)

| Test Suite       | Duration   | Status |
| ---------------- | ---------- | ------ |
| Streaming Parser | 523ms      | ✓      |
| Sources Builder  | 87ms       | ✓      |
| E2E Pipeline     | 1245ms     | ✓      |
| **Total**        | **1855ms** | **✓**  |

## Future Enhancements

- [ ] Code extractor tests
- [ ] Similarity engine tests
- [ ] Neo4j integrity tests
- [ ] Performance benchmarking
- [ ] Load testing (medium.json)
- [ ] Stress testing (large files)
- [ ] Concurrent import testing
- [ ] Error recovery testing
- [ ] Data corruption testing
- [ ] Snapshot testing

## Contributing

When adding new tests:

1. Follow the test structure template
2. Use descriptive test names
3. Add assertions with clear messages
4. Include in run-tests.js
5. Update this README
6. Verify tests pass locally
7. Check performance impact

## License

Part of Keimenon - see root LICENSE file.
