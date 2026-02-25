'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Tag, Plus } from 'lucide-react';
import { NavigationBar, TreeNode } from '../common/NavigationBar';
import { SettingsInspector } from '../settings/SettingsInspector';
import { SourceInspector } from './SourceInspector';
import { SelectionStack } from './SelectionStack';
import { AccountInspector } from '../inspector/AccountInspector';
import { ChatImportModal } from './ChatImportModal';
import { ImportMethodSelector } from './ImportMethodSelector';
import { ImportReviewDrawer } from '../import/ImportReviewDrawer';
import { UserDetailInspector } from '../inspector/UserDetailInspector';
import { InspectorData } from '@/types/keimenon';
import { KeimenonNode } from '@/store/keimenonStore';
import { CreateAccountModal } from '../modals/CreateAccountModal';
import { CreateUserInAccountModal } from '../modals/CreateUserInAccountModal';
import { useShell } from '@/contexts/ShellContext';
import { useOperating } from '@/contexts/OperatingContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAccountTree } from '@/hooks/useAccountTree';
import { useGroupsTree, fetchGroupMembers, fetchFolderChildren } from '@/hooks/useGroupsTree';
import { useSettingsTree } from '@/hooks/useSettingsTree';
import { useNodeGroupLookup } from '@/hooks/useNodeGroupLookup';
import { useKeimenonStore } from '@/store/keimenonStore';
import { NavigationModelFactory } from '@keimenon/types/src/navigation.model';
import { logDataEvent } from '@/lib/error-handler';
import { errorCapture } from '@/services/error-capture.service';
import type { Operation } from '@/contexts/BackgroundOperationsContext';
import { DEBUG_IMPORT_SELECTOR } from '@/lib/env.config';

// Inspector panel types for right sidebar
export type InspectorPanel =
  | 'node-detail' // Single node inspector
  | 'multi-select' // Multi-select stack
  | 'account-detail' // CRM account inspector
  | 'settings-control' // Settings inspector
  | 'import-flow' // Unified import panel
  | 'import-detail' // Import job detail (Manager mode)
  | 'import-review' // Import review panel (duplicates/AI)
  | 'user-detail'; // User detail inspector (Settings > Users)

interface KeimenonSidebarProps {
  side: 'left' | 'right';
  isOpen: boolean;
  onToggle: () => void;
  onSettingsSectionSelect?: (sectionId: string) => void;
  selectedSettingsControlId?: string | null;
  inspectorPanel?: InspectorPanel;
  onInspectorPanelChange?: (panel: InspectorPanel | undefined) => void;
  selectedUser?: any; // User selected from Settings > Users section
  onUserUpdate?: (user: any) => void; // Callback when user is updated
  activeOperation?: Operation | null;
  onViewProcessing?: () => void;
}

export function KeimenonSidebar({
  side,
  isOpen,
  onToggle,
  onSettingsSectionSelect,
  selectedSettingsControlId,
  inspectorPanel: externalInspectorPanel,
  onInspectorPanelChange,
  selectedUser,
  onUserUpdate,
  activeOperation,
  onViewProcessing,
}: KeimenonSidebarProps) {
  const CollapsedSidebar = (
    <button
      onClick={onToggle}
      className={`hidden lg:flex w-10 border-${side === 'left' ? 'r' : 'l'} border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 items-center justify-center transition-colors`}
    >
      {side === 'left' ? (
        <ChevronRight className="w-4 h-4 text-slate-500" />
      ) : (
        <ChevronLeft className="w-4 h-4 text-slate-500" />
      )}
    </button>
  );

  // Left sidebar - mode-aware navigation
  if (side === 'left') {
    const { user } = useAuth();
    const { shellMode, keimenonMode } = useShell();
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
    const keimenonStore = useKeimenonStore();

    // Subscribe to keimenon selection for bidirectional sync (Keimenon → Navigation)
    const keimenonSelectedNodeIds = useKeimenonStore((state) => state.selectedNodeIds);
    const keimenonSelectedArray = Array.from(keimenonSelectedNodeIds);
    const { groupIds: highlightedGroupIds } = useNodeGroupLookup(keimenonSelectedArray);

    // Use NavigationModelFactory to determine navigation data (DRY + testable)
    const navModel = NavigationModelFactory.get({
      shellMode,
      keimenonMode,
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
      logDataEvent('Navigation item selected', 'keimenon.navigation.select', {
        nodeId: node.id,
        navMode,
        shellMode,
      });

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
        // Navigate to settings section (center keimenon will render SettingsCard components)
        if (onSettingsSectionSelect) {
          onSettingsSectionSelect(node.id);
        }
        logDataEvent('Settings navigation item selected', 'keimenon.navigation.settingsSection', {
          nodeId: node.id,
          sectionId: node.metadata?.sectionId,
        });
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
              const err = error instanceof Error ? error : new Error(String(error));
              errorCapture.capture(err, {
                domain: 'api',
                operation: 'keimenon.groups.fetchFolderChildren',
                metadata: { folderId: node.id },
              });
            } finally {
              setLoadingFolders((prev) => {
                const next = new Set(prev);
                next.delete(node.id);
                return next;
              });
            }
          }
        } else {
          // Group: fetch members, filter keimenon, and SELECT them
          try {
            const memberIds = await fetchGroupMembers(node.id);
            logDataEvent('Fetched group members', 'keimenon.navigation.groupMembers', {
              groupId: node.id,
              memberCount: memberIds.length,
            });

            // Filter keimenon nodes to show only group members
            keimenonStore.setFilteredNodeIds(memberIds);

            // Bidirectional sync: Also select the member nodes on keimenon
            keimenonStore.clearSelection();
            memberIds.forEach((id) => keimenonStore.selectNode(id, true));

            // TODO: Implement zoom to fit filtered nodes
            // Related: apps/web/src/components/keimenon/KeimenonViewport.tsx (add zoomToFit method)
            // See: apps/web/src/components/keimenon/Keimenon2D.tsx (camera controls)
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            errorCapture.capture(err, {
              domain: 'api',
              operation: 'keimenon.groups.fetchMembers',
              metadata: { groupId: node.id },
            });
          }
        }
      }
    };

    if (!isOpen) {
      return CollapsedSidebar;
    }

    return (
      <>
        {/* Mobile overlay backdrop */}
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={onToggle} />

        {/* Sidebar */}
        <aside className="fixed lg:static inset-y-0 left-0 z-50 lg:z-auto w-64 lg:w-64 border-r border-slate-800 bg-slate-900 lg:bg-slate-900/50 backdrop-blur-sm flex flex-col shadow-2xl lg:shadow-none">
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
                // Related: apps/web/src/hooks/useAccountTree.tsx (add refetch method)
                // See: apps/api/src/routes/admin.routes.ts (accounts endpoint)
              }}
            />
          )}
        </aside>
      </>
    );
  }

  // Right sidebar
  const { keimenonMode: rightKeimenonMode, shellMode: rightShellMode } = useShell();
  const { operating } = useOperating();
  const { treeData: accountTreeData } = useAccountTree();
  const selectedNode = useKeimenonStore((state) => state.selectedNode);
  const selectedNodeIds = useKeimenonStore((state) => state.selectedNodeIds);
  const nodes = useKeimenonStore((state) => state.nodes);
  const deselectNode = useKeimenonStore((state) => state.deselectNode);
  const clearSelection = useKeimenonStore((state) => state.clearSelection);
  const openDetailPanel = useKeimenonStore((state) => state.openDetailPanel);
  const importCandidates = useKeimenonStore((state) => state.importProcess?.candidates || []);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);

  // Inspector panel state management
  const [internalInspectorPanel, setInternalInspectorPanel] = useState<InspectorPanel | null>(null);
  const [panelHistory, setPanelHistory] = useState<InspectorPanel[]>([]);

  // Use external panel if provided, otherwise use internal
  const currentPanel = externalInspectorPanel || internalInspectorPanel;

  // Helper to change panel and track history
  const changePanel = (newPanel: InspectorPanel) => {
    if (currentPanel && currentPanel !== newPanel) {
      setPanelHistory([...panelHistory, currentPanel]);
    }
    if (onInspectorPanelChange) {
      onInspectorPanelChange(newPanel);
    } else {
      setInternalInspectorPanel(newPanel);
    }
  };

  // Helper to go back to previous panel
  const goBackToPanel = () => {
    if (panelHistory.length > 0) {
      const previousPanel = panelHistory[panelHistory.length - 1];
      setPanelHistory(panelHistory.slice(0, -1));
      if (onInspectorPanelChange) {
        onInspectorPanelChange(previousPanel);
      } else {
        setInternalInspectorPanel(previousPanel);
      }
    } else {
      // No history - return to default state
      if (onInspectorPanelChange) {
        onInspectorPanelChange('node-detail');
      } else {
        setInternalInspectorPanel(null);
      }
    }
  };

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

  // Helper function to transform KeimenonNode to InspectorData
  const transformNodeToInspectorData = (node: KeimenonNode): InspectorData => {
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
            logDataEvent('Copied node ID to clipboard', 'keimenon.node.copyId', {
              nodeId: node.id,
            });
          },
        },
        {
          label: 'Add to Scope',
          icon: 'link',
          onClick: () => {
            errorCapture.warn('Scope builder integration pending', {
              domain: 'ui',
              operation: 'keimenon.scope.add',
              metadata: { nodeId: node.id },
            });
            // TODO: Implement scope builder integration
            // Related: apps/web/src/components/scope/ScopeBuilder.tsx (needs creation)
            // See: docs/features/SCOPE_BUILDER.md (needs creation)
          },
        },
      ],
    };
  };

  if (!isOpen) {
    return CollapsedSidebar;
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={onToggle} />

      {/* Sidebar */}
      <aside className="fixed lg:static inset-y-0 right-0 z-50 lg:z-auto w-80 sm:w-96 lg:w-96 border-l border-slate-800 bg-slate-900 lg:bg-slate-900/50 backdrop-blur-sm flex flex-col shadow-2xl lg:shadow-none">
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
          {currentPanel === 'user-detail' && selectedUser ? (
            // User Detail Inspector (Settings > Users)
            <UserDetailInspector
              user={selectedUser}
              onClose={() => {
                // Clear panel and history
                setInternalInspectorPanel(null);
                setPanelHistory([]);
              }}
              onUpdate={onUserUpdate}
            />
          ) : currentPanel === 'import-flow' ? (
            <>
              {/* NOTE(import-flow): Using ChatImportModal as primary job-based import rail.
                  Legacy ImportModule quarantined to ImportModule.old.tsx.
                  Debug selector enabled via NEXT_PUBLIC_DEBUG_IMPORT_SELECTOR=1. */}
              {DEBUG_IMPORT_SELECTOR ? (
                <ImportMethodSelector
                  onClose={() => {
                    setInternalInspectorPanel(null);
                    setPanelHistory([]);
                  }}
                  onSuccess={() => {
                    onViewProcessing?.();
                  }}
                />
              ) : (
                <ChatImportModal
                  onDismiss={() => {
                    setInternalInspectorPanel(null);
                    setPanelHistory([]);
                  }}
                />
              )}
            </>
          ) : currentPanel === 'import-review' ? (
            <ImportReviewDrawer
              candidates={importCandidates}
              onReviewAction={(id, action) => {
                  useKeimenonStore.getState().updateImportCandidate(id, { status: action === 'merge' ? 'merged' : action === 'reject' ? 'rejected' : 'approved' });
                  console.log('Review action:', id, action);
              }}
              onClose={() => {
                setInternalInspectorPanel(null);
                setPanelHistory([]);
                onInspectorPanelChange?.(undefined);
              }}
            />
          ) : rightKeimenonMode === 'settings' ? (
            // Settings Inspector
            <SettingsInspector selectedControlId={selectedSettingsControlId || null} />
          ) : rightShellMode === 'admin' && selectedAccounts.length > 1 ? (
            // Admin mode with multi-select → Show multi-select inspector
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
                    // TODO: Refetch account users after creation
                    // Related: apps/web/src/components/inspector/AccountInspector.tsx (users list)
                    // See: apps/api/src/routes/admin.routes.ts (users endpoint)
                  }}
                />
              )}
            </>
          ) : rightShellMode === 'admin' && selectedAccount ? (
            // Admin mode with single selected account → Account Inspector
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
                    // TODO: Refetch account users after creation
                    // Related: apps/web/src/components/inspector/AccountInspector.tsx (users list)
                    // See: apps/api/src/routes/admin.routes.ts (users endpoint)
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
                errorCapture.warn('Scope builder integration pending', {
                  domain: 'ui',
                  operation: 'keimenon.scope.add',
                  metadata: { nodeId },
                });
                // TODO: Implement scope builder integration
                // Related: apps/web/src/components/scope/ScopeBuilder.tsx (needs creation)
                // See: docs/features/SCOPE_BUILDER.md (needs creation)
              }}
              onSequester={(nodeId) => {
                errorCapture.warn('Sequester action pending implementation', {
                  domain: 'ui',
                  operation: 'keimenon.scope.sequester',
                  metadata: { nodeId },
                });
                // TODO: Implement sequester functionality
                // Related: apps/api/src/routes/nodes.ts (add sequester endpoint)
                // See: docs/architecture/SEQUESTER.md (needs creation)
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
                  {rightShellMode === 'admin'
                    ? 'Select an account to inspect'
                    : 'Click nodes to inspect'}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
