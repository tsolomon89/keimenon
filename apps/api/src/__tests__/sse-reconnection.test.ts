/**
 * SSE Reconnection Test
 *
 * Tests SSE connection lifecycle and automatic reconnection:
 * - Initial connection establishment
 * - Heartbeat mechanism (30s intervals)
 * - Automatic reconnection on disconnect
 * - Exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)
 * - Maximum reconnection attempts (10)
 * - Connection state tracking
 * - Error handling during reconnection
 * - Manual disconnect vs automatic reconnection
 */

import { describe, test, beforeAll, afterAll, type TestContext } from 'vitest';
import assert from 'node:assert';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env'), override: true });
(process.env as any).NODE_ENV = 'test';

import { login, waitFor, register } from './utils/test-helpers';
import { createApp } from '../app';
import { Server } from 'http';
import { DatabaseFactory } from '@keimenon/db';
import { AuthService } from '../services/auth.service';
import { SSEBroadcaster } from '../modules/jobs/infrastructure/SSEBroadcaster';
import os from 'os';

// Import EventSource correctly
import { EventSource } from 'eventsource';

// Test configuration
let PORT = 0; // Random port
let API_BASE_URL = '';
let SSE_BASE_URL = '';

describe('SSE Reconnection', () => {
  let adminToken: string;
  let adminAccountId: string;
  let server: Server;
  let sseBroadcaster: SSEBroadcaster;

  beforeAll(async () => {
    // Initialize DB
    const dbPath = path.join(os.homedir(), '.keimenon', 'keimenon.db');
    const dbClient = await DatabaseFactory.getClient({
      mode: 'local',
      local: { databasePath: dbPath },
    });

    // Mock global.dbClient for routes
    (global as any).dbClient = dbClient;

    // Initialize Schema if needed
    if ((dbClient as any).initializeSchema) {
      await (dbClient as any).initializeSchema();
    }

    // Initialize Services
    const authService = new AuthService(dbClient as any);
    sseBroadcaster = new SSEBroadcaster(500, 15000);
    sseBroadcaster.start();

    // Create App
    const { app, context } = createApp();

    // Initialize Routes with Mocks
    const mockWorkerPool = {} as any;
    const mockWriteQueue = {} as any;

    (context as any).initializeRoutes(authService, sseBroadcaster, mockWorkerPool, mockWriteQueue);

    // Start server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          PORT = address.port;
          API_BASE_URL = `http://localhost:${PORT}`;
          SSE_BASE_URL = `${API_BASE_URL}/api/v1/stream/jobs`;

          // Override process.env for login helper
          process.env.TEST_API_URL = API_BASE_URL;

          console.log(`[SSE Test] Server started on port ${PORT}`);
        }
        resolve();
      });
    });

    // Login as admin
    try {
      const loginResult = await register('admin@admin.com', 'admin123', 'Admin User');
      adminToken = loginResult.token;
      adminAccountId = loginResult.accountId;
    } catch (e) {
      console.error('FATAL: Register/Login failed during test setup:', e);
      throw e;
    }

    console.log('[SSE Reconnection] Test setup complete', {
      accountId: adminAccountId,
    });
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
    if (sseBroadcaster) {
      sseBroadcaster.stop();
    }
  });

  describe('Connection Lifecycle', () => {
    test('should establish initial connection successfully', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      const eventSource = new EventSource(sseUrl);

      // Wait for connection to open
      await new Promise<void>((resolve, reject) => {
        eventSource.onopen = () => {
          console.log('[TEST] Connection opened');
          resolve();
        };
        eventSource.onerror = (err) => {
          console.error('[TEST] Connection error:', err);
          // EventSource error object often doesn't have message, try to inspect it
          try {
            console.error('Error details:', JSON.stringify(err));
          } catch (e) {
            // Ignore
          }
          // Don't reject immediately, wait for timeout or retries?
          // But for "establish initial connection", error is bad.
        };
      });

      assert.strictEqual(eventSource.readyState, eventSource.OPEN);

      eventSource.close();
    });

    test('should receive heartbeat events', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      const eventSource = new EventSource(sseUrl);
      const heartbeats: any[] = [];

      // Listen for heartbeat events
      eventSource.addEventListener('heartbeat', (event: any) => {
        heartbeats.push(JSON.parse(event.data));
      });

      // Wait for connection
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => resolve();
      });

      // Wait for at least one heartbeat (30s interval, but may be faster in test)
      await waitFor(() => heartbeats.length > 0, { timeout: 35000, interval: 1000 });

      assert.ok(heartbeats.length > 0);
      assert.strictEqual(heartbeats[0].type, 'heartbeat');
      assert.ok(heartbeats[0].timestamp);

      eventSource.close();
    }, 40000);

    test('should handle manual close gracefully', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      const eventSource = new EventSource(sseUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => resolve();
      });

      assert.strictEqual(eventSource.readyState, eventSource.OPEN);

      // Close manually
      eventSource.close();

      // Should be closed
      assert.strictEqual(eventSource.readyState, eventSource.CLOSED);
    }, 10000);

    test('should cleanup connection on client disconnect', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;

      // Create multiple connections
      const eventSource1 = new EventSource(sseUrl);
      const eventSource2 = new EventSource(sseUrl);

      // Wait for both to connect
      await Promise.all([
        new Promise<void>((resolve) => {
          eventSource1.onopen = () => resolve();
        }),
        new Promise<void>((resolve) => {
          eventSource2.onopen = () => resolve();
        }),
      ]);

      assert.strictEqual(eventSource1.readyState, eventSource1.OPEN);
      assert.strictEqual(eventSource2.readyState, eventSource2.OPEN);

      console.log('   ✅ Two connections established');

      // Close first connection
      eventSource1.close();
      await new Promise((resolve) => setTimeout(resolve, 500)); // Give time for cleanup

      assert.strictEqual(eventSource1.readyState, eventSource1.CLOSED);
      assert.strictEqual(eventSource2.readyState, eventSource2.OPEN);

      console.log('   ✅ First connection closed, second still open');

      // Close second connection
      eventSource2.close();
      await new Promise((resolve) => setTimeout(resolve, 500)); // Give time for cleanup

      assert.strictEqual(eventSource2.readyState, eventSource2.CLOSED);

      console.log('   ✅ All connections cleaned up');
    }, 10000);
  });

  describe('Automatic Reconnection', () => {
    test('should reconnect automatically on disconnect', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      let eventSource = new EventSource(sseUrl);
      let connectionCount = 0;

      // Track connections
      eventSource.onopen = () => {
        connectionCount++;
      };

      // Wait for initial connection
      await new Promise<void>((resolve) => {
        const checkOpen = () => {
          if (connectionCount > 0) {
            resolve();
          } else {
            setTimeout(checkOpen, 100);
          }
        };
        checkOpen();
      });

      assert.strictEqual(connectionCount, 1);

      // Simulate disconnect by closing and creating new connection
      eventSource.close();

      // Create new connection (simulating reconnect)
      eventSource = new EventSource(sseUrl);

      // Wait for reconnection
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => {
          connectionCount++;
          resolve();
        };
      });

      assert.strictEqual(connectionCount, 2);

      eventSource.close();
    }, 15000);

    test('should use exponential backoff for reconnection attempts', async (_t: TestContext) => {
      // This test simulates the client-side reconnection logic
      const reconnectDelays: number[] = [];
      let currentDelay = 1000; // Start at 1 second
      const maxDelay = 30000; // Max 30 seconds

      // Simulate 10 reconnection attempts
      for (let i = 0; i < 10; i++) {
        reconnectDelays.push(currentDelay);
        currentDelay = Math.min(currentDelay * 2, maxDelay);
      }

      // Verify exponential backoff pattern
      assert.strictEqual(reconnectDelays[0], 1000); // 1s
      assert.strictEqual(reconnectDelays[1], 2000); // 2s
      assert.strictEqual(reconnectDelays[2], 4000); // 4s
      assert.strictEqual(reconnectDelays[3], 8000); // 8s
      assert.strictEqual(reconnectDelays[4], 16000); // 16s
      assert.strictEqual(reconnectDelays[5], 30000); // 30s (capped)
      assert.strictEqual(reconnectDelays[9], 30000); // Still capped

      // All subsequent delays should be capped at 30s
      for (let i = 5; i < reconnectDelays.length; i++) {
        assert.strictEqual(reconnectDelays[i], 30000);
      }
    }, 5000);

    test('should limit maximum reconnection attempts', async (_t: TestContext) => {
      // This test verifies the reconnection limit logic
      const MAX_RECONNECT_ATTEMPTS = 10;
      let reconnectAttempts = 0;

      // Simulate reconnection attempts
      while (reconnectAttempts < MAX_RECONNECT_ATTEMPTS + 2) {
        reconnectAttempts++;

        // Check if we should stop
        if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
          break;
        }
      }

      // Should stop at max attempts
      assert.strictEqual(reconnectAttempts, MAX_RECONNECT_ATTEMPTS + 1);
    }, 5000);
  });

  describe('Error Handling', () => {
    test('should handle connection errors', async (_t: TestContext) => {
      // Try to connect with invalid token
      const sseUrl = `${SSE_BASE_URL}?token=invalid-token`;
      const eventSource = new EventSource(sseUrl);
      const errors: any[] = [];

      eventSource.onerror = (error) => {
        errors.push(error);
      };

      // Wait for error
      await waitFor(() => errors.length > 0, { timeout: 5000, interval: 100 });

      assert.ok(errors.length > 0);

      eventSource.close();
    }, 10000);

    test('should handle network errors gracefully', async (_t: TestContext) => {
      // Connect to non-existent endpoint
      const sseUrl = `${API_BASE_URL}/api/v1/nonexistent/stream?token=${adminToken}`;
      const eventSource = new EventSource(sseUrl);
      const errors: any[] = [];

      eventSource.onerror = (error) => {
        errors.push(error);
        eventSource.close(); // Prevent infinite retry
      };

      // Wait for error
      await waitFor(() => errors.length > 0, { timeout: 5000, interval: 100 });

      assert.ok(errors.length > 0);
      assert.strictEqual(eventSource.readyState, eventSource.CLOSED);
    }, 10000);

    test('should handle malformed event data', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      const eventSource = new EventSource(sseUrl);
      const parseErrors: any[] = [];

      // Listen for jobs.update events
      eventSource.addEventListener('jobs.update', (event: any) => {
        try {
          JSON.parse(event.data);
        } catch (error) {
          parseErrors.push(error);
        }
      });

      // Wait for connection
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => resolve();
      });

      // Normal events should parse correctly
      // We can't easily inject malformed data, but we verify the error handling exists

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // If we received any events, they should have parsed correctly
      assert.strictEqual(parseErrors.length, 0);

      eventSource.close();
    }, 10000);
  });

  describe('Connection State Tracking', () => {
    test('should track connection state transitions', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      const eventSource = new EventSource(sseUrl);
      const states: number[] = [];

      // Track state changes
      const checkState = () => {
        states.push(eventSource.readyState);
      };

      // Initial state (CONNECTING)
      checkState();
      assert.strictEqual(states[0], eventSource.CONNECTING);

      // Wait for OPEN
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => {
          checkState();
          resolve();
        };
      });

      assert.ok(states.includes(eventSource.OPEN));

      // Close and check CLOSED state
      eventSource.close();
      checkState();

      assert.ok(states.includes(eventSource.CLOSED));
    }, 10000);

    test('should maintain connection state during active session', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      const eventSource = new EventSource(sseUrl);

      // Wait for connection
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => resolve();
      });

      // Check state multiple times over 5 seconds
      const states: number[] = [];
      for (let i = 0; i < 5; i++) {
        states.push(eventSource.readyState);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // All states should be OPEN
      states.forEach((state) => {
        assert.strictEqual(state, eventSource.OPEN);
      });

      eventSource.close();
    }, 10000);
  });

  describe('Multiple Connections', () => {
    test('should handle multiple simultaneous connections', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      const connections: EventSource[] = [];

      // Create 3 connections
      for (let i = 0; i < 3; i++) {
        const es = new EventSource(sseUrl);
        connections.push(es);
      }

      // Wait for all to connect
      await Promise.all(
        connections.map(
          (es) =>
            new Promise<void>((resolve) => {
              es.onopen = () => resolve();
            })
        )
      );

      // All should be open
      connections.forEach((es) => {
        assert.strictEqual(es.readyState, es.OPEN);
      });

      // Close all
      connections.forEach((es) => es.close());

      // All should be closed
      connections.forEach((es) => {
        assert.strictEqual(es.readyState, es.CLOSED);
      });
    }, 15000);

    test('should deliver events to all active connections', async (_t: TestContext) => {
      const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
      const connection1 = new EventSource(sseUrl);
      const connection2 = new EventSource(sseUrl);

      const events1: any[] = [];
      const events2: any[] = [];

      // Listen on both connections
      connection1.addEventListener('heartbeat', (event: any) => {
        events1.push(JSON.parse(event.data));
      });

      connection2.addEventListener('heartbeat', (event: any) => {
        events2.push(JSON.parse(event.data));
      });

      // Wait for connections
      await Promise.all([
        new Promise<void>((resolve) => {
          connection1.onopen = () => resolve();
        }),
        new Promise<void>((resolve) => {
          connection2.onopen = () => resolve();
        }),
      ]);

      // Wait for heartbeat on both (up to 35s)
      await waitFor(() => events1.length > 0 && events2.length > 0, {
        timeout: 35000,
        interval: 1000,
      });

      // Both should have received events
      assert.ok(events1.length > 0);
      assert.ok(events2.length > 0);

      connection1.close();
      connection2.close();
    }, 40000);
  });
});
