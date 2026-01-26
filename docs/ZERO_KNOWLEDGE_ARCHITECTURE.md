# Zero-Knowledge / BYO-Compute Architecture Strategy

## 1. The Core Requirement

**Goal**: You (The Provider) want to host a web interface (like `app.canvasmemory.com`) but **store ZERO user data** and **pay ZERO compute costs** for their heavy graph processing.
**Constraint**: The data must stay on the user's machine, but the interface should feel like a modern web app (Google Docs style).

## 2. The Solution: "Inverted Cloud" Architecture

Instead of the traditional "User connects to Cloud API", we invert it: **"Cloud Frontend connects to Local API"**.

### How it works structurally:

1.  **The Web App (Provider Hosted)**:
    - You host `apps/web` (Next.js) on Vercel.
    - It serves the UI (React/Three.js) globally via CDN.
    - **Crucial Difference**: The API Client in the browser is configured to talk to `http://localhost:3001` (or a custom port), NOT `api.canvasmemory.com`.
2.  **The "Engine" (User Installed)**:
    - The user downloads a "Canvas Engine" installer (Docker or Electron).
    - This runs your `apps/api` + `SQLite` + `Neo4j` on _their_ machine.
    - It exposes port `3001` locally.

## 3. Feasibility Analysis (Code Level)

**Verdict**: ✅ **Highly Feasible with current code.**

### Evidence:

1.  **Frontend Config**: `apps/web/src/lib/env.config.ts` loads `API_BASE_URL`.
    - _Action_: We can add a UI dropdown "Connect to Local Engine" which sets this variable at runtime to `http://localhost:3001`.
2.  **Auth Decoupling**: `auth.service.ts` uses local SQLite/JWTs.
    - _Action_: When running locally, the "Authentication" is self-contained. The user "logs in" to their own local database. The hosted Web App simply passes the JWT to the local API.
3.  **Multi-tenancy**:
    - In this model, "Multi-tenancy" is preserved but singular. The local API instance has 1 Tenant (The User). The code structure remains identical, you just don't have 1000s of rows in one DB.

## 4. Implementation Steps (The "BYOD" Plan)

1.  **Modify Web Client (`api-client.ts`)**:
    - Add ability to override `API_BASE_URL` from `localStorage` (e.g., User goes to Settings -> "Connect to Local Core").
    - Handle "CORS" issues (The hosted site `app.com` needs permission to talk to `localhost`).
2.  **Package the Backend**:
    - Create a simple "Installer" (Batch script or Electron wrapper) that runs the Docker Compose file user's machine.
3.  **Data Flow**:
    - User opens `app.yourdomain.com`.
    - Site loads.
    - Site probes `localhost:3001/health`.
    - If found -> functionality enables. Data flows `Local Disk -> Browser`. **Never** touches your servers.

## 5. Summary

This architecture achieves your exact goals:

- **No Storage Cost**: User's disk.
- **No Compute Cost**: User's CPU (for parsing/AI).
- **Zero Liability**: You never possess their data.
- **Google Auth**: Can still be used for "License Verification" on the frontend, while local auth handles the database security.
