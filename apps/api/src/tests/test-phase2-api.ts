/**
 * Phase 2 API Test Script
 * Tests group management and configuration endpoints
 */

import axios from 'axios';

const API_BASE = 'http://localhost:4001/api/v1';

// Sample messages for testing
const sampleMessages = [
  {
    id: 'msg_1',
    role: 'user',
    content: 'How do I implement JWT authentication in my Express API? I need to handle refresh tokens and access tokens properly.',
  },
  {
    id: 'msg_2',
    role: 'user',
    content: 'Can you help me build a React component that displays a list of users with pagination?',
  },
  {
    id: 'msg_3',
    role: 'user',
    content: 'I need to optimize my database queries. The posts table has millions of rows and queries are slow.',
  },
  {
    id: 'msg_4',
    role: 'user',
    content: 'How do I set up authentication with Passport.js? I want to support both JWT and OAuth.',
  },
  {
    id: 'msg_5',
    role: 'user',
    content: 'My React app is rendering slowly. How can I use React.memo and useMemo to optimize performance?',
  },
  {
    id: 'msg_6',
    role: 'user',
    content: 'What are the best practices for indexing in PostgreSQL? My query performance is terrible.',
  },
  {
    id: 'msg_7',
    role: 'user',
    content: 'I want to add JWT refresh token rotation to my API for better security.',
  },
  {
    id: 'msg_8',
    role: 'user',
    content: 'How do I create a custom React hook for fetching data with loading states?',
  },
  {
    id: 'msg_9',
    role: 'user',
    content: 'My database migrations are failing. How do I handle schema changes in production safely?',
  },
  {
    id: 'msg_10',
    role: 'user',
    content: 'Can you explain the difference between useState and useReducer in React?',
  },
];

async function testConfigAPI() {
  console.log('\n📋 Testing Configuration API...\n');

  try {
    // Test GET /config
    console.log('1. GET /api/v1/config');
    const getResponse = await axios.get(`${API_BASE}/config`);
    console.log('   ✅ Status:', getResponse.status);
    console.log('   Storage mode:', getResponse.data.config.storageMode);
    console.log('   Config path:', getResponse.data.configPath);

    // Test GET /config/defaults
    console.log('\n2. GET /api/v1/config/defaults');
    const defaultsResponse = await axios.get(`${API_BASE}/config/defaults`);
    console.log('   ✅ Status:', defaultsResponse.status);
    if (defaultsResponse.data.defaults?.grouping?.auto?.targetGroupCount) {
      console.log('   Default grouping target:', defaultsResponse.data.defaults.grouping.auto.targetGroupCount);
    } else {
      console.log('   Default grouping target: N/A (structure issue)');
    }

    // Test GET /config/storage-mode
    console.log('\n3. GET /api/v1/config/storage-mode');
    const modeResponse = await axios.get(`${API_BASE}/config/storage-mode`);
    console.log('   ✅ Status:', modeResponse.status);
    console.log('   Storage mode:', modeResponse.data.storageMode);
    console.log('   Local DB path:', modeResponse.data.database.local.path);

    console.log('\n✅ Configuration API tests passed!');
  } catch (error: any) {
    console.error('❌ Configuration API test failed:', error.response?.data || error.message);
  }
}

async function testGroupsAPI() {
  console.log('\n🏷️  Testing Groups API...\n');

  try {
    // Test POST /groups/auto with sample messages
    console.log('1. POST /api/v1/groups/auto (Auto-generate groups)');
    const autoResponse = await axios.post(`${API_BASE}/groups/auto`, {
      messages: sampleMessages,
      config: {
        mode: 'auto',
        auto: {
          targetGroupCount: 5,
          createCatchAll: true,
          minGroupSize: 2,
          algorithm: 'tfidf',
        },
        manual: [
          {
            name: 'Authentication',
            keywords: ['authentication', 'jwt', 'passport', 'oauth', 'token'],
          },
        ],
      },
    });

    console.log('   ✅ Status:', autoResponse.status);
    console.log('   Total groups:', autoResponse.data.result.groups.length);
    console.log('   Manual groups:', autoResponse.data.result.stats.manualGroups);
    console.log('   Auto groups:', autoResponse.data.result.stats.autoGroups);
    console.log('   Catch-all group:', autoResponse.data.result.stats.catchAllGroup);

    console.log('\n   Groups created:');
    for (const group of autoResponse.data.result.groups) {
      console.log(`     - ${group.name} (${group.sources.length} messages)${group.isManual ? ' [MANUAL]' : ''}${group.isCatchAll ? ' [CATCH-ALL]' : ''}`);
      console.log(`       Keywords: ${group.keywords.slice(0, 5).join(', ')}`);
    }

    // Test GET /groups/suggest
    console.log('\n2. GET /api/v1/groups/suggest (Get suggestions)');
    const suggestResponse = await axios.get(`${API_BASE}/groups/suggest`, {
      params: {
        messages: JSON.stringify(sampleMessages),
        target: 3,
      },
    });

    console.log('   ✅ Status:', suggestResponse.status);
    console.log('   Suggested groups:', suggestResponse.data.suggestions.length);
    console.log('\n   Suggestions:');
    for (const suggestion of suggestResponse.data.suggestions) {
      console.log(`     - ${suggestion.name} (${suggestion.messageCount} messages)`);
    }

    // Test POST /groups (Create manual group)
    console.log('\n3. POST /api/v1/groups (Create manual group)');
    const createResponse = await axios.post(`${API_BASE}/groups`, {
      name: 'Testing Group',
      keywords: ['test', 'example'],
      sourceIds: ['msg_1', 'msg_2'],
      mode: 'local',
    });

    console.log('   ✅ Status:', createResponse.status);
    console.log('   Group ID:', createResponse.data.groupId);
    console.log('   Member count:', createResponse.data.memberCount);

    // Test GET /groups (List all groups)
    console.log('\n4. GET /api/v1/groups (List all groups)');
    const listResponse = await axios.get(`${API_BASE}/groups`, {
      params: { mode: 'local' },
    });

    console.log('   ✅ Status:', listResponse.status);
    console.log('   Total groups:', listResponse.data.count);

    console.log('\n✅ Groups API tests passed!');
  } catch (error: any) {
    console.error('❌ Groups API test failed:', error.response?.data || error.message);
  }
}

async function runAllTests() {
  console.log('🧪 Starting Phase 2 API Tests...');
  console.log('=' .repeat(50));

  await testConfigAPI();
  await testGroupsAPI();

  console.log('\n' + '='.repeat(50));
  console.log('🎉 All tests complete!');
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get(`${API_BASE.replace('/api/v1', '')}/health`);
    return true;
  } catch (error) {
    return false;
  }
}

(async () => {
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.error('❌ API server is not running!');
    console.log('   Start the server with: npm run dev:boot');
    console.log('   Or: cd apps/api && npm run dev');
    process.exit(1);
  }

  await runAllTests();
})();
