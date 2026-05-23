# Keimenon Desktop Release Build Checklist & Log

This checklist documents the release preparation and manual verification results for the first official Windows standalone desktop release candidate (RC) build of Keimenon.

---

## 1. Environment & Packaging Specifications

- **Target OS**: Windows 10/11 x64 (MSVC Compiler Tools configured)
- **Node Runtime**: Node v24.9.0 (Project Local Node)
- **Electron Version**: v28.2.0 (Active ABI target)
- **Standalone Installer Format**: NSIS (`out/Keimenon Setup 0.1.0.exe`)

---

## 2. Hardened Verification Checklist

### Phase 1 — Packaging Configuration Audit

- [x] **Product Identity**: Evaluated `apps/desktop/package.json` to confirm `"productName": "Keimenon"` and `"appId": "com.keimenon.desktop"`.
- [x] **ASAR Container Isolation**: verified target files match `"dist/**/*"` and `"resources/**/*"` only, preventing raw repository scripts (`.agent/`, `.git/`, `AGENTS.md`, `GEMINI.md`) from leaking into packaged code.
- [x] **Preload Process Boundary**: Inspected `apps/desktop/preload.js` to ensure the `contextBridge` securely exposes dynamic ingestion, credentials, and accounts APIs while completely preventing Node.js system API exposure to the frontend renderer.
- [x] **Extra Resources Mapping**: Confirmed that `agent_context/runtime-skills` is mapped cleanly outside the ASAR container to enable local model runtime file system reads.

### Phase 2 — Automated Quality Gates

- [x] **Monorepo Build**: `turbo run build` compiles cleanly across all 14 workspaces.
- [x] **Automated Checks**: `npm run rc:check` completes flawlessly:
  - SQLite integrity matches `ok` (journal_mode=wal, foreign_keys=1).
  - Repository hygiene checks pass (scanned 481 files, 0 tracked developer artifacts).
  - All **22/22 Playwright E2E browser tests** pass on chromium with transaction-isolated databases.

### Phase 3 — Production Package Compilations

- [x] **Next.js Static Asset Sync**: Rebuilt Next.js production files with static exports (`NEXT_OUTPUT_EXPORT=1`) and verified 0 forbidden debug markers exist inside the `resources/web-dist/` bundle.
- [x] **Desktop Compilations**: TypeScript compiled Electron `main.js` and `preload.js` cleanly.
- [x] **NSIS Setup Build**: Compiled `out/Keimenon Setup 0.1.0.exe` (100.1 MB) and `out/win-unpacked/Keimenon.exe`.

### Phase 4 — Production Dependencies & ESM-CJS Alignment

- [x] **Missing Dependency Mitigation**:
  - Found that `@keimenon/parsers` depended on `canonicalize` and `@keimenon/api` depended on `jsonwebtoken`, which were missing from workspace production packages. Added them to respective `dependencies` lists to guarantee production bundling.
- [x] **ESM Mismatch Correction**:
  - Discovered that `@keimenon/agent-core` was compiled as an ES Module (`"type": "module"`, `"module": "NodeNext"`), throwing `ERR_REQUIRE_ESM` when required inside CommonJS Electron main processes.
  - Converted `@keimenon/agent-core` fully to CommonJS (removed type module, adjusted exports, changed tsconfig compilerOptions to `"module": "commonjs"` / `"moduleResolution": "node"`). Re-ran and verified clean compilation monorepo-wide.

### Phase 5 — Packaged Launch Smoke Test

- [x] **Shell Initialization**: Launched `win-unpacked/Keimenon.exe` directly on the host machine. Window boots instantly with Next.js landing layouts.
- [x] **Database Isolation**: Production SQLite database initializes under `%APPDATA%/keimenon-desktop/keimenon.db`.
- [x] **WAL Mode & Migrations**: Verified that WAL journaling is fully active (`keimenon.db-wal` and `keimenon.db-shm` created) and all 32 migrations applied cleanly.
- [x] **Embedded API Lifecycle**: Embedded API server binds dynamic port 4001, boots successfully, and runs background job pollers instantly.
- [x] **Skills Integration**: The app runtime successfully discovers all 7 offline skills inside resources:
  - `bounded-answer`
  - `bounded-synthesis`
  - `citation-audit`
  - `claim-extraction`
  - `gap-analysis`
  - `objective-claim-proposal`
  - `source-discovery-plan`
- [x] **Graceful Offline Fallbacks**: Verified that absent local model weights do not block basic app shell start, graph canvas rendering, or conversation creations.

---

## 3. Package Metrics Summary

| Packaged Artifact          | File System Location                                                          | Size            | Verification Status             |
| -------------------------- | ----------------------------------------------------------------------------- | --------------- | ------------------------------- |
| **NSIS Setup Installer**   | `apps/desktop/out/Keimenon Setup 0.1.0.exe`                                   | 100.1 MB        | **PASSED** (Ready to ship)      |
| **Standalone Application** | `apps/desktop/out/win-unpacked/Keimenon.exe`                                  | 134 KB (loader) | **PASSED** (Launches API + UI)  |
| **Packaged ASAR Code**     | `apps/desktop/out/win-unpacked/resources/app.asar`                            | 299.8 MB        | **PASSED** (Zero leak detected) |
| **SQLite Production DB**   | `%APPDATA%/keimenon-desktop/keimenon.db`                                      | ~900 KB         | **PASSED** (WAL active)         |
| **External Agent Skills**  | `%APPDATA%/../Local/Programs/keimenon/resources/agent_context/runtime-skills` | 7 skills        | **PASSED** (Discovered offline) |

---

## 4. Release Candidate Sign-off

The first official standalone Windows executable is certified as **Release Ready**. The offline fallback loops are fully verified, the SQLite userData path is completely isolated, and monorepo E2E tests are 100% green.
