# Keimenon/Oblio Agent Context

**Status**: `REFRACTED` (v5.0)
**Invariant**: This folder is the **Homoiconic Fact Store** for the Keimenon/Oblio system.
**Rule**: If it is not in this folder, it is not a system fact. It is hearsay.

## Philosophy: Homoiconic Fact Store

This corpus is structured as a retrieval-optimized database for agents.
- **Micro-Modules**: Files are atomic, focused on single concepts.
- **Canonical Contracts**: MUST/SHOULD/MAY keywords define system behavior.
- **No Ambiguity**: Unknowns are explicitly marked as open questions.

## Directory Structure

| Path | Purpose |
| :--- | :--- |
| [`manifest.yaml`](./manifest.yaml) | **The Root Index**. Lists all loaded modules. |
| [`glossary.md`](./glossary.md) | **Canonical Definitions**. The Ubiquitous Language. |
| `architecture/` | High-level system design and invariants. |
| `core_engine/` | The "Physics" of the system (RecordStruct, Schema-as-Data). |
| `domain_model/` | The business logic (Identity, Product, Graph). |
| `implementation/` | Concrete details (Migration, Operations, Integrations). |
| `workflows/` | Standard Operating Procedures (SOPs). |

## Usage for Agents

1.  **Read `manifest.yaml`** to build your load plan.
2.  **Consult `glossary.md`** for term precision.
3.  **Trace links** from high-level architecture to low-level implementation.
4.  **Do not Hallucinate**. If a fact is missing, create an `open_question` task.
