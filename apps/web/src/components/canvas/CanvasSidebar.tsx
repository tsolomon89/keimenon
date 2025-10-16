'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Tag, Plus } from 'lucide-react';
import { NavigationBar, TreeNode } from '../common/NavigationBar';
import { SettingsInspector } from '../settings/SettingsInspector';
import { SourceInspector } from './SourceInspector';
import { SelectionStack } from './SelectionStack';
import { AccountInspector } from '../inspector/AccountInspector';
import { InspectorData } from '@/types/canvas';
import { CanvasNode } from '@/store/canvasStore';
import { CreateAccountModal } from '../modals/CreateAccountModal';
import { CreateUserInAccountModal } from '../modals/CreateUserInAccountModal';
import { useShell } from '@/contexts/ShellContext';
import { useOperating } from '@/contexts/OperatingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAccountTree } from '@/hooks/useAccountTree';
import { useGroupsTree, fetchGroupMembers, fetchFolderChildren } from '@/hooks/useGroupsTree';
import { useSettingsTree } from '@/hooks/useSettingsTree';
import { useNodeGroupLookup } from '@/hooks/useNodeGroupLookup';
import { useCanvasStore } from '@/store/canvasStore';
import { NavigationModelFactory } from '@canvas-memory/types/src/navigation.model';

interface CanvasSidebarProps {
  side: 'left' | 'right';
  isOpen: boolean;
  onToggle: () => void;
  onSettingsSectionSelect?: (sectionId: string) => void;
  selectedSettingsControlId?: string | null;
}

export function CanvasSidebar({
  side,
  isOpen,
  onToggle,
  onSettingsSectionSelect,
  selectedSettingsControlId,
}: CanvasSidebarProps) {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className={`w-10 border-${side === 'left' ? 'r' : 'l'} border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 flex items-center justify-center transition-colors`}
      >
        {side === 'left' ? (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-slate-500" />
        )}
      </button>
    );
  }

  // Left sidebar - mode-aware navigation
  if (side === 'left') {
    const { user } = useAuth();
    const { shellMode, canvasMode } = useShell();
    const { operating, switchAccount } = useOperating();
    const { treeData: accountTreeData, loading: accountsLoading } = useAccountTree();
    const { treeData: groupsTreeData, loading: groupsLoading } = useGroupsTree();
    const {
      tree: settingsTreeData,
      loading: settingsLoading,
      error: settingsError,
    } = useSettingsTree();
    const [expandedTreeData, setExpandedTreeData] = useState<TreeNode[]>(groupsTreeData);
    const [_loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
    const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
    const [lastSelectedAccountId, setLastSelectedAccountId] = useState<string | null>(null);
    const canvasStore = useCanvasStore();

    // Subscribe to canvas selection for bidirectional sync (Canvas → Navigation)
    const canvasSelectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
    const canvasSelectedArray = Array.from(canvasSelectedNodeIds);
    const { groupIds: highlightedGroupIds } = useNodeGroupLookup(canvasSelectedArray);

    // Use NavigationModelFactory to determine navigation data (DRY + testable)
    const navModel = NavigationModelFactory.get({
      shellMode,
      canvasMode,
      operatingMode: operating.mode,
      user: user ? { accountType: user.accountType, accountId: user.accountId } : null,
      accountTreeData,
      groupsTreeData,
      settingsTreeData,
      accountsLoading,
      groupsLoading,
      settingsLoading,
      settingsError,
    });

    const {
      mode: navMode,
      title: navTitle,
      searchPlaceholder,
      emptyMessage,
      data: navData,
      showCreateButton,
    } = navModel;

    const handleSelect = async (node: TreeNode, event?: React.MouseEvent) => {
      console.log('Selected node:', node);

      // Handle account selection in CRM mode
      if (navMode === 'accounts' && node.metadata?.accountId) {
        const accountId = node.metadata.accountId as string;
        const accountType = node.metadata.accountType as 'admin' | 'client' | undefined;
        const serviceMode = node.metadata.serviceMode as boolean | undefined;

        // Multi-select logic with modifier keys
        if (event && (event.ctrlKey || event.metaKey)) {
          // Ctrl/Cmd + click: toggle selection
          setSelectedAccountIds((prev) => {
            const next = new Set(prev);
            if (next.has(node.id)) {
              next.delete(node.id);
            } else {
              next.add(node.id);
            }
            return next;
          });
          setLastSelectedAccountId(node.id);

          // Don't switch account in multi-select mode
          return;
        } else if (event && event.shiftKey && lastSelectedAccountId) {
          // Shift + click: range selection
          const flatList: TreeNode[] = [];
          const flatten = (nodes: TreeNode[]) => {
            nodes.forEach((n) => {
              if (n.metadata?.accountId) {
                flatList.push(n);
              }
              if (n.children) {
                flatten(n.children);
              }
            });
          };
          flatten(accountTreeData);

          const lastIndex = flatList.findIndex((n) => n.id === lastSelectedAccountId);
          const currentIndex = flatList.findIndex((n) => n.id === node.id);

          if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const rangeIds = flatList.slice(start, end + 1).map((n) => n.id);

            setSelectedAccountIds(new Set(rangeIds));
          }

          // Don't switch account in multi-select mode
          return;
        } else {
          // Regular click: clear multi-select and select single account
          setSelectedAccountIds(new Set());
          setLastSelectedAccountId(node.id);
        }

        switchAccount(accountId, 'crm', {
          accountType,
          accountName: node.label,
          serviceMode,
        });
      }

      // Handle settings selection
      if (navMode === 'settings') {
        // Navigate to settings section (center canvas will render SettingsCard components)
        if (onSettingsSectionSelect) {
          onSettingsSectionSelect(node.id);
        }
        console.log('Navigate to settings section:', node.id, node.metadata);
      }

      // Handle group/folder selection
      if (navMode === 'groups') {
        const isFolder = node.metadata?.kind === 'Folder';

        if (isFolder) {
          // Lazy-load folder children if not already loaded
          if (!node.children || node.children.length === 0) {
            setLoadingFolders((prev) => new Set(prev).add(node.id));

            try {
              const children = await fetchFolderChildren(node.id);

              // Update the tree data with loaded children
              const updateTreeWithChildren = (nodes: TreeNode[]): TreeNode[] => {
                return nodes.map((n) => {
                  if (n.id === node.id) {
                    return { ...n, children };
                  }
                  if (n.children) {
                    return { ...n, children: updateTreeWithChildren(n.children) };
                  }
                  return n;
                });
              };

              setExpandedTreeData(updateTreeWithChildren(expandedTreeData));
            } catch (error) {
              console.error('Failed to load folder children:', error);
            } finally {
              setLoadingFolders((prev) => {
                const next = new Set(prev);
                next.delete(node.id);
                return next;
              });
            }
          }
        } else {
          // Group: fetch members, filter canvas, and SELECT them
          try {
            const memberIds = await fetchGroupMembers(node.id);
            console.log(`Group ${node.id} has ${memberIds.length} members:`, memberIds);

            // Filter canvas nodes to show only group members
            canvasStore.setFilteredNodeIds(memberIds);

            // Bidirectional sync: Also select the member nodes on canvas
            canvasStore.clearSelection();
            memberIds.forEach((id) => canvasStore.selectNode(id, true));

            // TODO: Optionally zoom to fit the filtered nodes
          } catch (error) {
            console.error('Failed to fetch group members:', error);
          }
        }
      }
    };

    return (
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 backdrop-blur-sm flex flex-col">
        {/* Header */}
        <div className="min-h-[48px] border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between px-3">
          <h2 className="text-sm font-semibold text-slate-300">{navTitle}</h2>
          <div className="flex items-center gap-1">
            {/* + Account button (from navigation model) */}
            {showCreateButton && navMode === 'accounts' && (
              <button
                onClick={() => setShowCreateAccountModal(true)}
                className="p-1 hover:bg-slate-800 rounded text-purple-400 hover:text-purple-300"
                title="Create Account"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onToggle}
              className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NavigationBar */}
        <NavigationBar
          mode={navMode}
          data={navData}
          selectedId={navMode === 'accounts' ? operating.accountId : undefined}
          selectedIds={
            navMode === 'accounts'
              ? selectedAccountIds
              : navMode === 'groups'
                ? highlightedGroupIds
                : undefined
          }
          multiSelect={navMode === 'accounts' || navMode === 'groups'}
          onSelect={handleSelect}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
        />

        {/* Create Account Modal */}
        {showCreateAccountModal && (
          <CreateAccountModal
            onClose={() => setShowCreateAccountModal(false)}
            onSuccess={() => {
              setShowCreateAccountModal(false);
              // TODO: Refetch accounts after creation
            }}
          />
        )}
      </aside>
    );
  }

  // Right sidebar
  const { canvasMode: rightCanvasMode, shellMode: rightShellMode } = useShell();
  const { operating } = useOperating();
  const { treeData: accountTreeData } = useAccountTree();
  const selectedNode = useCanvasStore((state) => state.selectedNode);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const nodes = useCanvasStore((state) => state.nodes);
  const deselectNode = useCanvasStore((state) => state.deselectNode);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const openDetailPanel = useCanvasStore((state) => state.openDetailPanel);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);

  // Find the selected account from account tree
  const findAccountById = (accountId: string): any => {
    const findInNodes = (nodes: TreeNode[]): any => {
      for (const node of nodes) {
        if (node.id === accountId && node.metadata?.accountId) {
          return {
            id: node.metadata.accountId as string,
            name: node.label,
            email: (node.metadata.email as string) || '',
            account_type: (node.metadata.accountType as string) || 'client',
            account_class: (node.metadata.accountClass as string) || 'free',
            created_at: Date.now(),
            updated_at: Date.now(),
          };
        }
        if (node.children) {
          const found = findInNodes(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findInNodes(accountTreeData);
  };

  const selectedAccount = operating.accountId ? findAccountById(operating.accountId) : null;

  // Get all selected accounts (for multi-select mode) - currently not implemented in right sidebar
  // For now, selectedAccounts is just the single selected account if any
  const selectedAccounts = selectedAccount ? [selectedAccount] : [];

  // Helper function to transform CanvasNode to InspectorData
  const transformNodeToInspectorData = (node: CanvasNode): InspectorData => {
    const typeMapping: Record<string, string> = {
      conversation: 'conversation',
      message: 'source_doc',
      source: 'source_doc',
      code: 'code_asset',
    };

    return {
      nodeId: node.id,
      type: typeMapping[node.type] || 'source_doc',
      title: node.data.label || node.id.slice(0, 8),
      details: [
        { label: 'Type', value: node.type, type: 'badge' as const },
        { label: 'ID', value: node.id.slice(0, 12) + '...', type: 'text' as const },
        ...(node.data.metadata?.char_count
          ? [{ label: 'Characters', value: node.data.metadata.char_count, type: 'number' as const }]
          : []),
        ...(node.data.metadata?.created_at
          ? [{ label: 'Created', value: node.data.metadata.created_at, type: 'date' as const }]
          : []),
      ],
      metadata: node.data.metadata || {},
      actions: [
        {
          label: 'Copy ID',
          icon: 'copy',
          onClick: () => {
            navigator.clipboard.writeText(node.id);
            console.log('Copied node ID:', node.id);
          },
        },
        {
          label: 'Add to Scope',
          icon: 'link',
          onClick: () => {
            console.log('TODO: Add to scope:', node.id);
            // TODO: Implement scope builder integration
          },
        },
      ],
    };
  };

  return (
    <aside className="w-96 border-l border-slate-800 bg-slate-900/50 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="min-h-[48px] border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex items-center justify-between px-3">
        <h2 className="text-sm font-semibold text-slate-300">Inspector</h2>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Content - mode-aware */}
      <div className="flex-1 overflow-hidden">
        {rightCanvasMode === 'settings' ? (
          // Settings Inspector
          <SettingsInspector selectedControlId={selectedSettingsControlId || null} />
        ) : rightShellMode === 'crm' && selectedAccounts.length > 1 ? (
          // CRM mode with multi-select → Show multi-select inspector
          <>
            <div className="h-full overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300">
                    {selectedAccounts.length} Accounts Selected
                  </h3>
                  <button
                    onClick={() => setShowCreateUserModal(true)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors"
                  >
                    Add User
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="px-3 py-2 bg-slate-800 border border-slate-700 rounded"
                    >
                      <p className="text-sm font-medium text-slate-200">{account.name}</p>
                      <p className="text-xs text-slate-500">{account.email}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {showCreateUserModal && (
              <CreateUserInAccountModal
                account={selectedAccounts[0]}
                accounts={selectedAccounts}
                onClose={() => setShowCreateUserModal(false)}
                onSuccess={() => {
                  setShowCreateUserModal(false);
                  // TODO: Refetch account users if needed
                }}
              />
            )}
          </>
        ) : rightShellMode === 'crm' && selectedAccount ? (
          // CRM mode with single selected account → Account Inspector
          <>
            <AccountInspector
              account={selectedAccount}
              onCreateUser={() => setShowCreateUserModal(true)}
            />
            {showCreateUserModal && (
              <CreateUserInAccountModal
                account={selectedAccount}
                onClose={() => setShowCreateUserModal(false)}
                onSuccess={() => {
                  setShowCreateUserModal(false);
                  // TODO: Refetch account users if needed
                }}
              />
            )}
          </>
        ) : selectedNodeIds.size > 1 ? (
          // Multi-select → Selection Stack
          <SelectionStack
            selectedNodes={nodes.filter((n) => selectedNodeIds.has(n.id))}
            onRemoveFromSelection={(nodeId) => deselectNode(nodeId)}
            onClearAll={() => clearSelection()}
            onViewDetails={(node) => openDetailPanel(node)}
            onAddToScope={(nodeId) => {
              console.log('Add to scope:', nodeId);
              // TODO: Implement scope builder integration
            }}
            onSequester={(nodeId) => {
              console.log('Sequester node:', nodeId);
              // TODO: Implement sequester functionality
            }}
          />
        ) : selectedNode ? (
          // Single node selected → Source Inspector
          <SourceInspector
            data={transformNodeToInspectorData(selectedNode)}
            onViewFullDetails={() => openDetailPanel(selectedNode)}
          />
        ) : (
          // No selection → Empty state
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center text-sm text-slate-500">
              <Tag className="w-12 h-12 mb-4 text-slate-600 mx-auto" />
              <p>No selection</p>
              <p className="mt-2 text-xs">
                {rightShellMode === 'crm'
                  ? 'Select an account to inspect'
                  : 'Click nodes to inspect'}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
