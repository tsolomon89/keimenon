const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  'neo4j+s://2a55fc56.databases.neo4j.io',
  neo4j.auth.basic('neo4j', 'xEMVwxxwa62nD55n-XjeKDEoKxaDoixO6kMIC000CT8')
);

async function testConnection() {
  console.log('🔌 Testing Neo4j Aura connection...');
  console.log('URI: neo4j+s://2a55fc56.databases.neo4j.io');
  console.log('User: neo4j');
  console.log('Password: xEMVw... (first 5 chars)');

  try {
    await driver.verifyConnectivity();
    console.log('✅ Connection successful!');

    const session = driver.session();
    const result = await session.run('RETURN "Hello from Aura!" AS message');
    console.log('✅ Query successful:', result.records[0].get('message'));
    await session.close();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('\nPossible issues:');
    console.log('1. New Aura instance still starting (wait 1-2 minutes)');
    console.log('2. Password incorrect - double check in Aura console');
    console.log('3. Instance paused/stopped - check Aura console status');
    console.log('4. Copy-paste error - ensure no extra spaces in password');
  } finally {
    await driver.close();
  }
}

testConnection();
