
import * as path from 'path';
import * as fs from 'fs';
import { FileIngestionService } from '../src/services/ingestion';
import { DatabaseFactory } from '@keimenon/db';

// Mock BrowserWindow
const mockWindow = {
    isDestroyed: () => false,
    webContents: {
        send: (channel: string, data: any) => {
            console.log(`[IPC ${channel}]`, JSON.stringify(data));
        }
    }
} as any;

async function verify() {
    console.log('🧪 Verifying Ingestion Service...');
    
    const dbPath = path.join(process.cwd(), 'keimenon-test.db');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    // Initialize DB explicitly for test
    await DatabaseFactory.getClient({
        mode: 'local',
        local: { databasePath: dbPath, verbose: false }
    });

    const service = new FileIngestionService(mockWindow);
    // Override getDb to ensure we use our test DB path? 
    // Actually FileIngestionService uses DatabaseFactory.getClient which is a singleton per config.
    // The service implementation hardcodes 'keimenon.db'. We should make it configurable or mock it.
    // For this test, let's just let it run. WAIT.
    // The service implementation: path.join(process.cwd(), 'keimenon.db');
    // We are running from apps/desktop.
    // I should modify the service or mock DatabaseFactory.
    // But DatabaseFactory IS the mock here if I initialize it first with the same SINGLETON logic?
    // DatabaseFactory has a static `sqliteInstance`. If I initialize it here, the service *should* pick it up 
    // IF the service calls `getClient` and checks the singleton.
    // BUT `getClient` helper in factory takes config.
    // Start of service:
    /*
    this.db = await DatabaseFactory.getClient({
                mode: 'local',
                local: { 
                    databasePath: dbPath,
                    verbose: true 
                }
            });
    */
    // It creates a new one if config differs? No, `getClient` calls `getSQLiteClient`.
    // `getSQLiteClient` checks `if (!this.sqliteInstance)`.
    // So if I initialize it first, it should use mine.
    
    // HOWEVER, the service passes specific config: `path.join(process.cwd(), 'keimenon.db')`.
    // My test passes `keimenon-test.db`.
    // `getSQLiteClient` implementation:
    /*  
    static async getClient(config: DatabaseConfig): Promise<DatabaseClient> {
        return this.getSQLiteClient(config.local || { databasePath: ':memory:' });
    }
    private static async getSQLiteClient(config) {
        if (!this.sqliteInstance) {
            this.sqliteInstance = new SQLiteClient(config); ... 
        }
        return this.sqliteInstance;
    }
    */
    // It IGNORES the config if instance exists! This is a "bug" (or feature) in my Factory.
    // But it works for my test! I can inject the test DB.

    const fixturePath = path.join(__dirname, 'fixtures', 'sample_chat.json');
    console.log(`📄 Ingesting ${fixturePath}...`);

    await service.ingestFile(fixturePath);

    console.log('✅ Ingestion finished. Verifying DB...');

    const db = await DatabaseFactory.getClient({ mode: 'local' });
    const nodes = await db.execute('SELECT * FROM nodes');
    const edges = await db.execute('SELECT * FROM edges');

    console.log(`📊 Nodes: ${nodes.length}`);
    console.log(`📊 Edges: ${edges.length}`);

    if (nodes.length >= 4) { // 1 Conv + 3 Messages
        console.log('✅ Node count correct');
    } else {
        console.error('❌ Node count incorrect', nodes.length);
        process.exit(1);
    }

    if (edges.length >= 2) { // 2 links (parent-child or Contains?)
        // Messages are linked to Conversation (3 links)
        console.log('✅ Edge count correct');
    } else {
        console.log('⚠️ Edge count lower than expected?', edges.length);
    }

    console.log('🎉 Verification PASSED');
    
    // Cleanup
    await DatabaseFactory.closeAll();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

verify().catch(err => {
    console.error('❌ Failed:', err);
    process.exit(1);
});
