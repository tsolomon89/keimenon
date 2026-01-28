# Code Extraction

**Automatic code block detection and extraction from AI conversations**

Keimenon can automatically detect, extract, and organize code blocks from your AI chat conversations, building a searchable code snippet library from your ChatGPT, Claude, and Gemini exports.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Supported Languages](#supported-languages)
- [Code Node Structure](#code-node-structure)
- [Deduplication](#deduplication)
- [API Usage](#api-usage)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What is Code Extraction?

Code extraction automatically scans your AI chat conversations and pulls out code blocks as standalone, searchable nodes in your knowledge graph.

**Without code extraction:**

```
Chat: "Python Tutorial" (contains 15 code examples buried in text)
└── Hard to find specific snippets later
```

**With code extraction:**

```
Chat: "Python Tutorial"
├── Code 1: fibonacci.py (Python function)
├── Code 2: quicksort.py (Sorting algorithm)
├── Code 3: api_client.py (HTTP requests)
└── ... 12 more code nodes
```

Each code block becomes a first-class node with:

- ✅ **Language detection** - Automatically identifies programming language
- ✅ **Syntax highlighting** - Ready for display
- ✅ **Source linking** - Tracks which conversation it came from
- ✅ **Deduplication** - Removes identical code across conversations
- ✅ **Searchability** - Query by language, size, or content

---

## How It Works

### Extraction Pipeline

````
1. Message Scanning
   ↓ Scan each message for code patterns

2. Code Detection
   ↓ Find fenced code blocks (```language) or indented code

3. Language Identification
   ↓ Detect programming language from fence tag or content analysis

4. Extraction
   ↓ Pull out code with metadata (language, length, parent message)

5. Deduplication (Optional)
   ↓ Compare with existing code blocks using SHA-256 hashing

6. Storage
   ↓ Create CodeBlock nodes linked to source messages

7. Indexing
   ↓ Add to full-text search index
````

### Detection Methods

**Fenced Code Blocks** (Primary method):

````markdown
```python
def hello():
    print("Hello, World!")
```
````

**Indented Code** (Fallback):

```
    def hello():
        print("Hello, World!")
```

**Inline Code** (Optional, if enabled):

```markdown
Use the `print()` function to output text.
```

---

## Configuration

### Basic Configuration

```json
{
  "export_code": true, // Enable code extraction
  "code_min_chars": 50, // Minimum code length (characters)
  "code_global_dedupe": true // Deduplicate across all conversations
}
```

### Advanced Configuration

```json
{
  "export_code": true,
  "code_min_chars": 30, // Lower threshold (extract more code)
  "code_max_chars": 10000, // Maximum code length
  "code_global_dedupe": true,
  "code_extract_inline": false, // Extract inline code (`code`)
  "code_languages": [], // Empty = all languages, or specify: ["python", "javascript"]
  "code_exclude_languages": ["txt", "plaintext"], // Languages to skip
  "code_require_language_tag": false, // Only extract if language is specified
  "code_normalize_whitespace": true, // Normalize for deduplication
  "code_preserve_comments": true, // Keep comments in extracted code
  "code_add_context": true // Include surrounding text as context
}
```

### Configuration Presets

**Minimal** (Extract obvious code only):

```json
{
  "export_code": true,
  "code_min_chars": 100,
  "code_global_dedupe": false
}
```

**Balanced** (Recommended):

```json
{
  "export_code": true,
  "code_min_chars": 50,
  "code_global_dedupe": true
}
```

**Maximum** (Extract everything):

```json
{
  "export_code": true,
  "code_min_chars": 20,
  "code_global_dedupe": true,
  "code_extract_inline": true,
  "code_add_context": true
}
```

---

## Supported Languages

### Automatically Detected

Code extraction automatically detects **70+ programming languages**:

**Popular Languages:**

- JavaScript, TypeScript, Python, Java, C, C++, C#
- Go, Rust, Ruby, PHP, Swift, Kotlin
- HTML, CSS, SCSS, SQL
- Bash, Shell, PowerShell
- JSON, YAML, XML, TOML

**Framework-Specific:**

- React (JSX), Vue, Angular
- Django, Flask (Python)
- Rails (Ruby)
- Next.js, Nuxt.js

**Markup & Config:**

- Markdown, AsciiDoc
- Dockerfile, Docker Compose
- Terraform, Ansible
- GraphQL, Protocol Buffers

**Data Science:**

- R, Julia, MATLAB
- Jupyter notebooks
- NumPy, Pandas syntax

### Language Mapping

Fence tags are normalized:

```
"js" → "javascript"
"ts" → "typescript"
"py" → "python"
"rb" → "ruby"
"sh" → "bash"
```

---

## Code Node Structure

### Node Properties

Each extracted code block becomes a `CodeBlock` node:

```typescript
{
  id: string;              // e.g., "code_abc123"
  kind: "CodeBlock";

  // Code Content
  content: string;         // The actual code
  language: string;        // Programming language
  fingerprint: string;     // SHA-256 hash for deduplication

  // Metadata
  char_count: number;      // Length in characters
  line_count: number;      // Number of lines
  has_comments: boolean;   // Contains comments

  // Context
  context?: string;        // Surrounding text from message
  parent_message_id: string;  // Source message
  conversation_id: string; // Source conversation

  // Timestamps
  created_at: number;
  updated_at: number;

  // Optional
  tags?: string[];         // User-added tags
  description?: string;    // Auto-generated or user-provided
}
```

### Edges

Code blocks are linked via edges:

```
Message --[CONTAINS]--> CodeBlock
CodeBlock --[EXTRACTED_FROM]--> Message
CodeBlock --[DUP_OF]--> CodeBlock  (if duplicate detected)
```

---

## Deduplication

### How Deduplication Works

1. **Normalization**: Code is normalized before hashing
   - Remove leading/trailing whitespace
   - Normalize line endings (CRLF → LF)
   - Optionally normalize indentation

2. **Hashing**: SHA-256 fingerprint calculated

3. **Comparison**: Check if fingerprint exists

4. **Action**:
   - **Match found**: Create `DUP_OF` edge instead of new node
   - **No match**: Create new CodeBlock node

### Example

**First occurrence** (ChatGPT export):

````python
```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```
````

→ Creates `code_001` with fingerprint `abc123...`

**Second occurrence** (Claude export):

````python
```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```
````

→ Fingerprint matches → Creates edge: `code_new --[DUP_OF]--> code_001`

### Benefits

- ✅ No duplicate storage of identical code
- ✅ Track code reuse across conversations
- ✅ See which AI generated which code
- ✅ Compare different implementations

---

## API Usage

### Extract During Import

```bash
curl -X POST http://localhost:4001/api/v1/import/enhanced \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@conversations.json" \
  -F 'config={"export_code":true,"code_min_chars":50,"code_global_dedupe":true}'
```

### Query Code Blocks

```bash
# Get all code blocks
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4001/api/v1/nodes?kind=CodeBlock"

# Get Python code blocks
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4001/api/v1/nodes?kind=CodeBlock&language=python"

# Get code blocks > 100 characters
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4001/api/v1/nodes?kind=CodeBlock&min_chars=100"
```

### Get Code Block Content

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4001/api/v1/content/code/:id"
```

**Response:**

```json
{
  "id": "code_abc123",
  "kind": "CodeBlock",
  "language": "python",
  "content": "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)",
  "char_count": 95,
  "line_count": 4,
  "parent_message_id": "msg_xyz789",
  "fingerprint": "abc123...",
  "created_at": 1697123456789
}
```

### Search Code

```bash
# Full-text search in code content
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4001/api/v1/search?q=fibonacci&kind=CodeBlock"
```

---

## Use Cases

### 1. Personal Code Library

Build a searchable library of all code examples from your AI conversations:

```bash
# Import all ChatGPT conversations with code extraction
curl -X POST .../import/enhanced \
  -F "files=@chatgpt.json" \
  -F 'config={"export_code":true,"code_min_chars":30}'

# Query by language
curl ".../nodes?kind=CodeBlock&language=python" > python_snippets.json
curl ".../nodes?kind=CodeBlock&language=javascript" > js_snippets.json
```

### 2. Code Comparison

Compare how different AIs solve the same problem:

```bash
# Find duplicate implementations
curl ".../edges?kind=DUP_OF"

# Compare responses from ChatGPT vs Claude
```

### 3. Learning Resource

Track your coding journey:

```bash
# See all React code learned over time
curl ".../nodes?kind=CodeBlock&language=jsx&sort=created_at"

# Export to markdown for review
curl ".../export/code?format=markdown"
```

### 4. Quick Reference

Search your personal code library:

```bash
# Find that regex pattern you always forget
curl ".../search?q=regex+email+validation&kind=CodeBlock"

# Find API client examples
curl ".../search?q=fetch+axios+request&kind=CodeBlock"
```

---

## Best Practices

### Configuration

**DO:**

- ✅ Start with `code_min_chars: 50` (balanced)
- ✅ Enable `code_global_dedupe: true` (save storage)
- ✅ Set realistic thresholds based on your needs

**DON'T:**

- ❌ Set `code_min_chars` too low (< 20) unless needed
- ❌ Extract inline code unless you need single-word variables
- ❌ Disable deduplication if you have many conversations

### Organization

1. **Tag extracted code**: Add tags for easier searching
2. **Add descriptions**: Explain what the code does
3. **Link to docs**: Add external documentation references
4. **Create collections**: Group related code blocks

### Maintenance

1. **Review duplicates**: Check if DUP_OF edges are correct
2. **Clean up test code**: Remove debug snippets
3. **Update descriptions**: Add context as you learn more
4. **Archive old code**: Mark deprecated code

---

## Troubleshooting

### No Code Blocks Extracted

**Problem**: Import completes but no code nodes created

**Possible Causes:**

1. `export_code` is `false`
2. All code blocks below `code_min_chars` threshold
3. Code not in proper markdown format
4. Language filter excluding your code

**Solutions:**

```bash
# Check config
cat config.json | jq .export_code

# Lower threshold
curl -F 'config={"export_code":true,"code_min_chars":20}' ...

# Remove language filters
curl -F 'config={"export_code":true,"code_languages":[]}' ...
```

### Too Many Small Snippets

**Problem**: Extracting tiny code fragments

**Solution:** Increase `code_min_chars`:

```json
{ "code_min_chars": 100 }
```

### Missing Language Detection

**Problem**: Code blocks showing as `unknown` language

**Cause:** No fence tag or unrecognized language

**Solution:**

1. Ensure code blocks use proper fence syntax with language
2. Add manual language tags to extracted code
3. Update language mapping configuration

### Deduplication Not Working

**Problem**: Identical code creating multiple nodes

**Possible Causes:**

1. `code_global_dedupe` is `false`
2. Code has minor whitespace differences
3. Different line endings (CRLF vs LF)

**Solutions:**

```json
{
  "code_global_dedupe": true,
  "code_normalize_whitespace": true
}
```

### Code Too Large

**Problem**: Code blocks exceed display limits

**Solution:** Set `code_max_chars`:

```json
{ "code_max_chars": 5000 }
```

---

## Related Documentation

- [Chat Import Guide](CHAT_IMPORT.md) - Complete import documentation
- [Grouping Engine](GROUPING_ENGINE.md) - How code is organized
- [Deduplication](DEDUPLICATION.md) - Deduplication algorithms
- [API Reference](../specifications/API_REFERENCE.md) - Complete API documentation

---

**Last Updated**: 2025-10-15
**Related Docs**: [Chat Import](CHAT_IMPORT.md) | [Grouping Engine](GROUPING_ENGINE.md) | [API Reference](../specifications/API_REFERENCE.md)
