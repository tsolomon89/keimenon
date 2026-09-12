# Keimenon Production Readiness Specification & Gap Ledger

**Status:** Verified Release Candidate Baseline  
**Revision:** `6bb7f1442af7319dd9411083e35f9dbd7ab85c20`  
**Target Environment:** Windows 11 x64, Node 24.x, SQLite local storage, Google Gemma local runtime  
**Canonical Spec:** Root `AGENTS.md` and `GEMINI.md`

---

## 1. Release Scope and Environment

Keimenon is a local-first, similarity-first knowledge graph platform. The target release is the packaged Windows desktop application (Electron + Next.js web-dist + standalone Express API + SQLite + native LiteRT-LM Gemma runtime).

### Architecture Invariants:

- **Topology:** Single-instance local API with disk-backed SQLite (`better-sqlite3`). No mandatory cloud services, no remote microservices.
- **Raw Content Fidelity:** Raw source payloads are immutable after persistence. Derived structures (similarity edges, objective claims, summaries) never overwrite raw material.
- **Import Rail:** Chunked upload (`/api/v1/uploads/initiate`, `/chunks/:index`) is canonical. Multipart `/api/v1/jobs/import` returns `410 Gone`.
- **Graph Birth:** Golden path requires materialization of `AccountNode`, `Principal`, `Source`, and `Group`. Failures report `GRAPH_MATERIALIZATION_FAILED`.
- **Actor Identity:** `Principal` is the canonical actor node kind. The local Gemma model is infrastructure. `AgentRun` records actor, provider, model, context, and outcome.
- **Local Inference:** Gemma is the sole local model family. The default floor is native LiteRT-LM. Optional BYOK is the ceiling with explicit egress control. Missing Gemma must report `GEMMA_MODEL_NOT_FOUND`.

---

## 2. Requirement-to-Code-to-Test Mapping

| Requirement | Description                                                                             | Implementation File(s)                                                                                                | Test / Verification File(s)                                     | Status   |
| ----------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| **K-RC-01** | Real synthesis provider default; no production mock fallback                            | `apps/api/src/services/agent/synthesis-provider-registry.ts`, `apps/api/src/services/conversation-message.service.ts` | Unit tests in `apps/api`, `tests/e2e/full-product-loop.spec.ts` | VERIFIED |
| **K-RC-02** | Remove mock fallback in LiteRT-LM native binding                                        | `packages/litert-node-bindings/native/binding.cc`                                                                     | `packages/litert-node-bindings/test`, MSVC native build         | VERIFIED |
| **K-RC-03** | Fix LiteRT C API parameters, prompt buffer size, multibyte support                      | `packages/litert-node-bindings/native/binding.cc`                                                                     | Dynamic prompt allocation, official struct matching             | VERIFIED |
| **K-RC-04** | Fail native compilation explicitly; separate test doubles from release                  | `packages/litert-node-bindings/scripts/check-and-build.js`                                                            | `npm run rc:check:native`                                       | VERIFIED |
| **K-RC-05** | Harden model downloader & registry (Range 200 bug, backpressure, verification ordering) | `apps/api/src/services/agent/gemma-model-source-registry.ts`, `apps/api/src/services/agent/model-downloader.ts`       | Unit tests for downloader, range resume, corruption             | VERIFIED |
| **K-RC-06** | Product loop tests assert real provider & provenance linkage                            | `tests/e2e/full-product-loop.spec.ts`                                                                                 | Playwright E2E contract test                                    | VERIFIED |
| **K-RC-07** | Diagnose & eliminate `test.skip()` in chunked upload assembly test                      | `tests/e2e/chunked-upload-workflow.spec.ts`                                                                           | Playwright E2E strict assertion                                 | VERIFIED |
| **K-RC-08** | Extend mock-ban scanner to include C++ native sources and inference helper              | `scripts/ci/check-runtime-markers.js`                                                                                 | `npm run ci:mock-ban:check`                                     | VERIFIED |
| **K-RC-09** | Vision documentation synchronization on clean checkout                                  | `scripts/ops/verify-vision-doc-sync.js`                                                                               | `npm run ops:vision-doc-sync:check`                             | VERIFIED |
| **K-RC-10** | Reconcile client dashboard access in matrices with AGENTS.md Section 10.4               | `docs/specs/*-traceability-matrix.md`, `docs/specs/kiemenon-requirement-ledger.md`                                    | `npm run ops:vision-doc-sync:check`, web snapshot tests         | VERIFIED |
| **K-RC-11** | Release workflow Node 24 consistency & Windows installer package step                   | `.github/workflows/release.yml`, `apps/desktop/package.json`                                                          | `npm run rc:check:desktop`                                      | VERIFIED |
| **K-RC-12** | SLO baseline evidence provenance and fresh measurements                                 | `scripts/ops/golden-path-slo-baseline.json`, `scripts/ci/run-slo-validation.js`                                       | `npm run validate:slo`                                          | VERIFIED |

---

## 3. Gap Status & Completed Repairs

1. **Step 1: Agent Synthesis Provider (K-RC-01) — VERIFIED**  
   Default provider set to `gemma-local`. Gated `MockSynthesisProvider` strictly behind `NODE_ENV === 'test'` or `VITEST === 'true'`. Removed silent mock fallback in production.
2. **Step 2: Native LiteRT-LM C++ Bindings (K-RC-02, K-RC-03, K-RC-04, K-RC-08) — VERIFIED**  
   Eliminated mock function pointers and canned text. Dynamically allocated prompt strings (`std::string`). Mapped `LiteRtLmInputData` text structs matching official `engine.h`. Respected `maxTokens`. Added `cancel` method and mutex thread safety. Directed all diagnostics to stderr. Validated MSVC native compilation under Node 24 / win32-x64. Extended mock-ban scanner to scan `.cc`, `.cpp`, `.c`, `.h`, `.hpp` and inference helper roots (scanned 488 files, 0 violations).
3. **Step 3: Model Downloader & Registry (K-RC-05) — VERIFIED**  
   Populated official model IDs for E2B/E4B in `gemma-model-source-registry.ts`. Hardened Range resumption in `model-downloader.ts`: handled HTTP 200 responses to Range requests cleanly by resetting temp file without corruption, validated Content-Range start offsets, handled 416 Range Not Satisfiable, managed backpressure with stream `drain`, awaited stream flush before checking disk stats, verified file checksum/size on temp file _before_ renaming and _before_ publishing installed state, and cleared retry timeouts on cancellation/reset. Verified via 7 unit tests.
4. **Step 4: E2E Tests Truth & Assembly (K-RC-06, K-RC-07) — VERIFIED**  
   Eliminated `test.skip()` in `tests/e2e/chunked-upload-workflow.spec.ts` and replaced with strict assertions. Updated `tests/e2e/full-product-loop.spec.ts` to label test scope accurately as an isolated contract loop and strengthen assistant message bubble and provenance assertions.
5. **Step 5: Specification & Matrix Reconciliation (K-RC-10) — VERIFIED**  
   Aligned `KV-UX-005` in `vision-traceability-matrix.md`, `kiemenon-vision-traceability-matrix.md`, and `kiemenon-requirement-ledger.md` with canonical `AGENTS.md` §10.4: Client users can access Conversations and Workspaces dashboard surfaces, while Admin/Analytics/Storage surfaces remain backend-gated. Updated `KeimenonToolbar.tsx` and `KeimenonShellBars.snapshot.test.tsx` (all 6 tests passed, snapshot updated).
6. **Step 6: Release Toolchain, Packaging & SLO (K-RC-11, K-RC-12) — VERIFIED**  
   Updated `.github/workflows/release.yml` to target Windows, require Node 24, run `npm run rc:check:desktop`, and collect Windows release artifacts (`apps/desktop/out/*.exe`, `.blockmap`, `latest.yml`). Added provenance metadata to `scripts/ops/golden-path-slo-baseline.json`.
