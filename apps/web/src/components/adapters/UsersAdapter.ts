/**
 * UsersAdapter - Data adapter for user management
 *
 * Note: This is a simplified mock version for the PoC.
 * In production, this would use the actual API client with proper types.
 */

import { DataAdapter, bindObject } from './DataAdapter';
import { BoundObject } from '../primitives';

/**
 * Simplified User type for the PoC
 */
interface SimpleUser {
  id: string;
  email: string;
  name: string;
  permission_level: string;
  account_id: string;
}

/**
 * UsersAdapter Implementation (Mock for PoC)
 *
 * This is intentionally simplified to avoid type conflicts.
 * In production, this would integrate with the real API.
 */
export class UsersAdapter implements DataAdapter<SimpleUser> {
  constructor(private currentUserPermissions: string = 'read') {}

  async fetchAll(): Promise<BoundObject[]> {
    // Mock data for PoC
    const mockUsers: SimpleUser[] = [
      {
        id: 'user_1',
        email: 'admin@example.com',
        name: 'Admin User',
        permission_level: 'admin',
        account_id: 'acc_1',
      },
      {
        id: 'user_2',
        email: 'user@example.com',
        name: 'Regular User',
        permission_level: 'senior',
        account_id: 'acc_1',
      },
    ];

    return mockUsers.map((user) => {
      const capabilities = {
        canEdit: this.currentUserPermissions === 'admin',
        canDelete: this.currentUserPermissions === 'admin' && user.permission_level !== 'admin',
        canCreate: this.currentUserPermissions === 'admin',
      };

      return bindObject(user, 'user', capabilities);
    });
  }

  async fetchOne(id: string): Promise<BoundObject> {
    const users = await this.fetchAll();
    const user = users.find((u: any) => u.data.id === id);
    if (!user) throw new Error(`User not found: ${id}`);
    return user;
  }

  async create(data: Partial<SimpleUser>): Promise<BoundObject> {
    // Mock implementation
    const newUser: SimpleUser = {
      id: `user_${Date.now()}`,
      email: data.email || '',
      name: data.name || '',
      permission_level: data.permission_level || 'junior',
      account_id: data.account_id || '',
    };

    return bindObject(newUser, 'user', {
      canEdit: true,
      canDelete: true,
      canCreate: true,
    });
  }

  async update(id: string, data: Partial<SimpleUser>): Promise<BoundObject> {
    // Mock implementation
    const user = await this.fetchOne(id);
    const updatedUser = { ...user.data, ...data };
    return bindObject(updatedUser, 'user', user._capabilities);
  }

  async delete(id: string): Promise<void> {
    // Mock implementation
    console.log('Delete user:', id);
  }
}
