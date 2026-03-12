#!/bin/bash
# Install Keimenon MCP Servers to User Scope

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

if command -v cygpath >/dev/null 2>&1; then
  PROJECT_ROOT="$(cygpath -m "$PROJECT_ROOT")"
fi

echo "Installing Keimenon MCP servers to user scope..."
echo

echo "[1/6] Installing keimenon-database..."
claude mcp add --scope user --transport stdio keimenon-database --env SQLITE_PATH="$HOME/.keimenon/keimenon.db" -- node "$PROJECT_ROOT/.mcp/servers/database/index.js"

echo "[2/6] Installing keimenon-docs..."
claude mcp add --scope user --transport stdio keimenon-docs -- node "$PROJECT_ROOT/.mcp/servers/docs/index.js"

echo "[3/6] Installing keimenon-api-testing..."
claude mcp add --scope user --transport stdio keimenon-api-testing --env API_BASE_URL=http://localhost:4001 -- node "$PROJECT_ROOT/.mcp/servers/api-testing/index.js"

echo "[4/6] Installing keimenon-chat-import..."
claude mcp add --scope user --transport stdio keimenon-chat-import --env API_BASE_URL=http://localhost:4001 -- node "$PROJECT_ROOT/.mcp/servers/chat-import/index.js"

echo "[5/6] Installing keimenon-settings-crm..."
claude mcp add --scope user --transport stdio keimenon-settings-crm --env SQLITE_PATH="$HOME/.keimenon/keimenon.db" -- node "$PROJECT_ROOT/.mcp/servers/settings-crm/index.js"

echo "[6/6] Installing playwright-e2e..."
claude mcp add --scope user --transport stdio playwright-e2e --env BASE_URL=http://localhost:3000 --env API_BASE_URL=http://localhost:4001 --env TEST_USER_EMAIL=admin@admin.com --env TEST_USER_PASSWORD=admin123 -- node "$PROJECT_ROOT/.mcp/servers/playwright-e2e/index.js"

echo
echo "Done! Restart Claude Code and run '/mcp' to verify."
