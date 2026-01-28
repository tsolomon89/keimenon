import { useEffect, useCallback } from 'react';
import { useKeimenonStore } from '@/store/keimenonStore';

/**
 * Hook to synchronize selection between different views
 * (e.g., between keimenon graph and sidebar list)
 */
export function useSelectionSync() {
  const selectedNodeIds = useKeimenonStore((state) => state.selectedNodeIds);
  const selectNode = useKeimenonStore((state) => state.selectNode);
  const deselectNode = useKeimenonStore((state) => state.deselectNode);
  const clearSelection = useKeimenonStore((state) => state.clearSelection);
  const setHoveredNode = useKeimenonStore((state) => state.setHoveredNode);

  // Handle keyboard shortcuts for selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Cmd/Ctrl + A to select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        useKeimenonStore.getState().selectAll();
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }

      // Delete/Backspace to delete selected nodes
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.size > 0) {
        e.preventDefault();
        const nodesToDelete = Array.from(selectedNodeIds);
        nodesToDelete.forEach((id) => {
          useKeimenonStore.getState().deleteNode(id);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, clearSelection]);

  // Public API for components to use
  const handleSelect = useCallback(
    (id: string, multi: boolean = false) => {
      selectNode(id, multi);
    },
    [selectNode]
  );

  const handleDeselect = useCallback(
    (id: string) => {
      deselectNode(id);
    },
    [deselectNode]
  );

  const handleToggleSelect = useCallback(
    (id: string, multi: boolean = false) => {
      if (selectedNodeIds.has(id)) {
        deselectNode(id);
      } else {
        selectNode(id, multi);
      }
    },
    [selectedNodeIds, selectNode, deselectNode]
  );

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleHover = useCallback(
    (id: string | null) => {
      setHoveredNode(id);
    },
    [setHoveredNode]
  );

  const isSelected = useCallback(
    (id: string) => {
      return selectedNodeIds.has(id);
    },
    [selectedNodeIds]
  );

  return {
    selectedNodeIds,
    handleSelect,
    handleDeselect,
    handleToggleSelect,
    handleClearSelection,
    handleHover,
    isSelected,
    selectionCount: selectedNodeIds.size,
  };
}
