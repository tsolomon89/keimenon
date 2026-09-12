# Keimenon Release Candidate Verification Report

**Date:** 12 September 2026  
**Verdict:** **NOT PRODUCTION READY — EXTERNAL BLOCKERS**  
**Integration Branch:** `release/rc-readiness`  
**Audited Head:** `fc5050e0f46c764443fdb1042a70ad8052cc491e`  
**Tested Source Commit:** `d65ebcdcf9b6a71f8255a8da6350dd688b33623a`  
**Verified Candidate:** Frozen Working Tree on `release/rc-readiness`  
**Release Target:** Windows x64 Desktop Application (`Keimenon Setup 0.1.0.exe`)  
**Canonical Product Contract:** Root `AGENTS.md` and `GEMINI.md`

---

## 1. Executive Summary & Verdict

All 9 audit findings (Findings A through I) and 12 release gaps have been implemented, resolved, and verified under Windows 11 x64 and Node 24.9.0. Every required local, API, native, browser, and packaging check has passed with zero failures.

The engineering implementation is complete and verified. In accordance with the completion rule (Section 8 of prompt):
Because continuous physical time cannot be manufactured, the 14-day continuous nightly observation window required for Gate-E signoff remains at 0/14 days elapsed. Therefore, the honest verdict is:
**NOT PRODUCTION READY — EXTERNAL BLOCKERS** (all engineering gates complete; waiting on the 14-day calendar observation window).

---

## 2. Release Artifacts & Checksums

| Artifact                      | File Path                                            | Size (Bytes)            | SHA-256 Checksum                                                   |
| ----------------------------- | ---------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| **Windows Desktop Installer** | `apps/desktop/out/Keimenon Setup 0.1.0.exe`          | 104,976,940 (~100.1 MB) | `3946F71CF7270AB10505970DEA40911E28FBC16EE374962F15F1F0F9DE983A2B` |
| **Blockmap**                  | `apps/desktop/out/Keimenon Setup 0.1.0.exe.blockmap` | 111,040                 | Generated via electron-builder                                     |
| **Unpacked Application**      | `apps/desktop/out/win-unpacked/Keimenon.exe`         | Directory               | Complete standalone packaged executable                            |

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
   - Execution is genuinely asynchronous (`napi_create_async_work`), applies `maxTokens`, supports non-blocking cancellation via `g_activeSession`, and routes all native diagnostics to stderr.
   - Verified candidate registry pins exact expected sizes and SHA-256 digests; the downloader enforces both before announcing installed state.
6. **Provenance & Evidence Integrity:**
   - `AgentRun` records actor principal, provider, model, context, duration, and status.
   - Server-side validation actively filters and rejects any invented or out-of-scope evidence references returned by synthesis before creating `USED_EVIDENCE` graph edges.
   - Semantic UI test IDs (`user-message`, `assistant-message`, `message-bubble`, `message-content`, `view-provenance-button`) allow reliable browser interaction and verification.

---

## 4. Required Quality Gates Summary

All required release checks passed with reproducible evidence recorded in `docs/release/verification-ledger.json`:

| Gate / Command                               | Exit Code | Observed Result Summary                                                                                                              |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run doctor:runtime`                     | 0         | Node 24 ABI verified, better-sqlite3 in-memory check passed                                                                          |
| `npm run type-check`                         | 0         | 14/14 monorepo packages passed `tsc --noEmit` without errors                                                                         |
| `npm run lint`                               | 0         | 14/14 packages passed ESLint with 0 errors                                                                                           |
| `npm run ci:mock-ban:check`                  | 0         | 488 files scanned (including C++ addon & inference helper) with 0 violations                                                         |
| `npm run ci:hygiene:check`                   | 0         | Repo hygiene, factory-reset contract, web-dist freshness (315 files), and Gemma guard passed                                         |
| `npm run sqlite:check`                       | 0         | WAL mode, foreign keys, busy_timeout=5000, `integrity_check=ok`                                                                      |
| `npm run ops:factory-reset:contract:check`   | 0         | Factory reset preserves canonical bootstrap data and admin credentials                                                               |
| `npm run ops:vision-doc-sync:check`          | 0         | Clean checkout documentation check passed                                                                                            |
| `npm run rc:check:native`                    | 0         | 34 tests passed: 11 tests in bindings (including real C++ MSVC addon execution) + 23 tests in API native backend & synthesis runtime |
| `npm run test`                               | 0         | 28/28 turbo test tasks succeeded across monorepo; 93/93 test files passed (852 tests) in `@keimenon/api`                             |
| `npm run build`                              | 0         | 14/14 build tasks succeeded; MSVC C++ compiler compiled `litert_node_bindings.node`                                                  |
| `npm run test:auth`                          | 0         | 10/10 auth integration tests passed against live local API instance                                                                  |
| `npm run migrate:to-local:dry-run`           | 0         | Local storage migration simulation succeeded                                                                                         |
| `npm run rc:check`                           | 0         | 22/22 Playwright browser tests passed (visual, selection stack, chunked upload, full product loop)                                   |
| `npm run e2e:golden-path:slo`                | 0         | Real import/review timing metrics collected                                                                                          |
| `npm run ops:golden-path:slo:eval`           | 0         | Measured timings evaluated against threshold boundaries: `[golden-path-slo] OK`                                                      |
| `npm run perf:lod:burnin:quick`              | 0         | 10k (avg=188ms, p95=201ms, 0 failures) and 50k (avg=3076ms, p95=4756ms, 0 failures) passed                                           |
| `npm run ops:rollout-rollback:drill:quick`   | 0         | Kill-switch scenarios, fallback degradation, and recovery simulation passed                                                          |
| `npm run ops:gate-e:required-checks:sync`    | 0         | Required checks synchronized with Gate-E workflow                                                                                    |
| `node scripts/ops/gate-e-evidence-bundle.js` | 0         | Gate-E summary [GREEN]: Overall pass=true, E2E=success, LOD=pass, Drill=pass                                                         |
| `npm run rc:check:desktop`                   | 0         | Packaged `Keimenon Setup 0.1.0.exe` (104,976,940 bytes) with automatic host ABI restoration                                          |

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
  - Packaged Installer: `apps/desktop/out/Keimenon Setup 0.1.0.exe`
  - Action Awaiting Authorization: Pushing branch to origin, opening/updating draft PR into `main`, and scheduling automated nightly runs.
