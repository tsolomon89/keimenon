const fs = require('fs');
const path = require('path');

const logPath = path.join(process.cwd(), 'tests/api_server.log');

try {
  const content = fs.readFileSync(logPath, 'utf8');
  const keywords = ['[JobRepository Save]', '[IMPORT JOB]', '[API GET]', 'testDbPath'];
  
  const lines = content.split('\n');
  lines.forEach(line => {
    if (keywords.some(k => line.includes(k))) {
      console.log(line);
    }
  });
} catch (err) {
  console.error('Error reading log:', err.message);
}
