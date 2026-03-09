# Open Questions (Quarantine Zone)

> **Invariant**: If a fact is not known with certainty, it MUST NOT be written in the canonical corpus. It MUST be logged here or in an ADR.

## Active Unknowns

### Workspace Definition

**Status**: Undefined
**Context**: The term "workspace" appears in several spec documents but lacks a formal definition:

- `sources_mode_user_controls_improt_export_options_v_0.md`: "All options persist per-workspace"
- `chat_import_export_spec_v_0.md`: "Admin may publish workspace defaults via RuntimeManifest"
- `ai_context_import_no_ai_mutate.md`: "Per-workspace default cap for Sources"
- `runtime_systems.md`: "Default workspace/settings are provisioned"

**Possible interpretations**:

1. **Workspace = Account** (alias for tenancy unit)
2. **Workspace = Sub-Account project** (grouping mechanism within an Account)
3. **Workspace = UI configuration scope** (user preference namespace)

**Decision required**: Define the canonical meaning or remove ambiguous references.
