# Keimenon Production Readiness Specification & Gap Ledger

**Status:** Verified Candidate Baseline (Pre-Live External Blocker: Gate-E Observation Streak)  
**Base Head:** `fc5050e0f46c764443fdb1042a70ad8052cc491e`  
**Tested Source Commit:** `d65ebcdcf9b6a71f8255a8da6350dd688b33623a`  
**Integration Branch:** `release/rc-readiness`  
**Target Platform:** Windows 11 x64, Node 24.x, SQLite WAL local storage, Google Gemma local runtime  
**Canonical Spec:** Root `AGENTS.md` and `GEMINI.md`

---

## 1. Release Scope and Environment

Keimenon is a local-first, similarity-first knowledge graph platform. The target release is the packaged Windows desktop application (`Keimenon Setup 0.1.0.exe`) embedding:

- Electron 28 desktop shell
- Bundled Next.js 14 static web distribution (`resources/web-dist`)
- Standalone Express local API with disk-backed SQLite (`better-sqlite3` in WAL mode)
- Native LiteRT-LM C++ bindings compiled with MSVC x64
- Packaged stdio inference helper executing local Gemma models

### Architectural Invariants:

- **Local Ownership:** Single-instance local API with disk-backed SQLite (`better-sqlite3`). No mandatory external cloud services.
- **Raw Content Fidelity:** Raw source payloads remain exact and immutable after persistence. Derived structures (similarity edges, objective claims, summaries) never overwrite raw material.
- **Canonical Import Rail:** Chunked upload (`POST /api/v1/uploads/initiate`, `/chunks/:index`, `GET /api/v1/uploads/:sessionId`) is the only supported rail. Multipart `/api/v1/jobs/import` returns `410 Gone`.
- **Golden Path Hierarchy:** Materialization requires non-empty `AccountNode -> Principal -> Source / Group` structure.
- **Actor Identity:** `Principal` is the canonical actor node kind. AI is a user-like actor. The Gemma model is infrastructure. `AgentRun` records actor, provider, model, context, and outcome.
- **Native Local Floor:** Gemma is the only supported local model family. The default floor is native LiteRT-LM. Optional developer endpoint is strictly explicit and requires exact Gemma family model ID.

---

## 2. Requirement-to-Code-to-Test Mapping

| ID            | Title                                                        | Implementation File(s)                                                                                                                                          | Verification / Test File(s)                                                                                                                    | Status   |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **FINDING-A** | Connect conversation synthesis to real native generation     | `apps/inference-helper/src/index.ts`, `apps/api/src/services/agent/native-gemma-runtime-backend.ts`, `apps/api/src/services/agent/gemma-local-provider.ts`      | `apps/api/src/__tests__/synthesis-runtime.test.ts`, `apps/api/src/services/agent/__tests__/native-gemma-runtime-backend.test.ts`               | VERIFIED |
| **FINDING-B** | Make native execution genuinely asynchronous and cancellable | `packages/litert-node-bindings/native/binding.cc`, `apps/inference-helper/src/litert-adapter.ts`                                                                | `packages/litert-node-bindings/src/__tests__/native-addon-integration.test.ts`, `packages/litert-node-bindings/src/__tests__/index.test.ts`    | VERIFIED |
| **FINDING-C** | Separate native unit tests from actual runtime acceptance    | `packages/litert-node-bindings/src/__tests__/native-addon-integration.test.ts`, `package.json`                                                                  | `npm run rc:check:native` (34 tests including real C++ MSVC addon execution)                                                                   | VERIFIED |
| **FINDING-D** | Make native release compilation mandatory and reproducible   | `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `packages/litert-node-bindings/scripts/check-and-build.js`                                         | Full MSVC compilation in `npm run build`, `npm run rc:check:desktop`                                                                           | VERIFIED |
| **FINDING-E** | Fix documentation gate on clean checkout                     | `.gitignore`, `agent_context/AGENTS.md`, `agent_context/vision_gap_analysis.md`                                                                                 | `node scripts/ops/verify-vision-doc-sync.js` (clean checkout pass)                                                                             | VERIFIED |
| **FINDING-F** | Enforce model identity and integrity before usable state     | `apps/api/src/services/agent/gemma-model-source-registry.ts`, `apps/api/src/services/agent/model-downloader.ts`, `apps/api/src/services/agent/model-manager.ts` | `apps/api/src/services/agent/__tests__/model-downloader.test.ts` (8/8 unit tests)                                                              | VERIFIED |
| **FINDING-G** | Prove actual product loop and provenance                     | `apps/web/src/components/conversations/ConversationMessageRuntime.tsx`, `apps/api/src/services/conversation-message.service.ts`                                 | `tests/e2e/full-product-loop.spec.ts`, `apps/api/src/__tests__/synthesis-runtime.test.ts`                                                      | VERIFIED |
| **FINDING-H** | Replace unsupported release evidence with observed results   | `docs/release/verification-ledger.json`, `docs/release/release-report.md`                                                                                       | Freshly hashed Windows installer, raw test logs, observed exit codes                                                                           | VERIFIED |
| **FINDING-I** | Establish genuine performance and operational evidence       | `scripts/ops/golden-path-slo-baseline.json`, `scripts/ops/evaluate-golden-path-slo.js`, `apps/web/src/lib/graph-lod.ts`                                         | `npm run e2e:golden-path:slo`, `npm run ops:golden-path:slo:eval`, `npm run perf:lod:burnin:quick`, `npm run ops:rollout-rollback:drill:quick` | VERIFIED |

---

## 3. Detailed Verification Results

1. **Native Synthesis Pipeline (Finding A):**
   - Direct stdio JSON-RPC connection implemented between `NativeGemmaRuntimeBackend`, `inference-helper`, and `GemmaLocalProvider`.
   - Bounded synthesis context packs serialized into Gemma chat template format.
   - Verified via `synthesis-runtime.test.ts` (10 tests passing) and `native-gemma-runtime-backend.test.ts` (4 tests passing).
2. **Asynchronous Cancellable C++ Addon (Finding B):**
   - Replaced synchronous mutex-holding execution with Node-API `napi_create_async_work`.
   - Added atomic session tracking (`std::atomic<LiteRtLmSession*> g_activeSession`) allowing non-blocking `cancel()` invocation.
   - Dynamic prompt allocation and token limit application via official LiteRT-LM C engine API.
3. **Native Release Compilation & Acceptance Gate (Findings C & D):**
   - Created `packages/litert-node-bindings/src/__tests__/native-addon-integration.test.ts` directly loading the compiled MSVC addon binary.
   - Updated `rc:check:native` script to require both binding tests and API backend tests. All 34 tests pass.
   - Release workflows enforce `RELEASE_BUILD: '1'`, `KEIMENON_REQUIRE_NATIVE_BUILD: '1'`, and `CI_NATIVE: 'true'`.
4. **Documentation Sync Gate (Finding E):**
   - Unignored and restored tracked `agent_context/AGENTS.md` and `agent_context/vision_gap_analysis.md`.
   - `npm run ops:vision-doc-sync:check` passes with exit code 0 on clean checkouts.
5. **Model Registry & Downloader Hardening (Finding F):**
   - Pinned exact sizes and SHA-256 checksums for official LiteRT-LM Gemma candidates (`gemma-4-e2b-it-litert` and `gemma-4-e4b-it-litert`).
   - Downloader strictly requires both size and checksum matches before setting `artifact_verified: true`.
   - Range 200 fallback, backpressure drain handling, flush synchronization, and cleanup verified via 8 tests.
6. **Provenance Integrity & UI Locators (Finding G):**
   - Added semantic `data-testid` locators (`user-message`, `assistant-message`, `message-bubble`, `message-content`, `view-provenance-button`) in `ConversationMessageRuntime.tsx`.
   - `ConversationMessageService` validates all evidence references from synthesis against bounded context pack; out-of-scope references are actively rejected before creating `USED_EVIDENCE` edges.
   - Full product loop browser test passes without route interception.
7. **Operational Evidence & Performance (Finding I):**
   - SLO baseline records configured threshold boundaries without fabricated historical runs. Fresh timings evaluated via `ops:golden-path:slo:eval`.
   - LOD burn-in passes 10k (avg=188ms, p95=201ms, 0 gate failures) and 50k (avg=3076ms, p95=4756ms, 0 gate failures).
   - Rollout/rollback drill passes with kill-switch verification and degraded fallback handling.
   - Gate-E evidence bundle generated with `Overall pass: true` (status: GREEN).
8. **Windows Desktop Packaging (Finding H):**
   - Full packaging command `npm run rc:check:desktop` succeeded with exit code 0.
   - Packaged installer: `apps/desktop/out/Keimenon Setup 0.1.0.exe` (104,976,940 bytes, SHA-256: `3946F71CF7270AB10505970DEA40911E28FBC16EE374962F15F1F0F9DE983A2B`).
   - Host Node 24 ABI automatically restored post-packaging via `npm rebuild better-sqlite3`.

---

## 4. Remaining External Blocker

- **Requirement:** 14-day continuous nightly observation streak for Gate-E signoff.
- **Current State:** 0/14 days elapsed.
- **Nature of Blocker:** In pre-live development, continuous calendar time cannot be manufactured or simulated without violating evidence integrity rules.
- **Action Required:** Run nightly automation until the 14-day window completes.
