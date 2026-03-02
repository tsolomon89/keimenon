# Architecture: Runtime Systems

> Invariant: capabilities are enforced through account-aware policy checks.

## 1. Tenancy And Provisioning

### Account Hierarchy

- System Admin: cross-account visibility for support/operations.
- Account Owner: billing and account-level administration.
- User: member of one or more accounts.

### Provisioning Flow

1. Account record is created.
2. Initial admin user is created.
3. Entitlement records are attached to the account.
4. Default workspace/settings are provisioned.

## 2. Entitlements

Features are gated by entitlement records.

- Kind: `Entitlement`
- Fields:
  - `feature_key`
  - `limit`
  - `reset_period`

Enforcement point: middleware runs before protected routes and validates feature access + usage limits.

## 3. Metering

Usage is tracked via `UsageEvent` records.

- Fields:
  - `account_id`
  - `entitlement_id`
  - `amount`
  - `timestamp`

Current usage is computed by time-windowed sums and optionally cached.
