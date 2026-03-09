-- Migration 029: Protect admin account principals from deletion/demotion
-- This is a hard safety net at the DB layer.

DROP TRIGGER IF EXISTS trg_protect_admin_account_delete;
DROP TRIGGER IF EXISTS trg_protect_admin_account_demote;
DROP TRIGGER IF EXISTS trg_protect_admin_user_delete;
DROP TRIGGER IF EXISTS trg_protect_admin_membership_delete;
DROP TRIGGER IF EXISTS trg_protect_admin_membership_reassign;

CREATE TRIGGER trg_protect_admin_account_delete
BEFORE DELETE ON accounts
FOR EACH ROW
WHEN old.account_type = 'admin'
BEGIN
  SELECT RAISE(ABORT, 'Protected admin account cannot be deleted');
END;

CREATE TRIGGER trg_protect_admin_account_demote
BEFORE UPDATE OF account_type ON accounts
FOR EACH ROW
WHEN old.account_type = 'admin' AND new.account_type <> 'admin'
BEGIN
  SELECT RAISE(ABORT, 'Protected admin account cannot be demoted');
END;

CREATE TRIGGER trg_protect_admin_user_delete
BEFORE DELETE ON users
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM user_accounts ua
  JOIN accounts a ON a.id = ua.account_id
  WHERE ua.user_id = old.id
    AND a.account_type = 'admin'
)
BEGIN
  SELECT RAISE(ABORT, 'Protected admin user cannot be deleted');
END;

CREATE TRIGGER trg_protect_admin_membership_delete
BEFORE DELETE ON user_accounts
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM accounts a
  WHERE a.id = old.account_id
    AND a.account_type = 'admin'
)
BEGIN
  SELECT RAISE(ABORT, 'Protected admin membership cannot be deleted');
END;

CREATE TRIGGER trg_protect_admin_membership_reassign
BEFORE UPDATE OF user_id, account_id ON user_accounts
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM accounts a
  WHERE a.id = old.account_id
    AND a.account_type = 'admin'
)
BEGIN
  SELECT RAISE(ABORT, 'Protected admin membership cannot be reassigned');
END;
