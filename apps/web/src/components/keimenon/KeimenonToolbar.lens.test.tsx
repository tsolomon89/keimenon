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

function renderToolbar(overrides: Partial<React.ComponentProps<typeof KeimenonToolbar>> = {}) {
  const onRenderLensChange = vi.fn();
  const onZoomIn = vi.fn();
  const onZoomOut = vi.fn();
  const onCenterView = vi.fn();
  const onFocusModeToggle = vi.fn();

  const utils = render(
    <KeimenonToolbar
      onUploadClick={vi.fn()}
      onLeftSidebarToggle={vi.fn()}
      onRightSidebarToggle={vi.fn()}
      onFooterToggle={vi.fn()}
      leftSidebarVisible={true}
      rightSidebarVisible={true}
      footerVisible={false}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onCenterView={onCenterView}
      keimenonSurface="keimenon"
      onKeimenonSurfaceChange={vi.fn()}
      dashboardView="analytics"
      onDashboardViewChange={vi.fn()}
      processingAvailable={true}
      autoSwitchToProcessingEnabled={true}
      onAutoSwitchToProcessingChange={vi.fn()}
      focusModeEnabled={false}
      onFocusModeToggle={onFocusModeToggle}
      includeConnectorNodes={false}
      onConnectorVisibilityToggle={vi.fn()}
      pinnedNodeCount={0}
      onClearPinnedNodes={vi.fn()}
      renderLens="2d"
      onRenderLensChange={onRenderLensChange}
      ndConfig={{ dims: 8, axes: [0, 1, 2], sliceDim: 3, sliceCenter: 0, sliceWidth: 0.35 }}
      onNdConfigChange={vi.fn()}
      {...overrides}
    />
  );

  return {
    ...utils,
    onRenderLensChange,
    onZoomIn,
    onZoomOut,
    onCenterView,
    onFocusModeToggle,
  };
}

describe('KeimenonToolbar lens + camera controls', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: {
        accountType: 'client',
      },
    });
    mockUseShell.mockReturnValue({
      keimenonMode: 'keimenon',
      setKeimenonMode: vi.fn(),
    });
  });

  it('switches between 2D, 3D, and ND lenses', () => {
    const { onRenderLensChange } = renderToolbar();

    fireEvent.click(screen.getAllByTitle('Lens: 2D')[0]);
    fireEvent.click(screen.getAllByTitle('Lens: 3D')[0]);
    fireEvent.click(screen.getAllByTitle('Lens: ND')[0]);

    expect(onRenderLensChange).toHaveBeenNthCalledWith(1, '2d');
    expect(onRenderLensChange).toHaveBeenNthCalledWith(2, '3d');
    expect(onRenderLensChange).toHaveBeenNthCalledWith(3, 'nd');
  });

  it('fires camera controls', () => {
    const { onZoomIn, onZoomOut, onCenterView } = renderToolbar();

    fireEvent.click(screen.getAllByTitle('Camera: Zoom In')[0]);
    fireEvent.click(screen.getAllByTitle('Camera: Zoom Out')[0]);
    fireEvent.click(screen.getAllByTitle('Camera: Center View')[0]);

    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onCenterView).toHaveBeenCalledTimes(1);
  });

  it('fires LOD focus-mode toggle', () => {
    const { onFocusModeToggle } = renderToolbar();
    fireEvent.click(screen.getByTitle('LOD: Focus mode keeps focused neighborhoods visible'));
    expect(onFocusModeToggle).toHaveBeenCalledTimes(1);
  });

  it('renders desktop-full controls and compact mobile strip controls together', () => {
    renderToolbar();
    expect(screen.getAllByTitle('Lens: 2D').length).toBeGreaterThan(1);
    expect(screen.getAllByTitle('Camera: Zoom In').length).toBeGreaterThan(1);
  });
});
