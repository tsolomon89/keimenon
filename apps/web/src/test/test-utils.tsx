import * as React from 'react';
import { ReactElement, ReactNode, createContext } from 'react';
import { render, RenderOptions } from '@testing-library/react';

// Define context types
export interface User {
  id: string;
  accountId: string;
  email: string;
  name: string;
  accountType: 'admin' | 'client';
  accountClass: 'free' | 'professional' | 'business';
  rank: number;
  permissionLevel: 'junior' | 'senior' | 'leader' | 'admin';
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ token: string; user: User }>;
  register: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ token: string; user: User }>;
  logout: () => Promise<void>;
}

export interface OperatingContextType {
  operating: {
    mode: 'native' | 'cross-tenant';
    accountId: string | null;
    accountName: string | null;
    serviceMode: boolean;
  };
  isOperatingMode: boolean;
  switchAccount: (accountId: string, mode: string, config?: any) => Promise<void>;
  exitOperatingMode: () => void;
}

export interface ShellContextType {
  shellMode: 'admin' | 'client';
  keimenonMode: 'auth' | 'dashboard' | 'settings' | 'keimenon';
  setShellMode: (mode: 'admin' | 'client') => void;
  setKeimenonMode: (mode: 'auth' | 'dashboard' | 'settings' | 'keimenon') => void;
  canAccessPortal: () => boolean;
}

// Create mock contexts
export const MockAuthContext = createContext<AuthContextType | undefined>(undefined);
export const MockOperatingContext = createContext<OperatingContextType | undefined>(undefined);
export const MockShellContext = createContext<ShellContextType | undefined>(undefined);

// Mock user factory
export function mockUser(overrides?: Partial<User>): User {
  return {
    id: 'user_test_123',
    accountId: 'account_test_123',
    email: 'test@test.com',
    name: 'Test User',
    accountType: 'client',
    accountClass: 'professional',
    rank: 2, // Senior by default
    permissionLevel: 'senior',
    ...overrides,
  };
}

// Mock admin user factory
export function mockAdminUser(overrides?: Partial<User>): User {
  return mockUser({
    accountType: 'admin',
    accountClass: 'business',
    rank: 4, // Admin-admin
    permissionLevel: 'admin',
    ...overrides,
  });
}

// Mock AuthContext value
export function mockAuthContext(overrides?: Partial<AuthContextType>): AuthContextType {
  return {
    user: mockUser(),
    token: 'mock_jwt_token',
    loading: false,
    login: async () => ({ token: 'mock_token', user: mockUser() }),
    register: async () => ({ token: 'mock_token', user: mockUser() }),
    logout: async () => {},
    ...overrides,
  };
}

// Mock OperatingContext value
export function mockOperatingContext(
  overrides?: Partial<OperatingContextType>
): OperatingContextType {
  return {
    operating: {
      mode: 'native',
      accountId: null,
      accountName: null,
      serviceMode: false,
    },
    isOperatingMode: false,
    switchAccount: async () => {},
    exitOperatingMode: () => {},
    ...overrides,
  };
}

// Mock ShellContext value
export function mockShellContext(overrides?: Partial<ShellContextType>): ShellContextType {
  return {
    shellMode: 'admin',
    keimenonMode: 'keimenon',
    setShellMode: () => {},
    setKeimenonMode: () => {},
    canAccessPortal: () => true,
    ...overrides,
  };
}

interface ProvidersWrapperProps {
  children: ReactNode;
  authContext?: Partial<AuthContextType>;
  operatingContext?: Partial<OperatingContextType>;
  shellContext?: Partial<ShellContextType>;
}

/**
 * Wrapper component that provides all necessary contexts for testing
 */
export function ProvidersWrapper({
  children,
  authContext,
  operatingContext,
  shellContext,
}: ProvidersWrapperProps) {
  const authValue = mockAuthContext(authContext);
  const operatingValue = mockOperatingContext(operatingContext);
  const shellValue = mockShellContext(shellContext);

  return (
    <MockAuthContext.Provider value={authValue}>
      <MockOperatingContext.Provider value={operatingValue}>
        <MockShellContext.Provider value={shellValue}>{children}</MockShellContext.Provider>
      </MockOperatingContext.Provider>
    </MockAuthContext.Provider>
  );
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  authContext?: Partial<AuthContextType>;
  operatingContext?: Partial<OperatingContextType>;
  shellContext?: Partial<ShellContextType>;
}

/**
 * Custom render function that wraps components with all providers
 * Usage:
 *   renderWithProviders(<MyComponent />, {
 *     authContext: { user: mockAdminUser() }
 *   })
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: CustomRenderOptions
): ReturnType<typeof render> {
  const { authContext, operatingContext, shellContext, ...renderOptions } = options || {};

  return render(ui, {
    wrapper: ({ children }) => (
      <ProvidersWrapper
        authContext={authContext}
        operatingContext={operatingContext}
        shellContext={shellContext}
      >
        {children}
      </ProvidersWrapper>
    ),
    ...renderOptions,
  });
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
