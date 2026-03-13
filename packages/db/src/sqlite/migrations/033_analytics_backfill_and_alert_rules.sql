-- Backfill analytics billing rows and default alert rules

CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  source TEXT NOT NULL,
  metric_namespace TEXT NOT NULL CHECK(metric_namespace IN ('processing', 'system', 'billing', 'imports')),
  metric_name TEXT NOT NULL,
  comparison TEXT NOT NULL CHECK(comparison IN ('gt', 'gte', 'lt', 'lte', 'eq')),
  threshold REAL NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_tag TEXT DEFAULT 'real' CHECK(data_tag IN ('test', 'real', 'automated', 'manual')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_account ON alert_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_alert_rules_metric ON alert_rules(metric_namespace, metric_name);

INSERT OR IGNORE INTO subscriptions (
  id,
  account_id,
  plan,
  status,
  billing_period,
  amount_cents,
  currency,
  started_at,
  current_period_start,
  current_period_end,
  created_at,
  updated_at,
  data_tag
)
SELECT
  'sub_' || a.id,
  a.id,
  CASE
    WHEN a.account_class = 'business' THEN 'business'
    WHEN a.account_class = 'professional' THEN 'professional'
    ELSE 'free'
  END AS plan,
  'active' AS status,
  'monthly' AS billing_period,
  CASE
    WHEN a.account_class = 'business' THEN 9900
    WHEN a.account_class = 'professional' THEN 2900
    ELSE 0
  END AS amount_cents,
  'USD' AS currency,
  COALESCE(a.created_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000) AS started_at,
  COALESCE(a.created_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000) AS current_period_start,
  COALESCE(a.created_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000) + (30 * 24 * 60 * 60 * 1000) AS current_period_end,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS created_at,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS updated_at,
  'real' AS data_tag
FROM accounts a
WHERE a.account_type = 'client'
  AND NOT EXISTS (
    SELECT 1
    FROM subscriptions s
    WHERE s.account_id = a.id
  );

INSERT OR IGNORE INTO invoices (
  id,
  subscription_id,
  account_id,
  amount_cents,
  currency,
  status,
  issued_at,
  due_at,
  paid_at,
  metadata,
  created_at,
  updated_at,
  data_tag
)
SELECT
  'inv_seed_' || s.id,
  s.id AS subscription_id,
  s.account_id,
  s.amount_cents,
  s.currency,
  CASE WHEN s.amount_cents = 0 THEN 'paid' ELSE 'open' END AS status,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS issued_at,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000 + (14 * 24 * 60 * 60 * 1000) AS due_at,
  CASE WHEN s.amount_cents = 0 THEN CAST(strftime('%s', 'now') AS INTEGER) * 1000 ELSE NULL END AS paid_at,
  json_object('seeded', 1, 'reason', 'analytics_backfill') AS metadata,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS created_at,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS updated_at,
  'real' AS data_tag
FROM subscriptions s
WHERE NOT EXISTS (
  SELECT 1
  FROM invoices i
  WHERE i.subscription_id = s.id
);

INSERT OR IGNORE INTO alert_rules (
  id,
  account_id,
  source,
  metric_namespace,
  metric_name,
  comparison,
  threshold,
  severity,
  enabled,
  created_at,
  updated_at,
  data_tag
)
VALUES
  (
    'rule_system_error_rate',
    NULL,
    'system-health',
    'system',
    'error_rate',
    'gte',
    5.0,
    'high',
    1,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    'real'
  ),
  (
    'rule_system_queue_depth',
    NULL,
    'worker-pool',
    'system',
    'queue_depth',
    'gte',
    100.0,
    'medium',
    1,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    'real'
  ),
  (
    'rule_processing_failed_jobs',
    NULL,
    'job-processing',
    'processing',
    'failed_jobs',
    'gte',
    10.0,
    'high',
    1,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    'real'
  );
