'use client';

import { useState } from 'react';
import {
  User as UserIcon,
  Mail,
  Shield,
  Calendar,
  Edit,
  Save,
  X,
  Trash2,
  AlertTriangle,
  Loader,
} from 'lucide-react';
import { User as UserType, updateUser, deleteUser } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

interface UserDetailInspectorProps {
  user: UserType;
  onClose: () => void;
  onUserUpdated: () => void;
  onUserDeleted: () => void;
}

/**
 * UserDetailInspector Component
 *
 * Shows user details and edit form in the right sidebar Inspector.
 * Features:
 * - View user details
 * - Inline editing (admin only)
 * - Permission level changes
 * - Active/inactive toggle
 * - Delete user
 */
export function UserDetailInspector({
  user,
  onClose,
  onUserUpdated,
  onUserDeleted,
}: UserDetailInspectorProps) {
  const { user: currentUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(user.name);
  const [permissionLevel, setPermissionLevel] = useState(user.permission_level);
  const [isActive, setIsActive] = useState(user.is_active);
  const [password, setPassword] = useState('');

  const canEdit = currentUser?.permissionLevel === 'admin' || currentUser?.userId === user.id;
  const isSelf = currentUser?.userId === user.id;
  const isAdmin = currentUser?.permissionLevel === 'admin';

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const updates: any = {};

      // Self can only edit name and password
      if (isSelf && !isAdmin) {
        if (name !== user.name) updates.name = name;
        if (password) updates.password = password;
      } else if (isAdmin) {
        // Admin can edit all fields
        if (name !== user.name) updates.name = name;
        if (permissionLevel !== user.permission_level) updates.permission_level = permissionLevel;
        if (isActive !== user.is_active) updates.is_active = isActive;
        if (password) updates.password = password;
      }

      if (Object.keys(updates).length === 0) {
        setIsEditing(false);
        return;
      }

      await updateUser(user.id, updates);
      onUserUpdated();
      setIsEditing(false);
      setPassword('');
    } catch (err: any) {
      console.error('Failed to update user:', err);
      setError(err.message || 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (
      !confirm(`Are you sure you want to delete user "${user.name}"? This action cannot be undone.`)
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await deleteUser(user.id);
      onUserDeleted();
    } catch (err: any) {
      console.error('Failed to delete user:', err);
      setError(err.message || 'Failed to delete user');
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setName(user.name);
    setPermissionLevel(user.permission_level);
    setIsActive(user.is_active);
    setPassword('');
    setError(null);
    setIsEditing(false);
  };

  // Permission badge color
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">User Details</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Error Message */}
        {error && (
          <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        )}

        {/* Edit/Cancel Buttons */}
        {canEdit && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit User
          </button>
        )}

        {/* Permission Notice */}
        {isSelf && !isAdmin && (
          <div className="bg-blue-600/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-xs text-blue-300">
              You can only edit your name and password. Contact an admin to change other settings.
            </p>
          </div>
        )}

        {/* User Info */}
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
              <UserIcon className="w-3 h-3" />
              Name
            </label>
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                placeholder="Enter name"
              />
            ) : (
              <p className="text-sm text-white">{user.name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
              <Mail className="w-3 h-3" />
              Email
            </label>
            <p className="text-sm text-white">{user.email}</p>
            <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
          </div>

          {/* Permission Level */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
              <Shield className="w-3 h-3" />
              Permission Level
            </label>
            {isEditing && isAdmin ? (
              <select
                value={permissionLevel}
                onChange={(e) =>
                  setPermissionLevel(e.target.value as 'junior' | 'senior' | 'leader' | 'admin')
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="junior">Junior (Read-only)</option>
                <option value="senior">Senior (Create)</option>
                <option value="leader">Leader (Delete)</option>
                <option value="admin">Admin (Full access)</option>
              </select>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-xs font-medium ${getPermissionColor(user.permission_level)}`}
              >
                <Shield className="w-3 h-3" />
                {user.permission_level}
              </span>
            )}
          </div>

          {/* Active Status */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
              Status
            </label>
            {isEditing && isAdmin ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700"
                />
                <span className="text-sm text-white">Active</span>
              </label>
            ) : (
              <span
                className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                  user.is_active
                    ? 'bg-green-600/10 border border-green-500/30 text-green-400'
                    : 'bg-red-600/10 border border-red-500/30 text-red-400'
                }`}
              >
                {user.is_active ? 'Active' : 'Inactive'}
              </span>
            )}
          </div>

          {/* User Class */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
              User Class
            </label>
            <p className="text-sm text-white capitalize">{user.user_class}</p>
          </div>

          {/* Password Change */}
          {isEditing && (
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                placeholder="Leave blank to keep current"
              />
              <p className="text-xs text-slate-500 mt-1">
                Leave blank to keep the current password
              </p>
            </div>
          )}

          {/* Created Date */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
              <Calendar className="w-3 h-3" />
              Created
            </label>
            <p className="text-sm text-white">{new Date(user.created_at).toLocaleString()}</p>
          </div>

          {/* Updated Date */}
          {user.updated_at && (
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
                <Calendar className="w-3 h-3" />
                Last Updated
              </label>
              <p className="text-sm text-white">{new Date(user.updated_at).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {isEditing && (
          <div className="space-y-2 pt-4 border-t border-slate-800">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>

            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        )}

        {/* Delete Button */}
        {isAdmin && !isSelf && !isEditing && (
          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={handleDelete}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete User
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
