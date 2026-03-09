import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getImportArtifactsRoot, getUploadChunksRoot } from '../utils/import-artifacts';

function resolveDbPath(): string {
  const home = os.homedir();
  if (process.env.DB_PATH) return process.env.DB_PATH.replace('~', home);
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH.replace('~', home);
  return path.join(home, '.keimenon', 'keimenon.db');
}

function safeParseJson(value: string | null): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toNumber(value: unknown, fallback: number = 0): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

interface DirectoryStats {
  root: string;
  exists: boolean;
  files: number;
  directories: number;
  bytes: number;
}

async function collectDirectoryStats(root: string): Promise<DirectoryStats> {
  const stats: DirectoryStats = {
    root,
    exists: false,
    files: 0,
    directories: 0,
    bytes: 0,
  };

  const walk = async (dirPath: string): Promise<void> => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        stats.directories += 1;
        await walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        stats.files += 1;
        try {
          const fileStat = await fs.stat(fullPath);
          stats.bytes += fileStat.size;
        } catch {
          // best effort
        }
      }
    }
  };

  try {
    await fs.access(root);
    stats.exists = true;
    await walk(root);
  } catch {
    return stats;
  }

  return stats;
}

function hasRequiredNodeKinds(sql?: string): boolean {
  if (!sql) return false;
  return (
    sql.includes('Principal') &&
    sql.includes('ConversationThread') &&
    sql.includes('SourceSpan') &&
    sql.includes('Packet') &&
    sql.includes('AtomicUnit')
  );
}

function hasRequiredEdgeKinds(sql?: string): boolean {
  if (!sql) return false;
  return (
    sql.includes('INITIATED_BY') &&
    sql.includes('PARTICIPATED_IN') &&
    sql.includes('HAS_SPAN') &&
    sql.includes('OCCURS_IN_SPAN') &&
    sql.includes('COMPOSED_OF_ATOMIC')
  );
}

async function main(): Promise<void> {
  const dbPath = resolveDbPath();
  const limit = Number.parseInt(process.argv[2] || '3', 10);
  const eventLimit = Number.parseInt(process.argv[3] || '25', 10);
  const retentionMs = Number.parseInt(
    process.env.IMPORT_RETENTION_MS || String(30 * 24 * 60 * 60 * 1000),
    10
  );

  const db = new Database(dbPath, { readonly: true });
  try {
    const jobs = db
      .prepare(
        `
        SELECT id, account_id, created_by, status, config, state_data, created_at, updated_at
        FROM jobs
        WHERE type = 'import'
        ORDER BY updated_at DESC
        LIMIT ?
      `
      )
      .all(limit) as Array<{
      id: string;
      account_id: string;
      created_by: string;
      status: string;
      config: string;
      state_data: string;
      created_at: number;
      updated_at: number;
    }>;

    const latestTerminal = db
      .prepare(
        `
        SELECT id, status, state_data, updated_at
        FROM jobs
        WHERE type = 'import'
          AND status IN ('succeeded', 'failed', 'canceled')
        ORDER BY updated_at DESC
        LIMIT 10
      `
      )
      .all() as Array<{ id: string; status: string; state_data: string; updated_at: number }>;

    const queueHealth = db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN type = 'job.progress' THEN 1 ELSE 0 END) AS progressEvents,
          SUM(CASE WHEN data LIKE '%WRITE_QUEUE_FAILURE%' THEN 1 ELSE 0 END) AS writeQueueFailures
        FROM job_events
        WHERE timestamp >= ?
      `
      )
      .get(Date.now() - 24 * 60 * 60 * 1000) as {
      progressEvents: number | null;
      writeQueueFailures: number | null;
    };

    const nodeConstraintSql = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='nodes'")
      .get() as { sql?: string } | undefined;
    const edgeConstraintSql = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='edges'")
      .get() as { sql?: string } | undefined;

    const cleanupLagRows = db
      .prepare(
        `
        SELECT state_data
        FROM jobs
        WHERE type = 'import' AND status = 'failed'
      `
      )
      .all() as Array<{ state_data: string }>;
    const now = Date.now();
    let retainedArtifactsOverdue = 0;
    for (const row of cleanupLagRows) {
      const state = safeParseJson(row.state_data);
      const retainedUntil = Number(state?.metadata?.inputFileRetainedUntil || 0);
      if (retainedUntil > 0 && retainedUntil < now) {
        retainedArtifactsOverdue++;
      }
    }

    const [importArtifacts, uploadChunks] = await Promise.all([
      collectDirectoryStats(getImportArtifactsRoot()),
      collectDirectoryStats(getUploadChunksRoot()),
    ]);

    const payload = jobs.map((job) => {
      const events = db
        .prepare(
          `
          SELECT id, type, sequence_number, timestamp, data
          FROM job_events
          WHERE job_id = ?
          ORDER BY sequence_number DESC
          LIMIT ?
        `
        )
        .all(job.id, eventLimit) as Array<{
        id: string;
        type: string;
        sequence_number: number;
        timestamp: number;
        data: string;
      }>;

      const progressEvents = db
        .prepare(
          `
          SELECT sequence_number, timestamp, data
          FROM job_events
          WHERE job_id = ? AND type = 'job.progress'
          ORDER BY sequence_number ASC
        `
        )
        .all(job.id) as Array<{
        sequence_number: number;
        timestamp: number;
        data: string;
      }>;

      const terminalEvent = db
        .prepare(
          `
          SELECT sequence_number, timestamp, type, data
          FROM job_events
          WHERE job_id = ? AND type IN ('job.succeeded', 'job.failed', 'job.canceled')
          ORDER BY sequence_number DESC
          LIMIT 1
        `
        )
        .get(job.id) as
        | {
            sequence_number: number;
            timestamp: number;
            type: string;
            data: string;
          }
        | undefined;

      const stageTransitions: Array<{
        sequenceNumber: number;
        timestamp: number;
        stage: string;
        percent?: number;
        message?: string;
      }> = [];
      let previousStage: string | null = null;

      for (const progressEvent of progressEvents) {
        const parsed = safeParseJson(progressEvent.data);
        const stage = parsed?.progress?.stage ? String(parsed.progress.stage) : null;
        if (!stage || stage === previousStage) {
          continue;
        }
        stageTransitions.push({
          sequenceNumber: progressEvent.sequence_number,
          timestamp: progressEvent.timestamp,
          stage,
          percent: parsed?.progress?.percent,
          message: parsed?.message,
        });
        previousStage = stage;
      }

      const lastProgressTimestamp =
        progressEvents.length > 0 ? progressEvents[progressEvents.length - 1].timestamp : null;
      const idleBeforeTerminalMs =
        terminalEvent && lastProgressTimestamp
          ? Math.max(0, terminalEvent.timestamp - lastProgressTimestamp)
          : null;
      const stateData = safeParseJson(job.state_data);
      const deadLetterSample =
        stateData?.error?.details?.sampleErrors ??
        stateData?.error?.details?.deadLetterSamples ??
        stateData?.error?.details?.deadLetterSample ??
        null;
      const lastProgressStage =
        progressEvents.length > 0
          ? safeParseJson(progressEvents[progressEvents.length - 1].data)?.progress?.stage
          : null;
      const lastProgressPercent =
        progressEvents.length > 0
          ? safeParseJson(progressEvents[progressEvents.length - 1].data)?.progress?.percent
          : null;

      return {
        id: job.id,
        accountId: job.account_id,
        createdBy: job.created_by,
        status: job.status,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        config: safeParseJson(job.config),
        stateData,
        diagnostics: {
          stageTransitions: stageTransitions.slice(-20),
          lastProgressTimestamp,
          lastProgressStage,
          lastProgressPercent: toNumber(lastProgressPercent, 0),
          terminalEvent: terminalEvent
            ? {
                sequenceNumber: terminalEvent.sequence_number,
                timestamp: terminalEvent.timestamp,
                type: terminalEvent.type,
                data: safeParseJson(terminalEvent.data),
              }
            : null,
          idleBeforeTerminalMs,
          deadLetterSample,
        },
        events: events.map((event) => ({
          id: event.id,
          type: event.type,
          sequenceNumber: event.sequence_number,
          timestamp: event.timestamp,
          data: safeParseJson(event.data),
        })),
      };
    });

    console.log(
      JSON.stringify(
        {
          databasePath: dbPath,
          generatedAt: new Date().toISOString(),
          jobsInspected: payload.length,
          latestTerminalReasons: latestTerminal.map((row) => {
            const state = safeParseJson(row.state_data);
            return {
              id: row.id,
              status: row.status,
              updatedAt: row.updated_at,
              errorCode: state?.error?.code,
              errorMessage: state?.error?.message,
            };
          }),
          tempArtifacts: {
            importArtifacts,
            uploadChunks,
          },
          queueHealth24h: {
            progressEvents: Number(queueHealth?.progressEvents || 0),
            writeQueueFailures: Number(queueHealth?.writeQueueFailures || 0),
          },
          schemaCompatibility: {
            nodesKindsCompatible: hasRequiredNodeKinds(nodeConstraintSql?.sql),
            edgesKindsCompatible: hasRequiredEdgeKinds(edgeConstraintSql?.sql),
          },
          cleanupLag: {
            retentionMs,
            retainedArtifactsOverdue,
          },
          jobs: payload,
        },
        null,
        2
      )
    );
  } finally {
    db.close();
  }
}

void main();
