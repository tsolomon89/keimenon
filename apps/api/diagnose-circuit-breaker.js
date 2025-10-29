/**
 * Circuit Breaker Diagnostic Script
 *
 * Run this to diagnose why the circuit breaker opened and get the root cause.
 *
 * Usage: node diagnose-circuit-breaker.js
 */

const API_BASE = 'http://localhost:4001';

async function diagnose() {
  console.log('🔍 Diagnosing circuit breaker issue...\n');

  try {
    // Step 1: Get queue status
    console.log('📊 Fetching queue status...');
    const response = await fetch(`${API_BASE}/api/v1/debug/queue/status`);

    if (!response.ok) {
      console.error(`❌ API returned ${response.status}: ${response.statusText}`);
      console.error('Is the API server running? Try: cd apps/api && npm run dev');
      process.exit(1);
    }

    const data = await response.json();

    console.log('\n=== QUEUE STATUS ===');
    console.log(`Nodes in queue: ${data.queue.nodes}`);
    console.log(`Edges in queue: ${data.queue.edges}`);

    console.log('\n=== CIRCUIT BREAKER ===');
    console.log(
      `Status: ${data.circuitBreaker.isOpen ? '🔴 OPEN (blocking writes)' : '🟢 CLOSED (accepting writes)'}`
    );
    console.log(`Total attempts: ${data.circuitBreaker.totalAttempts}`);
    console.log(`Successful writes: ${data.circuitBreaker.successfulWrites}`);
    console.log(`Failed writes: ${data.circuitBreaker.failedWrites}`);
    console.log(`Circuit breaker opens: ${data.circuitBreaker.circuitBreakerOpens}`);

    console.log('\n=== STATS ===');
    console.log(`Nodes queued: ${data.stats.nodesQueued}`);
    console.log(`Nodes flushed: ${data.stats.nodesFlushed}`);
    console.log(`Edges queued: ${data.stats.edgesQueued}`);
    console.log(`Edges flushed: ${data.stats.edgesFlushed}`);
    console.log(`Flush count: ${data.stats.flushCount}`);

    console.log('\n=== DEAD LETTER QUEUE ===');
    console.log(`Items in dead letter queue: ${data.deadLetterQueue.count}`);

    if (data.deadLetterQueue.count > 0) {
      console.log('\n🚨 FAILED ITEMS (showing first 10):');
      data.deadLetterQueue.items.forEach((item, index) => {
        console.log(`\n--- Item ${index + 1} ---`);
        console.log(`Type: ${item.type}`);
        console.log(`Attempt count: ${item.attemptCount}`);
        console.log(`Timestamp: ${new Date(item.timestamp).toISOString()}`);
        console.log(`Error: ${item.error.message || item.error}`);
        console.log(`Data:`, JSON.stringify(item.data, null, 2));
      });

      console.log('\n\n💡 ROOT CAUSE ANALYSIS:');
      const firstError =
        data.deadLetterQueue.items[0].error.message || data.deadLetterQueue.items[0].error;

      if (firstError.includes('SQLITE_BUSY')) {
        console.log('❌ Database is locked (SQLITE_BUSY)');
        console.log('   Solutions:');
        console.log('   1. Check if another process has the database open');
        console.log('   2. Verify WAL mode is enabled: PRAGMA journal_mode=WAL');
        console.log('   3. Check file permissions on the database file');
      } else if (firstError.includes('FOREIGN KEY constraint')) {
        console.log('❌ Foreign key violation');
        console.log('   Solutions:');
        console.log('   1. Ensure the referenced account exists in the accounts table');
        console.log('   2. Ensure the referenced user exists in the users table');
      } else if (firstError.includes('UNIQUE constraint')) {
        console.log('❌ Duplicate key violation');
        console.log('   Solutions:');
        console.log('   1. Check for duplicate node/edge IDs in your import data');
        console.log('   2. Consider using INSERT OR REPLACE instead of INSERT');
      } else if (firstError.includes('NOT NULL constraint')) {
        console.log('❌ Missing required field');
        console.log('   Solutions:');
        console.log('   1. Ensure all nodes have account_id, created_by, etc.');
      } else {
        console.log(`❌ Unknown error: ${firstError}`);
      }
    }

    if (data.circuitBreaker.isOpen) {
      console.log('\n\n🔧 TO FIX:');
      console.log('1. Fix the root cause shown above');
      console.log('2. Reset the circuit breaker:');
      console.log(`   curl -X POST ${API_BASE}/api/v1/debug/queue/reset-circuit`);
      console.log('3. Retry your import');
    } else {
      console.log('\n✅ Circuit breaker is closed. System is healthy.');
    }
  } catch (error) {
    console.error('\n❌ Error running diagnostic:', error.message);
    console.error('\nMake sure the API server is running:');
    console.error('  cd apps/api');
    console.error('  npm run dev');
  }
}

diagnose();
