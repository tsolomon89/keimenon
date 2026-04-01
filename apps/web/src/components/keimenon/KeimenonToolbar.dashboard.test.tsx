import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KeimenonToolbar } from './KeimenonToolbar';

const mockUseAuth = vi.fn();
const mockUseShell = vi.fn();

const storeState = {
  filters: {
    sourceRoleFilter: new Set<string>(),
  },
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/contexts/ShellContext', () => ({
  useShell: () => mockUseShell(),
}));

vi.mock('@/store/keimenonStore', () => ({
  useKeimenonStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

describe('KeimenonToolbar dashboard views', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        accountType: 'admin',
      },
    });
    mockUseShell.mockReturnValue({
      keimenonMode: 'dashboard',
      setKeimenonMode: vi.fn(),
    });
  });

  it('renders and switches all dashboard views', () => {
    const onDashboardViewChange = vi.fn();

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
        keimenonSurface="keimenon"
        onKeimenonSurfaceChange={vi.fn()}
        dashboardView="analytics"
        onDashboardViewChange={onDashboardViewChange}
        processingAvailable={true}
        autoSwitchToProcessingEnabled={true}
        onAutoSwitchToProcessingChange={vi.fn()}
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

    fireEvent.click(screen.getByTitle('Analytics Overview'));
    fireEvent.click(screen.getByTitle('Storage Statistics'));
    fireEvent.click(screen.getByTitle('Workspace Browser'));
    fireEvent.click(screen.getByTitle('Conversation Browser'));

    expect(onDashboardViewChange).toHaveBeenNthCalledWith(1, 'analytics');
    expect(onDashboardViewChange).toHaveBeenNthCalledWith(2, 'storage');
    expect(onDashboardViewChange).toHaveBeenNthCalledWith(3, 'workspaces');
    expect(onDashboardViewChange).toHaveBeenNthCalledWith(4, 'conversations');
  });
});
