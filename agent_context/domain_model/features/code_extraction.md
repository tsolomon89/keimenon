# Feature: Code Extraction

> **Goal**: Build a searchable Code Library by extracting snippets from conversational text.

## Extraction Logic
1.  **Detection**: Scans for fenced code blocks (` ``` `) and indented blocks.
2.  **Language ID**:
    - Primary: Fence tag (`python`, `ts`).
    - Secondary: Heuristic analysis of content.
    - Normalization: `js` -> `javascript`, `py` -> `python`.
3.  **Fingerprinting**: Computes `SHA-256` of normalized code content (ignoring whitespace).

## Data Model
**Kind**: `CodeBlock`
- `content`: The extraction.
- `language`: Normalized language ID.
- `fingerprint`: Hash for deduplication.
- `context`: Surrounding text (optional).

## Deduplication Strategy
- **Scope**: Global (across all conversations).
- **Logic**: If `fingerprint` matches an existing `CodeBlock`:
    - Do NOT create a new node.
    - Create a `DUP_OF` edge or simply link the `Message` to the existing `CodeBlock`.
    - **Benefit**: "Write once, link many".

## Supported Languages
Over 70+ languages detected, including:
- **Core**: JS, TS, Python, Java, Go, Rust.
- **Config**: JSON, YAML, TOML, Dockerfile.
- **Data**: SQL, R, Pandas.
