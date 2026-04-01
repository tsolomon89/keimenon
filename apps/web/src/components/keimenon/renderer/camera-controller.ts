import type { RenderLens } from '@/lib/nd-projection';

export function defaultLensDistance(renderLens: RenderLens): number {
  return renderLens === '2d' ? 900 : 980;
}

export function zoomInDistance(currentDistance: number): number {
  return Math.max(120, currentDistance * 0.82);
}

export function zoomOutDistance(currentDistance: number): number {
  return Math.min(6400, currentDistance * 1.2);
}

export function distanceForTargetScale(targetScale: number): number {
  return Math.max(120, 640 / Math.max(0.4, targetScale));
}

export function distanceForBoundingRadius(maxRadius: number): number {
  return Math.max(160, maxRadius * 3.2 + 220);
}
