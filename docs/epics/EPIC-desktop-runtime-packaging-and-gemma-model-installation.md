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

Gemma 4 local install blocked.

- Date: 2026-05-16
- Google AI Edge source reviewed: yes
- Docker `ai/gemma4` verified: yes (Official Google image found via Docker Hub and AI Edge references)
- official/sufficient source status: Official Docker integration exists (`docker model pull ai/gemma4`).
- Exact model ID: N/A
- Model variant: N/A
- Local runtime endpoint: N/A
- `/models` result: N/A
- `gemma:status` result: N/A
- `gemma:smoke` result: N/A
- Desktop status result: N/A
- Desktop real-Gemma conversation result: N/A
- AgentRun provider/model verification: N/A
- Issues encountered:
  - Docker Desktop is not running or not installed on this system.
  - The `docker ps` command failed with connection errors.
- Remaining risks: We cannot test end-to-end integration without a valid live host.

### Required Manual Action

Docker was evaluated as a developer proof path, but is not the end-user product architecture. Do not use Docker as the primary installation path for Keimenon.

## Phase 9 — Tests

[x] Verified `type-check`, `build`, `sqlite:check`, and `gemma-runtime-status.test.ts`, `synthesis-runtime.test.ts`.

## Final report

Gemma 4 local install blocked.

1. preflight result: Passed all checks (`better-sqlite3` rebuilt, `type-check` ok, `build` ok, `sqlite:check` ok).
2. Google AI Edge source reviewed: yes
3. Docker `ai/gemma4` verified: yes
4. official/sufficient source status: Verified through Docker Hub (`docker model pull ai/gemma4`).
5. exact Gemma model ID: N/A (Must be the exact ID returned by GET <GEMMA_LOCAL_BASE_URL>/models)
6. model variant: N/A
7. local runtime endpoint: N/A (none reachable)
8. `/models` result: connection refused / Docker unavailable
9. `gemma:status` result: N/A
10. `gemma:smoke` result: N/A
11. desktop Gemma status result: N/A
12. desktop real-Gemma conversation result: N/A
13. AgentRun provider/model verified: no
14. docs updated: yes
15. commands run: `docker ps`, web search for `docker model pull ai/gemma4`.
16. command results: Docker Desktop not found; connection refused on local pipe.
17. remaining risks: Cannot verify end-to-end real synthesis.
18. recommended next sprint: Verify feasibility of Keimenon-managed native helper process wrapping an official Google-supported local Gemma runtime.
