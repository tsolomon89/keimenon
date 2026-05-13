import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeimenonHeader } from './KeimenonHeader';
import { KeimenonToolbar } from './KeimenonToolbar';
import { KeimenonFooter } from './KeimenonFooter';

const mockUseAuth = vi.fn();
const mockUseOperating = vi.fn();
const mockUseImportProgress = vi.fn();
const mockUseUIVersion = vi.fn();
const mockUseShell = vi.fn();
const mockUseConsole = vi.fn();

const storeState = {
  loadGraphData: vi.fn(),
  filters: {
    sourceRoleFilter: new Set<string>(),
  },
  nodes: [] as Array<{ sourceRole?: string }>,
  edges: [] as Array<unknown>,
  setSourceRoleFilter: vi.fn(),
  setFilteredNodeIds: vi.fn(),
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  getToken: vi.fn(() => 'test-token'),
}));

vi.mock('@/contexts/OperatingContext', () => ({
  useOperating: () => mockUseOperating(),
}));

vi.mock('@/contexts/ImportProgressContext', () => ({
  useImportProgress: () => mockUseImportProgress(),
}));

vi.mock('@/contexts/UIVersionContext', () => ({
  useUIVersion: () => mockUseUIVersion(),
}));

vi.mock('@/contexts/ShellContext', () => ({
  useShell: () => mockUseShell(),
}));

vi.mock('@/contexts/ConsoleContext', () => ({
  useConsole: () => mockUseConsole(),
}));

vi.mock('@/components/auth/AccountSwitcher', () => ({
  AccountSwitcher: () => <div data-testid="account-switcher">Account Switcher</div>,
}));

vi.mock('@/store/keimenonStore', () => ({
  useKeimenonStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

describe('Keimenon shell bars snapshots', () => {
  beforeEach(() => {
    storeState.loadGraphData.mockReset();
    storeState.setSourceRoleFilter.mockReset();
    storeState.filters.sourceRoleFilter = new Set<string>();
    storeState.nodes = [];

    mockUseAuth.mockReturnValue({
      user: {
        accountId: 'acc_1',
        accountType: 'client',
        accountClass: 'professional',
        permissionLevel: 'senior',
        email: 'user@test.dev',
        userId: 'user_1',
      },
      logout: vi.fn(),
      switchAccount: vi.fn(),
    });

    mockUseOperating.mockReturnValue({
      isOperatingMode: false,
      operating: { mode: 'native', accountId: null },
    });

    mockUseImportProgress.mockReturnValue({
      progress: {
        isProcessing: false,
        stage: 'complete',
        message: 'Complete',
        progress: 100,
      },
      openModal: vi.fn(),
    });

    mockUseUIVersion.mockReturnValue({
      uiVersion: 'legacy',
      toggleUIVersion: vi.fn(),
    });

    mockUseShell.mockReturnValue({
      shellMode: 'client',
      keimenonMode: 'keimenon',
      setKeimenonMode: vi.fn(),
    });

    mockUseConsole.mockReturnValue({
      errors: [
        {
          id: 'err_1',
          domain: 'import',
          severity: 'error',
          operation: 'jobs.run',
          timestamp: 1710000000000,
          message: 'Import failed',
          context: { metadata: { stage: 'parsing' } },
          stack: 'Error: Import failed',
        },
      ],
      errorCounts: { error: 1, warn: 0, info: 0, debug: 0 },
      setFilters: vi.fn(),
      clearErrors: vi.fn(),
      exportErrors: vi.fn(() => '[]'),
      activeTab: 'console',
      setActiveTab: vi.fn(),
    });
  });

  it('matches app bar (header) snapshot', () => {
    const { container } = render(<KeimenonHeader />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches toolbar snapshot in keimenon mode', () => {
    const { container } = render(
      <KeimenonToolbar
        onUploadClick={vi.fn()}
        onLeftSidebarToggle={vi.fn()}
        onRightSidebarToggle={vi.fn()}
        onFooterToggle={vi.fn()}
        leftSidebarVisible={true}
        rightSidebarVisible={true}
        footerVisible={false}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onCenterView={vi.fn()}
        dashboardView="analytics"
        onDashboardViewChange={vi.fn()}
        focusModeEnabled={false}
        onFocusModeToggle={vi.fn()}
        includeConnectorNodes={false}
        onConnectorVisibilityToggle={vi.fn()}
        pinnedNodeCount={0}
        onClearPinnedNodes={vi.fn()}
        renderLens="2d"
        onRenderLensChange={vi.fn()}
        ndConfig={{ dims: 8, axes: [0, 1, 2], sliceDim: 3, sliceCenter: 0, sliceWidth: 0.35 }}
        onNdConfigChange={vi.fn()}
      />
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('hides dashboard mode toggle for client accounts', () => {
    render(
      <KeimenonToolbar
        onUploadClick={vi.fn()}
        onLeftSidebarToggle={vi.fn()}
        onRightSidebarToggle={vi.fn()}
        onFooterToggle={vi.fn()}
        leftSidebarVisible={true}
        rightSidebarVisible={true}
        footerVisible={false}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onCenterView={vi.fn()}
        dashboardView="analytics"
        onDashboardViewChange={vi.fn()}
        focusModeEnabled={false}
        onFocusModeToggle={vi.fn()}
        includeConnectorNodes={false}
        onConnectorVisibilityToggle={vi.fn()}
        pinnedNodeCount={0}
        onClearPinnedNodes={vi.fn()}
        renderLens="2d"
        onRenderLensChange={vi.fn()}
        ndConfig={{ dims: 8, axes: [0, 1, 2], sliceDim: 3, sliceCenter: 0, sliceWidth: 0.35 }}
        onNdConfigChange={vi.fn()}
      />
    );

    expect(screen.queryByTitle('Dashboard')).toBeNull();
  });

  it('shows dashboard mode toggle for admin accounts', () => {
    mockUseAuth.mockReturnValue({
      user: {
        accountId: 'acc_admin',
        accountType: 'admin',
        accountClass: 'business',
        permissionLevel: 'admin',
        email: 'admin@test.dev',
        userId: 'admin_1',
      },
      logout: vi.fn(),
      switchAccount: vi.fn(),
    });

    render(
      <KeimenonToolbar
        onUploadClick={vi.fn()}
        onLeftSidebarToggle={vi.fn()}
        onRightSidebarToggle={vi.fn()}
        onFooterToggle={vi.fn()}
        leftSidebarVisible={true}
        rightSidebarVisible={true}
        footerVisible={false}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onCenterView={vi.fn()}
        dashboardView="analytics"
        onDashboardViewChange={vi.fn()}
        focusModeEnabled={false}
        onFocusModeToggle={vi.fn()}
        includeConnectorNodes={false}
        onConnectorVisibilityToggle={vi.fn()}
        pinnedNodeCount={0}
        onClearPinnedNodes={vi.fn()}
        renderLens="2d"
        onRenderLensChange={vi.fn()}
        ndConfig={{ dims: 8, axes: [0, 1, 2], sliceDim: 3, sliceCenter: 0, sliceWidth: 0.35 }}
        onNdConfigChange={vi.fn()}
      />
    );

    expect(screen.queryByTitle('Dashboard')).not.toBeNull();
  });

  it('matches console bar snapshot (collapsed and expanded)', () => {
    const collapsed = render(<KeimenonFooter isOpen={false} />);
    expect(collapsed.container.firstChild).toMatchSnapshot();

    const expanded = render(<KeimenonFooter isOpen={true} />);
    expect(expanded.container.firstChild).toMatchSnapshot();
  });
});
