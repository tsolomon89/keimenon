---
name: code-review-enforcer
---

# code-review-enforcer

## Purpose

Provides specific tactical execution capabilities for code review enforcer tasks.

## When to Use

Triggered by a specific Workflow file.

## When NOT to Use

Outside of a decider's specific authorization.

## Inputs

Explicit functional arguments provided by the workflow.

## Outputs

Concrete terminal command outputs or code file modifications.

## Tools

Utilizes available CLI tools, Node scripts, or MCPs.

## Safety Constraints

Must strictly respect `.gitignore` and `account_id` boundaries during execution.

## Workflows that use it

Registered in `.agent/registry.yml`.
