# Citation Audit

## Purpose

Audits a set of claims against the provided context pack to find citation issues, contradictions, or unsupported statements.

## Inputs

- Current conversation history
- Available context pack (groups, sources, topics)

## Outputs

- A conversational response detailing the audit findings
- ProposedGraphOutputs of kind `CitationIssue` detailing issues with specific claims.
