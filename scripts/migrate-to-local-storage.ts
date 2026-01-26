#!/usr/bin/env node
/**
 * Migration script: Extract content from Neo4j to local filesystem
 *
 * This script migrates from the old architecture (content in Neo4j) to the
 * new local-first architecture (content on filesystem, metadata in Neo4j).
 *
 * Usage:
 *   npm run migrate:to-local
 *   npm run migrate:to-local -- --dry-run
 *   npm run migrate:to-local -- --batch-size=50
 */

import { getNeo4jClient } from '@keimenon/db';
import { getLocalDocumentStore } from '../apps/api/src/services/local-document-store';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

interface MigrationStats {
  messages: { total: number; migrated: number; skipped: number; errors: number };
  sources: { total: number; migrated: number; skipped: number; errors: number };
  codeBlocks: { total: number; migrated: number; skipped: number; errors: number };
  totalBytes: number;
}

class MigrationService {
  private neo4j: any;
  private localStore: any;
  private dryRun: boolean;
  private batchSize: number;

  constructor(dryRun = false, batchSize = 100) {
    this.dryRun = dryRun;
    this.batchSize = batchSize;
  }

  async initialize() {
    console.log('🔧 Initializing migration service...\n');

    // Connect to Neo4j
    this.neo4j = getNeo4jClient(
      process.env.NEO4J_URI,
      process.env.NEO4J_USER,
      process.env.NEO4J_PASSWORD
    );
    await this.neo4j.connect();
    console.log('✅ Connected to Neo4j');

    // Initialize local document store
    this.localStore = getLocalDocumentStore();
    await this.localStore.initialize();
    console.log('✅ Local document store initialized\n');

    if (this.dryRun) {
      console.log('🏃 DRY RUN MODE - No changes will be made\n');
    }
  }

  async migrate(): Promise<MigrationStats> {
    const stats: MigrationStats = {
      messages: { total: 0, migrated: 0, skipped: 0, errors: 0 },
      sources: { total: 0, migrated: 0, skipped: 0, errors: 0 },
      codeBlocks: { total: 0, migrated: 0, skipped: 0, errors: 0 },
      totalBytes: 0,
    };

    console.log('📊 Starting migration...\n');

    // 1. Migrate Messages
    console.log('💬 Migrating Messages...');
    await this.migrateMessages(stats);
    console.log(
      `   ✅ ${stats.messages.migrated} migrated, ${stats.messages.skipped} skipped, ${stats.messages.errors} errors\n`
    );

    // 2. Migrate Sources
    console.log('📄 Migrating Sources...');
    await this.migrateSources(stats);
    console.log(
      `   ✅ ${stats.sources.migrated} migrated, ${stats.sources.skipped} skipped, ${stats.sources.errors} errors\n`
    );

    // 3. Migrate Code Blocks
    console.log('💻 Migrating Code Blocks...');
    await this.migrateCodeBlocks(stats);
    console.log(
      `   ✅ ${stats.codeBlocks.migrated} migrated, ${stats.codeBlocks.skipped} skipped, ${stats.codeBlocks.errors} errors\n`
    );

    return stats;
  }

  private async migrateMessages(stats: MigrationStats) {
    let offset = 0;

    while (true) {
      const session = this.neo4j.getSession();

      try {
        // Fetch messages with content but no content_location
        const result = await session.run(
          `
          MATCH (m:Message)
          WHERE m.content IS NOT NULL
            AND (m.content_location IS NULL OR m.content_location = '')
          RETURN m
          SKIP $offset LIMIT $limit
          `,
          { offset, limit: this.batchSize }
        );

        if (result.records.length === 0) {
          break; // No more messages
        }

        stats.messages.total += result.records.length;

        for (const record of result.records) {
          const message = record.get('m').properties;

          try {
            if (!message.content) {
              stats.messages.skipped++;
              continue;
            }

            // Extract conversation ID from thread_id or message id
            const conversationId = message.thread_id || message.id.split('_')[0];
            const messageId = message.id;

            if (!this.dryRun) {
              // Save to local storage
              const metadata = await this.localStore.saveMessage(
                conversationId,
                messageId,
                message.content,
                'md'
              );

              stats.totalBytes += metadata.size;

              // Update Neo4j node
              await session.run(
                `
                MATCH (m:Message {id: $id})
                SET m.content_location = $content_location,
                    m.content_hash = $content_hash,
                    m.char_count = $char_count
                REMOVE m.content
                `,
                {
                  id: messageId,
                  content_location: this.localStore.getStorageLocation(metadata),
                  content_hash: metadata.hash,
                  char_count: message.content.length,
                }
              );
            }

            stats.messages.migrated++;
          } catch (error: any) {
            console.error(`   ⚠️  Error migrating message ${message.id}:`, error.message);
            stats.messages.errors++;
          }
        }

        offset += this.batchSize;
      } finally {
        await session.close();
      }
    }
  }

  private async migrateSources(stats: MigrationStats) {
    let offset = 0;

    while (true) {
      const session = this.neo4j.getSession();

      try {
        // Fetch sources with metadata containing content but no content_location
        const result = await session.run(
          `
          MATCH (s:Source)
          WHERE s.metadata IS NOT NULL
            AND (s.content_location IS NULL OR s.content_location = '')
          RETURN s
          SKIP $offset LIMIT $limit
          `,
          { offset, limit: this.batchSize }
        );

        if (result.records.length === 0) {
          break;
        }

        stats.sources.total += result.records.length;

        for (const record of result.records) {
          const source = record.get('s').properties;

          try {
            const metadata = JSON.parse(source.metadata || '{}');
            const content = metadata.content_markdown;

            if (!content) {
              stats.sources.skipped++;
              continue;
            }

            if (!this.dryRun) {
              // Save to local storage
              const docMetadata = await this.localStore.saveSource(source.id, content);

              stats.totalBytes += docMetadata.size;

              // Update Neo4j node
              await session.run(
                `
                MATCH (s:Source {id: $id})
                SET s.content_location = $content_location
                `,
                {
                  id: source.id,
                  content_location: this.localStore.getStorageLocation(docMetadata),
                }
              );

              // Remove content from metadata
              delete metadata.content_markdown;
              await session.run(
                `
                MATCH (s:Source {id: $id})
                SET s.metadata = $metadata
                `,
                {
                  id: source.id,
                  metadata: JSON.stringify(metadata),
                }
              );
            }

            stats.sources.migrated++;
          } catch (error: any) {
            console.error(`   ⚠️  Error migrating source ${source.id}:`, error.message);
            stats.sources.errors++;
          }
        }

        offset += this.batchSize;
      } finally {
        await session.close();
      }
    }
  }

  private async migrateCodeBlocks(stats: MigrationStats) {
    let offset = 0;

    while (true) {
      const session = this.neo4j.getSession();

      try {
        const result = await session.run(
          `
          MATCH (c:CodeBlock)
          WHERE c.metadata IS NOT NULL
            AND (c.content_location IS NULL OR c.content_location = '')
          RETURN c
          SKIP $offset LIMIT $limit
          `,
          { offset, limit: this.batchSize }
        );

        if (result.records.length === 0) {
          break;
        }

        stats.codeBlocks.total += result.records.length;

        for (const record of result.records) {
          const codeBlock = record.get('c').properties;

          try {
            const metadata = JSON.parse(codeBlock.metadata || '{}');
            const code = metadata.code;
            const language = codeBlock.language || metadata.language || 'txt';

            if (!code) {
              stats.codeBlocks.skipped++;
              continue;
            }

            if (!this.dryRun) {
              // Save to local storage
              const docMetadata = await this.localStore.saveCodeBlock(codeBlock.id, code, language);

              stats.totalBytes += docMetadata.size;

              // Update Neo4j node
              await session.run(
                `
                MATCH (c:CodeBlock {id: $id})
                SET c.content_location = $content_location,
                    c.content_hash = $content_hash
                `,
                {
                  id: codeBlock.id,
                  content_location: this.localStore.getStorageLocation(docMetadata),
                  content_hash: docMetadata.hash,
                }
              );

              // Remove code from metadata
              delete metadata.code;
              await session.run(
                `
                MATCH (c:CodeBlock {id: $id})
                SET c.metadata = $metadata
                `,
                {
                  id: codeBlock.id,
                  metadata: JSON.stringify(metadata),
                }
              );
            }

            stats.codeBlocks.migrated++;
          } catch (error: any) {
            console.error(`   ⚠️  Error migrating code block ${codeBlock.id}:`, error.message);
            stats.codeBlocks.errors++;
          }
        }

        offset += this.batchSize;
      } finally {
        await session.close();
      }
    }
  }

  async verify(): Promise<boolean> {
    console.log('\n🔍 Verifying migration...\n');

    const session = this.neo4j.getSession();
    let allGood = true;

    try {
      // Check for messages still with content
      const messagesResult = await session.run(
        `
        MATCH (m:Message)
        WHERE m.content IS NOT NULL
        RETURN count(m) as count
        `
      );
      const messagesWithContent = messagesResult.records[0].get('count').toNumber();

      if (messagesWithContent > 0) {
        console.log(`⚠️  ${messagesWithContent} messages still have content in Neo4j`);
        allGood = false;
      } else {
        console.log('✅ All messages migrated');
      }

      // Check for sources still with content in metadata
      const sourcesResult = await session.run(
        `
        MATCH (s:Source)
        WHERE s.metadata CONTAINS 'content_markdown'
        RETURN count(s) as count
        `
      );
      const sourcesWithContent = sourcesResult.records[0].get('count').toNumber();

      if (sourcesWithContent > 0) {
        console.log(`⚠️  ${sourcesWithContent} sources still have content in metadata`);
        allGood = false;
      } else {
        console.log('✅ All sources migrated');
      }

      // Check for code blocks still with code in metadata
      const codeResult = await session.run(
        `
        MATCH (c:CodeBlock)
        WHERE c.metadata CONTAINS '"code":'
        RETURN count(c) as count
        `
      );
      const codeWithContent = codeResult.records[0].get('count').toNumber();

      if (codeWithContent > 0) {
        console.log(`⚠️  ${codeWithContent} code blocks still have code in metadata`);
        allGood = false;
      } else {
        console.log('✅ All code blocks migrated');
      }
    } finally {
      await session.close();
    }

    return allGood;
  }

  async cleanup() {
    if (this.neo4j) {
      await this.neo4j.disconnect();
      console.log('\n✅ Disconnected from Neo4j');
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchSizeArg = args.find((arg) => arg.startsWith('--batch-size='));
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 100;

  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Neo4j → Local Storage Migration Tool             ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const migrationService = new MigrationService(dryRun, batchSize);

  try {
    await migrationService.initialize();

    const stats = await migrationService.migrate();

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  Migration Summary                                 ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    console.log(`Messages:     ${stats.messages.migrated}/${stats.messages.total} migrated`);
    console.log(`Sources:      ${stats.sources.migrated}/${stats.sources.total} migrated`);
    console.log(`Code Blocks:  ${stats.codeBlocks.migrated}/${stats.codeBlocks.total} migrated`);
    console.log(`\nTotal Bytes:  ${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(
      `Errors:       ${stats.messages.errors + stats.sources.errors + stats.codeBlocks.errors}`
    );

    if (!dryRun) {
      const verified = await migrationService.verify();

      if (verified) {
        console.log('\n🎉 Migration completed successfully!');
        console.log('📁 Documents are now stored in ~/.canvas-memory/documents/');
        console.log('🗄️  Neo4j now contains only metadata and graph structure');
      } else {
        console.log('\n⚠️  Migration completed with warnings. Please review above.');
      }
    } else {
      console.log('\n✅ Dry run completed. Run without --dry-run to perform migration.');
    }
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await migrationService.cleanup();
  }
}

main();
