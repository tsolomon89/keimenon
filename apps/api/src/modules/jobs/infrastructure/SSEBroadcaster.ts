/**
 * SSE Broadcaster
 *
 * Manages Server-Sent Events (SSE) connections and broadcasts job events
 * to connected clients in real-time.
 *
 * Features:
 * - Account-scoped connections (multi-tenant isolation)
 * - Event coalescing (~2Hz rate limiting)
 * - Automatic cleanup of stale connections
 * - Heartbeat to keep connections alive
 *
 * Related: Product Directive - "Single realtime channel, ~2Hz updates"
 */

import { Response } from 'express';
import { Job } from '../domain/Job';
import { JobEvent } from '../domain/JobEvent';
import { JobRepository } from './JobRepository';

export interface SSEConnection {
  accountId: string;
  response: Response;
  connectedAt: Date;
  lastHeartbeat: Date;
}

export interface SSEJobUpdate {
  jobId: string;
  type: string;
  status: string;
  progress: {
    current: number;
    total: number;
    percent: number;
    message?: string;
  };
  config?: {
    fileName?: string; // Extracted from config.files[0].fileName
    deleteScope?: string; // Extracted from config.deleteScope
  };
  timestamp: number;
}

export interface SSEGraphUpdate {
  nodesAdded: number;
  edgesAdded: number;
  queueStats: {
    nodesQueued: number;
    edgesQueued: number;
    nodesFlushed: number;
    edgesFlushed: number;
  };
  timestamp: number;
  recentNodes?: Array<{
    id: string;
    kind: string;
    label?: string;
  }>;
}

/**
 * SSE Broadcaster
 */
export class SSEBroadcaster {
  private connections: Map<string, SSEConnection[]> = new Map();
  private pendingEvents: Map<string, Map<string, SSEJobUpdate>> = new Map(); // accountId -> jobId -> update
  private pendingGraphUpdates: Map<string, SSEGraphUpdate> = new Map(); // accountId -> graph update
  private broadcastTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private jobRepository: JobRepository | null = null;

  constructor(
    private broadcastIntervalMs: number = 500, // 2Hz = 500ms
    private heartbeatIntervalMs: number = 15000 // 15s heartbeat (reduced from 30s for faster disconnect detection)
  ) {}

  /**
   * Set the job repository (called during initialization)
   */
  setJobRepository(repository: JobRepository): void {
    this.jobRepository = repository;
  }

  /**
   * Start the broadcaster
   */
  start(): void {
    console.log('📡 Starting SSE broadcaster...');

    // Start broadcast timer (coalesced events)
    this.broadcastTimer = setInterval(() => {
      this.flushPendingEvents();
    }, this.broadcastIntervalMs);

    // Start heartbeat timer (keep connections alive)
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.heartbeatIntervalMs);

    console.log(`✅ SSE broadcaster started (rate: ${1000 / this.broadcastIntervalMs}Hz)`);
  }

  /**
   * Stop the broadcaster
   */
  stop(): void {
    console.log('🛑 Stopping SSE broadcaster...');

    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all connections
    for (const [accountId, connections] of this.connections.entries()) {
      for (const conn of connections) {
        try {
          conn.response.end();
        } catch (error) {
          // Ignore errors when closing
        }
      }
    }

    this.connections.clear();
    this.pendingEvents.clear();
    this.pendingGraphUpdates.clear();

    console.log('✅ SSE broadcaster stopped');
  }

  /**
   * Add a new SSE connection
   */
  async addConnection(accountId: string, response: Response): Promise<void> {
    // Get or create connections array for this account
    if (!this.connections.has(accountId)) {
      this.connections.set(accountId, []);
    }

    const connection: SSEConnection = {
      accountId,
      response,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    this.connections.get(accountId)!.push(connection);

    console.log(
      `📡 SSE connection added for account ${accountId} (total: ${this.connections.get(accountId)!.length})`
    );

    // Setup connection close handler
    response.on('close', () => {
      this.removeConnection(accountId, response);
    });

    // Send initial connection message
    this.sendMessage(response, {
      type: 'connected',
      data: {
        accountId,
        timestamp: Date.now(),
        message: 'SSE connection established',
      },
    });

    // Send current active jobs for this account (initial state sync)
    if (this.jobRepository) {
      try {
        const activeJobs = await this.jobRepository.find({
          accountId,
          status: ['queued', 'running'],
          limit: 100,
        });

        if (activeJobs.length > 0) {
          const jobUpdates: SSEJobUpdate[] = activeJobs.map((job) => {
            // Extract minimal config metadata for UI display
            const configMetadata: { fileName?: string; deleteScope?: string } = {};
            if (job.config.files && job.config.files.length > 0) {
              configMetadata.fileName = job.config.files[0].fileName;
            }
            if (job.config.deleteScope) {
              configMetadata.deleteScope = job.config.deleteScope;
            }

            return {
              jobId: job.id,
              type: job.type,
              status: job.status,
              progress: job.stateData.progress || {
                current: 0,
                total: 0,
                percent: 0,
              },
              config: configMetadata,
              timestamp: job.updatedAt,
            };
          });

          this.sendMessage(response, {
            type: 'jobs.update',
            data: {
              jobs: jobUpdates,
              timestamp: Date.now(),
            },
          });

          console.log(
            `📡 Sent initial state: ${activeJobs.length} active jobs for account ${accountId}`
          );
        }
      } catch (error) {
        console.error(`❌ Error sending initial job state for account ${accountId}:`, error);
      }
    }
  }

  /**
   * Remove a connection
   */
  private removeConnection(accountId: string, response: Response): void {
    const connections = this.connections.get(accountId);
    if (!connections) {
      return;
    }

    const index = connections.findIndex((c) => c.response === response);
    if (index >= 0) {
      connections.splice(index, 1);
      console.log(
        `📡 SSE connection removed for account ${accountId} (remaining: ${connections.length})`
      );

      if (connections.length === 0) {
        this.connections.delete(accountId);
      }
    }
  }

  /**
   * Broadcast job update (will be coalesced)
   */
  broadcastJobUpdate(job: Job): void {
    const accountId = job.accountId;

    // Get or create pending events for this account
    if (!this.pendingEvents.has(accountId)) {
      this.pendingEvents.set(accountId, new Map());
    }

    const accountEvents = this.pendingEvents.get(accountId)!;

    // Extract minimal config metadata for UI display
    const configMetadata: { fileName?: string; deleteScope?: string } = {};
    if (job.config.files && job.config.files.length > 0) {
      configMetadata.fileName = job.config.files[0].fileName;
    }
    if (job.config.deleteScope) {
      configMetadata.deleteScope = job.config.deleteScope;
    }

    // Store/update event (latest wins)
    accountEvents.set(job.id, {
      jobId: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      config: configMetadata,
      timestamp: Date.now(),
    });

    // Log broadcast (detailed for debugging)
    console.log(
      `[SSEBroadcaster] Queued update for job ${job.id} (${job.type}, ${job.status}, ${job.progress.percent}%)`
    );
  }

  /**
   * Broadcast graph update (write queue metrics)
   */
  broadcastGraphUpdate(accountId: string, update: SSEGraphUpdate): void {
    // Store/accumulate graph update for this account
    const existing = this.pendingGraphUpdates.get(accountId);
    if (existing) {
      // Accumulate metrics
      existing.nodesAdded += update.nodesAdded;
      existing.edgesAdded += update.edgesAdded;
      existing.queueStats = update.queueStats; // Use latest stats
      existing.timestamp = update.timestamp;
      if (update.recentNodes && update.recentNodes.length > 0) {
        const combined = [...update.recentNodes, ...(existing.recentNodes ?? [])];
        existing.recentNodes = combined.slice(0, 20);
      }
    } else {
      this.pendingGraphUpdates.set(accountId, update);
    }
  }

  /**
   * Flush pending events to clients (coalesced)
   */
  private flushPendingEvents(): void {
    // Flush job updates
    for (const [accountId, jobUpdates] of this.pendingEvents.entries()) {
      if (jobUpdates.size === 0) {
        continue;
      }

      const connections = this.connections.get(accountId);
      if (!connections || connections.length === 0) {
        // No connections for this account, clear pending events
        jobUpdates.clear();
        continue;
      }

      // Prepare batch update
      const updates = Array.from(jobUpdates.values());

      // Send to all connections for this account
      for (const conn of connections) {
        try {
          this.sendMessage(conn.response, {
            type: 'jobs.update',
            data: {
              jobs: updates,
              timestamp: Date.now(),
            },
          });
        } catch (error) {
          console.error(`Error sending SSE message to account ${accountId}:`, error);
          // Connection will be removed by close handler
        }
      }

      // Clear pending events for this account
      jobUpdates.clear();
    }

    // Flush graph updates
    for (const [accountId, graphUpdate] of this.pendingGraphUpdates.entries()) {
      const connections = this.connections.get(accountId);
      if (!connections || connections.length === 0) {
        // No connections for this account, clear pending events
        this.pendingGraphUpdates.delete(accountId);
        continue;
      }

      // Send to all connections for this account
      for (const conn of connections) {
        try {
          this.sendMessage(conn.response, {
            type: 'graph.update',
            data: graphUpdate,
          });
        } catch (error) {
          console.error(`Error sending graph update to account ${accountId}:`, error);
          // Connection will be removed by close handler
        }
      }

      // Clear pending graph update for this account
      this.pendingGraphUpdates.delete(accountId);
    }
  }

  /**
   * Send heartbeat to all connections
   */
  private sendHeartbeats(): void {
    for (const [accountId, connections] of this.connections.entries()) {
      for (const conn of connections) {
        try {
          this.sendMessage(conn.response, {
            type: 'heartbeat',
            data: {
              timestamp: Date.now(),
            },
          });
          conn.lastHeartbeat = new Date();
        } catch (error) {
          console.error(`Error sending heartbeat to account ${accountId}:`, error);
          // Connection will be removed by close handler
        }
      }
    }
  }

  /**
   * Send SSE message
   */
  private sendMessage(response: Response, message: { type: string; data: any }): void {
    const eventData = `event: ${message.type}\ndata: ${JSON.stringify(message.data)}\n\n`;
    response.write(eventData);
  }

  /**
   * Get broadcaster status
   */
  getStatus() {
    const totalConnections = Array.from(this.connections.values()).reduce(
      (sum, conns) => sum + conns.length,
      0
    );

    const totalPendingEvents = Array.from(this.pendingEvents.values()).reduce(
      (sum, events) => sum + events.size,
      0
    );

    return {
      isRunning: this.broadcastTimer !== null,
      totalConnections,
      connectionsByAccount: Array.from(this.connections.entries()).map(([accountId, conns]) => ({
        accountId,
        connections: conns.length,
      })),
      pendingEvents: totalPendingEvents,
      broadcastRateHz: 1000 / this.broadcastIntervalMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    };
  }
}
