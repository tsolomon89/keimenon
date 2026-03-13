import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { KeimenonSidebar } from './KeimenonSidebar';

const mockUseAuth = vi.fn();
const mockUseShell = vi.fn();
const mockUseOperating = vi.fn();
const mockUseAccountTree = vi.fn();
const mockUseGroupsTree = vi.fn();
const mockUseSettingsTree = vi.fn();
const mockUseNodeGroupLookup = vi.fn();

const storeState = {
  setFilteredNodeIds: vi.fn(),
  clearSelection: vi.fn(),
  selectNode: vi.fn(),
  selectedNode: null as null | {
    id: string;
    type: string;
    data: { label?: string; metadata?: any };
  },
  selectedNodeIds: new Set<string>(),
  nodes: [] as Array<{ id: string }>,
  deselectNode: vi.fn(),
  openDetailPanel: vi.fn(),
};

const navModel = {
  mode: 'groups',
  title: 'Groups',
  searchPlaceholder: 'Search groups...',
  emptyMessage: 'No groups',
  data: [{ id: 'group_1', label: 'Group Alpha', metadata: { kind: 'Group' } }],
  showCreateButton: false,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/contexts/ShellContext', () => ({
  useShell: () => mockUseShell(),
}));

vi.mock('@/contexts/OperatingContext', () => ({
  useOperating: () => mockUseOperating(),
}));

vi.mock('@/hooks/useAccountTree', () => ({
  useAccountTree: () => mockUseAccountTree(),
}));

vi.mock('@/hooks/useGroupsTree', () => ({
  useGroupsTree: () => mockUseGroupsTree(),
  fetchGroupMembers: vi.fn(async () => ['node_1']),
  fetchFolderChildren: vi.fn(async () => []),
}));

vi.mock('@/hooks/useSettingsTree', () => ({
  useSettingsTree: () => mockUseSettingsTree(),
}));

vi.mock('@/hooks/useNodeGroupLookup', () => ({
  useNodeGroupLookup: () => mockUseNodeGroupLookup(),
}));

vi.mock('@/store/keimenonStore', () => ({
  useKeimenonStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('@keimenon/types/src/navigation.model', () => ({
  NavigationModelFactory: {
    get: () => navModel,
  },
}));

vi.mock('../common/NavigationBar', () => ({
  NavigationBar: ({ mode, data }: { mode: string; data: Array<{ id: string; label: string }> }) => (
    <div data-testid="navigation-bar" data-mode={mode}>
      {data.map((item) => (
        <div key={item.id}>{item.label}</div>
      ))}
    </div>
  ),
}));

vi.mock('../settings/SettingsInspector', () => ({
  SettingsInspector: () => <div data-testid="settings-inspector">Settings Inspector</div>,
}));

vi.mock('./SourceInspector', () => ({
  SourceInspector: () => <div data-testid="source-inspector">Source Inspector</div>,
}));

vi.mock('./SelectionStack', () => ({
  SelectionStack: () => <div data-testid="selection-stack">Selection Stack</div>,
}));

vi.mock('../inspector/AccountInspector', () => ({
  AccountInspector: () => <div data-testid="account-inspector">Account Inspector</div>,
}));

vi.mock('./ChatImportModal', () => ({
  ChatImportModal: () => <div data-testid="chat-import-modal">Chat Import Modal</div>,
}));

vi.mock('./ImportMethodSelector', () => ({
  ImportMethodSelector: () => (
    <div data-testid="import-method-selector">Import Method Selector</div>
  ),
}));

vi.mock('../inspector/UserDetailInspector', () => ({
  UserDetailInspector: () => <div data-testid="user-detail-inspector">User Detail Inspector</div>,
}));

vi.mock('../modals/CreateAccountModal', () => ({
  CreateAccountModal: () => <div data-testid="create-account-modal">Create Account Modal</div>,
}));

vi.mock('../modals/CreateUserInAccountModal', () => ({
  CreateUserInAccountModal: () => (
    <div data-testid="create-user-modal">Create User In Account Modal</div>
  ),
}));

vi.mock('@/lib/error-handler', () => ({
  logDataEvent: vi.fn(),
}));

vi.mock('@/services/error-capture.service', () => ({
  errorCapture: {
    capture: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/env.config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env.config')>();
  return {
    ...actual,
    API_BASE_URL: 'http://127.0.0.1:4001',
    DEBUG_IMPORT_SELECTOR: false,
  };
});

describe('KeimenonSidebar snapshots', () => {
  beforeEach(() => {
    storeState.setFilteredNodeIds.mockReset();
    storeState.clearSelection.mockReset();
    storeState.selectNode.mockReset();
    storeState.deselectNode.mockReset();
    storeState.openDetailPanel.mockReset();
    storeState.selectedNode = null;
    storeState.selectedNodeIds = new Set<string>();
    storeState.nodes = [];

    mockUseAuth.mockReturnValue({
      user: {
        accountId: 'acc_1',
        accountType: 'client',
      },
    });

    mockUseShell.mockReturnValue({
      shellMode: 'client',
      keimenonMode: 'keimenon',
    });

    mockUseOperating.mockReturnValue({
      operating: {
        mode: 'native',
        accountId: null,
      },
      switchAccount: vi.fn(),
    });

    mockUseAccountTree.mockReturnValue({
      treeData: [],
      loading: false,
    });

    mockUseGroupsTree.mockReturnValue({
      treeData: [{ id: 'group_1', label: 'Group Alpha', metadata: { kind: 'Group' } }],
      loading: false,
    });

    mockUseSettingsTree.mockReturnValue({
      tree: [],
      loading: false,
      error: null,
    });

    mockUseNodeGroupLookup.mockReturnValue({
      groupIds: new Set<string>(),
    });
  });

  it('matches left sidebar snapshot when open', () => {
    const { container } = render(<KeimenonSidebar side="left" isOpen={true} onToggle={vi.fn()} />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches right sidebar snapshot when open', () => {
    const { container } = render(<KeimenonSidebar side="right" isOpen={true} onToggle={vi.fn()} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
