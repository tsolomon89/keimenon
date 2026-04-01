import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH =
  process.env.SQLITE_PATH || process.env.DB_PATH || 'C:\\Users\\Audna\\.canvas-memory\\canvas.db';
const DIAGNOSTICS_DIR = path.resolve(process.cwd(), 'test-results', 'diagnostics');
const OUTPUT_PATH =
  process.env.DIAGNOSE_IMPORT_OUTPUT || path.join(DIAGNOSTICS_DIR, 'diagnosis-latest.txt');

function ensureOutputDir(outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

function writeLog(outputPath: string, message: string): void {
  fs.appendFileSync(outputPath, `${message}\n`, 'utf8');
}

async function main() {
  ensureOutputDir(OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, '', 'utf8');
  const log = (msg: string) => writeLog(OUTPUT_PATH, msg);

  log('DIAGNOSING IMPORT FAILURE');
  log(`Database: ${DB_PATH}`);
  log(`Output: ${OUTPUT_PATH}`);

  const db = new Database(DB_PATH);

  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name);
    log(`Found ${tables.length} tables.`);

    if (!tables.includes('jobs')) {
      log('Table "jobs" does not exist.');
      return;
    }

    const jobCount = db.prepare('SELECT COUNT(*) as c FROM jobs').get() as any;
    log(`Job count: ${jobCount.c}`);

    try {
      const jobs = db
        .prepare(
          `
            SELECT *
            FROM jobs
            ORDER BY created_at DESC
            LIMIT 5
          `
        )
        .all() as any[];

      log(`\nFound ${jobs.length} recent jobs:`);
      for (const job of jobs) {
        log(`Job: ${JSON.stringify(job, null, 2)}`);

        if (tables.includes('job_events')) {
          try {
            const events = db
              .prepare(
                `
                  SELECT * FROM job_events
                  WHERE job_id = ?
                  ORDER BY created_at ASC
                `
              )
              .all(job.id) as any[];

            if (events.length > 0) {
              log('\nEvents:');
              events.forEach((event) => {
                log(
                  `  [${new Date(event.created_at).toISOString()}] ${event.type}: ${event.message} ${event.data ? JSON.stringify(event.data) : ''}`
                );
              });
            } else {
              log('\nNo events found.');
            }
          } catch (eventError: any) {
            log(`Error fetching events: ${eventError.message}`);
          }
        }
      }
    } catch (queryError: any) {
      log(`Failed to query jobs: ${queryError.message}`);
    }
  } catch (error: any) {
    log(`Diagnosis failed: ${error.message}`);
  } finally {
    db.close();
  }
}

main();
