# Domain Model: Inventory Graph

> **Invariant**: The system distinguishes between "Things we Own" (Inventory) and "Things we Know" (Graph).

## Core Taxonomy

### Asset (Inventory)

**Definition**: A digital object owned and hosted by the Tenant.
**Examples**: `Article`, `Image`, `Video`, `Page`.
**Contract**:

- MUST have a `file_path` or `content` blob.
- Lifecycle is managed (Draft -> Published -> Archived).

### Entity (Graph)

**Definition**: An abstract concept, person, or place referenced by the system.
**Examples**: `Person` (Elon Musk), `Concept` (SpaceX), `Place` (San Francisco).
**Contract**:

- MAY be external (Wikidata ID).
- Shared across the graph (canonicalization happens here).

**Note on Contacts**: Business or personal contacts are represented as `Person` entities with relationship edges (e.g., `KNOWS`, `WORKS_WITH`, `CONTACTED_BY`). There is no separate "Contact" node kind—contacts ARE Person entities with contextual edges defining the relationship.

### Link (Relationship)

**Definition**: A typed, directed edge between two Records.
**Structure**: `(Subject) -[PREDICATE]-> (Object)`
**Examples**:

- `Article -REFERENCES-> Person`
- `Person -WORKS_FOR-> Company`

## The Graph Contract

1.  **Connectivity**: Every Asset SHOULD be connected to at least one Entity (Tagging/Classification).
2.  **Traversal**: The "Graph" is the union of all Assets, Entities, and Links reachable from a start node.
