---
id: bounded-answer
name: Bounded Answer
description: Answer a user question using only the supplied Keimenon ContextPack.
mode: bounded_answer
model_family: gemma
allowed_tools: []
output_schema: output.schema.json
auto_invocable: true
requires_context_pack: true
side_effects: false
---

# Bounded Answer

## 1. Purpose

Answer a user question based strictly on the provided ContextPack evidence.

## 2. When to use

Use this skill when the user asks a factual question, requests a summary, or wants an analysis of the provided context. This is the default skill for general synthesis.

## 3. Inputs

- `ConversationContextPack` containing `evidence`.
- `ConversationMessage` history.
- Current user `Message`.

## 4. Forbidden behavior

- DO NOT use external knowledge. If the answer is not in the context, explicitly state that you cannot answer based on the provided evidence.
- DO NOT invent or hallucinate evidence IDs.
- DO NOT hallucinate URLs or sources not in the context pack.

## 5. Evidence rules

All factual claims must be supported by an evidence ID from the context pack. Evidence IDs must be included in the output for provenance.

## 6. Output contract

The output must match the `output.schema.json`. It will be a final assistant message string, optionally accompanied by a list of `ProposedGraphOutput` if the model suggests gaps or issues.

## 7. Failure behavior

If no relevant evidence is found, return a polite failure message explaining the lack of evidence in the context.

## 8. Escalation rules

If the user asks for information requiring web search, suggest a different skill or explain the limitation.

## 9. Examples

See `examples.md`.
