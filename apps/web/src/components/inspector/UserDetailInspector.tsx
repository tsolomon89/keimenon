'use client';

import { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Mail,
  Shield,
  Calendar,
  Edit,
  Save,
  X,
  Loader,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  GitBranch,
} from 'lucide-react';
import { User as UserType, updateUser } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { useShell } from '@/contexts/ShellContext';

interface UserDetailInspectorProps {
  user: UserType;
  onClose?: () => void;
  onUpdate?: (user: UserType) => void;
}

/**
 * UserDetailInspector Component
 *
 * Displays detailed user information in the right inspector panel.
 * Features:
 * - View user details
 * - Edit user properties (admin only)
 * - Update permission level
 * - Toggle active status
 * - Inline form editing
 *
 * Related: docs/inventory.md (User Management section)
 */
export function UserDetailInspector({ user, onClose, onUpdate }: UserDetailInspectorProps) {
  const { user: currentUser } = useAuth();
  const { setKeimenonMode } = useShell();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    permission_level: user.permission_level,
    is_active: user.is_active,
  });

  // Reset form when user changes
  useEffect(() => {
    setFormData({
      name: user.name,
      email: user.email,
      permission_level: user.permission_level,
      is_active: user.is_active,
    });
    setIsEditing(false);
    setError(null);
    setSuccess(false);
  }, [user.id]);

  // Permission checks
  const canEdit = currentUser?.permissionLevel === 'admin' && currentUser?.userId !== user.id;
  const isSelf = currentUser?.userId === user.id;

  // Handle form field changes
  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(false);
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await updateUser(user.id, formData);
      setSuccess(true);
      setIsEditing(false);
      onUpdate?.(response.user);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to update user:', err);
      setError(err.message || 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setFormData({
      name: user.name,
      email: user.email,
      permission_level: user.permission_level,
      is_active: user.is_active,
    });
    setIsEditing(false);
    setError(null);
    setSuccess(false);
  };

  // Permission level colors
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
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-600 rounded-lg">
              <UserIcon className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">User Details</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Edit/Save buttons */}
        <div className="flex items-center gap-2">
          {/* View Keimenon Button - Always visible */}
          <button
            onClick={() => setKeimenonMode('keimenon')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
            title="View this user's keimenon"
          >
            <GitBranch className="w-4 h-4" />
            View Keimenon
          </button>

          {/* Edit User Button - Only for admins */}
          {canEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm"
            >
              <Edit className="w-4 h-4" />
              Edit User
            </button>
          )}

          {/* Save/Cancel Buttons - When editing */}
          {canEdit && isEditing && (
            <>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
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
            </>
          )}
        </div>

        {isSelf && (
          <p className="text-sm text-blue-400 mt-2">
            This is your account. Contact an admin to modify your permissions.
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Success message */}
        {success && (
          <div className="bg-green-600/10 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-300">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">User updated successfully</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-start gap-2 text-red-300">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Failed to update user</p>
                <p className="text-sm text-red-400 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Name */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-400">
            <UserIcon className="w-4 h-4" />
            Name
          </label>
          {isEditing ? (
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Enter name"
            />
          ) : (
            <p className="text-base text-white">{user.name}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-400">
            <Mail className="w-4 h-4" />
            Email
          </label>
          {isEditing ? (
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Enter email"
            />
          ) : (
            <p className="text-base text-white">{user.email}</p>
          )}
        </div>

        {/* Permission Level */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-400">
            <Shield className="w-4 h-4" />
            Permission Level
          </label>
          {isEditing ? (
            <select
              value={formData.permission_level}
              onChange={(e) => handleChange('permission_level', e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="junior">Junior</option>
              <option value="senior">Senior</option>
              <option value="leader">Leader</option>
              <option value="admin">Admin</option>
            </select>
          ) : (
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-medium ${getPermissionColor(user.permission_level)}`}
            >
              <Shield className="w-4 h-4" />
              {user.permission_level}
            </span>
          )}
          <p className="text-xs text-slate-500">Determines what actions this user can perform</p>
        </div>

        {/* Active Status */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-400">
            {formData.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Status
          </label>
          {isEditing ? (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
                className="w-5 h-5 rounded bg-slate-800 border-slate-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-white">Account is active</span>
            </label>
          ) : (
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-medium ${
                user.is_active
                  ? 'text-green-400 bg-green-600/10 border-green-500/30'
                  : 'text-red-400 bg-red-600/10 border-red-500/30'
              }`}
            >
              {user.is_active ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Active
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  Inactive
                </>
              )}
            </span>
          )}
          <p className="text-xs text-slate-500">
            Inactive users cannot log in or access the system
          </p>
        </div>

        {/* Metadata */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <h3 className="text-sm font-medium text-slate-400">Additional Information</h3>

          {/* User Class */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">User Class</span>
            <span className="text-sm text-white capitalize">{user.user_class}</span>
          </div>

          {/* Account ID */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Account ID</span>
            <span className="text-xs text-slate-400 font-mono">{user.account_id}</span>
          </div>

          {/* User ID */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">User ID</span>
            <span className="text-xs text-slate-400 font-mono">{user.id}</span>
          </div>

          {/* Created At */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Created
            </span>
            <span className="text-sm text-white">
              {new Date(user.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {/* Permission Levels Guide */}
        <div className="pt-4 border-t border-slate-800">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Permission Levels Guide</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="inline-block px-2 py-0.5 bg-slate-600/10 border border-slate-500/30 text-slate-400 rounded text-xs font-medium">
                Junior
              </span>
              <span className="text-slate-500">View-only access, cannot modify data</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-block px-2 py-0.5 bg-green-600/10 border border-green-500/30 text-green-400 rounded text-xs font-medium">
                Senior
              </span>
              <span className="text-slate-500">Can edit own data and create content</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-block px-2 py-0.5 bg-blue-600/10 border border-blue-500/30 text-blue-400 rounded text-xs font-medium">
                Leader
              </span>
              <span className="text-slate-500">Can manage groups and team content</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-block px-2 py-0.5 bg-purple-600/10 border border-purple-500/30 text-purple-400 rounded text-xs font-medium">
                Admin
              </span>
              <span className="text-slate-500">Full system access and user management</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
