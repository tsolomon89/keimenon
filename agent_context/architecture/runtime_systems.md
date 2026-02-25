# Architecture: Runtime Systems

> **Invariant**: Capabilities are not boolean flags; they are **Entitlements** that are provisioned, metered, and enforced.

## 1. Tenancy & Provisioning
### The Account Hierarchy
- **System Admin**: Cross-tenant visibility (Support/Ops).
- **Tenant Owner**: Owns the billing relationship.
- **User**: A member of a Tenant (can belong to multiple).

### Provisioning Flow
When a deal is closed (Stripe Event):
1.  **Tenant Record** created.
2.  **Admin User** created.
3.  **Entitlement Records** created linked to Tenant.
4.  **Bootstrap Domain** (`tenant.oblio.com`) provisioned.

## 2. Entitlements System
Features are gated by `Entitlement` records.
- **Kind**: `Entitlement`
- **Fields**:
    - `feature_key`: e.g., `ai_writer_access`
    - `limit`: e.g., `5000` (credits/month)
    - `reset_period`: `monthly` | `lifetime`

### Enforcement Point
Middleware `checkEntitlement(featureKey)` runs before protected routes.
- Checks if valid `Entitlement` exists.
- Checks if usage < limit.

## 3. Metering
Usage is tracked via `UsageEvent` records.
- **Kind**: `UsageEvent`
- **Fields**:
    - `tenant_id`
    - `entitlement_id`
    - `amount`: number
    - `timestamp`

**Calculation**: `Current Usage = SUM(amount) WHERE timestamp > period_start`
Cached in Redis/Memory for performance.
