/**
 * EventBus Interface
 *
 * Pub/sub event system for task progress updates.
 * Used to communicate between agent services and UI.
 */

import type { AgentEvent, AgentEventHandler } from '../types/events.js';

/**
 * Subscription handle returned when subscribing
 */
export interface Subscription {
  /** Unique subscription ID */
  id: string;
  /** Unsubscribe function */
  unsubscribe: () => void;
}

/**
 * Event filter for selective subscriptions
 */
export interface EventFilter {
  /** Filter by event types */
  types?: AgentEvent['type'][];
  /** Filter by task ID */
  taskId?: string;
  /** Filter by agent ID */
  agentId?: string;
}

/**
 * EventBus interface for agent event communication
 *
 * Enables real-time progress updates to UI and logging.
 * Supports filtered subscriptions for efficient event delivery.
 */
export interface EventBus {
  /**
   * Emit an event to all subscribers
   *
   * @param event - Event to emit
   */
  emit(event: AgentEvent): void;

  /**
   * Subscribe to events with optional filter
   *
   * @param handler - Event handler function
   * @param filter - Optional filter to receive only matching events
   * @returns Subscription with unsubscribe function
   */
  subscribe(handler: AgentEventHandler, filter?: EventFilter): Subscription;

  /**
   * Subscribe to events for a specific task
   *
   * @param taskId - Task ID to filter
   * @param handler - Event handler function
   * @returns Subscription with unsubscribe function
   */
  subscribeToTask(taskId: string, handler: AgentEventHandler): Subscription;

  /**
   * Unsubscribe by subscription ID
   *
   * @param subscriptionId - ID from subscription
   */
  unsubscribe(subscriptionId: string): void;

  /**
   * Unsubscribe all handlers
   */
  unsubscribeAll(): void;

  /**
   * Get count of active subscriptions
   */
  getSubscriptionCount(): number;

  /**
   * Wait for a specific event type on a task
   *
   * @param taskId - Task to wait for
   * @param eventType - Event type to wait for
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise that resolves with the event or rejects on timeout
   */
  waitFor<T extends AgentEvent['type']>(
    taskId: string,
    eventType: T,
    timeoutMs?: number
  ): Promise<Extract<AgentEvent, { type: T }>>;
}

/**
 * Simple in-memory EventBus implementation
 */
export class InMemoryEventBus implements EventBus {
  private subscriptions = new Map<
    string,
    { handler: AgentEventHandler; filter?: EventFilter }
  >();
  private nextId = 1;

  emit(event: AgentEvent): void {
    for (const [, { handler, filter }] of this.subscriptions) {
      if (this.matchesFilter(event, filter)) {
        try {
          handler(event);
        } catch (error) {
          console.error('[EventBus] Handler error:', error);
        }
      }
    }
  }

  subscribe(handler: AgentEventHandler, filter?: EventFilter): Subscription {
    const id = `sub_${this.nextId++}`;
    this.subscriptions.set(id, { handler, filter });
    return {
      id,
      unsubscribe: () => this.unsubscribe(id),
    };
  }

  subscribeToTask(taskId: string, handler: AgentEventHandler): Subscription {
    return this.subscribe(handler, { taskId });
  }

  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  unsubscribeAll(): void {
    this.subscriptions.clear();
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  waitFor<T extends AgentEvent['type']>(
    taskId: string,
    eventType: T,
    timeoutMs = 30000
  ): Promise<Extract<AgentEvent, { type: T }>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error(`Timeout waiting for ${eventType} on task ${taskId}`));
      }, timeoutMs);

      const subscription = this.subscribe(
        (event) => {
          if (event.type === eventType) {
            clearTimeout(timeout);
            subscription.unsubscribe();
            resolve(event as Extract<AgentEvent, { type: T }>);
          }
        },
        { taskId, types: [eventType] }
      );
    });
  }

  private matchesFilter(event: AgentEvent, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }

    if (filter.taskId && 'taskId' in event && event.taskId !== filter.taskId) {
      return false;
    }

    if (
      filter.agentId &&
      'agent_id' in event &&
      event.agent_id !== filter.agentId
    ) {
      return false;
    }

    return true;
  }
}
