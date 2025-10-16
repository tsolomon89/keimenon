'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createUser } from '@/lib/api-client';
import { UserForm } from '@/components/users/UserForm';

export default function NewUserPage() {
  const router = useRouter();
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    } else if (!authLoading && currentUser?.permissionLevel !== 'admin') {
      router.push('/users');
    }
  }, [isAuthenticated, authLoading, currentUser, router]);

  const handleSubmit = async (data: {
    name: string;
    email: string;
    password?: string;
    permission_level: 'junior' | 'senior' | 'leader' | 'admin';
    user_class: 'person' | 'agent';
  }) => {
    if (!currentUser) return;

    setIsLoading(true);

    try {
      await createUser(currentUser.accountId, data);
      router.push('/users');
    } catch (error: any) {
      console.error('Failed to create user:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.push('/users');
  };

  // Show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

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
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Add New User</h1>
              <p className="text-slate-400 mt-1">
                Create a new user account in your workspace
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <UserForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
