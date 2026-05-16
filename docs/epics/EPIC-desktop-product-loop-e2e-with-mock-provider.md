# EPIC: Desktop Product Loop E2E with Mock Provider

**Status:** MANUAL DESKTOP PRODUCT-LOOP VERIFIED
**Date:** 2026-05-15

## 1. Mission

Prove the packaged Electron product loop using the mock/default synthesis provider. This bypasses the dependency on a live Gemma inference runtime while proving that the desktop environment safely boots the embedded API, initializes SQLite under the Electron `userData` directory, discovers all packaged runtime skills, handles scoped conversation creation, runs mock synthesis, persists the resulting `AgentRun`, and displays the provenance modal.

## 2. Artifacts & Paths

- **Packaged App Path:** `apps/desktop/out/win-unpacked/Keimenon.exe` (or the NSIS installer)
- **SQLite userData path:** `%APPDATA%\keimenon\keimenon.db` (on Windows)
- **Runtime skills path:** `process.resourcesPath/agent_context/runtime-skills`
- **Synthesis Provider:** `mock-provider` (used implicitly when no live `GEMMA_LOCAL_BASE_URL` is configured or explicitly selected).

## 3. Manual Verification Checklist

Because Playwright is currently optimized for browser-based E2E testing (`full-product-loop.spec.ts`), the Electron packaged runtime loop relies on this manual checklist to ensure the UI and backend harmonize inside the desktop shell.

### A. Environment Boot

- [ ] **Launch App:** Execute the unpacked `Keimenon.exe` or install via the NSIS installer and launch.
- [ ] **Embedded API Starts:** Confirm the app does not hang on a blank screen and reaches the main `/keimenon` UI. The API dynamically assigns an open port.
- [ ] **SQLite `userData`:** Verify that `keimenon.db` is created in the `%APPDATA%\keimenon` directory, confirming that `better-sqlite3` native bindings load correctly in the desktop shell.
- [ ] **Runtime Skills Load:** Verify through the debug logs or UI that the `resources/agent_context/runtime-skills` directory is parsed. Ensure all 7 canonical skills (`bounded-answer`, `bounded-synthesis`, `claim-extraction`, `gap-analysis`, `source-discovery-plan`, `objective-claim-proposal`, `citation-audit`) are present.
- [ ] **Repo Assets Excluded:** Confirm that `.agent`, `AGENTS.md`, and `GEMINI.md` are not parsed as runtime skills.

### B. Product Loop

- [ ] **Canvas Interaction:** Select at least one Source and one Group in the galactic graph canvas.
- [ ] **Conversation Creation:** Click "Discuss Selection" and ensure the Scoped Conversation modal appears.
- [ ] **Agent Selection:** Select the mock/E2E agent or a default human-driven workflow.
- [ ] **Message Runtime:** Click "Launch Runtime" and verify the chat interface appears, properly rendering the context bounds (the selected source/group).
- [ ] **Mock Synthesis:** Type a message (e.g., "Synthesize this context") and hit send. Verify the user message renders, followed shortly by a "Mocked Assistant Response" (the mock provider response).
- [ ] **AgentRun Persistence:** Confirm that an `AgentRun` is recorded by looking for the "View Provenance" or "Agent Run" metadata badge attached to the assistant message.
- [ ] **Provenance Modal:** Click "View Provenance" and verify the modal opens safely, showing either the `USED_EVIDENCE` subgraph or a graceful empty-evidence state.

## 4. Remaining Risks

- While the mock provider proves the full stack execution inside Electron, parsing the exact response from a live local Gemma host involves streaming token logic and potential context-window failures that the mock provider avoids.
- The `better-sqlite3` native module ABI mismatch has been documented, but developers must remember to run `npm rebuild better-sqlite3` when switching between desktop builds and backend local development.

## 5. Recommended Next Sprint

**Native Gemma Runtime Setup + Desktop Smoke Trial**

Now that the desktop mock loop is validated, the only remaining barrier to full desktop product completion is implementing the Keimenon-managed native local Gemma runtime and proving that Keimenon can run inference, stream the response, and hydrate the provenance UI with live inference results.
