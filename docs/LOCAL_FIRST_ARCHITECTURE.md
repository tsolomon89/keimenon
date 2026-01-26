# Local-First Architecture & Deployment Strategy

## 1. Vision vs. Reality

**Goal**: A "Local-First" application where data resides on the user's machine, accessed via a browser interface, but with "Google Docs-like" real-time collaboration capabilities.
**Current State**:

- **Architecture**: REST API (Express) + One-way Updates (Server-Sent Events).
- **Data**: Local Filesystem (SQLite + Uploads) via `docker-compose`.
- **Collaboration**: None. The current system is "Single Player" (one user, one database).

---

## 2. Recommended Deployment (How to Distribute)

Since the goal is "Local First" (User owns the data), you are **distributing software**, not purely hosting a website.

### Phase 1: The "Local Server" (Immediate)

- **Method**: **Docker Desktop**.
- **Deployment**: Provide users with the `docker-compose.prod.yml`.
- **User Flow**:
  1.  User installs Docker.
  2.  Runs `docker-compose up`.
  3.  Opens `localhost:3000` in their browser.
  4.  **Benefit**: Keeps architecture identical to current dev state. Data stays in a docker volume on their disk.

### Phase 2: The "Native App" (Better UX)

- **Method**: **Electron** or **Tauri**.
- **Concept**: Wrap the Next.js Frontend and the Node.js API into a single installable `.exe` or `.dmg`.
- **Why**: Normal users don't use Docker.
- **Technical Challenge**: You must bundle the Node.js backend (and potentially the Neo4j/SQLite binaries) inside the Electron resources.
- **Recommended**: Start with **Electron** since you already use Node.js heavily.

---

## 3. Architecture Roadmap: From "Rest API" to "Google Docs"

To achieve the "Shared Data" feeling (real-time collaboration) while keeping data local, you need a **Local-First Sync Architecture**.

### Step 1: Introduce WebSockets (The Pipe)

- **Current**: `SSEBroadcaster` (One-way: Server -> Client).
- **New**: **Socket.io** or **WS**.
- **Role**: Enables two-way communication. Client sends "User typed X", Server broadcasts "User typed X".

### Step 2: Conflict-Free Replicated Data Types (CRDTs) (The Magic)

This is the standard for "Local First" collaboration (Google Docs style).

- **Library**: **Y.js** (Recommended) or **Automerge**.
- **How it works**:
  1.  **State**: The "Document" (e.g., the Canvas/Graph) is stored as a Y.js Doc.
  2.  **Sync**: When User A moves a node, Y.js computes a small "update delta".
  3.  **Transport**: This delta is sent via WebSocket to other peers.
  4.  **Merge**: Other peers merge the delta mathematically. No conflicts.

### Step 3: The "Sync Server" (The Coordinator)

Even in "Local First", if you want to share with _another_ person, you need a connection.

- **Options**:
  - **P2P (WebRTC)**: Browser-to-Browser. Hard to maintain (firewalls).
  - **Relay Server**: A tiny cloud server that just passes encrypted messages between users. It stores nothing (blind relay).
  - **Self-Hosted**: User A runs the server, User B connects to User A's IP (via Tunnel/Tailscale).

---

## 4. Summary Plan

1.  **Distribution**: Stick to **Docker Compose** for now (Developers/Tech-savvy users). Plan for **Electron** for mass adoption.
2.  **Collaboration**:
    - Install `yjs` and `y-websocket`.
    - Refactor the "Board" component to use Y.js for state instead of just React State.
    - Add a WebSocket server to `apps/api` to handle the sync traffic.
