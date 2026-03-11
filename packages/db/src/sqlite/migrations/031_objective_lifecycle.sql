-- Objective lifecycle v2
-- Backward compatibility: normalize legacy "unverified" to "provisional"

UPDATE nodes
SET
  properties = json_set(properties, '$.status', 'provisional'),
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE kind = 'ObjectiveClaim'
  AND json_valid(properties) = 1
  AND json_extract(properties, '$.status') = 'unverified';

UPDATE nodes
SET
  properties = json_set(properties, '$.status', 'provisional'),
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE kind = 'ObjectiveClaim'
  AND json_valid(properties) = 1
  AND json_extract(properties, '$.status') IS NULL;

CREATE INDEX IF NOT EXISTS idx_nodes_objective_claim_status
ON nodes(kind, json_extract(properties, '$.status'))
WHERE kind = 'ObjectiveClaim';

