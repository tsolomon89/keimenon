const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// Target the correct database based on .env
const dbPath = 'C:\\Users\\Audna\\.canvas-memory\\canvas.db';
console.log(`Using database: ${dbPath}`);

const db = new Database(dbPath);

const email = 'admin@admin.com';
const newPassword = 'password123';

async function resetAdmin() {
    console.log(`Resetting account for ${email}...`);

    // 1. Unlock account
    const unlockStmt = db.prepare('DELETE FROM login_attempts WHERE email = ?');
    const unlockInfo = unlockStmt.run(email);
    console.log(`Deleted ${unlockInfo.changes} failed login attempts.`);

    // 2. Update password
    const hash = await bcrypt.hash(newPassword, 12);
    const updateStmt = db.prepare('UPDATE users SET password_hash = ? WHERE email = ?');
    const updateInfo = updateStmt.run(hash, email);

    if (updateInfo.changes > 0) {
        console.log(`Password updated to '${newPassword}' for user ${email}.`);
    } else {
        console.error(`User ${email} not found!`);
        
        // List users to see what exists
        const users = db.prepare('SELECT email FROM users').all();
        console.log('Available users:', users.map(u => u.email));
    }
}

resetAdmin().catch(console.error);
