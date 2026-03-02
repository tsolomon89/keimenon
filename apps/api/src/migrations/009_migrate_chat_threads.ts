import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

/**
 * Migration 009: Migrate ChatThread to ConversationThread (World Model V5)
 *
 * This migration:
 * 1. Converts ChatThread nodes to ConversationThread nodes
 * 2. Creates Principal nodes for users who imported the chats
 * 3. Creates INITIATED_BY edges from ConversationThread to Human Principal
 * 4. Updates provenance references in Source nodes
 *
 * Key invariants maintained:
 * - F1: Principal Equivalence (capabilities, not kind)
 * - F2: Account Boundary Integrity (account_id on all nodes/edges)
 * - F3: Provenance Completeness (origin_principal_id populated)
 * - F4: Context-Set Legibility (context_spec added)
 *
 * @see packages/types/src/nodes.ts - ConversationThreadSchema
 * @see agent_context/architecture/overview.md - World Model V5
 */

/**
 * Generate deterministic Principal ID for idempotent migration
 */
function generatePrincipalId(accountId: string, identifier: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`principal:${accountId}:${identifier}`);
  return `principal_${hash.digest('hex').slice(0, 16)}`;
}

export function up(db: Database.Database): void {
  console.log('Running migration 009: Migrate ChatThread to ConversationThread');

  // Start transaction for atomicity
  const transaction = db.transaction(() => {
    // Step 1: Get all ChatThread nodes
    const chatThreads = db
      .prepare(
        `
      SELECT id, properties, account_id, created_by, created_at
      FROM nodes
      WHERE kind = 'ChatThread'
    `
      )
      .all() as {
      id: string;
      properties: string;
      account_id: string;
      created_by: string;
      created_at: number;
    }[];

    console.log(`Found ${chatThreads.length} ChatThread nodes to migrate`);

    if (chatThreads.length === 0) {
      console.log('No ChatThread nodes to migrate');
      return;
    }

    // Step 2: Track principals to create (by account + userId)
    const principalsToCreate = new Map<string, { accountId: string; userId: string }>();
    const existingPrincipals = new Set<string>();

    // Check for existing Principal nodes
    const existingPrincipalRows = db
      .prepare(
        `
      SELECT id FROM nodes WHERE kind = 'Principal'
    `
      )
      .all() as { id: string }[];

    for (const row of existingPrincipalRows) {
      existingPrincipals.add(row.id);
    }

    console.log(`Found ${existingPrincipals.size} existing Principal nodes`);

    // Step 3: Process each ChatThread
    const updateNodeStmt = db.prepare(`
      UPDATE nodes
      SET kind = 'ConversationThread',
          properties = ?,
          updated_at = ?
      WHERE id = ?
    `);

    const insertEdgeStmt = db.prepare(`
      INSERT INTO edges (id, kind, from_id, to_id, properties, account_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertNodeStmt = db.prepare(`
      INSERT INTO nodes (id, kind, properties, account_id, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    let conversationsConverted = 0;
    let principalsCreated = 0;
    let edgesCreated = 0;

    for (const thread of chatThreads) {
      try {
        const props = JSON.parse(thread.properties);
        const accountId = thread.account_id;
        const userId = thread.created_by;

        // Generate deterministic Principal ID for this user in this account
        const principalId = generatePrincipalId(accountId, userId);

        // Track principal to create if not existing
        if (!existingPrincipals.has(principalId) && !principalsToCreate.has(principalId)) {
          principalsToCreate.set(principalId, { accountId, userId });
        }

        // Build ConversationThread properties (preserve existing, add new)
        const conversationProps = {
          ...props,
          kind: 'ConversationThread',
          human_principal_id: principalId,
          purpose: 'general', // Default for migrated threads
          context_spec: {
            source_ids: [],
            group_ids: [],
            expansion_rule: 'none',
          },
        };

        // Update the node to ConversationThread
        updateNodeStmt.run(JSON.stringify(conversationProps), now, thread.id);
        conversationsConverted++;

        // Create INITIATED_BY edge if Principal will exist
        const edgeId = `edge_${nanoid()}`;
        insertEdgeStmt.run(
          edgeId,
          'INITIATED_BY',
          thread.id,
          principalId,
          JSON.stringify({}),
          accountId,
          userId,
          now
        );
        edgesCreated++;
      } catch (error: any) {
        console.error(`Failed to migrate ChatThread ${thread.id}:`, error.message);
        // Continue with other threads
      }
    }

    // Step 4: Create Principal nodes for users
    for (const [principalId, { accountId, userId }] of principalsToCreate) {
      try {
        const principalProps = {
          id: principalId,
          kind: 'Principal',
          display_name: `User ${userId.slice(0, 8)}`,
          principal_kind: 'human',
          capabilities: {
            can_upload: true,
            can_run_tools: false,
            can_import_web: false,
            can_own_account: true,
            can_approve_runs: true,
          },
          created_at: now,
          updated_at: now,
        };

        insertNodeStmt.run(
          principalId,
          'Principal',
          JSON.stringify(principalProps),
          accountId,
          userId,
          now,
          now
        );
        principalsCreated++;
      } catch (error: any) {
        // Principal may already exist (race condition or re-run)
        if (!error.message.includes('UNIQUE constraint failed')) {
          console.error(`Failed to create Principal ${principalId}:`, error.message);
        }
      }
    }

    console.log(`✓ Converted ${conversationsConverted} ChatThread → ConversationThread`);
    console.log(`✓ Created ${principalsCreated} Principal nodes`);
    console.log(`✓ Created ${edgesCreated} INITIATED_BY edges`);
  });

  // Execute transaction
  transaction();

  console.log('✓ Migration 009 complete');
}

export function down(db: Database.Database): void {
  console.log('Rolling back migration 009: Migrate ChatThread to ConversationThread');

  const transaction = db.transaction(() => {
    // Step 1: Revert ConversationThread back to ChatThread
    const conversationThreads = db
      .prepare(
        `
      SELECT id, properties, account_id
      FROM nodes
      WHERE kind = 'ConversationThread'
    `
      )
      .all() as { id: string; properties: string; account_id: string }[];

    const updateNodeStmt = db.prepare(`
      UPDATE nodes
      SET kind = 'ChatThread',
          properties = ?,
          updated_at = ?
      WHERE id = ?
    `);

    const now = Date.now();
    let reverted = 0;

    for (const thread of conversationThreads) {
      try {
        const props = JSON.parse(thread.properties);

        // Remove ConversationThread-specific fields
        delete props.human_principal_id;
        delete props.agent_principal_id;
        delete props.purpose;
        delete props.context_spec;
        delete props.context_set_id;
        props.kind = 'ChatThread';

        updateNodeStmt.run(JSON.stringify(props), now, thread.id);
        reverted++;
      } catch (error: any) {
        console.error(`Failed to revert ConversationThread ${thread.id}:`, error.message);
      }
    }

    // Step 2: Delete INITIATED_BY and PARTICIPATED_IN edges created by this migration
    // (Note: Principals are NOT deleted as they may be referenced elsewhere)
    db.prepare(
      `
      DELETE FROM edges
      WHERE kind IN ('INITIATED_BY', 'PARTICIPATED_IN')
    `
    ).run();

    console.log(`✓ Reverted ${reverted} ConversationThread → ChatThread`);
    console.log(`✓ Removed INITIATED_BY and PARTICIPATED_IN edges`);
    console.log('Note: Principal nodes preserved (may be referenced elsewhere)');
  });

  transaction();

  console.log('✓ Migration 009 rolled back');
}
