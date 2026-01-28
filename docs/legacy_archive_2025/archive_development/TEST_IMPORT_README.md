# Import Test Script - Quick Start Guide

## 🎯 Purpose

The `test-import.js` script automatically tests the import system with real files, monitoring progress, timeouts, and performance metrics.

## 🚀 Quick Start

### Prerequisites

- API server running on `http://localhost:4001`
- Test files in `ai_context/chat_data/` directory

### Run a Test

```bash
# Test with small file (9.9MB - ~2 minutes)
node test-import.js small

# Test with medium file (136MB - ~5-10 minutes)
node test-import.js medium

# Test with large file (191MB - ~10-15 minutes)
node test-import.js large

# Test with extra large file (1.1GB - ~15-25 minutes)
node test-import.js xlarge
```

### Windows Batch Script

```bash
# Same as above, with automatic server health check
test-import.bat small
test-import.bat medium
test-import.bat large
```

## 📊 What the Script Does

1. **Authentication**
   - Attempts to login with test credentials
   - If login fails, registers a new test user
   - Returns auth token and account ID

2. **File Upload**
   - Uploads selected test file via multipart form data
   - Applies default import configuration
   - Reports upload time and created job ID

3. **Progress Monitoring**
   - Connects to SSE stream for real-time updates
   - Polls job status as backup (every 2 seconds)
   - Displays progress bar with percentage and stage
   - Shows heartbeat activity
   - Reports graph updates (nodes/edges created)

4. **Completion**
   - Detects job success, failure, or cancellation
   - Reports final statistics
   - Checks circuit breaker status
   - Exits with appropriate status code

## 📈 Output Explained

### Successful Run

```
================================================================================
🧪 Import Test - SMALL
================================================================================

================================================================================
🔐 Authentication
================================================================================
✅ Login successful

================================================================================
📤 File Upload
================================================================================
File: small.json
Size: 9.82 MB
Path: C:\...\small.json
⏳ Uploading file...
✅ Upload completed in 0s
Job ID: job_1761465737598_woxwob

================================================================================
📊 Monitoring Job Progress
================================================================================
📡 SSE connection established
[██████████████████████████░░░░░░░░░░░░░░░░░░░] 50% - Materializing... (1m 30s)
💓 Heartbeat (4 received)
📈 Graph update: +50 nodes, +100 edges
[████████████████████████████████████████████████] 100% - Succeeded (2m 15s)

================================================================================
✅ Import Completed
================================================================================
Duration: 2m 15s
Status: succeeded
Job ID: job_1761465737598_woxwob

Results:
  Conversations: 44
  Messages: 406
  Sources: 44
  Code Blocks: 156
  Duplicates for Review: 0

================================================================================
📋 Test Summary
================================================================================
Total Duration: 2m 15s
File: small (9.82 MB)
Status: SUCCESS
Job ID: job_1761465737598_woxwob
```

### Timeout Error (Expected Behavior)

```
================================================================================
❌ Import Failed
================================================================================
Total Duration: 20m 5s
Error: Import timed out after 1200s...

⏱️  This was a TIMEOUT error - the timeout system is working correctly!
You can increase the timeout by setting IMPORT_WORKER_TIMEOUT_MS higher.
```

### Circuit Breaker Opened

```
================================================================================
❌ Import Failed
================================================================================
Error: Circuit breaker is open after 3 consecutive failures...

⚠️  Circuit breaker is OPEN
   Dead letter queue: 15 items
```

## 🎨 Color Coding

- 🟢 **Green**: Success messages
- 🔵 **Cyan**: Information (file details, progress)
- 🟡 **Yellow**: Warnings
- 🔴 **Red**: Errors
- 🟣 **Magenta**: Graph updates
- 🟦 **Blue**: Heartbeats

## ⚙️ Configuration

### Test User Credentials

The script uses these credentials (auto-created if not exists):

```javascript
email: 'import-test@test.com';
password: 'Zm9$kL3#Qr2@Wv8!Nx6';
```

### API Endpoint

Default: `http://localhost:4001`

Override:

```bash
API_URL=http://example.com:4001 node test-import.js small
```

### Import Options

The script uses these default settings:

```javascript
{
  processingMode: 'automatic',
  extraction: {
    includeUser: true,
    includeAssistant: false,
  },
  duplicateDetection: {
    enabled: true,
    exactMatch: true,
    similarityThreshold: 0.85,
    requireReview: true,
    autoApproveExact: false,
  },
  codeSettings: {
    minLength: 50,
    deduplicate: true,
  },
  targetGroupCount: 25,
  minMessageLength: 400,
}
```

## 🐛 Troubleshooting

### Script Fails to Connect

**Error**: `ECONNREFUSED` or API health check fails

**Solution**: Ensure API server is running

```bash
cd apps/api
npm run dev
```

### EventSource Error

**Error**: `EventSource is not a constructor`

**Solution**: This is fixed in the latest version. Update `test-import.js` to use:

```javascript
const { EventSource } = require('eventsource');
```

### Authentication Failed

**Error**: `Invalid email or password` after registration

**Solution**: Delete the test user and let the script re-create:

```bash
# Via SQLite CLI
sqlite3 ~/.keimenon/keimenon.db "DELETE FROM users WHERE email='import-test@test.com';"
```

### Test Timeout

**Error**: `Test timeout after 30 minutes`

**Solution**: The script has a 30-minute hard timeout. For larger files:

1. Increase `IMPORT_WORKER_TIMEOUT_MS` in `apps/api/.env`
2. Or edit the script timeout on line ~320

## 📝 Test Files Reference

| Size Key | File                        | Size   | Est. Duration |
| -------- | --------------------------- | ------ | ------------- |
| `tiny`   | `test-samples/tiny.json`    | 1.4 KB | <5s           |
| `small`  | `test-samples/small.json`   | 9.9 MB | 1-3 min       |
| `medium` | `test-samples/medium.json`  | 136 MB | 5-10 min      |
| `large`  | `gpt_conversations.json`    | 191 MB | 10-15 min     |
| `xlarge` | `claude_conversations.json` | 1.1 GB | 15-25 min     |

## 🔧 Advanced Usage

### Run in Debug Mode

```bash
# Enable Node.js debugging
NODE_DEBUG=* node test-import.js small
```

### Save Output to File

```bash
node test-import.js medium 2>&1 | tee import-test-results.log
```

### Run Multiple Tests

```bash
# Test all sizes sequentially
for size in tiny small medium; do
  echo "Testing $size..."
  node test-import.js $size
  sleep 10
done
```

## 🎯 Success Criteria

The test is considered successful when:

- ✅ Upload completes without errors
- ✅ Job is created and dispatched
- ✅ SSE connection establishes
- ✅ Progress updates received (0% → 100%)
- ✅ Job status transitions to `succeeded`
- ✅ Final statistics are reported
- ✅ No circuit breaker activation
- ✅ No timeout errors

## 📚 Related Documentation

- [IMPORT_TIMEOUT_FIX_SUMMARY.md](IMPORT_TIMEOUT_FIX_SUMMARY.md) - Complete implementation details
- [apps/api/.env.example](apps/api/.env.example) - Timeout configuration reference
- [docs/IMPORT_SYSTEM_ARCHITECTURE.md](docs/IMPORT_SYSTEM_ARCHITECTURE.md) - System architecture

## 🆘 Need Help?

1. Check the API server logs: `tail -f apps/api/api-server.log`
2. Verify environment variables are set in `apps/api/.env`
3. Check circuit breaker status: `curl http://localhost:4001/api/v1/debug/queue/status`
4. Review [IMPORT_TIMEOUT_FIX_SUMMARY.md](IMPORT_TIMEOUT_FIX_SUMMARY.md) for troubleshooting
