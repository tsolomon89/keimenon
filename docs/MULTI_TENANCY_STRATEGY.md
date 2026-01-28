# Multi-Tenancy & Identity Strategy

## 1. The "Tenant of One" Concept

You asked if the current architecture supports future multi-tenancy while working locally today.
**Answer:** Yes. The software is _already_ built as a SaaS platform.

- **Current State:** When a user installs the Local Engine, they effectively deploy a "Private Cloud" where they are the _only_ tenant.
- **Future State:** To enable "Business Accounts", you simply deploy the _same_ software to a shared server and invite multiple users to the _same_ Account ID.

## 2. Evidence of Readiness

I have audited `auth.service.ts` and `accounts.routes.ts`. The following "Business" features are already dormant in the code:

- **Role-Based Access Control (RBAC)**: Support for `junior`, `senior`, `leader`, `admin` roles.
- **Team Management**: Endpoints to list users in an account and add new members (`POST /api/v1/accounts/:id/users`).
- **Account Switching**: A single user email can belong to multiple Accounts (e.g., "Personal" and "Work").
- **Database Isolation**: All core tables (`nodes`, `edges`, `chats`) are keyed by `account_id`.

## 3. The "Hybrid Identity" Bridge

To make the transition from "Local Solo" to "Cloud Team" seamless, we rely on **Immutable Identity Service** (Google/OAuth).

### Scenario A: Local Work (Zero Knowledge)

1.  User installs App.
2.  Logs in via Google (`tim@example.com`).
3.  Local API creates a user `tim@example.com` in the **local SQLite DB**.
4.  User works on "Project Alpha" (stored locally).

### Scenario B: Cloud Team (Business Account)

1.  You host a shared instance at `team.keimenon.com`.
2.  User logs in via Google (`tim@example.com`).
3.  Cloud API identifies `tim@example.com` and grants access to the shared "Business Account".
4.  User works on "Project Beta" (stored in Cloud Neo4j).

### The "Client Switch"

The Frontend (`apps/web`) will handle this via a "Connection Switcher":

- **Context 1**: Connected to `localhost:3001` (Your Personal Data).
- **Context 2**: Connected to `team.keimenon.com` (Your Team Data).

## 4. Conclusion

You do **not** need to rebuild account management. It is already there. You are simply choosing to deploy separate _instances_ of the database for each user today (Local First), instead of one giant database for everyone (SaaS). The day you want to launch "Enterprise", you just spin up a central server and the code is ready.
