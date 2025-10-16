import { useState, useCallback } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseUndoRedoReturn<T> {
  state: T;
  setState: (newState: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
  historySize: number;
}

/**
 * Hook for undo/redo functionality with history management
 */
export function useUndoRedo<T>(initialState: T, maxHistorySize = 50): UseUndoRedoReturn<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const setState = useCallback(
    (newState: T) => {
      setHistory((current) => {
        const newPast = [...current.past, current.present];

        // Limit history size
        if (newPast.length > maxHistorySize) {
          newPast.shift();
        }

        return {
          past: newPast,
          present: newState,
          future: [], // Clear future when new state is set
        };
      });
    },
    [maxHistorySize]
  );

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.past.length === 0) return current;

      const previous = current.past[current.past.length - 1];
      const newPast = current.past.slice(0, -1);

      return {
        past: newPast,
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.future.length === 0) return current;

      const next = current.future[0];
      const newFuture = current.future.slice(1);

      return {
        past: [...current.past, current.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  const clear = useCallback(() => {
    setHistory((current) => ({
      past: [],
      present: current.present,
      future: [],
    }));
  }, []);

  return {
    state: history.present,
    setState,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    clear,
    historySize: history.past.length + history.future.length + 1,
  };
}
