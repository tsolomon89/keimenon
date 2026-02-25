# Core Engine: Schema-as-Data

> **Invariant**: The schema of the system is NOT hardcoded in TypeScript classes. It is stored as `SchemaDefinition` records in the database.

## Principle of Homoiconicity
The system allows users (and agents) to modify the structure of data *using* the same mechanism they use to modify the data itself.
- **Data**: `kind: 'Article'`, `title: 'Hello'`
- **Schema**: `kind: 'Schema'`, `target_kind: 'Article'`, `fields: [...]`

## Schema Record Structure
A Schema Record typically contains:
- `target_kind`: The Record kind this schema governs.
- `fields`: A list of Field Definitions.
    - `name`: Field key.
    - `type`: Data type (Text, Number, Reference, JSON).
    - `validation`: Zod-like constraints (min, max, required).
- `display`: UI hints (label, placeholder, obscure).

## Runtime Implications
1.  **Validation**: effectively "soft" at the DB level, but "hard" at the API/Service level by loading the Schema Record before writes.
2.  **Migration**: Adding a field is an `INSERT` into the Schema table, not an `ALTER TABLE`.
3.  **Discovery**: Agents can query "What fields does an Article have?" by querying the Schema table.

## The Bootstrap Problem
**Q: How do we define the Schema for Schemas?**
A: There is a `Bootstrap Schema` hardcoded in the kernel that defines the structure of a `SchemaRecord`. This is the only exception.
