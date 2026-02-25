
import path from 'path';
import fs from 'fs';
import { Worker } from 'worker_threads';

const TEST_FILE_PATH = path.join(__dirname, 'test-large-file.json');

async function createTestFile() {
    console.log('Creating test file...');
    const data = [];
    for (let i = 0; i < 1000; i++) {
        data.push({
            id: `conv_${i}`,
            title: `Conversation ${i}`,
            created_at: Date.now(),
            messages: [
                { role: 'user', content: 'hello' },
                { role: 'assistant', content: 'world' }
            ]
        });
    }
    fs.writeFileSync(TEST_FILE_PATH, JSON.stringify(data));
    console.log('Test file created:', TEST_FILE_PATH);
    return TEST_FILE_PATH;
}

async function runWorker() {
    console.log('Starting worker test...');
    
    // Locate the worker file - assuming we are running with ts-node
    // We need to point to the .ts file for ts-node to handle it, OR the .js file if built.
    // For this test, let's try the .ts file with ts-node registration if possible.
    
    const workerPath = path.join(__dirname, '../import.worker.ts');
    
    console.log('Worker path:', workerPath);

    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
            workerData: {
                filePath: TEST_FILE_PATH,
                fileSize: fs.statSync(TEST_FILE_PATH).size,
                mimeType: 'application/json',
                batchSize: 50
            },
            execArgv: ['-r', 'ts-node/register'] // Crucial for running .ts worker
        });

        worker.on('message', (msg) => {
            console.log('Message from worker:', msg.type);
            if (msg.type === 'progress') {
                console.log(`Progress: ${msg.data.percent}% - ${msg.data.message}`);
            } else if (msg.type === 'batch') {
                console.log(`Received batch of ${msg.data.length} items`);
            } else if (msg.type === 'done') {
                console.log('Worker finished successfully!');
                resolve(true);
            } else if (msg.type === 'error') {
                console.error('Worker error:', msg.data);
                reject(new Error(msg.data));
            }
        });

        worker.on('error', (err) => {
            console.error('Worker thread error:', err);
            reject(err);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`Worker stopped with exit code ${code}`);
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

(async () => {
    try {
        await createTestFile();
        await runWorker();
        console.log('Test passed!');
    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        if (fs.existsSync(TEST_FILE_PATH)) {
            fs.unlinkSync(TEST_FILE_PATH);
            console.log('Cleanup done.');
        }
    }
})();
