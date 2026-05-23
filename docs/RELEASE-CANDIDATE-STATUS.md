# Keimenon Desktop Release Candidate Status Report

This status report establishes the technical inventory, testing audits, local inference optionality gates, and user-facing launch documentation for the **Keimenon Desktop Release-Candidate (RC)**.

---

## 1. Capabilities Inventory

The following table summarizes the implementation, testing, and packaging baseline of all 11 core product capabilities:

| #   | Core Capability          | Implemented | Unit/Int Tested | E2E-covered | Desktop-covered | Known Gaps / Debt                                                                                        |
| --- | ------------------------ | ----------- | --------------- | ----------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **Import**               | Yes         | Yes             | Yes         | Yes             | None. Standard sidebar import rail is canonical.                                                         |
| 2   | **Import Collision**     | Yes         | Yes             | Yes         | Yes             | None. Duplicate checks operate at exact hashing levels.                                                  |
| 3   | **Chunked Ingestion**    | Yes         | Yes             | Yes         | Yes             | None. Multipart import is fully retired.                                                                 |
| 4   | **Similarity Review**    | Yes         | Yes             | Yes         | Yes             | Internal schema refers to similarity edges via `duplicateNodeId` fields. UI display copy is fully clean. |
| 5   | **Graph Canvas View**    | Yes         | Yes             | Yes         | Yes             | None. Multi-scale Lod, 2D/3D/ND projected lenses, pointer dragging are fully functional.                 |
| 6   | **Selection Stack**      | Yes         | Yes             | Yes         | Yes             | None. Displays sources, groups, and ignored counts precisely.                                            |
| 7   | **Scoped Conversation**  | Yes         | Yes             | Yes         | Yes             | None. Reconciles frontend selections cleanly into `context_spec`.                                        |
| 8   | **Provenance Workspace** | Yes         | Yes             | Yes         | Yes             | None. Animates link particles with custom sidebar diagnostics.                                           |
| 9   | **Desktop Packaging**    | Yes         | Yes             | Yes         | Yes             | None. Bundles stand-alone API and NextJS `web-dist` assets cleanly.                                      |
| 10  | **Native Gemma Runtime** | Yes         | Yes             | Mocked      | Yes             | Optional. Dynamic DLL loader resolves dependencies cleanly or gracefully falls back.                     |
| 11  | **Model Downloader**     | Yes         | Yes             | Mocked      | Yes             | Staging folders require manual cleanups if downloads are corrupted.                                      |

---

## 2. Flake Audit & Architectural Decisions

To guarantee zero test regressions and absolute build reproducibility, the following integration fixes have been locked down:

### A. Async Worker savepoint Bypass

- **Problem**: Playwright integration runs transaction isolation via SQLite savepoints. However, asynchronous background workers (like graph materializers and DB workers) execute on separate worker threads and cannot see uncommitted transactional savepoints of the main webserver thread.
- **Design Choice**: The API endpoints used by background worker tests are registered inside `shouldBypassSavepoint` hooks ([test-isolation.ts](file:///C:/Development/Projects/keimenon/tests/e2e/fixtures/test-isolation.ts)). This forces realistic, direct disk-committing transactions during full-product-loop runs, ensuring that async operations remain 100% visible across threads without causing intermittent timeouts.

### B. Teardown Database Restorations

- **Problem**: Sequential integration tests running inside the same shared process (due to sequential execution requirements) repeatedly overrode the shared `global.dbClient` singleton, causing late-running suites to crash with `Database not connected`.
- **Design Choice**: Integration suites now clone, store, and faithfully restore original `global.dbClient` references in their `beforeAll` and `afterAll` lifecycle hooks, guaranteeing zero cross-suite database pollution.

### C. Web-Dist Packaging Fingerprinting

- **Problem**: Mismatches between Next.js build-cached files and Electron-embedded paths would cause white-screens when booting production bundles.
- **Design Choice**: A robust static web sync pipeline has been implemented:
  - `npm run desktop:web-dist:refresh`: Re-runs a fresh Next.js build and syncs files.
  - `npm run desktop:web-dist:verify`: Compares embedded files against an exact checksum manifest, flagging any asset drift before compilation.

---

## 3. Local Inference and Native Truth Gates

Keimenon preserves private, local-first data guarantees, making native LLM synthesis available but truthfully optional:

> [!IMPORTANT]
> The app remains fully functional and responsive even if local inference dependencies are absent. Native LLM synthesis is a Pro/Business tier gate, not a blocker for the basic workspace or core graph.

### Expected Truth State States:

1. **Dynamic DLL Dependency Gating**:
   If the compiled LiteRT-LM dynamic bindings (`@keimenon/litert-node-bindings`) cannot find the Google LiteRT dynamic library on PATH or inside the local resource folder, the system returns `runtime_dependency_missing` status cleanly, without crashing the app shell.
2. **Model Terms Consent**:
   The local downloader requires explicit license acknowledgement and terms consent before downloading model weights. If terms are not signed off, the downloader remains gated.
3. **Checksum Staging Safety**:
   Downloaded segments are staged in temporary files and compared against exact SHA-256 checksums. If a segment fails verification, it is rejected before being marked active, ensuring zero corrupted weight deployments.

---

## 4. Operating Instructions

### A. Running Release Checks

To run the full suite of release candidate checks:

```powershell
npm run rc:check
```

To run packaging tests and build installers:

```powershell
npm run rc:check:desktop
```

To run native local-inference integration tests:

```powershell
npm run rc:check:native
```

### B. Cleaning and Resetting Local Data

If you need to sweep dev/test data and restore the clean canonical bootstrap baseline:

```powershell
npm run factory-reset
```

This preserves the admin accounts (`admin@keimenon.com` and `admin@admin.com`) and clean database schemas, while purging disposable workspaces.
