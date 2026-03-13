# Provider Backbone Runbook (LiteLLM + SearXNG)

## Required environment

Production profile requires all of:

- `LITELLM_URL`
- `LITELLM_API_KEY`
- `SEARXNG_URL`

If any are missing, agent runtime initialization fails fast.

## Runtime health checks

1. Verify API readiness:
   - `GET /ready`
2. Verify agent runtime and provider status:
   - `GET /api/v1/agent/health`
3. Confirm required providers are available:
   - `tools` list must show `llm.available=true` and `web.available=true`.

## Failure behavior

- Provider-dependent task submission (`ANALYZE_SOURCE`, `VERIFY_SOURCE_CHAIN`, `VERIFY_TOPIC`) fails with:
  - HTTP `503`
  - `code: PROVIDER_UNAVAILABLE`
  - `taskType`, `providers`, and `retryable` metadata
- No synthetic artifacts are produced on provider-unavailable paths.

## Operator response

1. Validate env values are present and point to reachable hosts.
2. Check LiteLLM health endpoint at `${LITELLM_URL}/health`.
3. Check SearXNG health endpoint at `${SEARXNG_URL}/healthz` (or base URL).
4. Re-run `GET /api/v1/agent/health` until both providers report available.
