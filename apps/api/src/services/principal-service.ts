/**
 * Principal Service
 *
 * Manages Principal nodes for World Model V5.
 * Provides idempotent resolve-or-create operations for human and agent principals.
 *
 * Key design principles:
 * - Deterministic IDs: Same input = same Principal ID (for idempotency)
 * - Resolve existing: Check if Principal exists before creating
 * - Platform-based agents: ChatGPT, Claude, Gemini as distinct agent Principals
 *
 * @see packages/types/src/nodes.ts - PrincipalNodeSchema
 * @see agent_context/architecture/overview.md - World Model V5
 */

import { nanoid } from 'nanoid';
import { DatabaseClient, SQLiteClient } from '@keimenon/db';
import { generateFingerprint } from './fingerprint';
import type { PrincipalNode, PrincipalCapabilities } from '@keimenon/types';

/**
 * Platform identifiers for AI agents
 */
export type AgentPlatform = 'chatgpt' | 'claude' | 'gemini' | 'unknown';

/**
 * Default capabilities by principal kind
 * Authorization uses THESE, not principal_kind (F1: Principal Equivalence)
 */
const DEFAULT_CAPABILITIES: Record<'human' | 'agent' | 'contact', PrincipalCapabilities> = {
  human: {
    can_upload: true,
    can_run_tools: false,
    can_import_web: false,
    can_own_account: true,
    can_approve_runs: true,
  },
  agent: {
    can_upload: true,
    can_run_tools: true,
    can_import_web: true,
    can_own_account: false,
    can_approve_runs: false,
  },
  contact: {
    can_upload: false,
    can_run_tools: false,
    can_import_web: false,
    can_own_account: false,
    can_approve_runs: false,
  },
};

/**
 * Display names for known agent platforms
 */
const PLATFORM_DISPLAY_NAMES: Record<AgentPlatform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  unknown: 'AI Assistant',
};

/**
 * Principal Service - Manages Principal nodes
 */
export class PrincipalService {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Generate a deterministic ID for a Principal
   * Same inputs will always produce the same ID (idempotency)
   *
   * @param accountId - Account scope
   * @param identifier - Unique identifier within account (userId for humans, 'agent:{platform}' for agents)
   */
  private generatePrincipalId(accountId: string, identifier: string): string {
    const hash = generateFingerprint(`principal:${accountId}:${identifier}`);
    return `principal_${hash.slice(0, 16)}`;
  }

  /**
   * Get a Principal by ID
   */
  async getPrincipal(id: string, accountId: string): Promise<PrincipalNode | null> {
    const node = await this.db.getNode(id);
    if (!node || node.kind !== 'Principal') {
      return null;
    }
    // Verify account isolation
    if ((node as any).account_id !== accountId) {
      return null;
    }
    return node as unknown as PrincipalNode;
  }

  /**
   * Find Principal by deterministic ID
   */
  async findPrincipalByIdentifier(
    accountId: string,
    identifier: string
  ): Promise<PrincipalNode | null> {
    const id = this.generatePrincipalId(accountId, identifier);
    return this.getPrincipal(id, accountId);
  }

  /**
   * Resolve or create a human Principal for a user
   *
   * @param accountId - Account scope
   * @param userId - User ID (from auth)
   * @param displayName - User's display name
   * @param email - User's email (optional)
   * @returns Existing or newly created Principal node
   */
  async resolveHumanPrincipal(
    accountId: string,
    userId: string,
    displayName?: string,
    email?: string
  ): Promise<PrincipalNode> {
    const identifier = userId;
    const id = this.generatePrincipalId(accountId, identifier);

    // Check for existing Principal
    const existing = await this.getPrincipal(id, accountId);
    if (existing) {
      return existing;
    }

    // Create new Principal
    const now = Date.now();
    const principal: PrincipalNode = {
      id,
      kind: 'Principal',
      display_name: displayName || `User ${userId.slice(0, 8)}`,
      email,
      principal_kind: 'human',
      capabilities: DEFAULT_CAPABILITIES.human,
      created_at: now,
      updated_at: now,
    };

    // Write to database with account context
    await this.db.createNode({
      ...principal,
      account_id: accountId,
      created_by: userId,
    } as any);

    return principal;
  }

  /**
   * Resolve or create an agent Principal for a platform
   *
   * @param accountId - Account scope
   * @param platform - Agent platform (chatgpt, claude, gemini, unknown)
   * @param createdBy - User ID who triggered the creation
   * @returns Existing or newly created Principal node
   */
  async resolveAgentPrincipal(
    accountId: string,
    platform: AgentPlatform,
    createdBy: string
  ): Promise<PrincipalNode> {
    const identifier = `agent:${platform}`;
    const id = this.generatePrincipalId(accountId, identifier);

    // Check for existing Principal
    const existing = await this.getPrincipal(id, accountId);
    if (existing) {
      return existing;
    }

    // Create new Principal
    const now = Date.now();
    const principal: PrincipalNode = {
      id,
      kind: 'Principal',
      display_name: PLATFORM_DISPLAY_NAMES[platform],
      principal_kind: 'agent',
      capabilities: DEFAULT_CAPABILITIES.agent,
      contact_info: {
        source_platform: platform,
      },
      created_at: now,
      updated_at: now,
    };

    // Write to database with account context
    await this.db.createNode({
      ...principal,
      account_id: accountId,
      created_by: createdBy,
    } as any);

    return principal;
  }

  /**
   * Detect agent platform from conversation metadata
   *
   * @param platform - Platform string from parser (e.g., 'chatgpt', 'claude', 'gemini')
   * @param filename - Optional filename for fallback detection
   * @returns Normalized platform identifier
   */
  static detectPlatform(platform?: string, filename?: string): AgentPlatform {
    // Priority 1: Explicit platform from parser
    if (platform) {
      const normalized = platform.toLowerCase().trim();
      if (normalized === 'chatgpt' || normalized === 'openai' || normalized === 'gpt') {
        return 'chatgpt';
      }
      if (normalized === 'claude' || normalized === 'anthropic') {
        return 'claude';
      }
      if (normalized === 'gemini' || normalized === 'google' || normalized === 'bard') {
        return 'gemini';
      }
    }

    // Priority 2: Filename pattern detection
    if (filename) {
      const lowerFilename = filename.toLowerCase();
      if (lowerFilename.includes('chatgpt') || lowerFilename.includes('openai')) {
        return 'chatgpt';
      }
      if (lowerFilename.includes('claude') || lowerFilename.includes('anthropic')) {
        return 'claude';
      }
      if (
        lowerFilename.includes('gemini') ||
        lowerFilename.includes('google') ||
        lowerFilename.includes('bard')
      ) {
        return 'gemini';
      }
    }

    // Fallback: Unknown platform
    return 'unknown';
  }

  /**
   * Get all Principals for an account
   */
  async getPrincipals(accountId: string): Promise<PrincipalNode[]> {
    if (!this.db.getNodesByKind) {
      console.warn('[PrincipalService] getNodesByKind not available on database client');
      return [];
    }
    const nodes = await this.db.getNodesByKind('Principal', { accountId });
    return nodes as unknown as PrincipalNode[];
  }

  /**
   * Get human Principals for an account
   */
  async getHumanPrincipals(accountId: string): Promise<PrincipalNode[]> {
    const principals = await this.getPrincipals(accountId);
    return principals.filter((p) => p.principal_kind === 'human');
  }

  /**
   * Get agent Principals for an account
   */
  async getAgentPrincipals(accountId: string): Promise<PrincipalNode[]> {
    const principals = await this.getPrincipals(accountId);
    return principals.filter((p) => p.principal_kind === 'agent');
  }
}

/**
 * Singleton instance for service reuse
 */
let instance: PrincipalService | null = null;

export function getPrincipalService(db: DatabaseClient): PrincipalService {
  if (!instance) {
    instance = new PrincipalService(db);
  }
  return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetPrincipalService(): void {
  instance = null;
}
