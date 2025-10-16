import { type ClassValue, clsx } from 'clsx';

/**
 * Utility for merging Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
