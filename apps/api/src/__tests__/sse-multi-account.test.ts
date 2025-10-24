/**
 * SSE Multi-Account Test
 *
 * Tests SSE event isolation across accounts:
 * - Account-based event filtering (users only see their account's jobs)
 * - Multi-tenant event broadcasting
 * - Permission-based event visibility
 * - Cross-account isolation (Account A cannot see Account B's events)
 * - Concurrent jobs across multiple accounts
 */

import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import EventSource from 'eventsource';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import {
  login,
  createDeleteJob,
  createTestNodes,
  cleanupTestData,
  waitFor,
} from './utils/test-helpers';

// Test configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:4001';
const DB_PATH = process.env.DB_PATH || path.join(os.homedir(), '.canvas-memory', 'canvas.db');
const SSE_BASE_URL = `${API_BASE_URL}/api/v1/stream/jobs`;

describe('SSE Multi-Account', () => {
  let db: Database.Database;

  // Admin account (Account A)
  let adminToken: string;
  let adminAccountId: string;
  let adminUserId: string;

  // Regular user account (Account B) - we'll create this
  let userBToken: string;
  let userBAccountId: string;
  let userBUserId: string;

  before(async () => {
    // Connect to database
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Login as admin (Account A)
    const adminLogin = await login('admin@admin.com', 'admin123');
    adminToken = adminLogin.token;
    adminAccountId = adminLogin.accountId;
    adminUserId = adminLogin.userId;

    console.log('[SSE Multi-Account] Admin account setup', {
      accountId: adminAccountId,
      userId: adminUserId,
    });

    // Create second test user/account (Account B)
    // First check if test user exists
    const existingUser = db
      .prepare(
        `
      SELECT id, account_id FROM users WHERE email = ?
    `
      )
      .get('testuser@example.com') as any;

    if (existingUser) {
      // Use existing user
      userBUserId = existingUser.id;
      userBAccountId = existingUser.account_id;

      // Try to login
      try {
        const userBLogin = await login('testuser@example.com', 'testpass123');
        userBToken = userBLogin.token;
      } catch (error) {
        console.log('[SSE Multi-Account] Cannot login as test user, will create new');
        // Will create new user below
      }
    }

    // If we don't have a valid token, create new user
    if (!userBToken) {
      // Create new account
      const accountId = `test-account-${Date.now()}`;
      db.prepare(
        `
        INSERT INTO accounts (id, account_type, account_class, email, name, created_at, updated_at)
        VALUES (?, 'client', 'free', ?, ?, ?, ?)
      `
      ).run(accountId, 'test@example.com', 'Test Account', Date.now(), Date.now());

      // Create new user
      const userId = `test-user-${Date.now()}`;
      const bcrypt = require('bcryptjs');
      const passwordHash = bcrypt.hashSync('testpass123', 10);

      db.prepare(
        `
        INSERT INTO users (id, account_id, email, password_hash, name, permission_level, user_class, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        userId,
        accountId,
        'testuser@example.com',
        passwordHash,
        'Test User B',
        'user',
        'person',
        1,
        Date.now(),
        Date.now()
      );

      userBAccountId = accountId;
      userBUserId = userId;

      // Login as new user
      const userBLogin = await login('testuser@example.com', 'testpass123');
      userBToken = userBLogin.token;
    }

    console.log('[SSE Multi-Account] User B account setup', {
      accountId: userBAccountId,
      userId: userBUserId,
    });

    console.log('[SSE Multi-Account] Test setup complete');
  });

  after(() => {
    if (db) {
      // Clean up test data
      cleanupTestData(db, adminAccountId);
      if (userBAccountId !== adminAccountId) {
        cleanupTestData(db, userBAccountId);
      }

      db.close();
    }
  });

  beforeEach(() => {
    // Clean up test data before each test
    cleanupTestData(db, adminAccountId);
    if (userBAccountId !== adminAccountId) {
      cleanupTestData(db, userBAccountId);
    }
  });

  afterEach(() => {
    // Clean up after each test
    cleanupTestData(db, adminAccountId);
    if (userBAccountId !== adminAccountId) {
      cleanupTestData(db, userBAccountId);
    }
  });

  describe('Account-Based Event Filtering', () => {
    test(
      'should only broadcast events to job owner account',
      async (_t) => {
        // Create test data for Account A
        createTestNodes(db, adminAccountId, 100);

        // Connect SSE for Account A
        const sseUrlA = `${SSE_BASE_URL}?token=${adminToken}`;
        const eventSourceA = new EventSource(sseUrlA);
        const eventsA: any[] = [];

        eventSourceA.addEventListener('jobs.update', (event: any) => {
          eventsA.push(JSON.parse(event.data));
        });

        // Connect SSE for Account B
        const sseUrlB = `${SSE_BASE_URL}?token=${userBToken}`;
        const eventSourceB = new EventSource(sseUrlB);
        const eventsB: any[] = [];

        eventSourceB.addEventListener('jobs.update', (event: any) => {
          eventsB.push(JSON.parse(event.data));
        });

        // Wait for both connections
        await Promise.all([
          new Promise<void>((resolve) => {
            eventSourceA.onopen = () => resolve();
          }),
          new Promise<void>((resolve) => {
            eventSourceB.onopen = () => resolve();
          }),
        ]);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Create delete job for Account A
        const { jobId: jobIdA } = await createDeleteJob('canvas', adminToken);

        // Wait for Account A to receive event
        await waitFor(() => eventsA.some((e) => e.jobs?.some((j: any) => j.jobId === jobIdA)), {
          timeout: 10000,
          interval: 500,
        });

        // Account A should have received the event
        const accountAEvents = eventsA.flatMap((e) => e.jobs || []);
        const accountAHasJob = accountAEvents.some((j: any) => j.jobId === jobIdA);
        assert.strictEqual(accountAHasJob, true);

        // Account B should NOT have received the event
        const accountBEvents = eventsB.flatMap((e) => e.jobs || []);
        const accountBHasJob = accountBEvents.some((j: any) => j.jobId === jobIdA);
        assert.strictEqual(accountBHasJob, false);

        eventSourceA.close();
        eventSourceB.close();
      },
      { timeout: 30000 }
    );

    test(
      'should isolate events across different accounts',
      async (_t) => {
        // Create test data for both accounts
        createTestNodes(db, adminAccountId, 50);
        createTestNodes(db, userBAccountId, 50);

        // Connect SSE for both accounts
        const sseUrlA = `${SSE_BASE_URL}?token=${adminToken}`;
        const eventSourceA = new EventSource(sseUrlA);
        const eventsA: any[] = [];

        eventSourceA.addEventListener('jobs.update', (event: any) => {
          eventsA.push(JSON.parse(event.data));
        });

        const sseUrlB = `${SSE_BASE_URL}?token=${userBToken}`;
        const eventSourceB = new EventSource(sseUrlB);
        const eventsB: any[] = [];

        eventSourceB.addEventListener('jobs.update', (event: any) => {
          eventsB.push(JSON.parse(event.data));
        });

        // Wait for connections
        await Promise.all([
          new Promise<void>((resolve) => {
            eventSourceA.onopen = () => resolve();
          }),
          new Promise<void>((resolve) => {
            eventSourceB.onopen = () => resolve();
          }),
        ]);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Create jobs for both accounts
        const { jobId: jobIdA } = await createDeleteJob('canvas', adminToken);
        const { jobId: jobIdB } = await createDeleteJob('canvas', userBToken);

        // Wait for events
        await waitFor(
          () =>
            eventsA.some((e) => e.jobs?.some((j: any) => j.jobId === jobIdA)) &&
            eventsB.some((e) => e.jobs?.some((j: any) => j.jobId === jobIdB)),
          { timeout: 15000, interval: 500 }
        );

        // Account A should only see jobIdA
        const accountAEvents = eventsA.flatMap((e) => e.jobs || []);
        assert.ok(accountAEvents.some((j: any) => j.jobId === jobIdA));
        assert.ok(!accountAEvents.some((j: any) => j.jobId === jobIdB));

        // Account B should only see jobIdB
        const accountBEvents = eventsB.flatMap((e) => e.jobs || []);
        assert.ok(accountBEvents.some((j: any) => j.jobId === jobIdB));
        assert.ok(!accountBEvents.some((j: any) => j.jobId === jobIdA));

        eventSourceA.close();
        eventSourceB.close();
      },
      { timeout: 45000 }
    );
  });

  describe('Concurrent Jobs Across Accounts', () => {
    test(
      'should handle concurrent jobs from different accounts',
      async (_t) => {
        // Create test data for both accounts
        createTestNodes(db, adminAccountId, 100);
        createTestNodes(db, userBAccountId, 100);

        // Connect SSE for both
        const sseUrlA = `${SSE_BASE_URL}?token=${adminToken}`;
        const eventSourceA = new EventSource(sseUrlA);
        const eventsA: any[] = [];

        eventSourceA.addEventListener('jobs.update', (event: any) => {
          eventsA.push(JSON.parse(event.data));
        });

        const sseUrlB = `${SSE_BASE_URL}?token=${userBToken}`;
        const eventSourceB = new EventSource(sseUrlB);
        const eventsB: any[] = [];

        eventSourceB.addEventListener('jobs.update', (event: any) => {
          eventsB.push(JSON.parse(event.data));
        });

        // Wait for connections
        await Promise.all([
          new Promise<void>((resolve) => {
            eventSourceA.onopen = () => resolve();
          }),
          new Promise<void>((resolve) => {
            eventSourceB.onopen = () => resolve();
          }),
        ]);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Create concurrent delete jobs
        const jobPromises = await Promise.all([
          createDeleteJob('canvas', adminToken),
          createDeleteJob('canvas', userBToken),
        ]);

        const jobIdA = jobPromises[0].jobId;
        const jobIdB = jobPromises[1].jobId;

        // Both jobs should complete
        await waitFor(
          () =>
            eventsA.some((e) =>
              e.jobs?.some((j: any) => j.jobId === jobIdA && j.status === 'succeeded')
            ) &&
            eventsB.some((e) =>
              e.jobs?.some((j: any) => j.jobId === jobIdB && j.status === 'succeeded')
            ),
          { timeout: 60000, interval: 1000 }
        );

        // Verify isolation
        const accountAJobs = eventsA.flatMap((e) => e.jobs || []);
        const accountBJobs = eventsB.flatMap((e) => e.jobs || []);

        // Account A should only have jobIdA
        assert.ok(accountAJobs.some((j: any) => j.jobId === jobIdA));
        assert.ok(accountAJobs.every((j: any) => j.jobId !== jobIdB));

        // Account B should only have jobIdB
        assert.ok(accountBJobs.some((j: any) => j.jobId === jobIdB));
        assert.ok(accountBJobs.every((j: any) => j.jobId !== jobIdA));

        eventSourceA.close();
        eventSourceB.close();
      },
      { timeout: 90000 }
    );
  });

  describe('Event Data Validation', () => {
    test(
      'should include accountId in all events',
      async (_t) => {
        // Create test data
        createTestNodes(db, adminAccountId, 50);

        // Connect SSE
        const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
        const eventSource = new EventSource(sseUrl);
        const events: any[] = [];

        eventSource.addEventListener('jobs.update', (event: any) => {
          events.push(JSON.parse(event.data));
        });

        // Wait for connection
        await new Promise<void>((resolve) => {
          eventSource.onopen = () => resolve();
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Create job
        const { jobId } = await createDeleteJob('canvas', adminToken);

        // Wait for event
        await waitFor(() => events.some((e) => e.jobs?.some((j: any) => j.jobId === jobId)), {
          timeout: 10000,
          interval: 500,
        });

        // All job events should have accountId matching admin account
        const jobEvents = events.flatMap((e) => e.jobs || []);
        jobEvents.forEach((job: any) => {
          assert.strictEqual(job.accountId, adminAccountId);
        });

        eventSource.close();
      },
      { timeout: 30000 }
    );

    test(
      'should not leak data across accounts',
      async (_t) => {
        // Create test data for Account A only
        createTestNodes(db, adminAccountId, 50);

        // Connect SSE for Account B (should not see Account A's events)
        const sseUrlB = `${SSE_BASE_URL}?token=${userBToken}`;
        const eventSourceB = new EventSource(sseUrlB);
        const eventsB: any[] = [];

        eventSourceB.addEventListener('jobs.update', (event: any) => {
          eventsB.push(JSON.parse(event.data));
        });

        // Wait for connection
        await new Promise<void>((resolve) => {
          eventSourceB.onopen = () => resolve();
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Create job for Account A
        const { jobId: jobIdA } = await createDeleteJob('canvas', adminToken);

        // Wait a bit for potential events
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Account B should not have received any events for Account A's job
        const accountBJobs = eventsB.flatMap((e) => e.jobs || []);
        const hasAccountAJob = accountBJobs.some((j: any) => j.jobId === jobIdA);

        assert.strictEqual(hasAccountAJob, false);

        // Account B should not have received any events with Account A's accountId
        accountBJobs.forEach((job: any) => {
          assert.notStrictEqual(job.accountId, adminAccountId);
        });

        eventSourceB.close();
      },
      { timeout: 30000 }
    );
  });
});
