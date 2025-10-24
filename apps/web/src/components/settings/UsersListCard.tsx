'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Search, X, Shield, Edit, Trash2, UserCircle, Loader } from 'lucide-react';
import { User as UserType, getAccountUsers, deleteUser, Account } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { CreateUserInAccountModal } from '@/components/modals/CreateUserInAccountModal';
import { logApiEvent } from '@/lib/error-handler';
import { errorCapture } from '@/services/error-capture.service';

interface UsersListCardProps {
  onUserSelect?: (user: UserType) => void;
  onCreateUser?: () => void;
}

/**
 * UsersListCard Component
 *
 * Displays users list in Settings page (replaces /users page route).
 * Features:
 * - User list with search
 * - Permission badges
 * - Edit and delete actions
 * - Click user to show detail in Inspector
 */
export function UsersListCard({ onUserSelect, onCreateUser }: UsersListCardProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Load users
  useEffect(() => {
    const loadUsers = async () => {
      if (!currentUser) return;

      setIsLoading(true);
      setError(null);

      try {
        const data = await getAccountUsers(currentUser.accountId);
        setUsers(data.users);
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(String(err));
        errorCapture.capture(error, {
          domain: 'api',
          operation: 'settings.users.fetch',
        });
        setError(error.message || 'Failed to load users');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [currentUser]);

  // Filter users based on search
  const filteredUsers = users.filter((user) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.permission_level.toLowerCase().includes(query)
    );
  });

  // Handle user deletion
  const handleDelete = async (userId: string, userName: string) => {
    if (
      !confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)
    ) {
      return;
    }

    setDeletingId(userId);
    setActionError(null);

    try {
      await deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));

      // Log deletion event
      logApiEvent(`User deleted: ${userName}`, {
        domain: 'api',
        operation: 'users.delete',
        metadata: { userId, userName },
      });
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      errorCapture.capture(err, {
        domain: 'ui',
        operation: 'settings.users.delete',
        metadata: { userId },
      });
      setActionError(err.message || 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  // Handle create user modal
  const handleCreateClick = () => {
    if (onCreateUser) {
      onCreateUser();
    } else {
      setShowCreateModal(true);
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    // Reload users list
    if (currentUser) {
      getAccountUsers(currentUser.accountId)
        .then((data) => setUsers(data.users))
        .catch((err) => {
          const error = err instanceof Error ? err : new Error(String(err));
          errorCapture.capture(
            error,
            {
              domain: 'ui',
              operation: 'settings.users.reload',
            },
            'warn'
          );
        });
    }
  };

  // Permission badge styling
  const getPermissionColor = (level: string) => {
    switch (level) {
      case 'admin':
        return 'text-purple-400 bg-purple-600/10 border-purple-500/30';
      case 'leader':
        return 'text-blue-400 bg-blue-600/10 border-blue-500/30';
      case 'senior':
        return 'text-green-400 bg-green-600/10 border-green-500/30';
      case 'junior':
        return 'text-slate-400 bg-slate-600/10 border-slate-500/30';
      default:
        return 'text-slate-400 bg-slate-600/10 border-slate-500/30';
    }
  };

  const canManageUsers = currentUser?.permissionLevel === 'admin';

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-sm text-slate-400">Loading users...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <X className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-300 mb-1">Failed to load users</h3>
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div
          role="alert"
          className="bg-red-900/20 border border-red-500/40 rounded-lg p-3 text-sm text-red-300"
        >
          {actionError}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600 rounded-lg">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Users</h2>
            <p className="text-sm text-slate-400">
              {users.length} {users.length === 1 ? 'user' : 'users'} in your account
            </p>
          </div>
        </div>

        {canManageUsers && (
          <button
            onClick={handleCreateClick}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        )}
      </div>

      {/* Permission Notice */}
      {!canManageUsers && (
        <div className="bg-blue-600/10 border border-blue-500/30 rounded-lg p-4">
          <p className="text-sm text-blue-300">
            You can view users but need admin permission to add, edit, or delete users.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users by name, email, or permission..."
          className="w-full pl-10 pr-10 py-2 bg-slate-900/50 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-3 h-3 text-slate-500" />
          </button>
        )}
      </div>

      {/* Users List */}
      {filteredUsers.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/30 border border-slate-700 rounded-lg">
          <UserCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-4">
            {searchQuery ? `No users found matching "${searchQuery}"` : 'No users found'}
          </p>
          {canManageUsers && !searchQuery && (
            <button
              onClick={onCreateUser}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add First User
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              onClick={() => onUserSelect?.(user)}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-purple-500/50 hover:bg-slate-800 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-base font-semibold text-white">{user.name}</h3>

                    {/* Permission Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-xs font-medium ${getPermissionColor(user.permission_level)}`}
                    >
                      <Shield className="w-3 h-3" />
                      {user.permission_level}
                    </span>

                    {/* Agent Badge */}
                    {user.user_class === 'agent' && (
                      <span className="px-2 py-0.5 bg-slate-700 text-slate-300 border border-slate-600 rounded text-xs">
                        Agent
                      </span>
                    )}

                    {/* Inactive Badge */}
                    {!user.is_active && (
                      <span className="px-2 py-0.5 bg-red-900/30 text-red-300 border border-red-500/30 rounded text-xs">
                        Inactive
                      </span>
                    )}

                    {/* Current User Badge */}
                    {currentUser?.userId === user.id && (
                      <span className="px-2 py-0.5 bg-blue-900/30 text-blue-300 border border-blue-500/30 rounded text-xs">
                        You
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-400 mb-1">{user.email}</p>
                  <p className="text-xs text-slate-500">
                    Created: {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 ml-4">
                  {canManageUsers && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUserSelect?.(user);
                        }}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        title="Edit user"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      {currentUser?.userId !== user.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(user.id, user.name);
                          }}
                          disabled={deletingId === user.id}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete user"
                        >
                          {deletingId === user.id ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {filteredUsers.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
          <span>
            Showing {filteredUsers.length} of {users.length} {users.length === 1 ? 'user' : 'users'}
          </span>
          {searchQuery && <span>• Filtered by: "{searchQuery}"</span>}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && currentUser && (
        <CreateUserInAccountModal
          account={
            {
              id: currentUser.accountId,
              name: 'Current Account',
              account_type: currentUser.accountType,
              account_class: currentUser.accountClass,
            } as Account
          }
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
}
