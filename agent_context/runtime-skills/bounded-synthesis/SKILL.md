---
id: bounded-synthesis
name: Bounded Synthesis
description: Provides a comprehensive answer to the user's question, strictly bounded by the provided context pack.
mode: bounded_synthesis
model_family: gemma
allowed_tools: []
output_schema: output.schema.json
auto_invocable: true
requires_context_pack: true
side_effects: false
---

# Bounded Synthesis

## Purpose

Provides a comprehensive answer to the user's question, strictly bounded by the provided context pack.

## Inputs

- Current conversation history
- Available context pack (groups, sources, topics)

## Outputs

- A conversational response answering the user's query
- NO proposed outputs. This skill only synthesizes information.
