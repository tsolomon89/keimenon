---
id: citation-audit
name: Citation Audit
description: Audits a set of claims against the provided context pack to find citation issues, contradictions, or unsupported statements.
mode: citation_audit
model_family: gemma
allowed_tools: []
output_schema: output.schema.json
auto_invocable: false
requires_context_pack: true
side_effects: false
---

# Citation Audit

## Purpose

Audits a set of claims against the provided context pack to find citation issues, contradictions, or unsupported statements.

## Inputs

- Current conversation history
- Available context pack (groups, sources, topics)

## Outputs

- A conversational response detailing the audit findings
- ProposedGraphOutputs of kind `CitationIssue` detailing issues with specific claims.
