# Domain Model: Attribution

> **Invariant**: URL = Identity. The canonical URL of a thing *is* its primary identity in the distributed graph.

## The URL Contract
A URL in this system is not just a locator; it is a **globally unique identifier**.

### Canonical URLs
Every Record that represents a public resource MUST have a `canonical_url`.
- **Format**: `https://{domain}/{kind}/{slug}`
- **Constraint**: Uniqueness constraint on `canonical_url` per Tenant.

### Attribution Logic
When importing content or citing sources:
1.  **Resolution**: Attempt to resolve the citation URL to an existing Record.
2.  **Upsert**: If found, link to it. If not, create a "Stub" Entity with that URL.
3.  **Provenance**: The `source_url` field on a Record points to its origin.

### Implications for Agents
- **Deduplication**: Use URL normalization to detect duplicates.
- **Crawlability**: The structure of the URL implies the structure of the Graph.
