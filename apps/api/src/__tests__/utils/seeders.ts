import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';

/**
 * Seed test accounts
 */
export async function seedAccounts(db: Database.Database) {
  const now = Date.now();

  const accounts = [
    {
      id: 'acc_admin_test',
      account_type: 'admin',
      account_class: 'business',
      account_name: 'Admin Test Account',
      created_at: now,
      updated_at: now,
      mode_service: 0,
    },
    {
      id: 'acc_client1_test',
      account_type: 'client',
      account_class: 'professional',
      account_name: 'Client 1 Test Account',
      created_at: now,
      updated_at: now,
      mode_service: 0,
    },
    {
      id: 'acc_client2_test',
      account_type: 'client',
      account_class: 'free',
      account_name: 'Client 2 Test Account',
      created_at: now,
      updated_at: now,
      mode_service: 0,
    },
    {
      id: 'acc_debug_test',
      account_type: 'client',
      account_class: 'professional',
      account_name: 'Debug Test Account',
      created_at: now,
      updated_at: now,
      mode_service: 1, // Service mode enabled
    },
  ];

  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, account_type, account_class, account_name, created_at, updated_at, mode_service)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const account of accounts) {
    insertAccount.run(
      account.id,
      account.account_type,
      account.account_class,
      account.account_name,
      account.created_at,
      account.updated_at,
      account.mode_service
    );
  }

  return accounts;
}

/**
 * Seed test users
 */
export async function seedUsers(db: Database.Database) {
  const now = Date.now();
  const password = await bcrypt.hash('Test123!', 10);

  const users = [
    {
      id: 'user_admin_test',
      account_id: 'acc_admin_test',
      email: 'admin@test.com',
      password_hash: password,
      name: 'Admin User',
      rank: 4, // Admin-admin
      permission_level: 'admin',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'user_admin_junior',
      account_id: 'acc_admin_test',
      email: 'admin-junior@test.com',
      password_hash: password,
      name: 'Admin Junior User',
      rank: 1, // Admin-junior
      permission_level: 'junior',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'user_client1_senior',
      account_id: 'acc_client1_test',
      email: 'client1@test.com',
      password_hash: password,
      name: 'Client 1 Senior User',
      rank: 2, // Senior
      permission_level: 'senior',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'user_client1_junior',
      account_id: 'acc_client1_test',
      email: 'client1-junior@test.com',
      password_hash: password,
      name: 'Client 1 Junior User',
      rank: 1, // Junior
      permission_level: 'junior',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'user_client2_leader',
      account_id: 'acc_client2_test',
      email: 'client2@test.com',
      password_hash: password,
      name: 'Client 2 Leader User',
      rank: 3, // Leader
      permission_level: 'leader',
      created_at: now,
      updated_at: now,
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, account_id, email, password_hash, name, rank, permission_level, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const user of users) {
    insertUser.run(
      user.id,
      user.account_id,
      user.email,
      user.password_hash,
      user.name,
      user.rank,
      user.permission_level,
      user.created_at,
      user.updated_at
    );
  }

  return users;
}

/**
 * Seed account links (admin manages clients)
 */
export function seedAccountLinks(db: Database.Database) {
  const now = Date.now();

  const links = [
    {
      id: nanoid(),
      admin_account_id: 'acc_admin_test',
      client_account_id: 'acc_client1_test',
      relationship_type: 'manages',
      created_at: now,
    },
    {
      id: nanoid(),
      admin_account_id: 'acc_admin_test',
      client_account_id: 'acc_client2_test',
      relationship_type: 'manages',
      created_at: now,
    },
  ];

  const insertLink = db.prepare(`
    INSERT INTO account_links (id, admin_account_id, client_account_id, relationship_type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const link of links) {
    insertLink.run(
      link.id,
      link.admin_account_id,
      link.client_account_id,
      link.relationship_type,
      link.created_at
    );
  }

  return links;
}

/**
 * Seed test nodes
 */
export function seedNodes(db: Database.Database) {
  const now = Date.now();

  const nodes = [
    {
      id: 'node_client1_1',
      account_id: 'acc_client1_test',
      kind: 'Group',
      data: JSON.stringify({ name: 'Client 1 Group', purpose: 'Testing' }),
      created_at: now,
      updated_at: now,
    },
    {
      id: 'node_client1_2',
      account_id: 'acc_client1_test',
      kind: 'Source',
      data: JSON.stringify({ title: 'Client 1 Source', content: 'Test content' }),
      created_at: now,
      updated_at: now,
    },
    {
      id: 'node_client2_1',
      account_id: 'acc_client2_test',
      kind: 'Group',
      data: JSON.stringify({ name: 'Client 2 Group', purpose: 'Testing' }),
      created_at: now,
      updated_at: now,
    },
  ];

  const insertNode = db.prepare(`
    INSERT INTO nodes (id, account_id, kind, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const node of nodes) {
    insertNode.run(
      node.id,
      node.account_id,
      node.kind,
      node.data,
      node.created_at,
      node.updated_at
    );
  }

  return nodes;
}

/**
 * Seed all test data
 */
export async function seedAll(db: Database.Database) {
  const accounts = await seedAccounts(db);
  const users = await seedUsers(db);
  const links = seedAccountLinks(db);
  const nodes = seedNodes(db);

  return {
    accounts,
    users,
    links,
    nodes,
  };
}
