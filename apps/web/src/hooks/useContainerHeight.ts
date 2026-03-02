import { RefObject, useEffect, useState } from 'react';

/**
 * Hook to track the height of a container element using ResizeObserver.
 * Useful for dynamically sizing virtualized lists.
 *
 * @param containerRef - Ref to the container element to observe
 * @param defaultHeight - Fallback height when container is not yet measured (default: 400)
 * @returns Current height of the container in pixels
 */
export function useContainerHeight(
  containerRef: RefObject<HTMLElement | null>,
  defaultHeight: number = 400
): number {
  const [height, setHeight] = useState(defaultHeight);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Set initial height
    setHeight(element.clientHeight || defaultHeight);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const newHeight = entry.contentRect.height;
        if (newHeight > 0) {
          setHeight(newHeight);
        }
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, defaultHeight]);

  return height;
}
