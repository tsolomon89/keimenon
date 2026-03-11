import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { MigrationRunner } from '../../packages/db/src/sqlite/MigrationRunner';

type DrillArgs = {
  quick: boolean;
  strict: boolean;
  keepTemp: boolean;
  output: string;
};

type DrillStepResult = {
  step: string;
  pass: boolean;
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
};

function parseArgs(): DrillArgs {
  const args = process.argv.slice(2);
  const parsed: DrillArgs = {
    quick: false,
    strict: false,
    keepTemp: false,
    output: 'test-results/ops/rollout-rollback-drill-latest.json',
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--quick') {
      parsed.quick = true;
      continue;
    }
    if (token === '--strict') {
      parsed.strict = true;
      continue;
    }
    if (token === '--keep-temp') {
      parsed.keepTemp = true;
      continue;
    }
    if (token === '--output' && args[index + 1]) {
      parsed.output = args[index + 1];
      index += 1;
      continue;
    }
  }

  if (parsed.quick) {
    parsed.strict = false;
  }

  return parsed;
}

function readProbeMarker(dbPath: string): string | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare('SELECT marker FROM _gatee_probe WHERE id = ?').get('probe') as
      | { marker?: string }
      | undefined;
    return typeof row?.marker === 'string' ? row.marker : null;
  } finally {
    db.close();
  }
}

function runCommand(
  command: string,
  cwd: string,
  envOverrides?: Record<string, string>
): { pass: boolean; error?: string } {
  const result = spawnSync(command, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(envOverrides || {}),
    },
    shell: true,
  });

  if (typeof result.status === 'number' && result.status === 0) {
    return { pass: true };
  }

  return {
    pass: false,
    error:
      result.error?.message || `Command failed: ${command} (status=${result.status ?? 'unknown'})`,
  };
}

async function runKillSwitchMatrixRegression(): Promise<Record<string, unknown>> {
  const scenarios: Array<{
    name: string;
    env: Record<string, string>;
    commands: string[];
  }> = [
    {
      name: 'baseline',
      env: {},
      commands: [
        'npm run test --workspace=@keimenon/api -- src/utils/__tests__/gate-e-kill-switches.test.ts src/utils/__tests__/semantic-stage-kill-switch.test.ts src/modules/workers/infrastructure/ImportWorker.objective-queue.test.ts src/routes/__tests__/import.routes.test.ts',
        'npm run test --workspace=@keimenon/parsers -- src/services/__tests__/similarity-engine-v2.test.ts',
      ],
    },
    {
      name: 'objective_enqueue_kill_switch_on',
      env: {
        KILL_SWITCH_OBJECTIVE_ENQUEUE: '1',
      },
      commands: [
        'npm run test --workspace=@keimenon/api -- src/utils/__tests__/gate-e-kill-switches.test.ts src/modules/workers/infrastructure/ImportWorker.objective-queue.test.ts',
      ],
    },
    {
      name: 'semantic_stage_kill_switch_on',
      env: {
        KILL_SWITCH_SIMILARITY_SEMANTIC_STAGE: '1',
      },
      commands: [
        'npm run test --workspace=@keimenon/api -- src/utils/__tests__/semantic-stage-kill-switch.test.ts',
        'npm run test --workspace=@keimenon/parsers -- src/services/__tests__/similarity-engine-v2.test.ts',
      ],
    },
  ];

  const scenarioResults: Array<{ name: string; pass: boolean; failedCommand?: string }> = [];

  for (const scenario of scenarios) {
    console.log(`[rollout-rollback-drill] kill-switch scenario=${scenario.name}`);
    let scenarioPass = true;
    let failedCommand: string | undefined;

    for (const command of scenario.commands) {
      const commandResult = runCommand(command, process.cwd(), scenario.env);
      if (!commandResult.pass) {
        scenarioPass = false;
        failedCommand = command;
        break;
      }
    }

    scenarioResults.push({
      name: scenario.name,
      pass: scenarioPass,
      failedCommand,
    });

    if (!scenarioPass) {
      throw new Error(
        `Kill-switch scenario '${scenario.name}' failed${failedCommand ? ` (command: ${failedCommand})` : ''}`
      );
    }
  }

  return {
    scenarios: scenarioResults,
  };
}

async function runStep(
  step: string,
  action: () => Promise<Record<string, unknown> | void>
): Promise<DrillStepResult> {
  const startedAt = Date.now();
  try {
    const details = (await action()) || {};
    return {
      step,
      pass: true,
      durationMs: Date.now() - startedAt,
      details,
    };
  } catch (error) {
    return {
      step,
      pass: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runSchemaBackupRestoreDrill(runDirectory: string): Promise<Record<string, unknown>> {
  const dbPath = path.join(runDirectory, 'keimenon-rollout.db');
  const backupPath = path.join(runDirectory, 'keimenon-rollout.backup.db');
  const migrationsDir = path.resolve('packages/db/src/sqlite/migrations');
  const schemaPath = path.resolve('packages/db/src/sqlite/schema.sql');
  const schemaSql = await readFile(schemaPath, 'utf8');
  const expectedMigrations = (await readdir(migrationsDir)).filter((item) =>
    item.endsWith('.sql')
  ).length;

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    db.exec(schemaSql);
    const runner = new MigrationRunner(db, migrationsDir);
    await runner.markAllAvailableMigrationsApplied();

    db.exec(`
      CREATE TABLE IF NOT EXISTS _gatee_probe (
        id TEXT PRIMARY KEY,
        marker TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    db.prepare(`INSERT OR REPLACE INTO _gatee_probe (id, marker, updated_at) VALUES (?, ?, ?)`).run(
      'probe',
      'rollout_v1',
      Date.now()
    );

    const migrationCount = Number(
      (
        db.prepare('SELECT COUNT(*) AS count FROM migrations').get() as
          | { count?: number }
          | undefined
      )?.count || 0
    );
    if (migrationCount < expectedMigrations) {
      throw new Error(
        `Expected at least ${expectedMigrations} SQL migrations applied, received ${migrationCount}`
      );
    }
  } finally {
    db.close();
  }

  await cp(dbPath, backupPath);

  const rolloutDb = new Database(dbPath);
  try {
    rolloutDb
      .prepare(`UPDATE _gatee_probe SET marker = ?, updated_at = ? WHERE id = ?`)
      .run('rollout_v2', Date.now(), 'probe');
    rolloutDb
      .prepare(`INSERT OR REPLACE INTO _gatee_probe (id, marker, updated_at) VALUES (?, ?, ?)`)
      .run('probe_extra', 'new_state', Date.now());
  } finally {
    rolloutDb.close();
  }

  const markerAfterRollout = readProbeMarker(dbPath);
  if (markerAfterRollout !== 'rollout_v2') {
    throw new Error(
      `Rollout mutation validation failed, expected rollout_v2, received ${markerAfterRollout}`
    );
  }

  await cp(backupPath, dbPath);

  const markerAfterRollback = readProbeMarker(dbPath);
  if (markerAfterRollback !== 'rollout_v1') {
    throw new Error(
      `Rollback validation failed, expected rollout_v1, received ${markerAfterRollback}`
    );
  }

  const verifyDb = new Database(dbPath, { readonly: true });
  try {
    const extra = verifyDb
      .prepare(`SELECT marker FROM _gatee_probe WHERE id = ?`)
      .get('probe_extra') as { marker?: string } | undefined;
    if (extra?.marker) {
      throw new Error('Rollback validation failed: probe_extra row still present');
    }
  } finally {
    verifyDb.close();
  }

  return {
    dbPath,
    backupPath,
    markerAfterRollout,
    markerAfterRollback,
  };
}

async function writeReport(outputPath: string, payload: Record<string, unknown>): Promise<void> {
  const absolutePath = path.resolve(outputPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs();
  const startedAt = Date.now();
  const runDirectory = await mkdtemp(path.join(tmpdir(), 'keimenon-gatee-drill-'));
  const steps: DrillStepResult[] = [];

  console.log(
    `[rollout-rollback-drill] mode=${args.quick ? 'quick' : args.strict ? 'strict' : 'default'}`
  );
  console.log(`[rollout-rollback-drill] runDirectory=${runDirectory}`);

  steps.push(
    await runStep('schema-backup-restore-drill', async () =>
      runSchemaBackupRestoreDrill(runDirectory)
    )
  );

  steps.push(
    await runStep('raw-local-policy-regression', async () => {
      const command = runCommand(
        'npm run test --workspace=@keimenon/api -- src/utils/__tests__/raw-storage-policy.test.ts src/routes/__tests__/content.routes.audit.test.ts src/routes/__tests__/verification.routes.audit.test.ts',
        process.cwd()
      );

      if (!command.pass) {
        throw new Error(command.error || 'raw-local-policy regression run failed');
      }
      return {};
    })
  );

  steps.push(await runStep('kill-switch-regression-matrix', runKillSwitchMatrixRegression));

  const runStrict = args.strict || !args.quick;
  if (runStrict) {
    steps.push(
      await runStep('objective-lifecycle-bridge-regression', async () => {
        const command = runCommand(
          'npm run test --workspace=@keimenon/api -- src/services/__tests__/objective-build-job-bridge.test.ts src/routes/__tests__/import.routes.test.ts',
          process.cwd()
        );

        if (!command.pass) {
          throw new Error(command.error || 'objective lifecycle regression run failed');
        }
        return {};
      })
    );
  }

  const pass = steps.every((step) => step.pass);
  const report = {
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    mode: args.quick ? 'quick' : args.strict ? 'strict' : 'default',
    pass,
    runDirectory,
    steps,
  };

  await writeReport(args.output, report);
  console.log(`[rollout-rollback-drill] wrote report to ${path.resolve(args.output)}`);

  if (!args.keepTemp) {
    await rm(runDirectory, { recursive: true, force: true });
  }

  if (!pass) {
    console.error('[rollout-rollback-drill] FAILED');
    process.exit(1);
  }

  console.log('[rollout-rollback-drill] PASS');
}

main().catch((error) => {
  console.error(
    `[rollout-rollback-drill] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
