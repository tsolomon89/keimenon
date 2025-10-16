import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import * as React from 'react';
import { MockAuthContext, MockOperatingContext, MockShellContext } from './test-utils';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock the context hooks
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => {
    const context = React.useContext(MockAuthContext);
    if (!context) {
      throw new Error('useAuth must be used within a ProvidersWrapper');
    }
    return context;
  },
}));

vi.mock('@/contexts/OperatingContext', () => ({
  useOperating: () => {
    const context = React.useContext(MockOperatingContext);
    if (!context) {
      throw new Error('useOperating must be used within a ProvidersWrapper');
    }
    return context;
  },
}));

vi.mock('@/contexts/ShellContext', () => ({
  useShell: () => {
    const context = React.useContext(MockShellContext);
    if (!context) {
      throw new Error('useShell must be used within a ProvidersWrapper');
    }
    return context;
  },
}));

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: (props: any) => {
    return React.createElement('img', props);
  },
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => {
    return React.createElement('a', { href }, children);
  },
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
global.localStorage = localStorageMock as any;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
global.sessionStorage = sessionStorageMock as any;

// Mock fetch
global.fetch = vi.fn();

// Mock IntersectionObserver (for @react-three/fiber, @dnd-kit, etc.)
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver (for responsive components)
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Suppress console errors in tests (optional - comment out if debugging)
// global.console.error = vi.fn();
// global.console.warn = vi.fn();
