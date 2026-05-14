---
id: gap-analysis
name: Gap Analysis
description: Identify missing information, logical leaps, or underspecified concepts in the provided context.
mode: gap_analysis
model_family: gemma
allowed_tools: []
output_schema: output.schema.json
auto_invocable: false
requires_context_pack: true
side_effects: false
---

# Gap Analysis

## 1. Purpose

Analyze a set of evidence and a user's inquiry to identify critical missing information that prevents a complete, logically sound answer.

## 2. When to use

Use this skill when the system needs to proactively prompt the user for clarification, or when identifying contradictions or missing links in the knowledge graph.

## 3. Inputs

- `ConversationContextPack` containing `evidenceItems`.
- `ConversationMessage` history for context.
- Current user `Message`.

## 4. Forbidden behavior

- DO NOT invent or assume facts to fill the gaps.
- DO NOT critique the user's grammar or writing style; focus purely on factual and logical completeness.

## 5. Output contract

The output must match `output.schema.json`, providing a JSON object with a `gaps` array containing the missing topics, the reason they are needed, and suggested follow-up questions.
