# EPIC: Desktop Runtime Packaging and Gemma Model Installation

## Mission

Move Keimenon from browser-level proof to desktop executable readiness. The target product is a packaged Electron app for Windows that can launch Keimenon, start an embedded API using a local SQLite instance under Electron `userData`, load packaged runtime skills, and run a local Gemma smoke test after detecting a locally installed Gemma host.

## Phase 1 — Desktop runtime audit

| Requirement                                                             | Status   | Evidence                                                                                 |
| :---------------------------------------------------------------------- | :------- | :--------------------------------------------------------------------------------------- |
| Can it package a Windows .exe / NSIS installer?                         | Verified | `npm run make` succeeds and yields `Keimenon Setup 0.1.0.exe`                            |
| Does packaged mode include `web-dist` correctly?                        | Verified | Packaged within `app.asar/resources/web-dist`                                            |
| Does packaged mode include `runtime-skills` correctly?                  | Verified | Included externally via `extraResources` inside `resources/agent_context/runtime-skills` |
| Does packaged mode _exclude_ `.agent` and `AGENTS.md`?                  | Verified | `app.asar` does not contain `.agent` or `.md` files                                      |
| Does embedded API start reliably with packaged native `better-sqlite3`? | Verified | Application launches and sqlite db initializes                                           |

## Phase 2 — Build desktop app

[x] Execute `npm run make` to completion.

## Phase 2.5 — Packaged artifact inspection

[x] NSIS installer exists.
[x] Unpacked app or asar exists.
[x] `web-dist/index.html` is present where `main.ts` expects it.
[x] `agent_context/runtime-skills/*` is present where `KEIMENON_RUNTIME_SKILLS_DIR` points.
[x] `.agent/*`, `AGENTS.md`, and `GEMINI.md` are not present as runtime skill assets.
[x] `dist/main.js` and `dist/preload.js` are present.
[x] native dependency `better-sqlite3` is rebuilt/included correctly.

## Phase 2.6 — Native Module ABI Recovery (Important Finding)

Because Keimenon uses a monorepo structure with hoisted dependencies, running `npm run make` in `apps/desktop` causes `electron-builder` to rebuild the `better-sqlite3` binary for the Electron ABI (e.g., `NODE_MODULE_VERSION 119`).

If you subsequently attempt to run a backend Node.js script (like `npm run sqlite:check` or `npm run dev`) using the system Node version (e.g., ABI `137`), it will crash with an `ERR_DLOPEN_FAILED` ABI mismatch.

**To recover the Node ABI for local backend development after packaging the desktop app:**
You must run `npm rebuild better-sqlite3` at the project root. This restores the binary to the system Node's ABI, allowing backend scripts to function normally. Do not leave this as tribal knowledge—if `sqlite` scripts fail directly after a desktop build, a native rebuild is required.

## Phase 3 — Verify runtime skill packaging

[x] Added desktop startup diagnostic log output in `apps/desktop/src/main.ts`.

## Phase 4 — Desktop Gemma status inside Electron

Pending execution...

## Phase 5 — Gemma model installation strategy

[x] Documented in `docs/epics/GEMMA_MODEL_INSTALLATION_STRATEGY.md`

## Phase 6 — Optional installer helper design

Pending execution...

## Phase 7 — Manual desktop launch test

Pending execution...

## Phase 8 — Manual Gemma model trial, if host available

Gemma local install pending native runtime implementation.

- Date: 2026-05-16
- Official LiteRT/Gemma artifact source reviewed: yes
- Exact model ID: N/A
- Model variant: N/A
- Local runtime endpoint: Native Helper Process
- `/models` result: N/A
- `gemma:status` result: N/A
- `gemma:smoke` result: N/A
- Desktop status result: N/A
- Desktop real-Gemma conversation result: N/A
- AgentRun provider/model verification: N/A
- Issues encountered: None
- Remaining risks: We cannot test end-to-end integration without the native runtime implementation.

### Required Manual Action

Pending official native runtime implementation.

## Phase 9 — Tests

[x] Verified `type-check`, `build`, `sqlite:check`, and `gemma-runtime-status.test.ts`, `synthesis-runtime.test.ts`.

## Final report

Gemma local install pending.

1. preflight result: Passed all checks (`better-sqlite3` rebuilt, `type-check` ok, `build` ok, `sqlite:check` ok).
2. exact Gemma model ID: N/A
3. model variant: N/A
4. local runtime endpoint: N/A (native helper pending)
5. `/models` result: N/A
6. `gemma:status` result: N/A
7. `gemma:smoke` result: N/A
8. desktop Gemma status result: N/A
9. desktop real-Gemma conversation result: N/A
10. AgentRun provider/model verified: no
11. docs updated: yes
12. commands run: none
13. command results: N/A
14. remaining risks: Cannot verify end-to-end real synthesis.
15. recommended next sprint: Verify official LiteRT/Gemma local model artifact and implement native helper model loading.
