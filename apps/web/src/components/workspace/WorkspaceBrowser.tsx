'use client';

import { useState, useEffect } from 'react';
import {
  Briefcase,
  Plus,
  Bot,
  Pin,
  Trash2,
  ChevronRight,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { organizationService, Workspace, CreateWorkspaceInput } from '@/services/organization-service';
import { useKeimenonStore } from '@/store/keimenonStore';

interface WorkspaceBrowserProps {
  onWorkspaceSelect?: (workspace: Workspace) => void;
  onCreateWorkspace?: () => void;
  className?: string;
}

export function WorkspaceBrowser({
  onWorkspaceSelect,
  onCreateWorkspace,
  className = '',
}: WorkspaceBrowserProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Get selected nodes from keimenon store for workspace creation
  const selectedNodeIds = useKeimenonStore((state) => state.selectedNodeIds);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await organizationService.listWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setError('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  };

  const handleWorkspaceClick = (workspace: Workspace) => {
    setSelectedWorkspaceId(workspace.id);
    onWorkspaceSelect?.(workspace);
  };

  const handleDeleteWorkspace = async (workspaceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this workspace?')) return;

    try {
      await organizationService.deleteWorkspace(workspaceId);
      setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
      if (selectedWorkspaceId === workspaceId) {
        setSelectedWorkspaceId(null);
      }
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

  const handleCreateClick = () => {
    if (onCreateWorkspace) {
      onCreateWorkspace();
    } else {
      setShowCreateModal(true);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-center text-red-400 text-sm">
          <p>{error}</p>
          <button
            onClick={loadWorkspaces}
            className="mt-2 text-purple-400 hover:text-purple-300 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-slate-200">Workspaces</h3>
          <span className="text-xs text-slate-500">({workspaces.length})</span>
        </div>
        <button
          onClick={handleCreateClick}
          className="p-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded transition-colors"
          title="Create Workspace"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Workspace List */}
      <div className="flex-1 overflow-y-auto">
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <FolderOpen className="w-12 h-12 text-slate-600 mb-4" />
            <p className="text-sm text-slate-400 mb-2">No workspaces yet</p>
            <p className="text-xs text-slate-500 mb-4">
              Select nodes in the graph and create a workspace to organize your work
            </p>
            <button
              onClick={handleCreateClick}
              disabled={selectedNodeIds.size === 0}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm rounded transition-colors"
            >
              {selectedNodeIds.size > 0
                ? `Create from ${selectedNodeIds.size} selected`
                : 'Select nodes first'}
            </button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                selected={workspace.id === selectedWorkspaceId}
                onClick={() => handleWorkspaceClick(workspace)}
                onDelete={(e) => handleDeleteWorkspace(workspace.id, e)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Workspace Modal */}
      {showCreateModal && (
        <CreateWorkspaceModal
          selectedNodeIds={Array.from(selectedNodeIds)}
          onClose={() => setShowCreateModal(false)}
          onCreate={async (input) => {
            try {
              const newWorkspace = await organizationService.createWorkspace(input);
              setWorkspaces((prev) => [newWorkspace, ...prev]);
              setShowCreateModal(false);
              setSelectedWorkspaceId(newWorkspace.id);
              onWorkspaceSelect?.(newWorkspace);
            } catch (err) {
              console.error('Failed to create workspace:', err);
            }
          }}
        />
      )}
    </div>
  );
}

// Workspace Card Component
interface WorkspaceCardProps {
  workspace: Workspace;
  selected?: boolean;
  onClick?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

function WorkspaceCard({ workspace, selected, onClick, onDelete }: WorkspaceCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        p-3 rounded-lg border cursor-pointer transition-all
        ${selected
          ? 'bg-purple-600/20 border-purple-500/50 shadow-lg shadow-purple-500/10'
          : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'}
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-slate-200 line-clamp-1">{workspace.title}</h4>
        <div className="flex items-center gap-1">
          <button
            onClick={onDelete}
            className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Delete workspace"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        {/* Attached agents */}
        {workspace.attached_agents && workspace.attached_agents.length > 0 && (
          <div className="flex items-center gap-1" title="Attached agents">
            <Bot className="w-3.5 h-3.5 text-blue-400" />
            <span>{workspace.attached_agents.length}</span>
          </div>
        )}

        {/* Context pins */}
        {workspace.context_pins && workspace.context_pins.length > 0 && (
          <div className="flex items-center gap-1" title="Pinned context nodes">
            <Pin className="w-3.5 h-3.5 text-amber-400" />
            <span>{workspace.context_pins.length}</span>
          </div>
        )}

        {/* Created date */}
        <span className="ml-auto">
          {new Date(workspace.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

// Create Workspace Modal
interface CreateWorkspaceModalProps {
  selectedNodeIds: string[];
  onClose: () => void;
  onCreate: (input: CreateWorkspaceInput) => Promise<void>;
}

function CreateWorkspaceModal({
  selectedNodeIds,
  onClose,
  onCreate,
}: CreateWorkspaceModalProps) {
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    try {
      await onCreate({
        title: title.trim(),
        context_pins: selectedNodeIds,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Create Workspace</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm text-slate-400 mb-2">Workspace Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Research Project"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />
          </div>

          <div className="mb-6 p-3 bg-slate-800/50 rounded border border-slate-700">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Pin className="w-4 h-4 text-amber-400" />
              <span>
                {selectedNodeIds.length > 0
                  ? `${selectedNodeIds.length} nodes will be pinned as context`
                  : 'No nodes selected - workspace will be empty'}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || creating}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors flex items-center gap-2"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Workspace
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
