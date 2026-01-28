@echo off
REM Install Keimenon MCP Servers to User Scope

echo Installing Keimenon MCP servers to user scope...
echo.

echo [1/6] Installing keimenon-database...
claude mcp add --scope user --transport stdio keimenon-database --env SQLITE_PATH=%USERPROFILE%\.keimenon\keimenon.db -- node C:/Development/Projects/ai_convo_parser/.mcp/servers/database/index.js

echo [2/6] Installing keimenon-docs...
claude mcp add --scope user --transport stdio keimenon-docs -- node C:/Development/Projects/ai_convo_parser/.mcp/servers/docs/index.js

echo [3/6] Installing keimenon-api-testing...
claude mcp add --scope user --transport stdio keimenon-api-testing --env API_BASE_URL=http://localhost:4001 -- node C:/Development/Projects/ai_convo_parser/.mcp/servers/api-testing/index.js

echo [4/6] Installing keimenon-chat-import...
claude mcp add --scope user --transport stdio keimenon-chat-import --env API_BASE_URL=http://localhost:4001 -- node C:/Development/Projects/ai_convo_parser/.mcp/servers/chat-import/index.js

echo [5/6] Installing keimenon-settings-crm...
claude mcp add --scope user --transport stdio keimenon-settings-crm --env SQLITE_PATH=%USERPROFILE%\.keimenon\keimenon.db -- node C:/Development/Projects/ai_convo_parser/.mcp/servers/settings-crm/index.js

echo [6/6] Installing playwright-e2e...
claude mcp add --scope user --transport stdio playwright-e2e --env BASE_URL=http://localhost:3000 --env API_BASE_URL=http://localhost:4001 --env TEST_USER_EMAIL=admin@admin.com --env TEST_USER_PASSWORD=admin123 -- node C:/Development/Projects/ai_convo_parser/.mcp/servers/playwright-e2e/index.js

echo.
echo Done! Restart Claude Code and run '/mcp' to verify.
