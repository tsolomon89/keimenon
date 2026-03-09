# Change Log

## v5.3.0 (2026-02-03)

**Legacy Migration (Pass 4)**

- **Synthesized Features**: `chat_import`, `clustering`, `code_extraction`.
- **Synthesized Specs**: `desktop_app` (local-first spec), `chunked_upload` (protocol).
- **Added Architecture**: `security_model.md` (RBAC, Auth isolation).
- **Status**: Critical gaps identified in Audit have been filled.

## v5.2.0 (2026-02-03)

**Domain Model Synthesis**

- **Added**: `domain_model/identity.md` (User/Tenant/Auth).
- **Added**: `domain_model/inventory_graph.md` (Asset/Entity/Link).
- **Added**: `domain_model/attribution.md` (URL=Attribution).
- **Invariant**: URL Identity and Graph Separation formalized.

## v5.0.0 (2026-02-03)

**Initial Refactoring / Homoiconic Fact Store**

- **Action**: Established `agent_context_refactored/` as the canonical source.
- **Added**: `manifest.yaml`, `README.md`, `glossary.md`.
- **Added**: Core Engine modules (`record_struct`, `schema_as_data`, `query_model`).
- **Added**: Architecture modules (`overview`, `runtime_systems`).
- **Added**: Implementation modules (`system_operations`, `content_migration`).
- **Status**: `active`
