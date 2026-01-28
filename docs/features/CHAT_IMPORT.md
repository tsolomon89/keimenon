# Chat Import Guide

**Complete guide to importing AI chat conversations into Keimenon**

**Supported Platforms**: ChatGPT, Claude, Gemini

---

## Table of Contents

1. [Overview](#overview)
2. [Exporting Your Chats](#exporting-your-chats)
3. [Import Methods](#import-methods)
4. [Configuration Options](#configuration-options)
5. [Sources Mode](#sources-mode-explained)
6. [Code Extraction](#code-extraction)
7. [Duplicate Detection](#duplicate-detection)
8. [Advanced Features](#advanced-features)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Overview

### What is Chat Import?

Keimenon can parse your AI chat conversation exports and transform them into an organized knowledge graph. Instead of scrolling through hundreds of chats, you get:

- 🗂️ **Organized nodes** - Each conversation becomes a node
- 📚 **Source extraction** - Meaningful segments extracted as standalone sources
- 💻 **Code blocks** - Automatically detected and extracted
- 🔍 **Duplicate detection** - Similar content identified and merged
- 📊 **Visual graph** - See relationships between conversations

### Use Cases

- **Code Library**: Extract all code snippets from your ChatGPT history
- **Research Organization**: Group related conversations by topic
- **Knowledge Base**: Transform chats into searchable documentation
- **Duplicate Cleanup**: Find and merge repeated questions/answers
- **Learning Journal**: Track your AI-assisted learning journey

---

## Exporting Your Chats

### ChatGPT (OpenAI)

**Format**: `conversations.json`

**Steps**:

1. Log in to ChatGPT (https://chat.openai.com)
2. Click your profile icon (bottom left)
3. Go to **Settings** → **Data controls**
4. Click **"Export data"**
5. Confirm your email
6. Wait for email (usually arrives in 5-10 minutes)
7. Download `conversations.json` from the link in email

**File Structure**:

```json
[
  {
    "title": "Python Async Tutorial",
    "create_time": 1699564800,
    "update_time": 1699568400,
    "mapping": {
      "id_1": {
        "message": {
          "role": "user",
          "content": "Explain async/await in Python"
        }
      },
      "id_2": {
        "message": {
          "role": "assistant",
          "content": "Async/await in Python..."
        }
      }
    }
  }
]
```

### Claude (Anthropic)

**Format**: `claude_conversations.json`

**Method 1: Official Export** (if available):

1. Log in to Claude (https://claude.ai)
2. Go to **Settings**
3. Look for **"Export conversations"** or **"Download data"**
4. Download the JSON file

**Method 2: Browser Extension**:

- Use a Claude export extension from Chrome Web Store
- Follow extension instructions to export

**File Structure**:

```json
[
  {
    "uuid": "conv_abc123",
    "name": "React Hooks Discussion",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T11:45:00Z",
    "chat_messages": [
      {
        "uuid": "msg_1",
        "text": "Explain useState",
        "sender": "human"
      },
      {
        "uuid": "msg_2",
        "text": "useState is a React Hook...",
        "sender": "assistant"
      }
    ]
  }
]
```

### Gemini (Google)

**Format**: `gemini_conversations.json` or similar

**Steps**:

1. Go to Google Account → Data & Privacy
2. Navigate to **"Download your data"**
3. Select **"Gemini"** or **"Bard"** (old name)
4. Choose JSON format
5. Click **"Create export"**
6. Download when ready

**Alternative**:

1. Go to Gemini Activity page
2. Look for export option
3. Download conversation history

---

## Import Methods

### Method 1: Web UI (Easiest)

1. Open Keimenon: http://localhost:3000/ingest
2. Click **"Upload File"** or drag & drop
3. Select your exported JSON file
4. Choose **"Import as Chat"**
5. (Optional) Click **"Configure"** to adjust settings
6. Click **"Start Import"**
7. Watch progress in real-time
8. View results when complete

### Method 2: Basic API Import

```bash
curl -X POST http://localhost:3001/api/v1/import/chat \
  -F "file=@conversations.json" \
  -F "config={}"
```

**Response**:

```json
{
  "success": true,
  "import_id": "imp_abc123",
  "stats": {
    "conversations_found": 42,
    "messages_processed": 856,
    "sources_created": 127,
    "code_blocks_extracted": 34,
    "duplicates_found": 8
  }
}
```

### Method 3: Enhanced Import (Recommended)

```bash
curl -X POST http://localhost:3001/api/v1/import/enhanced \
  -F "file=@conversations.json" \
  -F "config={
    \"export_code\": true,
    \"code_min_chars\": 50,
    \"code_global_dedupe\": true,
    \"duplicate_detection_enabled\": true,
    \"duplicate_similarity_threshold\": 0.85,
    \"sources_role_subset\": \"both\",
    \"sources_min_chars_user\": 400,
    \"sources_min_chars_assistant\": 400,
    \"sources_stitch_strategy\": \"by_chat\"
  }"
```

### Method 4: Background Job Import (Recommended for Large Files)

For files >50MB or to run in background:

```bash
curl -X POST http://localhost:3001/api/v1/import/job \
  -F "file=@large_conversations.json" \
  -F "config={...}"
```

**Progress Tracking**:
Connect to the Jobs SSE stream to receive real-time updates:
`GET /api/v1/stream/jobs?token=YOUR_TOKEN`

### Method 5: Batch Import

Import multiple files at once:

```bash
curl -X POST http://localhost:3001/api/v1/import/chat/batch \
  -F "files=@chatgpt_export.json" \
  -F "files=@claude_export.json" \
  -F "files=@gemini_export.json" \
  -F "config={...}"
```

---

## Configuration Options

### Complete Config Reference

```typescript
{
  // Sources Mode Configuration
  "sources_role_subset": "both" | "user" | "assistant",
    // Which messages to include
    // "both" = user + assistant (recommended)
    // "user" = only user messages
    // "assistant" = only assistant responses

  "sources_min_chars_user": 400,
    // Minimum characters for user messages to become sources
    // Lower = more sources but more noise
    // Higher = fewer but higher quality sources

  "sources_min_chars_assistant": 400,
    // Minimum characters for assistant responses

  "sources_stitch_strategy": "by_chat" | "by_title" | "by_topic",
    // How to group messages into sources
    // "by_chat" = one source per conversation (default)
    // "by_title" = group by conversation title similarity
    // "by_topic" = intelligent topic-based grouping

  "sources_preserve_chat_integrity": true,
    // Keep full conversations together vs splitting

  "sources_cap": 150,
    // Maximum number of sources to create per import

  "sources_export_format": "md" | "txt",
    // Format for exported sources

  // Code Extraction
  "export_code": true,
    // Enable automatic code block detection

  "code_min_chars": 50,
    // Minimum code length to extract

  "code_global_dedupe": true,
    // Deduplicate code across all conversations

  // Duplicate Detection
  "duplicate_detection_enabled": true,
    // Enable similarity comparison

  "duplicate_exact_match": false,
    // Require exact match (faster but less smart)

  "duplicate_similarity_threshold": 0.85,
    // 0.0 to 1.0 - higher = stricter matching
    // 0.95+ = nearly identical
    // 0.85 = recommended default
    // 0.70 = catch more variants

  "duplicate_cross_conversation": true,
    // Check across different conversations

  "duplicate_algorithm": "jaccard" | "levenshtein" | "cosine" | "embedding",
    // Similarity algorithm
    // "jaccard" = token overlap (fast, recommended)
    // "levenshtein" = edit distance (slower)
    // "cosine" = vector similarity (balanced)
    // "embedding" = semantic similarity (requires model)

  "duplicate_normalize_tokens": true,
    // Normalize text before comparison

  "duplicate_min_token_overlap": 5,
    // Minimum shared tokens for comparison

  "duplicate_length_ratio_tolerance": 0.2,
    // How different lengths can be (0.0-1.0)

  "duplicate_ignore_whitespace": true,
    // Ignore whitespace differences

  "duplicate_ignore_case": false,
    // Case-insensitive comparison

  "duplicate_ignore_timestamp": true,
    // Don't consider timestamps in comparison

  "duplicate_require_review": true,
    // Show decisions UI for manual review

  "duplicate_auto_approve_exact": false,
    // Auto-merge exact duplicates

  "duplicate_auto_merge_threshold": 0.95
    // Auto-merge above this threshold
}
```

### Preset Configurations

**Minimal (Fast, Simple)**:

```json
{
  "export_code": false,
  "duplicate_detection_enabled": false,
  "sources_stitch_strategy": "by_chat"
}
```

Use when: Quick import, small history, don't need deduplication

**Balanced (Recommended)**:

```json
{
  "export_code": true,
  "code_min_chars": 50,
  "duplicate_detection_enabled": true,
  "duplicate_similarity_threshold": 0.85,
  "sources_role_subset": "both",
  "sources_min_chars_user": 400,
  "sources_min_chars_assistant": 400
}
```

Use when: General purpose, good balance of features

**Maximum (Extract Everything)**:

```json
{
  "export_code": true,
  "code_min_chars": 20,
  "code_global_dedupe": true,
  "duplicate_detection_enabled": true,
  "duplicate_similarity_threshold": 0.75,
  "duplicate_cross_conversation": true,
  "sources_role_subset": "both",
  "sources_min_chars_user": 200,
  "sources_min_chars_assistant": 200,
  "sources_stitch_strategy": "by_topic",
  "sources_cap": 300
}
```

Use when: Comprehensive extraction, willing to review more duplicates

**Code-Focused**:

```json
{
  "export_code": true,
  "code_min_chars": 30,
  "code_global_dedupe": true,
  "sources_role_subset": "assistant",
  "sources_min_chars_assistant": 100,
  "duplicate_detection_enabled": true,
  "duplicate_algorithm": "jaccard"
}
```

Use when: Building code snippet library

---

## Sources Mode Explained

### What Are Sources?

Sources are meaningful, standalone pieces of content extracted from your conversations. Instead of storing entire chats, we identify valuable segments worth preserving.

### Why Extract Sources?

**Without Sources Mode**:

```
Chat: "Python Tutorial" (10,000 words)
├── User: "Explain classes"
├── Assistant: (500 word explanation)
├── User: "Now interfaces"
├── Assistant: (400 word explanation)
└── ... 20 more exchanges
```

Hard to find specific information later.

**With Sources Mode**:

```
Sources extracted:
├── "Python Classes Explained" (500 words)
├── "Python Interfaces" (400 words)
├── "Async/Await Tutorial" (600 words)
└── "Error Handling Best Practices" (350 words)
```

Each source is independently searchable and reusable.

### Stitching Strategies

**by_chat** (Default):

- One source per conversation
- Preserves full context
- Best for: Conversations that discuss a single topic

**by_title**:

- Groups by conversation title similarity
- Merges related chats
- Best for: Multiple chats on same topic ("React Hooks Part 1", "React Hooks Part 2")

**by_topic**:

- Intelligent topic detection
- Groups by semantic similarity
- Best for: Large imports where you want automatic organization

### Example: Stitching Comparison

**Input**: 3 conversations

1. "React useState"
2. "React Hooks useEffect"
3. "Python Async"

**by_chat** output:

- Source 1: "React useState" (full chat)
- Source 2: "React Hooks useEffect" (full chat)
- Source 3: "Python Async" (full chat)

**by_title** output:

- Source 1: "React Hooks" (combines 1 & 2)
- Source 2: "Python Async"

**by_topic** output:

- Source 1: "Frontend Development" (combines React chats)
- Source 2: "Python Programming"

---

## Code Extraction

### How It Works

1. **Detection**: Scans messages for code blocks (```) or indented code
2. **Language ID**: Identifies programming language
3. **Extraction**: Pulls out code with metadata
4. **Deduplication**: Removes identical code blocks
5. **Storage**: Saves as separate nodes linked to sources

### Example

**Input** (from assistant message):

````markdown
Here's a Python example:

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```

And here's the same in JavaScript:

```javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
```
````

**Output**: 2 code nodes created

- Code 1: `fibonacci.py` (Python)
- Code 2: `fibonacci.js` (JavaScript)

### Configuration

```json
{
  "export_code": true,
  "code_min_chars": 50, // Ignore tiny snippets
  "code_global_dedupe": true // Remove duplicates across all chats
}
```

### Benefits

- ✅ Never lose a code snippet again
- ✅ Build a personal code library
- ✅ Search by language
- ✅ Copy-paste ready
- ✅ Track where code came from

---

## Duplicate Detection

### Why Detect Duplicates?

You might ask the same question to multiple AIs or rephrase questions. Duplicate detection finds similar content so you can:

- Merge identical answers
- Compare different perspectives
- Clean up redundant content
- See evolution of your questions

### Algorithms

**Jaccard Similarity** (Recommended):

- Compares token overlap
- Fast and accurate
- Good for text comparison

```
Score = (shared_tokens) / (total_unique_tokens)
```

**Levenshtein Distance**:

- Edit distance between strings
- Slower but precise
- Good for small differences

```
Score = 1 - (edits_needed / max_length)
```

**Cosine Similarity**:

- Vector-based comparison
- Balanced speed/accuracy
- Good for semantic similarity

**Embedding** (Future):

- AI-powered semantic understanding
- Slowest but most intelligent
- Catches meaning, not just words

### Threshold Guide

| Threshold | Strictness  | Use Case                                   |
| --------- | ----------- | ------------------------------------------ |
| 0.95-1.0  | Very strict | Only nearly identical content              |
| 0.85-0.95 | Strict      | Recommended default                        |
| 0.75-0.85 | Moderate    | Catch more variants                        |
| 0.65-0.75 | Loose       | Find loosely related content               |
| <0.65     | Very loose  | Not recommended (too many false positives) |

### Example

**Message 1**: "Explain async/await in Python with examples"
**Message 2**: "Can you explain Python's async/await with some examples?"

**Jaccard Similarity**: 0.89 (high overlap)
**Decision**: Likely duplicate → Show in decisions UI

### Decisions UI

When duplicates are found, you'll see:

```
Potential Duplicate Found

Source A: "Python async/await tutorial"
Preview: "Async/await in Python allows..."
From: ChatGPT Export, 2024-01-15

Source B: "Async Python explanation"
Preview: "Python's async/await feature..."
From: Claude Export, 2024-01-20

Similarity: 0.87 (Jaccard)

Actions:
[ ] Keep Both (separate nodes)
[ ] Merge (combine into one)
[ ] Skip B (ignore duplicate)
```

---

## Advanced Features

### Batch Import with Different Configs

```bash
# Import ChatGPT with code extraction
curl -X POST .../import/enhanced \
  -F "file=@chatgpt.json" \
  -F "config={\"export_code\":true}"

# Import Claude focused on long explanations
curl -X POST .../import/enhanced \
  -F "file=@claude.json" \
  -F "config={\"sources_min_chars_assistant\":800}"
```

### Incremental Imports

Import new conversations without re-importing everything:

1. First import: All conversations
2. Later: Export only new chats
3. Import again: Duplicates detected automatically
4. Review: Merge or keep new versions

### Filter by Date Range

```json
{
  "date_filter": {
    "start": "2024-01-01",
    "end": "2024-06-30"
  }
}
```

### Custom Metadata

Add tags during import:

```json
{
  "metadata": {
    "source": "ChatGPT",
    "category": "Programming",
    "project": "React Refactor"
  }
}
```

---

## Troubleshooting

### Import Fails

**Error**: "Failed to parse JSON"
**Solution**: Validate your JSON file

```bash
cat conversations.json | jq . > /dev/null
```

**Error**: "File too large"
**Solution**: Use streaming import

```bash
curl -X POST .../import-stream -F "file=@large.json"
```

**Error**: "Out of memory"
**Solution**:

1. Use SQLite storage mode (more efficient)
2. Split file into smaller chunks
3. Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096 npm run dev`

### No Code Blocks Extracted

**Possible causes**:

1. `export_code` is `false`
2. `code_min_chars` threshold too high
3. Code not in proper markdown format
4. Code blocks too short

**Solution**: Lower threshold

```json
{ "code_min_chars": 20 }
```

### Too Many Duplicates

**Problem**: Duplicate detection is too aggressive

**Solution**: Increase threshold

```json
{ "duplicate_similarity_threshold": 0.92 }
```

### Not Enough Duplicates

**Problem**: Missing obvious duplicates

**Solution**:

1. Lower threshold: `0.75` instead of `0.85`
2. Enable cross-conversation: `"duplicate_cross_conversation": true`
3. Try different algorithm: `"cosine"` instead of `"jaccard"`

### Sources Too Short/Long

**Problem**: Sources are fragmented or too large

**Solution**: Adjust character limits

```json
{
  "sources_min_chars_assistant": 600, // Longer sources
  "sources_stitch_strategy": "by_chat" // Keep together
}
```

---

## Best Practices

### Before Import

1. **Clean your exports**: Remove test conversations if needed
2. **Validate JSON**: Ensure file is properly formatted
3. **Check file size**: Use streaming for >50MB files
4. **Plan your strategy**: Decide if you want aggressive deduplication

### During Import

1. **Start with defaults**: Don't over-configure first time
2. **Monitor progress**: Watch for errors in real-time
3. **Be patient**: Large imports take time
4. **Use streaming**: For files >100MB always use streaming

### After Import

1. **Review duplicates**: Check decisions UI carefully
2. **Browse keimenon**: Visually inspect organization
3. **Test search**: Verify sources are findable
4. **Export samples**: Generate docs from sources to verify quality
5. **Adjust and re-import**: If unhappy, tweak config and try again

### Optimal Configurations by Use Case

**Personal Knowledge Base**:

```json
{
  "export_code": true,
  "duplicate_similarity_threshold": 0.85,
  "sources_min_chars_user": 300,
  "sources_min_chars_assistant": 500,
  "sources_stitch_strategy": "by_topic"
}
```

**Code Snippet Library**:

```json
{
  "export_code": true,
  "code_min_chars": 30,
  "code_global_dedupe": true,
  "sources_role_subset": "assistant",
  "duplicate_detection_enabled": false
}
```

**Research Archive**:

```json
{
  "export_code": false,
  "duplicate_similarity_threshold": 0.9,
  "sources_min_chars_assistant": 800,
  "sources_stitch_strategy": "by_title",
  "duplicate_cross_conversation": true
}
```

---

## FAQ

**Q: Can I import the same file twice?**
A: Yes! Duplicates will be detected. Use decisions UI to merge or keep separate.

**Q: How long does import take?**
A: Depends on size. ~100 conversations = 1-2 minutes. ~1000 conversations = 10-15 minutes.

**Q: Does it work offline?**
A: Yes! With SQLite mode, everything runs locally.

**Q: Can I undo an import?**
A: Not yet. Best practice: Backup database before large imports.

**Q: What if my platform isn't supported?**
A: Generic parser handles most JSON formats. Open an issue for specific support.

**Q: Can I edit sources after import?**
A: Yes! Use the content API or UI to modify sources.

**Q: How much storage do I need?**
A: Rule of thumb: 1000 conversations ≈ 50-100MB

---

## Next Steps

- ✅ Import your chats using this guide
- 📊 Explore the keimenon visualization
- 📝 Generate UnifiedDocs from sources
- 🔍 Use duplicate detection to clean up
- 📚 Build your personal knowledge graph

**Happy importing!** 🚀

For more help, see:

- [QUICK_START.md](QUICK_START.md) - Basic setup
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Feature overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical details
