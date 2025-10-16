import { GraphNode } from './layout';

export interface SelectionState {
  selectedIds: Set<string>;
  hoveredId: string | null;
  pinnedIds: Set<string>;
}

/**
 * Create initial selection state
 */
export function createSelectionState(): SelectionState {
  return {
    selectedIds: new Set(),
    hoveredId: null,
    pinnedIds: new Set(),
  };
}

/**
 * Toggle selection of a node
 */
export function toggleSelection(
  state: SelectionState,
  nodeId: string
): SelectionState {
  const newSelected = new Set(state.selectedIds);
  if (newSelected.has(nodeId)) {
    newSelected.delete(nodeId);
  } else {
    newSelected.add(nodeId);
  }

  return {
    ...state,
    selectedIds: newSelected,
  };
}

/**
 * Select a single node (replace current selection)
 */
export function selectNode(
  state: SelectionState,
  nodeId: string
): SelectionState {
  return {
    ...state,
    selectedIds: new Set([nodeId]),
  };
}

/**
 * Add node to selection (multi-select)
 */
export function addToSelection(
  state: SelectionState,
  nodeId: string
): SelectionState {
  const newSelected = new Set(state.selectedIds);
  newSelected.add(nodeId);

  return {
    ...state,
    selectedIds: newSelected,
  };
}

/**
 * Remove node from selection
 */
export function removeFromSelection(
  state: SelectionState,
  nodeId: string
): SelectionState {
  const newSelected = new Set(state.selectedIds);
  newSelected.delete(nodeId);

  return {
    ...state,
    selectedIds: newSelected,
  };
}

/**
 * Clear all selections
 */
export function clearSelection(state: SelectionState): SelectionState {
  return {
    ...state,
    selectedIds: new Set(),
  };
}

/**
 * Select multiple nodes (replace current selection)
 */
export function selectNodes(
  state: SelectionState,
  nodeIds: string[]
): SelectionState {
  return {
    ...state,
    selectedIds: new Set(nodeIds),
  };
}

/**
 * Set hovered node
 */
export function setHovered(
  state: SelectionState,
  nodeId: string | null
): SelectionState {
  return {
    ...state,
    hoveredId: nodeId,
  };
}

/**
 * Pin a node (fix position)
 */
export function pinNode(state: SelectionState, nodeId: string): SelectionState {
  const newPinned = new Set(state.pinnedIds);
  newPinned.add(nodeId);

  return {
    ...state,
    pinnedIds: newPinned,
  };
}

/**
 * Unpin a node
 */
export function unpinNode(state: SelectionState, nodeId: string): SelectionState {
  const newPinned = new Set(state.pinnedIds);
  newPinned.delete(nodeId);

  return {
    ...state,
    pinnedIds: newPinned,
  };
}

/**
 * Check if node is selected
 */
export function isSelected(state: SelectionState, nodeId: string): boolean {
  return state.selectedIds.has(nodeId);
}

/**
 * Check if node is hovered
 */
export function isHovered(state: SelectionState, nodeId: string): boolean {
  return state.hoveredId === nodeId;
}

/**
 * Check if node is pinned
 */
export function isPinned(state: SelectionState, nodeId: string): boolean {
  return state.pinnedIds.has(nodeId);
}

/**
 * Get all selected nodes from a list
 */
export function getSelectedNodes(
  state: SelectionState,
  nodes: GraphNode[]
): GraphNode[] {
  return nodes.filter((node) => state.selectedIds.has(node.id));
}
