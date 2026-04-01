import { RefObject, useEffect, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize(
  elementRef: RefObject<HTMLElement | null>,
  fallback: ElementSize = { width: 0, height: 0 }
): ElementSize {
  const [size, setSize] = useState<ElementSize>(fallback);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const update = (width?: number, height?: number) => {
      const nextWidth = Math.floor(width ?? element.clientWidth);
      const nextHeight = Math.floor(height ?? element.clientHeight);
      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }
      setSize({ width: nextWidth, height: nextHeight });
    };

    update();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        update(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [elementRef]);

  return size;
}
