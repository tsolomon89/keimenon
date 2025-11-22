/**
 * Upload Progress Broadcaster (SSE)
 *
 * Server-Sent Events broadcaster for real-time upload progress updates.
 * Allows clients to receive live progress as chunks are uploaded.
 *
 * Features:
 * - Per-session progress streaming
 * - Automatic client cleanup on disconnect
 * - Multi-tenant isolation (account_id filtering)
 * - Heartbeat to keep connections alive
 * - Graceful shutdown
 *
 * Related: Chunked Upload System - Phase 5 (SSE Integration)
 */

import { Response } from 'express';

export interface UploadProgressEvent {
  type: 'progress' | 'completed' | 'failed' | 'expired';
  sessionId: string;
  chunkIndex?: number;
  chunksReceived: number;
  totalChunks: number;
  progress: number; // 0-100 percentage
  status: string;
  errorMessage?: string;
  timestamp: number;
}

interface SSEClient {
  response: Response;
  sessionId: string;
  accountId: string;
  connectedAt: number;
  lastHeartbeat: number;
}

/**
 * Upload Progress Broadcaster
 *
 * Manages SSE connections for upload progress streaming.
 * One broadcaster instance per application (singleton).
 */
export class UploadProgressBroadcaster {
  private clients: Map<string, SSEClient[]> = new Map(); // sessionId -> clients
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

  /**
   * Register a new SSE client for upload progress
   */
  registerClient(sessionId: string, accountId: string, res: Response): void {
    console.log(`[UploadSSE] Client connected: session=${sessionId}, account=${accountId}`);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection event
    this.sendEvent(res, {
      type: 'progress',
      sessionId,
      chunksReceived: 0,
      totalChunks: 0,
      progress: 0,
      status: 'connected',
      timestamp: Date.now(),
    });

    // Create client record
    const client: SSEClient = {
      response: res,
      sessionId,
      accountId,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    // Add to clients map
    if (!this.clients.has(sessionId)) {
      this.clients.set(sessionId, []);
    }
    this.clients.get(sessionId)!.push(client);

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(sessionId, client);
    });

    // Start heartbeat if not already running
    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }
  }

  /**
   * Broadcast progress update to all clients watching a session
   */
  broadcastProgress(event: UploadProgressEvent): void {
    const clients = this.clients.get(event.sessionId);

    if (!clients || clients.length === 0) {
      return; // No clients listening
    }

    console.log(
      `[UploadSSE] Broadcasting: session=${event.sessionId}, progress=${event.progress}%, clients=${clients.length}`
    );

    // Send to all clients for this session
    for (const client of clients) {
      try {
        this.sendEvent(client.response, event);
      } catch (error) {
        console.error(`[UploadSSE] Failed to send to client:`, error);
        this.removeClient(event.sessionId, client);
      }
    }

    // Clean up clients if upload completed or failed
    if (event.type === 'completed' || event.type === 'failed' || event.type === 'expired') {
      // Give clients a moment to receive final event, then close connections
      setTimeout(() => {
        this.closeSessionClients(event.sessionId);
      }, 1000);
    }
  }

  /**
   * Send SSE event to a client
   */
  private sendEvent(res: Response, event: UploadProgressEvent): void {
    const data = JSON.stringify(event);

    // SSE format: "data: {json}\n\n"
    res.write(`data: ${data}\n\n`);
  }

  /**
   * Send heartbeat to all clients to keep connections alive
   */
  private sendHeartbeat(): void {
    const now = Date.now();

    for (const [sessionId, clients] of this.clients.entries()) {
      for (const client of clients) {
        try {
          // Send comment as heartbeat (SSE spec allows comments)
          client.response.write(`: heartbeat\n\n`);
          client.lastHeartbeat = now;
        } catch (error) {
          console.error(`[UploadSSE] Heartbeat failed for session ${sessionId}:`, error);
          this.removeClient(sessionId, client);
        }
      }
    }
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      return; // Already running
    }

    console.log(`[UploadSSE] Starting heartbeat (interval: ${this.HEARTBEAT_INTERVAL_MS}ms)`);

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[UploadSSE] Heartbeat stopped');
    }
  }

  /**
   * Remove a client from the broadcaster
   */
  private removeClient(sessionId: string, client: SSEClient): void {
    const clients = this.clients.get(sessionId);

    if (!clients) {
      return;
    }

    const index = clients.indexOf(client);
    if (index !== -1) {
      clients.splice(index, 1);
      console.log(`[UploadSSE] Client disconnected: session=${sessionId}, remaining=${clients.length}`);
    }

    // Remove session entry if no more clients
    if (clients.length === 0) {
      this.clients.delete(sessionId);
      console.log(`[UploadSSE] Session ${sessionId} has no more clients`);
    }

    // Stop heartbeat if no more clients
    if (this.clients.size === 0) {
      this.stopHeartbeat();
    }
  }

  /**
   * Close all clients for a session
   */
  private closeSessionClients(sessionId: string): void {
    const clients = this.clients.get(sessionId);

    if (!clients) {
      return;
    }

    console.log(`[UploadSSE] Closing ${clients.length} clients for session ${sessionId}`);

    for (const client of clients) {
      try {
        client.response.end();
      } catch (error) {
        // Ignore errors on close
      }
    }

    this.clients.delete(sessionId);

    // Stop heartbeat if no more clients
    if (this.clients.size === 0) {
      this.stopHeartbeat();
    }
  }

  /**
   * Get statistics (for monitoring)
   */
  getStats(): {
    totalClients: number;
    activeSessions: number;
    isHeartbeatActive: boolean;
  } {
    let totalClients = 0;
    for (const clients of this.clients.values()) {
      totalClients += clients.length;
    }

    return {
      totalClients,
      activeSessions: this.clients.size,
      isHeartbeatActive: this.heartbeatInterval !== null,
    };
  }

  /**
   * Shutdown broadcaster (close all connections)
   */
  shutdown(): void {
    console.log('[UploadSSE] Shutting down broadcaster...');

    this.stopHeartbeat();

    // Close all client connections
    for (const [sessionId, clients] of this.clients.entries()) {
      for (const client of clients) {
        try {
          // Send shutdown event
          this.sendEvent(client.response, {
            type: 'failed',
            sessionId,
            chunksReceived: 0,
            totalChunks: 0,
            progress: 0,
            status: 'server_shutdown',
            errorMessage: 'Server is shutting down',
            timestamp: Date.now(),
          });

          client.response.end();
        } catch (error) {
          // Ignore errors on shutdown
        }
      }
    }

    this.clients.clear();

    console.log('[UploadSSE] Broadcaster shutdown complete');
  }
}

/**
 * Singleton instance (initialized in server.ts)
 */
let broadcasterInstance: UploadProgressBroadcaster | null = null;

export function initializeProgressBroadcaster(): UploadProgressBroadcaster {
  if (broadcasterInstance) {
    console.warn('[UploadSSE] Broadcaster already initialized');
    return broadcasterInstance;
  }

  broadcasterInstance = new UploadProgressBroadcaster();
  console.log('[UploadSSE] Broadcaster initialized');

  return broadcasterInstance;
}

export function getProgressBroadcaster(): UploadProgressBroadcaster | null {
  return broadcasterInstance;
}

export function shutdownProgressBroadcaster(): void {
  if (broadcasterInstance) {
    broadcasterInstance.shutdown();
    broadcasterInstance = null;
  }
}
