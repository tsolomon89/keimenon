# Scripts Directory

Development and production helper scripts for Keimenon (local-only storage).

## Quick Start

```bash
npm run dev
npm run dev:clean
npm run validate
npm run check-ports
npm run kill-ports
```

## Core Scripts

### `check-port.js`

Check whether a port is currently in use.

```bash
node scripts/check-port.js 3000
```

### `kill-port.js`

Stop processes bound to specific ports.

```bash
node scripts/kill-port.js 3000 4001
node scripts/kill-port.js 3000 --force
```

### `wait-for.js`

Wait for HTTP/TCP endpoints before continuing.

```bash
node scripts/wait-for.js http://localhost:4001/health
node scripts/wait-for.js localhost:4001 --timeout 30000
```

### `validate-env.js`

Validate Node/npm and app environment files.

```bash
node scripts/validate-env.js
node scripts/validate-env.js --verbose
```

Checks include:

- Node.js 22.x
- npm >= 9
- dependency installation
- required local storage env values (`STORAGE_MODE=local`, `LOCAL_DOCS_PATH`, `SQLITE_PATH`)
- API and web URL configuration

### `dev.js`

Development orchestrator.

Flow:

1. Run validation
2. Detect/fix port conflicts
3. Enforce local storage mode
4. Start API
5. Wait for health endpoint
6. Start web app

### `dev-boot.js`

Boot helper that prepares env files/dependencies and then runs `dev.js`.

## Port Reference

| Port | Service | Protocol |
| ---- | ------- | -------- |
| 3000 | Web app | HTTP     |
| 4001 | API     | HTTP     |

## Troubleshooting

### Port conflicts

```bash
npm run check-ports
npm run kill-ports
npm run dev:clean
```

### Environment issues

```bash
npm run validate
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### Restart quickly

```bash
npm run kill-ports
npm run dev
```

## Production Notes

Development scripts are local workflow helpers. For production, use your deployment process (container orchestration, process manager, or platform runtime).
