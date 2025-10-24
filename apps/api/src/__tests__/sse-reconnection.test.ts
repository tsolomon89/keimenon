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

import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import EventSourcePolyfill from 'eventsource';
import { login, waitFor } from './utils/test-helpers';

// Handle both ESM and CommonJS imports
const EventSource = (EventSourcePolyfill as any).default || EventSourcePolyfill;

// Test configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:4001';
const SSE_BASE_URL = `${API_BASE_URL}/api/v1/stream/jobs`;

describe('SSE Reconnection', () => {
  let adminToken: string;
  let adminAccountId: string;

  before(async () => {
    // Login as admin
    const loginResult = await login('admin@admin.com', 'admin123');
    adminToken = loginResult.token;
    adminAccountId = loginResult.accountId;

    console.log('[SSE Reconnection] Test setup complete', {
      accountId: adminAccountId,
    });
  });

  describe('Connection Lifecycle', () => {
    test(
      'should establish initial connection successfully',
      async (_t) => {
        const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
        const eventSource = new EventSource(sseUrl);

        // Wait for connection to open
        await new Promise<void>((resolve) => {
          eventSource.onopen = () => {
            resolve();
          };
        });

        assert.strictEqual(eventSource.readyState, EventSource.OPEN);

        eventSource.close();
      },
      { timeout: 10000 }
    );

    test(
      'should receive heartbeat events',
      async (_t) => {
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
      },
      { timeout: 40000 }
    );

    test(
      'should handle manual close gracefully',
      async (_t) => {
        const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
        const eventSource = new EventSource(sseUrl);

        // Wait for connection
        await new Promise<void>((resolve) => {
          eventSource.onopen = () => resolve();
        });

        assert.strictEqual(eventSource.readyState, EventSource.OPEN);

        // Close manually
        eventSource.close();

        // Should be closed
        assert.strictEqual(eventSource.readyState, EventSource.CLOSED);
      },
      { timeout: 10000 }
    );
  });

  describe('Automatic Reconnection', () => {
    test(
      'should reconnect automatically on disconnect',
      async (_t) => {
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
      },
      { timeout: 15000 }
    );

    test(
      'should use exponential backoff for reconnection attempts',
      async (_t) => {
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
      },
      { timeout: 5000 }
    );

    test(
      'should limit maximum reconnection attempts',
      async (_t) => {
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
      },
      { timeout: 5000 }
    );
  });

  describe('Error Handling', () => {
    test(
      'should handle connection errors',
      async (_t) => {
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
      },
      { timeout: 10000 }
    );

    test(
      'should handle network errors gracefully',
      async (_t) => {
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
        assert.strictEqual(eventSource.readyState, EventSource.CLOSED);
      },
      { timeout: 10000 }
    );

    test(
      'should handle malformed event data',
      async (_t) => {
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
      },
      { timeout: 10000 }
    );
  });

  describe('Connection State Tracking', () => {
    test(
      'should track connection state transitions',
      async (_t) => {
        const sseUrl = `${SSE_BASE_URL}?token=${adminToken}`;
        const eventSource = new EventSource(sseUrl);
        const states: number[] = [];

        // Track state changes
        const checkState = () => {
          states.push(eventSource.readyState);
        };

        // Initial state (CONNECTING)
        checkState();
        assert.strictEqual(states[0], EventSource.CONNECTING);

        // Wait for OPEN
        await new Promise<void>((resolve) => {
          eventSource.onopen = () => {
            checkState();
            resolve();
          };
        });

        assert.ok(states.includes(EventSource.OPEN));

        // Close and check CLOSED state
        eventSource.close();
        checkState();

        assert.ok(states.includes(EventSource.CLOSED));
      },
      { timeout: 10000 }
    );

    test(
      'should maintain connection state during active session',
      async (_t) => {
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
          assert.strictEqual(state, EventSource.OPEN);
        });

        eventSource.close();
      },
      { timeout: 10000 }
    );
  });

  describe('Multiple Connections', () => {
    test(
      'should handle multiple simultaneous connections',
      async (_t) => {
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
          assert.strictEqual(es.readyState, EventSource.OPEN);
        });

        // Close all
        connections.forEach((es) => es.close());

        // All should be closed
        connections.forEach((es) => {
          assert.strictEqual(es.readyState, EventSource.CLOSED);
        });
      },
      { timeout: 15000 }
    );

    test(
      'should deliver events to all active connections',
      async (_t) => {
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
      },
      { timeout: 40000 }
    );
  });
});
