const neo4j = require('neo4j-driver');
require('dotenv').config({ path: './apps/api/.env' });

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
);

async function testConnection() {
  const session = driver.session();

  try {
    console.log('🔌 Testing Neo4j connection...');
    console.log('URI:', process.env.NEO4J_URI);
    console.log('User:', process.env.NEO4J_USER);

    const result = await session.run('RETURN "Hello, Neo4j!" AS message');
    const message = result.records[0].get('message');

    console.log('✅ Success!', message);
    console.log('✅ Neo4j is connected and working!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure Neo4j is running');
    console.log('2. Check your URI, username, and password in apps/api/.env');
    console.log('3. For Aura, URI should start with neo4j+s://');
    console.log('4. For local, URI should be bolt://localhost:7687');
  } finally {
    await session.close();
    await driver.close();
  }
}

testConnection();
