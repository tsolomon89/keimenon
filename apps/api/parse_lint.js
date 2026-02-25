const fs = require('fs');
try {
  let content = fs.readFileSync('lint_retry.json', 'utf16le');
  // Find first '['
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found');
  content = content.substring(start, end + 1);
  const results = JSON.parse(content);
  results.forEach(result => {
    if (result.errorCount > 0 || result.warningCount > 0) {
      console.log('File:', result.filePath);
      result.messages.forEach(msg => {
        console.log(`  Line ${msg.line}:${msg.column} - ${msg.message} (${msg.ruleId})`);
      });
    }
  });
} catch (e) {
  console.error('Error parsing JSON:', e);
}
