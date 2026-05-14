---
id: claim-extraction
name: Claim Extraction
description: Extract objective factual claims from the provided context and trace them back to their exact source evidence.
mode: claim_extraction
model_family: gemma
allowed_tools: []
output_schema: output.schema.json
auto_invocable: false
requires_context_pack: true
side_effects: false
---

# Claim Extraction

## 1. Purpose

Extract atomic, declarative factual claims from the provided ContextPack evidence, and explicitly link each claim to the `node_id` of the source that supports it.

## 2. When to use

Use this skill when processing raw user chat, documents, or logs into structured ObjectiveClaims for the knowledge graph. This is an analytical skill.

## 3. Inputs

- `ConversationContextPack` containing `evidenceItems`.
- Optional `ConversationMessage` history for context.

## 4. Forbidden behavior

- DO NOT invent claims not supported by the context.
- DO NOT combine multiple distinct facts into a single claim. Claims must be atomic.
- DO NOT use evidence IDs that are not present in the input context.

## 5. Evidence rules

Each claim must include an array of `evidence_node_ids` containing the exact `node_id` strings from the ContextPack that support it.

## 6. Output contract

The output must match `output.schema.json`, providing a JSON object with a `claims` array.
