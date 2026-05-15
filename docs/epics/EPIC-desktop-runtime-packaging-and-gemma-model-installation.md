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

Pending execution...

## Phase 9 — Tests

Pending execution...

## Final report

Pending execution...
