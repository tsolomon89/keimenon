import { nanoid } from 'nanoid';
import { createHash } from 'crypto';

/**
 * Helper function to create properly formatted test nodes that match the schema.
 *
 * All Source nodes require:
 * - BaseNodeSchema fields: id, kind, properties, account_id (from JWT), created_by (from JWT),
 *   created_at, updated_at, data_tag
 * - SourceNodeSchema fields: fingerprint, mime_type, size_bytes
 *
 * Related: packages/types/src/nodes.ts - SourceNodeSchema definition
 * Related: ai_context/schemas/Node.json - JSON schema
 */

export interface TestSourceNodeInput {
  title: string;
  content: string;
  platform?: string;
  url?: string;
  file_path?: string;
}

export interface TestSourceNode {
  id: string;
  kind: 'Source';
  created_at: number;
  updated_at: number;
  fingerprint: string;
  mime_type: string;
  size_bytes: number;
  title: string;
  url?: string;
  file_path?: string;
  metadata: {
    platform: string;
    content: string;
    data_tag: string;
  };
}

/**
 * Creates a complete Source node data object that passes SourceNodeSchema validation.
 *
 * Auto-generates:
 * - id: nanoid()
 * - timestamps: Date.now()
 * - fingerprint: SHA-256 hash of content
 * - mime_type: 'text/plain' for text content
 * - size_bytes: byte length of content
 *
 * @param input - Minimal node data (title, content, optional platform/url/file_path)
 * @returns Complete node data ready for POST /api/v1/nodes/source
 *
 * @example
 * ```typescript
 * const nodeData = createTestSourceNode({
 *   title: 'Test Document',
 *   content: 'This is test content',
 *   platform: 'test'
 * });
 *
 * const response = await apiRequest.post('/api/v1/nodes/source', {
 *   headers: { 'Authorization': `Bearer ${token}` },
 *   data: nodeData
 * });
 * ```
 */
export function createTestSourceNode(input: TestSourceNodeInput): TestSourceNode {
  const { title, content, platform = 'test', url, file_path } = input;

  // Generate content fingerprint (SHA-256 hash)
  const fingerprint = createHash('sha256').update(content).digest('hex');

  // Calculate byte size
  const size_bytes = Buffer.byteLength(content, 'utf8');

  const now = Date.now();

  return {
    id: nanoid(),
    kind: 'Source',
    created_at: now,
    updated_at: now,
    fingerprint,
    mime_type: 'text/plain',
    size_bytes,
    // Spread fields at top level to match SourceNodeSchema
    title,
    // Note: content is not in SourceNodeSchema - it's stored separately
    // url and file_path are optional SourceNode fields
    ...(url && { url }),
    ...(file_path && { file_path }),
    // Add metadata for test context
    metadata: {
      platform,
      content, // Store content in metadata since it's not a Source field
      data_tag: 'test', // Track test data for cleanup
    },
  };
}

/**
 * Creates multiple test source nodes in one call.
 * Useful for tests that need multiple nodes with different content.
 *
 * @example
 * ```typescript
 * const [node1, node2, node3] = createTestSourceNodes([
 *   { title: 'Node 1', content: 'Content 1' },
 *   { title: 'Node 2', content: 'Content 2' },
 *   { title: 'Node 3', content: 'Content 3' }
 * ]);
 * ```
 */
export function createTestSourceNodes(inputs: TestSourceNodeInput[]): TestSourceNode[] {
  return inputs.map((input) => createTestSourceNode(input));
}

/**
 * Creates a test node with unique content based on account/index.
 * Useful for multi-tenant isolation tests where you need distinct nodes per account.
 *
 * @param accountName - Name to include in title (e.g., "Account A", "Account B")
 * @param index - Optional index for multiple nodes (default: 1)
 * @param contentPrefix - Optional prefix for content (default: "This is private data belonging to")
 *
 * @example
 * ```typescript
 * // Create nodes for isolation testing
 * const nodeA1 = createTestSourceNodeForAccount('Account A', 1);
 * const nodeA2 = createTestSourceNodeForAccount('Account A', 2);
 * const nodeB1 = createTestSourceNodeForAccount('Account B', 1);
 * ```
 */
export function createTestSourceNodeForAccount(
  accountName: string,
  index: number = 1,
  contentPrefix: string = 'This is private data belonging to'
): TestSourceNode {
  return createTestSourceNode({
    title: `${accountName} Confidential Source ${index}`,
    content: `${contentPrefix} ${accountName}. Document ${index}.`,
    platform: 'test',
  });
}

/**
 * Creates a test Group node with all required fields.
 *
 * @param input - Group node configuration (name, purpose, etc.)
 * @returns Complete group node data ready for POST /api/v1/nodes/group
 */
export interface TestGroupNodeInput {
  name: string;
  purpose?: string;
}

export function createTestGroupNode(input: TestGroupNodeInput) {
  const { name, purpose } = input;
  const now = Date.now();

  return {
    id: nanoid(),
    kind: 'Group',
    created_at: now,
    updated_at: now,
    name,
    ...(purpose && { purpose }),
    member_count: 0,
    metadata: {
      data_tag: 'test',
    },
  };
}
