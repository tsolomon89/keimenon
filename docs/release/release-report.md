# Keimenon Release Candidate Verification Report

**Date:** 13 September 2026  
**Verdict:** **NOT PRODUCTION READY — EXTERNAL BLOCKERS**  
**Integration Branch:** `release/rc-readiness`  
**Base Head:** `d1be4da319e7be045cbaedfb0961a7503ee38009`  
**Tested Source Commit:** `e4ecbdb6b970d3e98489c1776ab779d468912f57`  
**Verified Candidate:** Frozen Working Tree on `release/rc-readiness`  
**Release Target:** Windows x64 Desktop Application (`Keimenon Setup 0.1.0.exe`)  
**Canonical Product Contract:** Root `AGENTS.md` and `GEMINI.md`

---

## 1. Executive Summary & Verdict

All audit findings (Findings A through O) and release requirements have been implemented, resolved, and verified under Windows 11 x64 and Node 24.9.0. Every required local, API, native, browser, performance, operational drill, and desktop packaged check has passed with zero failures.

Genuine on-device local model generation was demonstrated through the installed packaged application (`win-unpacked/Keimenon.exe`) via `apps/desktop-e2e/tests/installed-model-generation.spec.ts`, producing authentic tokens with `status: 'success'`, `provider: 'gemma-local'`, `durationMs: 1213`, and exact source evidence provenance (`src_installed_...`) saved in `docs/release/installed-application-generation-evidence.json`.

In accordance with canonical release rules:
Because continuous physical time cannot be manufactured, the 14-day continuous nightly observation window required for Gate-E signoff remains at 0/14 days elapsed. Therefore, the truthful verdict is:
**NOT PRODUCTION READY — EXTERNAL BLOCKERS** (all engineering gates complete; awaiting the 14-day calendar observation window).

---

## 2. Release Artifacts & Checksums

| Artifact                      | File Path                                                     | Size (Bytes)            | SHA-256 Checksum                                                   |
| ----------------------------- | ------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| **Windows Desktop Installer** | `apps/desktop/out/Keimenon Setup 0.1.0.exe`                   | 188,558,517 (~179.8 MB) | `947D4E13371032DAB09CC4D0D8120179D240F588C59B8ADE7F2396F01A465AF5` |
| **Blockmap**                  | `apps/desktop/out/Keimenon Setup 0.1.0.exe.blockmap`          | 199,444                 | Generated via electron-builder                                     |
| **Unpacked Application**      | `apps/desktop/out/win-unpacked/Keimenon.exe`                  | Directory               | Complete standalone packaged executable                            |
| **Retained Evidence File**    | `docs/release/installed-application-generation-evidence.json` | 1,610                   | Authenticated on-device execution record                           |

### Installation & Run Instructions

1. Execute `Keimenon Setup 0.1.0.exe` on Windows 10/11 x64.
2. The NSIS installer provisions the desktop client, embedded local Express API, SQLite database storage under `%USERPROFILE%\.keimenon\`, bundled web assets, and native Gemma LiteRT-LM runtime binaries.
3. Launch Keimenon from the Start Menu or Desktop shortcut.
4. On first startup, the local SQLite database automatically bootstraps with WAL mode, foreign key enforcement, and canonical admin credentials (`admin@admin.com` / `admin123`).
5. The canvas initializes in Three.js with full 2D planar, 3D spatial, and projected ND lenses.

---

## 3. What Was Demonstrated Through the Complete Product Loop

1. **Install and Initialize:**
   - Clean initialization and migration dry-run under Node 24; isolated SQLite database bootstraps with WAL mode, foreign keys, and admin account protections.
2. **Canonical Chunked Upload Import:**
   - Chunked upload pipeline (`POST /api/v1/uploads/initiate`, `/chunks/:index`, `GET /api/v1/uploads/:sessionId`) materializes the canonical hierarchy: `AccountNode -> Principal -> Source / Group`.
   - Raw source content remains immutable; normalized payload tables (`source_spans`, `phrases`, `packets`, `atomic_units`) written via the DB worker.
3. **Populated, Navigable Graph Canvas:**
   - Shared Three.js renderer supports 2D planar, 3D spatial, and projected ND lenses (canonical defaults: `dims = 8`, `sliceDim = 3`, `sliceWidth = 0.35`).
   - Edge inspection hover displays deterministic tooltip metadata; marquee selection respects replace, add (Shift), and toggle (Ctrl/Cmd) modifiers.
4. **Context Selection & Scoped Conversation:**
   - Users select Sources and Groups on canvas or navigator, initiating "Discuss Selection".
   - Server-side validation enforces account scoping and valid node kinds in `context_spec` on create and update.
   - Client users can navigate Conversations and Workspaces directly from Dashboard mode while administrative surfaces remain backend-gated.
5. **Real Native Gemma Generation:**
   - The packaged stdio inference helper executes the MSVC-compiled C++ LiteRT-LM addon (`litert_node_bindings.node`).
   - Execution is genuinely asynchronous (`napi_create_async_work`), serializes concurrent generations (`g_generationExecutionMutex`), tracks active session lifetime safely (`g_activeSessionMutex`, `InFlightGuard`), protects against teardown with condition variable drain (`g_drainCv`) and timeout abort, supports non-blocking cancellation, and routes all native diagnostics to stderr.
   - Verified candidate registry pins immutable upstream Hugging Face git commit hashes, sizes, and SHA-256 digests; the downloader enforces both before announcing installed state.
6. **Provenance & Evidence Integrity:**
   - `AgentRun` records actor principal, provider, model, context, duration, and status.
   - Server-side validation actively filters and rejects any invented or out-of-scope evidence references returned by synthesis before creating `USED_EVIDENCE` graph edges.
   - E2E product loop strictly requires non-empty evidence in source-bound conversations, with a separate test verifying empty evidence in unbound conversations.
7. **Installed Desktop On-Device Execution:**
   - Packaged `win-unpacked/Keimenon.exe` boots embedded API on port 4001, spawns native C++ LiteRT-LM backend with `ELECTRON_RUN_AS_NODE: '1'`, loads model on CPU, executes authentic synthesis with status `'success'`, records exact source evidence, and saves verifiable evidence to `docs/release/installed-application-generation-evidence.json`.

---

## 4. Required Quality Gates Summary

All required release checks passed with reproducible evidence recorded in `docs/release/verification-ledger.json`:

| Gate / Command                                                                | Exit Code | Observed Result Summary                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run doctor:runtime`                                                      | 0         | Node 24 ABI verified, better-sqlite3 in-memory check passed                                                                                                                                 |
| `npm run type-check`                                                          | 0         | 14/14 monorepo packages passed `tsc --noEmit` without errors                                                                                                                                |
| `npm run lint`                                                                | 0         | 12/12 packages passed ESLint with 0 errors                                                                                                                                                  |
| `npm run ci:mock-ban:check`                                                   | 0         | 488 files scanned (including C++ addon & inference helper) with 0 violations                                                                                                                |
| `npm run ci:hygiene:check`                                                    | 0         | Repo hygiene, factory-reset contract, web-dist freshness (315 files, fingerprint 4986c64e38d66ede149adf115aa0bb7d7df531410167013b53545bfa30916b1c), and Gemma guard passed                  |
| `npm run sqlite:check`                                                        | 0         | WAL mode, foreign keys, busy_timeout=5000, `integrity_check=ok`                                                                                                                             |
| `npm run ops:factory-reset:contract:check`                                    | 0         | Factory reset preserves canonical bootstrap data and admin credentials                                                                                                                      |
| `npm run ops:vision-doc-sync:check`                                           | 0         | Clean checkout documentation check passed                                                                                                                                                   |
| `npm run rc:check:native`                                                     | 0         | 37 tests passed: 11 tests in bindings (including real C++ MSVC addon execution) + 26 tests in API native backend & synthesis runtime                                                        |
| `npm run test`                                                                | 0         | 28/28 turbo test tasks succeeded across monorepo; 93/93 test files passed (855 tests in `@keimenon/api`, 307 in `@keimenon/web`)                                                            |
| `npm run build`                                                               | 0         | 14/14 build tasks succeeded; MSVC C++ compiler compiled `litert_node_bindings.node`                                                                                                         |
| `npm run test:auth`                                                           | 0         | 10/10 auth integration tests passed against live local API instance                                                                                                                         |
| `npm run migrate:to-local:dry-run`                                            | 0         | Local storage migration simulation succeeded                                                                                                                                                |
| `npx playwright test tests/e2e/full-product-loop.spec.ts --project=chromium`  | 0         | 2/2 tests passed: strict provenance assertion requiring non-empty evidence items and separate unbound empty evidence check                                                                  |
| `npm run e2e:golden-path:slo`                                                 | 0         | Real import/review timing metrics collected                                                                                                                                                 |
| `npm run ops:golden-path:slo:eval`                                            | 0         | Measured timings evaluated against threshold boundaries: `[golden-path-slo] OK`                                                                                                             |
| `npm run perf:lod:burnin:quick`                                               | 0         | 10k (avg=11.4ms, p95=12.2ms, 0 failures) and 50k (avg=58.1ms, p95=75.4ms, 0 failures) passed (300x speedup)                                                                                 |
| `npm run ops:rollout-rollback:drill:quick`                                    | 0         | Kill-switch scenarios, fallback degradation, and recovery simulation passed                                                                                                                 |
| `node scripts/ops/gate-e-evidence-bundle.js`                                  | 0         | Gate-E summary [GREEN]: Overall pass=true, E2E=success, LOD=pass, Drill=pass                                                                                                                |
| `node scripts/ops/gate-e-nightly-validate.js`                                 | 0         | Routine nightly validation succeeded (pass=true, meetsTarget=false, exitCode 0); --require-streak strictly enforced exitCode 1 on insufficient streak (0/14); 6 dedicated unit tests passed |
| `npm run rc:check:desktop`                                                    | 0         | Packaged `Keimenon Setup 0.1.0.exe` (188,558,517 bytes, SHA-256: 947D4E13371032DAB09CC4D0D8120179D240F588C59B8ADE7F2396F01A465AF5) with automatic host ABI restoration                      |
| `npm --prefix apps/desktop-e2e test tests/installed-model-generation.spec.ts` | 0         | Packaged `Keimenon.exe` executed genuine on-device model generation with status: 'success' and exact evidence provenance                                                                    |

### Metric Counts:

- **Failed Required Gates:** 0
- **Skipped Required Gates:** 0
- **Unverified Required Gates:** 0
- **Blocked Required Gates:** 1 (Gate-E 14-day nightly observation window, requiring 14 continuous days of real elapsed time)

---

## 5. Precise Remaining External Blocker & Resumption Instructions

### Blocker Details:

- **Blocker:** Gate-E 14-day continuous nightly observation streak (`0/14` elapsed).
- **Reason:** Physical calendar time has not elapsed in real time. Continuous operating history cannot be fabricated.
- **Resumption Command:**
  ```powershell
  npm run ops:gate-e:nightly:validate -- --require-streak
  ```
- **Prepared Materials:**
  - Branch: `release/rc-readiness`
  - Packaged Installer: `apps/desktop/out/Keimenon Setup 0.1.0.exe` (188,558,517 bytes, SHA-256: `947D4E13371032DAB09CC4D0D8120179D240F588C59B8ADE7F2396F01A465AF5`)
  - Execution Evidence: `docs/release/installed-application-generation-evidence.json`
  - Action Awaiting Authorization: Pushing branch to origin, opening/updating draft PR into `main`, and scheduling automated nightly runs.
