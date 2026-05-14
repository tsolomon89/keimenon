---
id: objective-claim-proposal
name: Objective Claim Proposal
description: Proposes objective claims based on the current context pack to add structured knowledge to the user's graph.
mode: objective_claim_proposal
model_family: gemma
allowed_tools: []
output_schema: output.schema.json
auto_invocable: false
requires_context_pack: true
side_effects: false
---

# Objective Claim Proposal

## Purpose

Propose objective claims based on the current context pack to add structured knowledge to the user's graph.

## Inputs

- Current conversation history
- Available context pack (groups, sources, topics)

## Outputs

- A conversational response detailing the insights
- ProposedGraphOutputs of kind `ProposedClaim` detailing objective facts or statements that can be verified against the sources in the context pack.
