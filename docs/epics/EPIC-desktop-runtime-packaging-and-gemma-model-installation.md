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

- Date: 2026-05-15
- Model source: Checked https://huggingface.co/google/gemma-4-e4b-it / Google Deepmind
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
  - `ollama` and `lms` CLI tools are not installed or recognized.
  - Ports 11434 (Ollama) and 1234 (LM Studio) refused connection.
- Remaining risks: We cannot test end-to-end integration without a valid live host.

### Required Manual Action

Please download and install a local runtime host such as Ollama (https://ollama.com/) or LM Studio (https://lmstudio.ai/), then download the Gemma 4 (or equivalent Gemma-family) model.

## Phase 9 — Tests

[x] Verified `type-check`, `build`, `sqlite:check`, and `gemma-runtime-status.test.ts`, `synthesis-runtime.test.ts`.

## Final report

Gemma 4 local install blocked.

1. preflight result: Passed all checks (`better-sqlite3` rebuilt, `type-check` ok, `build` ok, `sqlite:check` ok).
2. model source used: N/A (Checked Google Deepmind/Hugging Face requirements. Verified `google/gemma-4-E4B-it` and `gemma4:e4b` are official exact IDs)
3. exact Gemma 4 model ID: `gemma4:e4b` (Ollama) / `google/gemma-4-E4B-it` (Hugging Face)
4. model variant: N/A
5. local runtime endpoint: N/A (none reachable)
6. `/models` result: connection refused
7. `gemma:status` result: N/A
8. `gemma:smoke` result: N/A
9. desktop Gemma status result: N/A
10. desktop real-Gemma conversation result: N/A
11. AgentRun provider/model verified: no
12. docs updated: yes
13. commands run: `npm rebuild`, `npm run type-check`, `npm run build`, tests, etc., `Invoke-RestMethod` against ports 11434 and 1234, `ollama --version`, `lms --version`.
14. command results: CLI tools not found; connection refused on ports 11434/1234.
15. remaining risks: Cannot verify end-to-end real synthesis.
16. recommended next sprint: Complete manual download and installation of Ollama or LM Studio and run Gemma 4, then retry this sprint.
