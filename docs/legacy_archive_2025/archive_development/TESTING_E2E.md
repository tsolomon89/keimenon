# End-to-End Testing Guide: Import & Navigation

This guide walks through manual E2E testing of the import-enhanced functionality with both admin and client accounts.

## Prerequisites

1. API server running on port 4001
2. Web frontend running on port 3000
3. Test file ready: `ai_context/chat_data/test-samples/medium.json`

## Test Steps

### 1. Start Services

```bash
# Terminal 1: Start API
cd apps/api
npm run dev

# Terminal 2: Start Frontend
cd apps/web
npm run dev
```

### 2. Test Admin Account Import

1. Navigate to http://localhost:3000
2. Login with admin credentials:
   - Email: `admin@admin.com`
   - Password: (set during seed migration)
3. Verify you're in CRM mode (see "Accounts" in left sidebar)
4. Switch to Keimenon mode (click "Keimenon" button)
5. Verify left sidebar shows "Groups & Folders"
6. Click "Import" button or navigate to import page
7. Upload `ai_context/chat_data/test-samples/medium.json`
8. Configure import settings:
   - ✅ Export code: true
   - Sources role subset: both
   - Sources stitch strategy: by_chat
9. Click "Start Import" and wait for completion
10. **VERIFY**: "Imported Conversations" folder appears in left sidebar
11. **VERIFY**: Expand folder → see groups for each conversation
12. Click on a group
13. **VERIFY**: Keimenon area displays conversation threads
14. **VERIFY**: Right inspector shows group details

### 3. Test Client Account Import

1. Logout from admin account
2. Login with client credentials:
   - Email: `client@client.com`
   - Password: (set during seed migration)
3. Verify you're in Portal mode (see "Groups & Folders" in left sidebar)
4. Click "Import" button
5. Upload a **different** test file (e.g., `small.json`)
6. Start import and wait for completion
7. **VERIFY**: Client sees their own "Imported Conversations" folder
8. **VERIFY**: Folder contains groups from their import only
9. **VERIFY**: Admin's imported data is NOT visible

### 4. Test Tenant Isolation

1. Login as admin
2. Navigate to CRM mode → Accounts view
3. Find client account in list
4. Click client account to inspect
5. **VERIFY**: Cannot see client's imported conversations in admin's keimenon
6. Switch back to Keimenon mode
7. **VERIFY**: Admin sees only admin's imported data

### 5. Test Navigation API Integration

1. Open browser DevTools → Network tab
2. Login as admin and navigate to Keimenon mode
3. Observe network requests:
   - `GET /api/v1/groups/nav` → should return admin's folders/groups
   - Should include `Authorization: Bearer <token>` header
4. Click on a group
5. Observe network requests:
   - `GET /api/v1/groups/nav/{folder_id}` → fetch folder children
   - `GET /api/v1/groups/nav/{group_id}/nodes` → fetch group members
6. **VERIFY**: All requests use authentication
7. **VERIFY**: Responses contain only account-specific data

## Expected Results

### Database State After Import

Query the database to verify:

```sql
-- Admin account should have nodes
SELECT kind, COUNT(*) as count
FROM nodes
WHERE account_id = '<admin_account_id>'
GROUP BY kind;

-- Expected output:
-- ChatThread: N (number of conversations)
-- Message: M (number of messages)
-- Source: S (number of sources)
-- CodeBlock: C (number of code blocks)
-- Folder: 1
-- Group: N (same as ChatThread count)

-- Verify edges have account_id
SELECT kind, COUNT(*) as count
FROM edges
WHERE account_id = '<admin_account_id>'
GROUP BY kind;

-- Expected output:
-- CONTAINS: M (messages in threads)
-- DERIVES_FROM: S + C (sources + code blocks)
-- IN_GROUP: N (threads in groups)
-- FOLDS_INTO_FOLDER: N (groups in folder)
```

### UI State

- **Left Sidebar (Groups & Folders)**:
  - Shows "Imported Conversations" folder
  - Badge shows number of child groups
  - Expanding folder shows list of groups
  - Each group has conversation title
  - Badge shows member count

- **Keimenon Area**:
  - Initially shows all nodes
  - Clicking group filters to show only group members
  - Nodes represent ChatThreads, Messages, Sources, CodeBlocks
  - Edges connect related nodes

- **Right Inspector**:
  - Shows selected node/group details
  - Displays metadata (created_at, char_count, etc.)
  - Provides actions (Copy ID, Add to Scope)

## Troubleshooting

### Import succeeds but nothing appears in sidebar

**Check**:

1. Open browser console for errors
2. Check `/api/v1/groups/nav` returns data
3. Verify nodes have `account_id` set:
   ```sql
   SELECT account_id, COUNT(*) FROM nodes GROUP BY account_id;
   ```
4. Check auth token is valid (not expired)

### Cross-account data visibility

**Check**:

1. Verify `account_id` on all nodes matches logged-in user's account
2. Check edges also have `account_id` set
3. Verify navigation API filters by `account_id`

### Groups not showing members

**Check**:

1. Verify `IN_GROUP` edges exist linking ChatThreads to Groups
2. Check edge `account_id` matches user's account
3. Test `/api/v1/groups/nav/{group_id}/nodes` API directly

## Success Criteria

- ✅ Admin can import and see their data
- ✅ Client can import and see their data
- ✅ Admin and client data are isolated (no cross-visibility)
- ✅ Navigation sidebar displays folders and groups correctly
- ✅ Clicking groups filters keimenon to show members
- ✅ All API calls use authentication
- ✅ Database queries filter by `account_id`
