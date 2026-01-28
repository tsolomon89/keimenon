'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users as UsersIcon, Plus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAccountUsers, User } from '@/lib/api-client';
import { UserList } from '@/components/users/UserList';

export default function UsersPage() {
  const router = useRouter();
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Load users
  useEffect(() => {
    if (!currentUser) return;

    const loadUsers = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getAccountUsers(currentUser.accountId);
        setUsers(data.users);
      } catch (err: any) {
        console.error('Failed to load users:', err);
        setError(err.message || 'Failed to load users');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [currentUser]);

  const handleUserDeleted = (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  // Show loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading users...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
            <p className="text-red-300 mb-4">Failed to load users: {error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canManageUsers = currentUser?.permissionLevel === 'admin';

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/keimenon"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Keimenon
          </Link>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-600 rounded-lg">
                <UsersIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">User Management</h1>
                <p className="text-slate-400 mt-1">
                  Manage users in your account ({users.length}{' '}
                  {users.length === 1 ? 'user' : 'users'})
                </p>
              </div>
            </div>

            {canManageUsers && (
              <Link
                href="/users/new"
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add User
              </Link>
            )}
          </div>
        </div>

        {/* Permission Notice */}
        {!canManageUsers && (
          <div className="mb-6 bg-blue-900/20 border border-blue-500/50 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              You can view users but need admin permission to add, edit, or delete users.
            </p>
          </div>
        )}

        {/* User List */}
        <UserList users={users} onUserDeleted={handleUserDeleted} />
      </div>
    </div>
  );
}
