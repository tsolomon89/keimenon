'use client';

import { useState } from 'react';
import Link from 'next/link';
import { User, Shield, Trash2, Edit, UserCircle } from 'lucide-react';
import { User as UserType, deleteUser } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

interface UserListProps {
  users: UserType[];
  onUserDeleted: (userId: string) => void;
}

export function UserList({ users, onUserDeleted }: UserListProps) {
  const { user: currentUser } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(userId);

    try {
      await deleteUser(userId);
      onUserDeleted(userId);
    } catch (error: any) {
      alert(`Failed to delete user: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const getPermissionColor = (level: string) => {
    switch (level) {
      case 'admin':
        return 'text-purple-400';
      case 'leader':
        return 'text-blue-400';
      case 'senior':
        return 'text-green-400';
      case 'junior':
        return 'text-slate-400';
      default:
        return 'text-slate-400';
    }
  };

  const getPermissionBadge = (level: string) => {
    const color = getPermissionColor(level);
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${color}`}>
        <Shield className="w-3 h-3" />
        {level}
      </span>
    );
  };

  if (users.length === 0) {
    return (
      <div className="text-center py-12">
        <UserCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 mb-4">No users found</p>
        <Link
          href="/users/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          <User className="w-4 h-4" />
          Add First User
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {users.map((user) => (
        <div
          key={user.id}
          className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold text-white">{user.name}</h3>
                {getPermissionBadge(user.permission_level)}
                {user.user_class === 'agent' && (
                  <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                    Agent
                  </span>
                )}
                {!user.is_active && (
                  <span className="px-2 py-1 bg-red-900/50 text-red-300 rounded text-xs">
                    Inactive
                  </span>
                )}
                {currentUser?.userId === user.id && (
                  <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs">
                    You
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 mb-1">{user.email}</p>
              <p className="text-xs text-slate-500">
                Created: {new Date(user.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/users/${user.id}`}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Edit user"
              >
                <Edit className="w-4 h-4" />
              </Link>

              {currentUser?.userId !== user.id && (
                <button
                  onClick={() => handleDelete(user.id, user.name)}
                  disabled={deletingId === user.id}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete user"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
