'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUser, updateUser, User } from '@/lib/api-client';
import { UserForm } from '@/components/users/UserForm';

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Load user
  useEffect(() => {
    if (!currentUser || !userId) return;

    const loadUser = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getUser(userId);
        setUser(data.user);
      } catch (err: any) {
        console.error('Failed to load user:', err);
        setError(err.message || 'Failed to load user');
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, [currentUser, userId]);

  const handleSubmit = async (data: {
    name: string;
    password?: string;
    permission_level: 'junior' | 'senior' | 'leader' | 'admin';
    is_active?: boolean;
  }) => {
    setIsSaving(true);

    try {
      await updateUser(userId, data);
      router.push('/users');
    } catch (error: any) {
      console.error('Failed to update user:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/users');
  };

  // Show loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading user...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !user) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 text-center">
            <p className="text-red-300 mb-4">{error || 'User not found'}</p>
            <Link
              href="/users"
              className="inline-block px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Back to Users
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canEdit = currentUser?.permissionLevel === 'admin' || currentUser?.userId === userId;
  const isSelf = currentUser?.userId === userId;

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/users"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Users
          </Link>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600 rounded-lg">
              <Edit className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                Edit User {isSelf && '(You)'}
              </h1>
              <p className="text-slate-400 mt-1">
                Update user account details
              </p>
            </div>
          </div>
        </div>

        {/* Permission Notice */}
        {!canEdit && (
          <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-lg p-4">
            <p className="text-sm text-red-300">
              You don't have permission to edit this user.
            </p>
          </div>
        )}

        {isSelf && currentUser?.permissionLevel !== 'admin' && (
          <div className="mb-6 bg-blue-900/20 border border-blue-500/50 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              You can only edit your name and password. Contact an admin to change other settings.
            </p>
          </div>
        )}

        {/* Form */}
        {canEdit && (
          <UserForm
            mode="edit"
            initialData={{
              name: user.name,
              email: user.email,
              permission_level: user.permission_level,
              user_class: user.user_class,
              is_active: user.is_active,
            }}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={isSaving}
          />
        )}
      </div>
    </div>
  );
}
