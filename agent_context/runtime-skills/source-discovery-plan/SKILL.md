---
id: source-discovery-plan
name: Source Discovery Plan
description: Analyzes the current graph and context pack to propose new external sources or internal areas of exploration.
mode: source_discovery_plan
model_family: gemma
allowed_tools: []
output_schema: output.schema.json
auto_invocable: false
requires_context_pack: true
side_effects: false
---

# Source Discovery Plan

## Purpose

Analyzes the current graph and context pack to propose new external sources or internal areas of exploration needed to answer the user's implicit or explicit research objective.

## Inputs

- Current conversation history
- Available context pack (groups, existing sources, topics)

## Outputs

- A conversational response explaining the discovery plan
- ProposedGraphOutputs of kind `ProposedSource` pointing to URLs or search terms that should be ingested.
