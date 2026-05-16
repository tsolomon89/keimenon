# Native Gemma Helper Process Contract

This document outlines the standard interface for the `keimenon-gemma-helper` binary that will execute locally via Node's `child_process.spawn`.

The communication protocol is JSON-RPC 2.0 over `stdio`. The Node.js parent process acts as the Client, and the native helper binary acts as the Server.

## Lifetime Management

- The parent process launches the helper binary.
- The binary listens continuously on `stdin` for JSON-RPC messages separated by newlines (`\n`).
- The binary writes JSON-RPC responses to `stdout`, separated by newlines.
- Errors or diagnostic logs meant for debugging should be written to `stderr`.
- If the parent process sends a `shutdown` command, or if the `stdin` pipe is closed, the binary must terminate gracefully.

## JSON-RPC 2.0 Methods

### 1. `status`

Returns the current health and loaded state of the engine.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "status",
  "id": 1
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "status": "ready", // or "error", "loading", "unsupported_hardware"
    "model_loaded": true,
    "model_id": "gemma-4-e2b-cpu"
  },
  "id": 1
}
```

### 2. `load_model`

Instructs the engine to load a model weight file into memory.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "load_model",
  "params": {
    "model_path": "C:/Users/name/AppData/Roaming/keimenon/models/gemma/gemma-4-e2b-cpu.task"
  },
  "id": 2
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true
  },
  "id": 2
}
```

### 3. `generate`

Requests a text completion or chat generation.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "generate",
  "params": {
    "prompt": "You are a helpful assistant.\nUser: Hello\nAssistant:",
    "max_tokens": 1000,
    "temperature": 0.7
  },
  "id": 3
}
```

**Response (Streaming via JSON-RPC Notifications or Final Output):**
_(TBD: Decide between full-response vs JSON-RPC streams. A standard approach is a single response containing the full text for simpler integrations first.)_

```json
{
  "jsonrpc": "2.0",
  "result": {
    "text": "Hello! How can I help you today?",
    "completion_tokens": 9,
    "prompt_tokens": 14
  },
  "id": 3
}
```

### 4. `shutdown`

Instructs the binary to unload models and exit gracefully.

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "shutdown",
  "id": 4
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "result": { "success": true },
  "id": 4
}
```

## Error Handling

Standard JSON-RPC error objects will be returned for invalid paths, out-of-memory errors, or unsupported hardware.

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Model not found at specified path"
  },
  "id": 2
}
```
