# Integration Tests

End-to-end integration tests for the API import pipeline on local SQLite storage.

## Scope

These suites validate:

1. Streaming JSON parsing
2. Source construction and code extraction
3. Similarity and duplicate detection behavior
4. End-to-end import flow

## Prerequisites

1. Start the API server in test/dev mode.

```bash
npm run dev
```

2. Ensure test samples exist in `ai_context/chat_data/test-samples/`.

Required files:

- `tiny.json`
- `small.json`
- `medium.json` (optional for heavier checks)

## Run

Run all integration suites:

```bash
cd apps/api
node tests/integration/run-tests.js
```

Run an individual suite:

```bash
cd apps/api
node tests/integration/test-e2e-pipeline.js
```

## Notes

- Tests are local-storage only.
- If a fixture is missing, the relevant suite may skip or fallback to `small.json`.
- Keep `NODE_ENV=test` for deterministic behavior.
