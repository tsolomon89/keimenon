---
name: n-pass-iteration
description: 'Iteratively refines agent context and specs to reduce ambiguity without destabilizing the corpus'
---

# n-pass-iteration

## Purpose

Iteratively refines agent context and specs to reduce ambiguity without destabilizing the corpus

## Operational Details

- **Owning Persona**: documentation-steward
- **When to Use**: Refining complex markdown files iteratively
- **When NOT to Use**: Deploying code changes
- **Required Inputs**: Target markdown document
- **Commands / Checks**: `manual/none`
- **Evidence Output**: Unified and unambiguous markdown file
- **Stop Conditions / Acceptance Criteria**: Zero conflicting statements remain in the spec.

## Step-by-Step Procedure

1. Read the target document.
2. Identify contradictions or undefined invariants.
3. Clarify and rewrite sections specifically.
