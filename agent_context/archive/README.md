# Keimenon Agent Context

This directory is the active architecture/spec corpus for Keimenon.

## Purpose

- maintain canonical runtime/design facts
- provide retrieval-friendly docs for engineering agents
- keep terminology and contracts aligned with live code

## Structure

- `manifest.yaml` - index of active context modules
- `glossary.md` - canonical terminology
- `architecture/` - runtime architecture invariants
- `core_engine/` - core persistence/query contracts
- `domain_model/` - business/domain behavior
- `implementation/` - operational and implementation specs
- `workflows/` - agent operating procedures

## Rules

1. Code reality is source of truth.
2. Account is the tenancy unit (`account_id`).
3. Keep docs concise, testable, and implementation-aligned.
