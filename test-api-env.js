require('dotenv').config({ path: './apps/api/.env' });

console.log('Environment variables loaded:');
console.log('NEO4J_URI:', process.env.NEO4J_URI);
console.log('NEO4J_USER:', process.env.NEO4J_USER);
console.log('NEO4J_PASSWORD:', process.env.NEO4J_PASSWORD ? process.env.NEO4J_PASSWORD.substring(0, 5) + '...' : 'NOT SET');
