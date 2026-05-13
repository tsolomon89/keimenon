---
name: documentation-sync
description: 'Aligning docs with code, identifying stale docs, preserving provenance without hallucinating.'
---

# documentation-sync

## Purpose

Aligning docs with code, identifying stale docs, preserving provenance without hallucinating.

## Operational Details

- **Owning Persona**: documentation-steward
- **When to Use**: Code changes render existing `docs/` outdated
- **When NOT to Use**: Active coding phases
- **Required Inputs**: Code diffs
- **Commands / Checks**: `manual/none`
- **Evidence Output**: Updated markdown docs
- **Stop Conditions / Acceptance Criteria**: Documentation accurately reflects the codebase.

## Step-by-Step Procedure

1. Read `AGENTS.md` and `docs/`.
2. Append clarifications based on recent code commits.
