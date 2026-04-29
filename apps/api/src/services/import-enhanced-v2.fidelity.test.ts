import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { normalizeImportOptions } from '@keimenon/types';
import { EnhancedImportServiceV2, type ImportMessage } from './import-enhanced-v2';
import type { Group } from './autogroup-enhanced';

type Harness = {
  service: EnhancedImportServiceV2;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  dispose: () => void;
};

function createHarness(): Harness {
  const sqlite = new Database(':memory:');
  const fakeDb = {
    getDatabase: () => sqlite,
    createNode: async () => {},
    createEdge: async () => {},
  } as any;

  const service = new EnhancedImportServiceV2(fakeDb);
  const nodes: Array<Record<string, unknown>> = [];
  const edges: Array<Record<string, unknown>> = [];
  const serviceAny = service as any;

  serviceAny.localStore = {
    async saveSource(id: string, content: string) {
      const hash = createHash('sha256').update(content).digest('hex');
      return {
        id,
        type: 'source',
        hash,
        storagePath: `documents/sources/${id}.md`,
        size: Buffer.byteLength(content),
        createdAt: 1700000000000,
      };
    },
    getStorageLocation(metadata: { storagePath: string }) {
      return `local://${metadata.storagePath}`;
    },
  };

  serviceAny.context = {
    accountId: 'acc_fixture',
    userId: 'user_fixture',
    jobId: 'job_fixture',
  };
  serviceAny.humanPrincipal = { id: 'principal_human_fixture' };
  serviceAny.writeNode = async (node: Record<string, unknown>) => {
    nodes.push(node);
  };
  serviceAny.writeEdge = async (edge: Record<string, unknown>) => {
    edges.push(edge);
  };
  serviceAny.writeEdgeIfAbsent = async (edge: Record<string, unknown>) => {
    edges.push(edge);
    return true;
  };

  return {
    service,
    nodes,
    edges,
    dispose: () => sqlite.close(),
  };
}

function buildFixtureMessages(): ImportMessage[] {
  return [
    {
      id: 'msg_user_001',
      role: 'user',
      content: 'User message with fenced code.\n```ts\nconst x = 42;\n```\nAfter code.',
      timestamp: 1700000001000,
      conversationId: 'conv_fixture_alpha',
      index: 0,
    },
    {
      id: 'msg_assistant_001',
      role: 'assistant',
      content: 'Assistant response for deterministic source materialization.',
      timestamp: 1700000002000,
      conversationId: 'conv_fixture_alpha',
      index: 1,
    },
  ];
}

const FIXTURE_GROUPS: Group[] = [
  {
    id: 'grp_fixture_alpha',
    name: 'Fixture Alpha',
    keywords: ['fixture', 'alpha'],
    sources: ['msg_user_001', 'msg_assistant_001'],
    isManual: false,
  },
];

describe('EnhancedImportServiceV2 source materialization fidelity', () => {
  it('materializes separate branches deterministically with discourse lineage', async () => {
    const first = createHarness();
    const second = createHarness();

    try {
      const config = normalizeImportOptions({
        extraction: { includeUser: true, includeAssistant: true },
        minMessageLength: 0,
        processingMode: 'automatic',
        branches: 'separate',
        extractCode: true,
        codeSettings: {
          minLength: 0,
          languages: ['ts'],
          groupBy: 'language',
          deduplicate: true,
          sourceHandling: 'keep_inline',
        },
      });

      const firstSources = await (first.service as any).createSources(
        buildFixtureMessages(),
        FIXTURE_GROUPS,
        config,
        'import_fixture_batch'
      );
      const secondSources = await (second.service as any).createSources(
        buildFixtureMessages(),
        FIXTURE_GROUPS,
        config,
        'import_fixture_batch'
      );

      expect(firstSources).toHaveLength(2);
      expect(
        firstSources
          .map((source: { branch: string }) => source.branch)
          .slice()
          .sort()
      ).toEqual(['assistant', 'user']);

      const firstCanonical = firstSources
        .map((source: { id: string; branch: string; messageIds: string[] }) => ({
          id: source.id,
          branch: source.branch,
          messageIds: [...source.messageIds].sort(),
        }))
        .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
      const secondCanonical = secondSources
        .map((source: { id: string; branch: string; messageIds: string[] }) => ({
          id: source.id,
          branch: source.branch,
          messageIds: [...source.messageIds].sort(),
        }))
        .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
      expect(firstCanonical).toEqual(secondCanonical);

      const sourceNodes = first.nodes.filter((node) => node.kind === 'Source');
      expect(sourceNodes).toHaveLength(2);
      expect(
        sourceNodes.every(
          (node) => (node.metadata as Record<string, unknown>)?.branches_mode === 'separate'
        )
      ).toBe(true);
      expect(
        sourceNodes
          .map((node) => String((node.metadata as Record<string, unknown>)?.branch || ''))
          .slice()
          .sort()
      ).toEqual(['assistant', 'user']);

      expect(first.edges.some((edge) => edge.kind === 'DISCOURSE')).toBe(true);
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it('keeps raw fixture messages invariant while sourceHandling changes derived output', async () => {
    const keepInline = createHarness();
    const extractAndRemove = createHarness();
    const extractAndRemoveRepeat = createHarness();

    try {
      const baseMessages = buildFixtureMessages();
      const rawSnapshot = baseMessages.map((message) => ({
        id: message.id,
        content: message.content,
      }));

      const keepInlineConfig = normalizeImportOptions({
        extraction: { includeUser: true, includeAssistant: true },
        minMessageLength: 0,
        processingMode: 'automatic',
        branches: 'merged',
        extractCode: true,
        codeSettings: {
          minLength: 0,
          languages: ['ts'],
          groupBy: 'language',
          deduplicate: true,
          sourceHandling: 'keep_inline',
        },
      });
      const extractAndRemoveConfig = normalizeImportOptions({
        extraction: { includeUser: true, includeAssistant: true },
        minMessageLength: 0,
        processingMode: 'automatic',
        branches: 'merged',
        extractCode: true,
        codeSettings: {
          minLength: 0,
          languages: ['ts'],
          groupBy: 'language',
          deduplicate: true,
          sourceHandling: 'extract_and_remove',
        },
      });

      const keepSources = await (keepInline.service as any).createSources(
        baseMessages.map((message) => ({ ...message })),
        FIXTURE_GROUPS,
        keepInlineConfig,
        'import_fixture_batch'
      );
      const extractSources = await (extractAndRemove.service as any).createSources(
        baseMessages.map((message) => ({ ...message })),
        FIXTURE_GROUPS,
        extractAndRemoveConfig,
        'import_fixture_batch'
      );
      const extractSourcesRepeat = await (extractAndRemoveRepeat.service as any).createSources(
        baseMessages.map((message) => ({ ...message })),
        FIXTURE_GROUPS,
        extractAndRemoveConfig,
        'import_fixture_batch'
      );

      expect(keepSources).toHaveLength(1);
      expect(extractSources).toHaveLength(1);
      expect(keepSources[0].content).toContain('```ts');
      expect(extractSources[0].content).not.toContain('```');

      const keepSourceNode = keepInline.nodes.find((node) => node.kind === 'Source');
      const extractSourceNode = extractAndRemove.nodes.find((node) => node.kind === 'Source');
      const extractRepeatSourceNode = extractAndRemoveRepeat.nodes.find(
        (node) => node.kind === 'Source'
      );
      expect(keepSourceNode).toBeDefined();
      expect(extractSourceNode).toBeDefined();
      expect(extractRepeatSourceNode).toBeDefined();
      expect(
        ((keepSourceNode!.metadata as Record<string, unknown>)?.code_removed_ranges as unknown[]) ||
          []
      ).toEqual([]);
      expect(
        (
          ((extractSourceNode!.metadata as Record<string, unknown>)
            ?.code_removed_ranges as unknown[]) || []
        ).length
      ).toBeGreaterThan(0);

      const keepMetadata = keepSourceNode!.metadata as Record<string, unknown>;
      const extractMetadata = extractSourceNode!.metadata as Record<string, unknown>;
      const extractRepeatMetadata = extractRepeatSourceNode!.metadata as Record<string, unknown>;
      expect(keepMetadata.raw_content_hash).toBe(extractMetadata.raw_content_hash);
      expect(extractMetadata.raw_content_hash).toBe(extractRepeatMetadata.raw_content_hash);
      expect(keepMetadata.raw_content_bytes).toBe(extractMetadata.raw_content_bytes);
      expect(keepSourceNode!.fingerprint).toBe(extractSourceNode!.fingerprint);
      expect(extractSourceNode!.fingerprint).toBe(extractRepeatSourceNode!.fingerprint);
      expect(keepSourceNode!.content_hash).toBe(keepMetadata.derived_content_hash);
      expect(extractSourceNode!.content_hash).toBe(extractMetadata.derived_content_hash);
      expect(extractSourceNode!.content_hash).toBe(extractRepeatSourceNode!.content_hash);
      expect(keepSourceNode!.content_hash).not.toBe(extractSourceNode!.content_hash);

      expect(baseMessages.map((message) => ({ id: message.id, content: message.content }))).toEqual(
        rawSnapshot
      );
      expect(extractSources[0].id).toBe(extractSourcesRepeat[0].id);
      expect(extractSources[0].content).toBe(extractSourcesRepeat[0].content);
    } finally {
      keepInline.dispose();
      extractAndRemove.dispose();
      extractAndRemoveRepeat.dispose();
    }
  });

  it('canonicalizes duplicate labels to one account-scoped group and drops catch-all labels', async () => {
    const harness = createHarness();
    const serviceAny = harness.service as any;

    try {
      const sqlite = serviceAny.sqliteDb as any;
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          properties TEXT NOT NULL,
          account_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      sqlite
        .prepare(
          `
          INSERT INTO nodes (id, kind, properties, account_id, created_at, updated_at)
          VALUES (?, 'Group', ?, 'acc_fixture', ?, ?)
        `
        )
        .run(
          'grp_existing_2025',
          JSON.stringify({
            id: 'grp_existing_2025',
            kind: 'Group',
            name: '2025',
            metadata: {
              normalized_label_key: '2025',
              keywords: ['year'],
            },
          }),
          1000,
          1000
        );

      const canonical = serviceAny.canonicalizeGroupsForAccount(
        [
          {
            id: 'grp_tmp_a',
            name: '2025',
            keywords: ['plan'],
            sources: ['msg_a'],
            isManual: false,
          },
          {
            id: 'grp_tmp_b',
            name: '  2025  ',
            keywords: ['roadmap'],
            sources: ['msg_b'],
            isManual: true,
          },
          {
            id: 'grp_tmp_catchall',
            name: 'Other / Uncategorized',
            keywords: [],
            sources: ['msg_c'],
            isManual: false,
            isCatchAll: true,
          },
        ] as Group[],
        'acc_fixture'
      ) as Group[];

      expect(canonical).toHaveLength(1);
      expect(canonical[0].id).toBe('grp_existing_2025');
      expect(canonical[0].sources.slice().sort()).toEqual(['msg_a', 'msg_b']);
      expect(canonical[0].keywords.slice().sort()).toEqual(['plan', 'roadmap']);
      expect(canonical[0].isManual).toBe(true);
    } finally {
      harness.dispose();
    }
  });
});
