
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Configuration
const DB_PATH = process.env.SQLITE_PATH || process.env.DB_PATH || 'C:\\Users\\Audna\\.canvas-memory\\canvas.db';

async function main() {
  // Clear file
  fs.writeFileSync('diagnosis.txt', '');
  const log = (msg: string) => fs.appendFileSync('diagnosis.txt', msg + '\n');
  
  log('🔍 DIAGNOSING IMPORT FAILURE');
  log(`📂 Database: ${DB_PATH}`);

  const db = new Database(DB_PATH);

  try {
    // 1. List Tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row: any) => row.name);
    log(`Found ${tables.length} tables.`);

    if (!tables.includes('jobs')) {
        log('❌ Table "jobs" does not exist!');
        return;
    }

    // 2. Check Counts
    const jobCount = db.prepare('SELECT COUNT(*) as c FROM jobs').get() as any;
    log(`Job count: ${jobCount.c}`);

    // 3. Query Jobs
    try {
        const jobs = db.prepare(`
            SELECT *
            FROM jobs 
            ORDER BY created_at DESC 
            LIMIT 5
        `).all() as any[];

        log(`\nFound ${jobs.length} recent jobs:`);
        for (const job of jobs) {
            log(`Job: ${JSON.stringify(job, null, 2)}`);
            
            // Get events
            if (tables.includes('job_events')) {
                try {
                    const events = db.prepare(`
                        SELECT * FROM job_events 
                        WHERE job_id = ? 
                        ORDER BY created_at ASC
                    `).all(job.id) as any[];

                    if (events.length > 0) {
                        log(`\nEvents:`);
                        events.forEach((e) => {
                             log(`  [${new Date(e.created_at).toISOString()}] ${e.type}: ${e.message} ${e.data ? JSON.stringify(e.data) : ''}`);
                        });
                    } else {
                        log(`\nNo events found.`);
                    }
                } catch (e: any) {
                    log(`Error fetching events: ${e.message}`);
                }
            }
        }
    } catch (e: any) {
        log(`❌ Failed to query jobs: ${e.message}`);
    }

  } catch (error: any) {
    log(`❌ Diagnosis Failed: ${error.message}`);
  } finally {
    db.close();
  }
}

main();
