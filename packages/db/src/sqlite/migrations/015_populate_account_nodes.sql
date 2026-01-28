-- Migration 015: Populate AccountNode and membership edges
-- Purpose: Create graph nodes for existing accounts and users, establish MEMBER_OF edges
-- This makes the M:N user-account relationships visible on the keimenon

-- ============================================================================
-- PART 1: Create AccountNode for each existing account
-- ============================================================================

INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, version)
SELECT
  'account_node_' || a.id AS id,
  'AccountNode' AS kind,
  json_object(
    'sql_account_id', a.id,
    'name', a.name,
    'account_type', a.account_type,
    'account_class', a.account_class,
    'owner_user_id', a.owner_user_id,
    'member_count', (SELECT COUNT(*) FROM user_accounts WHERE account_id = a.id AND status = 'active'),
    'color', CASE a.account_type
      WHEN 'admin' THEN '#3b82f6'  -- Blue for admin
      WHEN 'client' THEN '#10b981' -- Green for client
      ELSE '#6b7280'               -- Gray fallback
    END,
    'icon', CASE a.account_type
      WHEN 'admin' THEN 'shield'
      WHEN 'client' THEN 'briefcase'
      ELSE 'building'
    END
  ) AS properties,
  a.id AS account_id,
  a.owner_user_id AS created_by,
  a.created_at,
  a.updated_at,
  'real' AS data_tag,
  1 AS version
FROM accounts a;

-- ============================================================================
-- PART 2: Create UserNode for each existing user (if not already exists)
-- ============================================================================

-- Only create UserNodes for users that don't already have one
INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at, data_tag, version)
SELECT
  'user_node_' || u.id AS id,
  'UserNode' AS kind,
  json_object(
    'sql_user_id', u.id,
    'email', u.email,
    'name', u.name,
    'user_class', u.user_class,
    'preferences', json_object()
  ) AS properties,
  u.deprecated_account_id AS account_id,  -- Use deprecated for now
  u.id AS created_by,
  u.created_at,
  u.updated_at,
  'real' AS data_tag,
  1 AS version
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM nodes WHERE id = 'user_node_' || u.id
);

-- ============================================================================
-- PART 3: Create MEMBER_OF edges for all user-account relationships
-- ============================================================================

INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag, version)
SELECT
  'edge_member_' || ua.id AS id,
  'MEMBER_OF' AS kind,
  'user_node_' || ua.user_id AS from_id,
  'account_node_' || ua.account_id AS to_id,
  json_object(
    'permission_level', ua.permission_level,
    'role_rank', ua.role_rank,
    'joined_at', ua.joined_at,
    'status', ua.status,
    'invited_by', ua.invited_by
  ) AS properties,
  ua.account_id,
  ua.user_id AS created_by,
  ua.created_at,
  'real' AS data_tag,
  1 AS version
FROM user_accounts ua
WHERE ua.status = 'active';

-- ============================================================================
-- PART 4: Create OWNER_OF edges for account owners
-- ============================================================================

INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag, version)
SELECT
  'edge_owner_' || a.id AS id,
  'OWNER_OF' AS kind,
  'user_node_' || a.owner_user_id AS from_id,
  'account_node_' || a.id AS to_id,
  json_object(
    'created_account_at', a.created_at,
    'cannot_be_removed', 1
  ) AS properties,
  a.id AS account_id,
  a.owner_user_id AS created_by,
  a.created_at,
  'real' AS data_tag,
  1 AS version
FROM accounts a
WHERE a.owner_user_id IS NOT NULL;

-- ============================================================================
-- PART 5: Create ADMIN_OF edges for admin users
-- ============================================================================

INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at, data_tag, version)
SELECT
  'edge_admin_' || ua.id AS id,
  'ADMIN_OF' AS kind,
  'user_node_' || ua.user_id AS from_id,
  'account_node_' || ua.account_id AS to_id,
  json_object(
    'granted_at', ua.created_at
  ) AS properties,
  ua.account_id,
  ua.user_id AS created_by,
  ua.created_at,
  'real' AS data_tag,
  1 AS version
FROM user_accounts ua
WHERE ua.permission_level = 'admin'
  AND ua.status = 'active';

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================

-- Verify AccountNodes created
-- SELECT 'AccountNodes created' AS check, COUNT(*) AS count FROM nodes WHERE kind = 'AccountNode';

-- Verify UserNodes created
-- SELECT 'UserNodes created' AS check, COUNT(*) AS count FROM nodes WHERE kind = 'UserNode';

-- Verify MEMBER_OF edges created
-- SELECT 'MEMBER_OF edges created' AS check, COUNT(*) AS count FROM edges WHERE kind = 'MEMBER_OF';

-- Verify OWNER_OF edges created
-- SELECT 'OWNER_OF edges created' AS check, COUNT(*) AS count FROM edges WHERE kind = 'OWNER_OF';

-- Verify ADMIN_OF edges created
-- SELECT 'ADMIN_OF edges created' AS check, COUNT(*) AS count FROM edges WHERE kind = 'ADMIN_OF';
