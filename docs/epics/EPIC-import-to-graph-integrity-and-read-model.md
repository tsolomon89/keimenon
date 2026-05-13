# EPIC: Import-to-Graph Integrity and Read Model

## Why this epic matters

The Keimenon vision contract dictates a strict local-first, similarity-first knowledge graph platform where raw source content is preserved exactly and provenance is verifiable. To materialize this vision, the pipeline from raw import to graph structure and display must be highly coherent, verifiable, and free of legacy shims. This epic completes the stabilization of this golden path.

## Canonical References

- `AGENTS.md` - Section 5.0 (Canonical Import Rail), 5.6 (Golden Path Materialization Invariant), 6.1 (Bulk Insert via DB Worker).

## Current Implementation State

- Legacy multipart import route has been retired, but some documentation (`AGENTS.md` / `GEMINI.md`) still refers to "quarantined" shims, which have actually been removed.
- `BulkGraphWriteSink` is the canonical write path for imports. `ImportWorker` properly guards against DB worker unavailability.
- `KEIMENON_BULK_INSERTS=0` bypass correctly fails loud with `BYPASS_UNSUPPORTED_FOR_IMPORTS` during imports to prevent bypasses that would fail Migration 040 FK constraints.
- Stale assumptions exist where code directly queries `nodes.properties` for fields that have been normalized (e.g., `Phrase`'s `normalized_text`).
- The UI layer currently lacks a clean backend-to-web read model contract, requiring it to handle raw graph primitives.

## Exact gaps between contract and code

1. Documentation drift in `AGENTS.md`, `GEMINI.md`, `vision-contract-v1.md`, etc., regarding retired rails.
2. Code/tests querying `json_extract(properties, '$.normalized_text')` on `Phrase` nodes instead of the `phrases` payload table.
3. Lack of comprehensive job-level diagnostics for graph birth invariant failures.
4. Lack of an intermediary `GraphReadModel` adapter for the web UI.

## Non-goals

- Large-scale refactoring of the semantic spine or ingestion AI logic.
- Building a full 3D visualization system (the focus is on the data model/adapter).
- Weakening local-first or provenance invariants.

## System invariants

- AccountNode + Principal + Source + Group + required links must exist after import.
- Raw content fidelity must be preserved exactly.
- Foreign Key constraints for normalized payload tables must be satisfied (Migration 040).

## Affected architecture

- Import Pipeline (`ImportWorker.ts`, `import-enhanced-v2.ts`)
- Services (`authority-scoring.service.ts`, `semantic-indexing-pipeline.ts`)
- Testing (`semantic-spine-loop.test.ts`)
- Web Layer (`shared-three-graph-renderer`, backend adapter)

## Implementation Phases

- **Phase 1**: Contract/doc correction. Update `AGENTS.md`, `GEMINI.md`, and check derived specs.
- **Phase 2**: Import write-path integrity audit. Document and finalize the fail-loud stance of `KEIMENON_BULK_INSERTS=0`.
- **Phase 3**: Normalized-payload assumption audit. Fix queries on `Phrase` nodes expecting `normalized_text` in `properties` instead of the `phrases` payload table.
- **Phase 4**: Graph materialization diagnostics. Improve error observability for failed materializations.
- **Phase 5**: Graph read model. Define a unified graph read model backend representation.
- **Phase 6**: Web graph adapter. Integrate the new read model into the frontend UI layer.

## Task breakdown

- [x] Correct `AGENTS.md` and `GEMINI.md` to remove references to quarantined shims.
- [x] Update `semantic-spine-loop.test.ts` to use `phrases` table instead of `json_extract`.
- [x] Add `graphBirth` diagnostics payload to the job status API.
- [x] Implement `GET /api/v1/graph/read-model`.
- [x] Update the web frontend adapter for `GraphReadModel`.

### Phase 6: Frontend Read Model Migration

**Status:** ✅ Complete

- [x] Update `api-client.ts` to request `/api/v1/graph/read-model` instead of the snapshot route for 3D renderer data.
- [x] Rename references in the React store from `getGraphSnapshot` to `getGraphReadModel` for semantic clarity.
- [x] Verify that the frontend canvas correctly receives and renders the fully hydrated graph properties without requiring fallback queries.
- Run `npm run test:data:split` and `npm run test:auth`.

## Security/Privacy Review

- Ensure read models respect account boundaries and `user`/`admin` visibility scopes.

## Risks

- Correcting stale payload assumptions might ripple into untested areas of semantic indexing.
- Creating the read model could expose underlying schema details to the UI; it must be tightly typed.

## Recommended first implementation slice

Phase 1: Contract/doc correction followed by Phase 3: Normalized-payload assumption fix in tests.
