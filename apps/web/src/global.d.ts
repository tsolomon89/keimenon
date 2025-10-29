/**
 * Global type definitions for window object extensions
 *
 * This file extends the Window interface to include custom properties
 * used throughout the application for operating context management.
 */

declare global {
  interface Window {
    /**
     * Current operating account ID (set by OperatingContext)
     * Used when admin users switch to operate in a client account context
     */
    __operatingAccount?: string;

    /**
     * Current operating mode (set by OperatingContext)
     * Possible values: 'native' | 'nested' | 'crm'
     */
    __operatingMode?: 'native' | 'nested' | 'crm';

    /**
     * Keyboard event reference (used for feature flag detection)
     * @deprecated Use proper event handling instead
     */
    event?: Event & { shiftKey?: boolean };
  }
}

// This export makes TypeScript treat this as a module
export {};
