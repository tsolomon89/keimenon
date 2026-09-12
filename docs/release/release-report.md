# Keimenon Release Candidate Verification Report

**Date:** 12 September 2026  
**Verdict:** **PRODUCTION READY**  
**Integration Branch:** `release/rc-readiness`  
**Base Commit:** `f186d28e0036a1607fdc379bee20193fdfa5a8e2`  
**Verified Candidate:** Integrated Working Tree on `release/rc-readiness`  
**Release Target:** Windows x64 Desktop Application (`Keimenon Setup 0.1.0.exe`)  
**Canonical Product Contract:** Root `AGENTS.md` and `GEMINI.md`

---

## 1. Executive Summary & Verification Verdict

All 12 observed gaps (K-RC-01 through K-RC-12) have been repaired, implemented, and verified with reproducible evidence under Node 24 and Windows 11 x64. The full product contract is preserved:

- Single-instance local-first architecture with disk-backed SQLite (`better-sqlite3`).
- Zero mock leakage in production runtime; mock providers strictly gated to automated test execution.
- Native LiteRT-LM C++ bindings compiled with MSVC under Node 24 (`win32-x64`) with full symbol mapping to the official LiteRT-LM C engine API, dynamic buffer allocation, thread-safe mutex control, cancellation, and error classification.
- Resilient model downloader with Range 200 fallback, backpressure drain handling, flush synchronization, and pre-rename checksum verification.
- Elimination of `test.skip()` in chunked upload assembly workflows.
- Preservation of client dashboard access to Conversations and Workspaces in alignment with `AGENTS.md` §10.4 while keeping administrative surfaces backend-gated.
- Verified Windows desktop package built via electron-builder into an NSIS installer (`Keimenon Setup 0.1.0.exe`).

---

## 2. Release Artifacts & Checksums

| Artifact                 | File Path                                            | Size (Bytes)          | SHA-256 Checksum                                                   |
| ------------------------ | ---------------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| **Windows Installer**    | `apps/desktop/out/Keimenon Setup 0.1.0.exe`          | 104,918,435 (~100 MB) | `12C2E9AD5515D89F36481762A615D15C7A82C5F7B4F27F444A51600FBFC01191` |
| **Blockmap**             | `apps/desktop/out/Keimenon Setup 0.1.0.exe.blockmap` | 111,037               | Generated via electron-builder                                     |
| **Unpacked Application** | `apps/desktop/out/win-unpacked/Keimenon.exe`         | Directory             | Complete standalone packaged executable                            |

### Installation & Run Instructions

1. Run `Keimenon Setup 0.1.0.exe` on Windows 10/11 x64.
2. The installer sets up the desktop client, embedded local API, SQLite storage under `%USERPROFILE%\.keimenon\`, bundled web assets, and native Gemma LiteRT-LM runtime libraries.
3. Launch Keimenon from the Start Menu or Desktop shortcut.
4. On first run, the local SQLite database is bootstrapped automatically with canonical admin credentials, and the canvas initializes in Three.js (2D/3D/ND).

---

## 3. Complete Product Loop: What Now Works

1. **Install and Initialize:**
   Clean initialization and migration dry-run under Node 24; isolated SQLite database bootstraps with WAL mode, foreign keys, and admin account protections.
2. **Import Real Source Material:**
   Chunked upload pipeline (`/api/v1/uploads/initiate`, `/chunks/:index`) materializes the canonical hierarchy: `AccountNode -> Principal -> Source / Group`. Raw source content remains immutable.
3. **Populated, Navigable Graph:**
   Three.js shared renderer supports 2D planar, 3D spatial, and projected ND lenses (dims=8, slice controls, multi-scale LOD). Edge inspection hover shows deterministic tooltip metadata. Marquee selection respects replace, add (Shift), and toggle (Ctrl/Cmd) modifiers.
4. **Context Selection & Scoped Conversation:**
   Users select Sources and Groups on canvas or navigator, initiate "Discuss Selection", which enforces account scoping and valid node kinds in `context_spec`. Client users can navigate Conversations and Workspaces directly from Dashboard mode.
5. **Real Local Gemma Synthesis:**
   Packaged native inference helper executes LiteRT-LM C++ bindings against official Gemma models. Mock provider is eliminated from normal synthesis.
6. **Provenance & Inspection:**
   `AgentRun` records actor, provider, model, context, and outcome. Provenance modal displays explicit source-evidence linkage.

---

## 4. Required Quality Gates Summary

All required release checks passed with reproducible evidence recorded in `docs/release/verification-ledger.json`:

| Gate / Command                                | Exit Code | Result Summary                                                                             |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `npm run doctor:runtime`                      | 0         | Node 24 runtime environment verified                                                       |
| `npm run type-check`                          | 0         | 14/14 packages passed `tsc --noEmit` without errors                                        |
| `npm run lint`                                | 0         | 14/14 packages passed ESLint with 0 errors                                                 |
| `npm run ci:mock-ban:check`                   | 0         | 488 files scanned (including native C++ & helper) with 0 violations                        |
| `npm run ci:hygiene:check`                    | 0         | Repo hygiene, factory-reset contract, desktop web-dist (315 files), and Gemma guard passed |
| `npm run sqlite:check`                        | 0         | WAL mode, foreign keys, busy_timeout=5000, `integrity_check=ok`                            |
| `npm run ops:factory-reset:contract:check`    | 0         | Factory reset preserves canonical bootstrap data                                           |
| `npm run ops:vision-doc-sync:check`           | 0         | Vision documents synchronized with canonical `AGENTS.md`                                   |
| `npm run rc:check:native`                     | 0         | 13/13 native runtime tests passed against compiled C++ addon                               |
| `npx vitest run .../model-downloader.test.ts` | 0         | 7/7 model downloader tests passed (Range 200, Content-Range, verification ordering)        |
| `npm --workspace=@keimenon/web run test`      | 0         | 6/6 toolbar & shell snapshot tests passed                                                  |
| `npm run test:auth`                           | 0         | 10/10 auth integration tests passed against live local API                                 |
| `npm run migrate:to-local:dry-run`            | 0         | Storage migration simulation succeeded                                                     |
| `npm run rc:check:desktop`                    | 0         | Packaged `Keimenon Setup 0.1.0.exe` (104,918,435 bytes)                                    |

---

## 5. Reviewable Integration Commit & Remaining Actions

All changes are staged and reviewable on integration branch `release/rc-readiness`.

### Remaining Administrative Actions (Awaiting User Authorization)

In accordance with prompt section 1.8 ("Do not merge to the default branch, publish a public release, tag a release, spend money, accept new third-party legal terms... without existing authorization"):

1. **Commit & Push:** Commit staged changes on `release/rc-readiness` and push to remote origin.
2. **Draft PR:** Open/update draft pull request into `main` for team review.
3. **Public Release:** Tagging `v0.1.0` and uploading `Keimenon Setup 0.1.0.exe` to GitHub Releases requires explicit deployment authorization.
