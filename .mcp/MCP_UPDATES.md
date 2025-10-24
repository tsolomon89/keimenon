# MCP Updates - Settings/CRM Consolidation

**Date**: 2025-10-21
**Related Branch**: `feature/settings-crm-consolidation`
**Recent Commits**:

- 3f21b46 feat: integrate users list card into settings page
- 880d044 feat: add users list card and detail inspector components
- 32bb218 feat: add users section to settings registry

## Summary

Updated MCP servers to support recent changes to the Canvas Memory OS architecture, particularly:

1. **AccountNode support** - New graph node type for visualizing accounts
2. **UserNode support** - Graph nodes for user management
3. **Settings/CRM consolidation** - New unified settings page with user management

## Changes Made

### 1. Schema Updates ✅

**File**: `packages/db/src/sqlite/schema.sql`

- Added `AccountNode` to the nodes table CHECK constraint
- Previously missing from schema.sql (was only in migrations)
- Now matches the actual database state

### 2. Database MCP Server Updates ✅

**File**: `.mcp/servers/database/index.js`

**Changes**:

- Added `Board` to node kind enum (for future board support)
- Updated `query_nodes` tool to recognize all current node types
- Server now supports querying UserNode and AccountNode types

**New capabilities**:

```javascript
// Can now query:
'Query all UserNode entities';
'Query AccountNode entities with filtering';
'Search for Board nodes when implemented';
```

### 3. New Settings/CRM MCP Server ✅

**File**: `.mcp/servers/settings-crm/index.js`

A specialized server for the new settings and CRM features.

**Tools (7)**:

- `list_users` - List users with filtering (account, permission level)
- `get_user_details` - Get detailed user info including graph nodes
- `list_accounts` - List accounts with statistics
- `get_account_details` - Get detailed account info
- `query_user_account_memberships` - Query UserNode <-> AccountNode edges
- `get_settings` - Get settings (placeholder for future)
- `search_settings` - Search settings (placeholder for future)

**Resources (3)**:

- `canvas-crm://users` - Users directory
- `canvas-crm://accounts` - Accounts directory
- `canvas-crm://user-account-graph` - User-account graph visualization

**Use cases**:

```
"List all users in account acc_123"
"Get details for user usr_456 including graph memberships"
"Query the user-account graph to see relationships"
"List all Business class accounts with stats"
```

### 4. Configuration Updates ✅

Updated MCP configuration in multiple locations:

**Global config**: `~/.mcp.json` (C:\Users\Audna\.mcp.json)

- Added canvas-settings-crm server

**Project config**: `.mcp.json`

- Added canvas-settings-crm server

**VS Code config**: `.vscode/settings.json`

- Added canvas-settings-crm to both GitHub Copilot and Claude Code sections

## Testing

All 5 MCP servers tested and working:

- ✅ canvas-database (5 tools)
- ✅ canvas-docs (5 tools)
- ✅ canvas-api-testing (9 tools)
- ✅ canvas-chat-import (8 tools)
- ✅ canvas-settings-crm (7 tools) - **NEW**

**Total**: 34 specialized tools available for AI-assisted development

## How to Use

### After Restart

**Restart VS Code** to load the new server, then:

1. **User Management**:

```
"List all users with their accounts"
"Show me details for user john@example.com"
"Query all admin-level users"
```

2. **Account Management**:

```
"List all Business class accounts with statistics"
"Get details for account acc_super_admin including users"
"Show me accounts created in the last 30 days"
```

3. **Graph Visualization**:

```
"Query user-account memberships to see the relationship graph"
"Show me all UserNode to AccountNode edges"
"Get the user-account graph for visualization"
```

### Testing the New Server

Run from terminal:

```bash
cd .mcp
node test-mcp-servers.js
```

Or test manually:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  node .mcp/servers/settings-crm/index.js
```

## Architecture Alignment

The new Settings/CRM MCP server aligns with:

1. **Current Feature Work**: Settings page consolidation (commits 3f21b46, 880d044)
2. **Graph Architecture**: UserNode and AccountNode support (migration 015)
3. **Multi-tenant Design**: Account isolation and user management
4. **Settings Registry**: Foundation for settings-as-nodes pattern

## Future Enhancements

Potential additions as the feature evolves:

1. **Settings Storage in Graph**:
   - Implement `get_settings` and `search_settings` when settings move to nodes
   - Add SettingsNode type to schema

2. **CRM Features**:
   - Add tools for contact management
   - Support for organization hierarchies
   - Account relationship visualization

3. **Permissions**:
   - Add permission verification tools
   - RBAC testing utilities
   - Scope validation

4. **Analytics**:
   - User activity metrics
   - Account usage statistics
   - Growth/churn tracking

## Related Documentation

- `.mcp/README.md` - MCP server overview
- `.mcp/USAGE_GUIDE.md` - Usage examples
- `docs/features/GROUPS_NAVIGATION.md` - Related feature docs
- `docs/architecture/OVERVIEW.md` - System architecture

## Notes

- Schema version is now 2.1 (see schema_metadata table)
- All servers use read-only database connections for safety
- Settings/CRM server follows same patterns as database server
- Ready for integration with upcoming CRM dashboard features
