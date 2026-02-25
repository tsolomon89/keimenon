
import keytar from 'keytar';

const SERVICE = 'Keimenon-Test';
const ACCOUNT = 'test-token';
const SECRET = 'my-secret-token-123';

async function verify() {
    console.log('🔐 Testing Keytar Integration...');
    
    // 1. Save
    await keytar.setPassword(SERVICE, ACCOUNT, SECRET);
    console.log('✅ Saved password');

    // 2. Retrieve
    const retrieved = await keytar.getPassword(SERVICE, ACCOUNT);
    if (retrieved === SECRET) {
        console.log('✅ Retrieved password matches');
    } else {
        console.error('❌ Retrieved password mismatch:', retrieved);
        process.exit(1);
    }

    // 3. Delete
    await keytar.deletePassword(SERVICE, ACCOUNT);
    console.log('✅ Deleted password');

    // 4. Verify Deletion
    const AFTER_DELETE = await keytar.getPassword(SERVICE, ACCOUNT);
    if (AFTER_DELETE === null) {
        console.log('✅ Verified deletion');
    } else {
        console.error('❌ Password still exists after delete');
        process.exit(1);
    }

    console.log('🎉 Keytar Verification PASSED');
}

verify().catch(err => {
    console.error('❌ Verification FAILED:', err);
    process.exit(1);
});
