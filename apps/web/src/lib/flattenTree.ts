/**
 * Utility for flattening hierarchical tree structures into a flat array
 * for use with react-window virtualization.
 */

/**
 * Represents a flattened tree node with metadata for rendering
 */
export interface FlattenedNode<T> {
  /** Original node data */
  node: T;
  /** Nesting depth (0 = root level) */
  depth: number;
  /** Whether this node is currently expanded (for parent nodes) */
  isExpanded: boolean;
  /** Whether this node has children */
  hasChildren: boolean;
  /** Unique key for React rendering */
  key: string;
}

/**
 * Configuration for tree flattening behavior
 */
export interface FlattenConfig<T> {
  /** Function to get unique ID from a node */
  getId: (node: T) => string;
  /** Function to get child nodes (return empty array for leaf nodes) */
  getChildren: (node: T, allNodes: T[]) => T[];
  /** Set of expanded node IDs */
  expandedIds: Set<string>;
}

/**
 * Flattens a tree structure into a flat array suitable for virtualization.
 * Only includes children of expanded nodes in the output.
 *
 * @param nodes - Array of root-level nodes to flatten
 * @param config - Configuration for tree traversal
 * @returns Flat array of nodes with depth and expansion metadata
 */
export function flattenTree<T>(nodes: T[], config: FlattenConfig<T>): FlattenedNode<T>[] {
  const { getId, getChildren, expandedIds } = config;
  const result: FlattenedNode<T>[] = [];

  function traverse(node: T, depth: number) {
    const id = getId(node);
    const children = getChildren(node, nodes);
    const hasChildren = children.length > 0;
    const isExpanded = hasChildren && expandedIds.has(id);

    result.push({
      node,
      depth,
      isExpanded,
      hasChildren,
      key: id,
    });

    // Only traverse children if this node is expanded
    if (isExpanded) {
      for (const child of children) {
        traverse(child, depth + 1);
      }
    }
  }

  for (const rootNode of nodes) {
    traverse(rootNode, 0);
  }

  return result;
}

/**
 * Calculates the total visible node count for a tree with given expansion state.
 * Useful for determining itemCount in virtualized lists.
 */
export function countVisibleNodes<T>(nodes: T[], config: FlattenConfig<T>): number {
  const { getId, getChildren, expandedIds } = config;
  let count = 0;

  function countRecursive(node: T): number {
    const id = getId(node);
    const children = getChildren(node, nodes);
    const isExpanded = children.length > 0 && expandedIds.has(id);

    let total = 1; // Count this node
    if (isExpanded) {
      for (const child of children) {
        total += countRecursive(child);
      }
    }
    return total;
  }

  for (const rootNode of nodes) {
    count += countRecursive(rootNode);
  }

  return count;
}
