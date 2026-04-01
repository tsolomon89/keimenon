import Database from 'better-sqlite3';
import { generateFingerprint } from './fingerprint';

type PrincipalKind = 'human' | 'agent' | 'contact';

interface PrincipalCapabilities {
  can_upload: boolean;
  can_run_tools: boolean;
  can_import_web: boolean;
  can_own_account: boolean;
  can_approve_runs: boolean;
}

interface EnsurePrincipalOptions {
  accountId: string;
  identifier: string;
  createdByUserId: string;
  principalKind: PrincipalKind;
  displayName: string;
  email?: string;
  contactInfo?: Record<string, unknown>;
  capabilities?: PrincipalCapabilities;
  now?: number;
}

interface EnsureAccountPrincipalLinkOptions {
  accountId: string;
  principalId: string;
  createdByUserId: string;
  membershipRole: 'owner' | 'admin' | 'member' | 'agent' | 'contact';
  now?: number;
}

const DEFAULT_CAPABILITIES: Record<PrincipalKind, PrincipalCapabilities> = {
  human: {
    can_upload: true,
    can_run_tools: false,
    can_import_web: false,
    can_own_account: true,
    can_approve_runs: true,
  },
  agent: {
    can_upload: true,
    can_run_tools: true,
    can_import_web: true,
    can_own_account: false,
    can_approve_runs: false,
  },
  contact: {
    can_upload: false,
    can_run_tools: false,
    can_import_web: false,
    can_own_account: false,
    can_approve_runs: false,
  },
};

function roleRankToMembershipRole(
  permissionLevel: string | undefined,
  isOwner: boolean,
  principalKind: PrincipalKind
): EnsureAccountPrincipalLinkOptions['membershipRole'] {
  if (principalKind === 'agent') {
    return 'agent';
  }
  if (principalKind === 'contact') {
    return 'contact';
  }
  if (isOwner) {
    return 'owner';
  }
  if (permissionLevel === 'admin') {
    return 'admin';
  }
  return 'member';
}

export function buildDeterministicPrincipalId(accountId: string, identifier: string): string {
  const hash = generateFingerprint(`principal:${accountId}:${identifier}`);
  return `principal_${hash.slice(0, 16)}`;
}

export function ensureAccountNode(
  database: Database.Database,
  accountId: string,
  createdByUserId: string,
  now: number = Date.now()
): string {
  let accountRow:
    | {
        id: string;
        name: string;
        account_type: 'admin' | 'client';
        account_class: 'free' | 'professional' | 'business';
        owner_user_id: string | null;
        created_at: number | null;
        updated_at: number | null;
      }
    | undefined;
  try {
    accountRow = database
      .prepare(
        `
          SELECT id, name, account_type, account_class, owner_user_id, created_at, updated_at
          FROM accounts
          WHERE id = ?
        `
      )
      .get(accountId) as
      | {
          id: string;
          name: string;
          account_type: 'admin' | 'client';
          account_class: 'free' | 'professional' | 'business';
          owner_user_id: string | null;
          created_at: number | null;
          updated_at: number | null;
        }
      | undefined;
  } catch {
    accountRow = undefined;
  }

  let memberCountRow: { count?: number } | undefined;
  try {
    memberCountRow = database
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM user_accounts
          WHERE account_id = ? AND status = 'active'
        `
      )
      .get(accountId) as { count?: number } | undefined;
  } catch {
    memberCountRow = { count: undefined };
  }

  const hydratedAccount = accountRow || {
    id: accountId,
    name: `Account ${accountId.slice(0, 8)}`,
    account_type: 'client' as const,
    account_class: 'free' as const,
    owner_user_id: null,
    created_at: now,
    updated_at: now,
  };

  const accountNodeId = `account_node_${accountId}`;
  const properties = JSON.stringify({
    id: accountNodeId,
    kind: 'AccountNode',
    sql_account_id: hydratedAccount.id,
    name: hydratedAccount.name,
    account_type: hydratedAccount.account_type,
    account_class: hydratedAccount.account_class,
    owner_user_id: hydratedAccount.owner_user_id || undefined,
    member_count: Number(memberCountRow?.count ?? 0),
    color: hydratedAccount.account_type === 'admin' ? '#3b82f6' : '#10b981',
    icon: hydratedAccount.account_type === 'admin' ? 'shield' : 'briefcase',
    created_at: hydratedAccount.created_at ?? now,
    updated_at: now,
  });

  try {
    database
      .prepare(
        `
          INSERT OR IGNORE INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
          VALUES (?, 'AccountNode', ?, ?, ?, ?, ?)
        `
      )
      .run(
        accountNodeId,
        properties,
        accountId,
        createdByUserId,
        hydratedAccount.created_at ?? now,
        hydratedAccount.updated_at ?? now
      );

    database
      .prepare(
        `
          UPDATE nodes
          SET properties = ?, updated_at = ?
          WHERE id = ? AND account_id = ?
        `
      )
      .run(properties, now, accountNodeId, accountId);
  } catch {
    return accountNodeId;
  }

  return accountNodeId;
}

export function ensurePrincipalNode(
  database: Database.Database,
  options: EnsurePrincipalOptions
): string {
  const now = options.now ?? Date.now();
  const principalId = buildDeterministicPrincipalId(options.accountId, options.identifier);

  const existing = database
    .prepare(
      `
        SELECT id
        FROM nodes
        WHERE id = ? AND kind = 'Principal' AND account_id = ?
      `
    )
    .get(principalId, options.accountId) as { id?: string } | undefined;

  if (existing?.id) {
    return principalId;
  }

  const capabilities = options.capabilities ?? DEFAULT_CAPABILITIES[options.principalKind];
  const properties = JSON.stringify({
    id: principalId,
    kind: 'Principal',
    display_name: options.displayName,
    email: options.email,
    principal_kind: options.principalKind,
    capabilities,
    contact_info: options.contactInfo,
    created_at: now,
    updated_at: now,
  });

  database
    .prepare(
      `
        INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
        VALUES (?, 'Principal', ?, ?, ?, ?, ?)
      `
    )
    .run(principalId, properties, options.accountId, options.createdByUserId, now, now);

  return principalId;
}

export function ensureAccountContainsPrincipal(
  database: Database.Database,
  options: EnsureAccountPrincipalLinkOptions
): { accountNodeId: string; containsEdgeId: string } {
  const now = options.now ?? Date.now();
  const accountNodeId = ensureAccountNode(
    database,
    options.accountId,
    options.createdByUserId,
    now
  );
  const containsEdgeId = `edge_contains_account_principal_${generateFingerprint(
    `${options.accountId}:${options.principalId}`
  ).slice(0, 24)}`;
  const containsProperties = JSON.stringify({
    membership_role: options.membershipRole,
    hierarchy_relation: 'account_contains_principal',
  });

  try {
    database
      .prepare(
        `
          INSERT OR IGNORE INTO edges (
            id, kind, from_id, to_id, properties, account_id, created_by, created_at
          )
          VALUES (?, 'CONTAINS', ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        containsEdgeId,
        accountNodeId,
        options.principalId,
        containsProperties,
        options.accountId,
        options.createdByUserId,
        now
      );
  } catch {
    // No-op for minimal test schemas that do not include full edge tables.
  }

  return { accountNodeId, containsEdgeId };
}

export function ensureOwnerEdge(
  database: Database.Database,
  accountId: string,
  principalId: string,
  accountNodeId: string,
  createdByUserId: string,
  now: number = Date.now()
): string {
  const ownerEdgeId = `edge_owner_account_principal_${generateFingerprint(
    `${accountId}:${principalId}`
  ).slice(0, 24)}`;
  const ownerProperties = JSON.stringify({
    hierarchy_relation: 'principal_owns_account',
    cannot_be_removed: 1,
  });

  try {
    database
      .prepare(
        `
          INSERT OR IGNORE INTO edges (
            id, kind, from_id, to_id, properties, account_id, created_by, created_at
          )
          VALUES (?, 'OWNER_OF', ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        ownerEdgeId,
        principalId,
        accountNodeId,
        ownerProperties,
        accountId,
        createdByUserId,
        now
      );
  } catch {
    // No-op for minimal test schemas that do not include full edge tables.
  }

  return ownerEdgeId;
}

export function ensureHumanPrincipalHierarchyForUser(
  database: Database.Database,
  accountId: string,
  userId: string,
  actorUserId: string = userId,
  now: number = Date.now()
): { principalId: string; accountNodeId: string } {
  let userRow = database
    .prepare(
      `
        SELECT id, email, name
        FROM users
        WHERE id = ?
      `
    )
    .get(userId) as { id: string; email: string | null; name: string | null } | undefined;
  if (!userRow) {
    userRow = { id: userId, email: null, name: null };
  }

  let accountRow: { owner_user_id?: string | null } | undefined;
  try {
    accountRow = database
      .prepare(
        `
          SELECT owner_user_id
          FROM accounts
          WHERE id = ?
        `
      )
      .get(accountId) as { owner_user_id?: string | null } | undefined;
  } catch {
    accountRow = undefined;
  }

  let membershipRow: { permission_level?: string } | undefined;
  try {
    membershipRow = database
      .prepare(
        `
          SELECT permission_level
          FROM user_accounts
          WHERE account_id = ? AND user_id = ? AND status = 'active'
          LIMIT 1
        `
      )
      .get(accountId, userId) as { permission_level?: string } | undefined;
  } catch {
    membershipRow = undefined;
  }

  const principalId = ensurePrincipalNode(database, {
    accountId,
    identifier: userId,
    createdByUserId: actorUserId,
    principalKind: 'human',
    displayName: userRow.name || userRow.email || `User ${userId.slice(0, 8)}`,
    email: userRow.email || undefined,
    now,
  });

  const isOwner = accountRow?.owner_user_id === userId;
  const membershipRole = roleRankToMembershipRole(
    membershipRow?.permission_level,
    isOwner,
    'human'
  );
  const { accountNodeId } = ensureAccountContainsPrincipal(database, {
    accountId,
    principalId,
    createdByUserId: actorUserId,
    membershipRole,
    now,
  });

  if (isOwner) {
    ensureOwnerEdge(database, accountId, principalId, accountNodeId, actorUserId, now);
  }

  return { principalId, accountNodeId };
}

export function ensureAgentPrincipalHierarchy(
  database: Database.Database,
  accountId: string,
  principalId: string,
  actorUserId: string,
  now: number = Date.now()
): string {
  const { accountNodeId } = ensureAccountContainsPrincipal(database, {
    accountId,
    principalId,
    createdByUserId: actorUserId,
    membershipRole: 'agent',
    now,
  });
  return accountNodeId;
}
