/**
 * Verification Routes (Vision V2)
 *
 * API endpoints for online verification operations:
 * - Verify topics against external sources
 * - Create VerifiedSource and VerifiedClaim nodes
 * - Link claims back to UGC spine
 *
 * Related:
 * - apps/api/src/services/verification-service.ts
 * - packages/types/src/nodes.ts (VerifiedSourceNode, VerifiedClaimNode)
 */

import { Router, Request, Response } from 'express';
import { VerificationService } from '../services/verification-service';
import { AuthService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { TopicNode } from '@keimenon/types';

export function createVerificationRoutes(authService: AuthService) {
  const router = Router();
  const verificationService = VerificationService.getInstance();

  // Middleware
  router.use(requireAuth(authService));

  /**
   * GET /api/v1/verification/health
   * Health check for verification service
   */
  router.get('/health', (_req: Request, res: Response) => {
    const searchConfigured = verificationService.isSearchConfigured();
    return res.json({
      status: 'ok',
      service: 'verification',
      version: '1.0.0',
      capabilities: {
        search: searchConfigured ? 'tavily' : 'mock',
        llmExtraction: process.env.OPENAI_API_KEY ? 'openai' : 'none',
      },
    });
  });

  /**
   * POST /api/v1/verification/verify-topic
   * Verify a topic by searching external sources and extracting claims
   *
   * Body:
   * - topic: TopicNode - The topic to verify
   *
   * Returns:
   * - sources: VerifiedSourceNode[]
   * - claims: VerifiedClaimNode[]
   */
  router.post('/verify-topic', async (req: Request, res: Response) => {
    try {
      const { topic } = req.body;
      const user = (req as any).user;
      const accountId = user?.accountId || user?.operating_account_id;

      if (!topic || !topic.id || !topic.name) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'topic with id and name is required',
        });
      }

      // Ensure topic has required fields for TopicNode
      const topicNode: TopicNode = {
        id: topic.id,
        kind: 'Topic',
        name: topic.name,
        description: topic.description,
        keywords: topic.keywords || [],
        strength: topic.strength || 1.0,
        created_at: topic.created_at || Date.now(),
        updated_at: topic.updated_at || Date.now(),
        metadata: topic.metadata || {},
      };

      // Perform verification
      const { sources, claims } = await verificationService.verifyTopic(topicNode);

      // Add account context
      const enrichedSources = sources.map((s) => ({
        ...s,
        metadata: { ...s.metadata, account_id: accountId, topic_id: topic.id },
      }));
      const enrichedClaims = claims.map((c) => ({
        ...c,
        metadata: { ...c.metadata, account_id: accountId, topic_id: topic.id },
      }));

      return res.json({
        success: true,
        topicId: topic.id,
        topicName: topic.name,
        sources: enrichedSources,
        claims: enrichedClaims,
        stats: {
          sourceCount: enrichedSources.length,
          claimCount: enrichedClaims.length,
        },
      });
    } catch (error: any) {
      console.error('[VerificationRoutes] Verify topic failed:', error);
      return res.status(500).json({
        error: 'Topic verification failed',
        details: error.message,
      });
    }
  });

  /**
   * POST /api/v1/verification/verify-claim
   * Verify a specific claim against external sources
   *
   * Body:
   * - claimText: string - The claim to verify
   * - context?: string - Optional context for better search
   *
   * Returns:
   * - sources: VerifiedSourceNode[]
   * - verifiedClaim: VerifiedClaimNode (if claim is substantiated)
   * - status: 'verified' | 'disputed' | 'unverified'
   */
  router.post('/verify-claim', async (req: Request, res: Response) => {
    try {
      const { claimText, context } = req.body;
      const user = (req as any).user;
      const accountId = user?.accountId || user?.operating_account_id;

      if (!claimText) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'claimText is required',
        });
      }

      // Create a temporary topic from the claim for verification
      const tempTopic: TopicNode = {
        id: `temp-claim-${Date.now()}`,
        kind: 'Topic',
        name: claimText.slice(0, 50),
        description: claimText,
        keywords: context ? [context] : [],
        strength: 1.0,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: { is_claim_verification: true },
      };

      const { sources, claims } = await verificationService.verifyTopic(tempTopic);

      // Determine verification status
      let status: 'verified' | 'disputed' | 'unverified' = 'unverified';
      if (claims.length > 0) {
        const avgConfidence = claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length;
        status = avgConfidence > 0.7 ? 'verified' : 'disputed';
      }

      return res.json({
        success: true,
        claimText,
        status,
        sources: sources.map((s) => ({
          ...s,
          metadata: { ...s.metadata, account_id: accountId },
        })),
        claims: claims.map((c) => ({
          ...c,
          metadata: { ...c.metadata, account_id: accountId },
        })),
        stats: {
          sourceCount: sources.length,
          claimCount: claims.length,
        },
      });
    } catch (error: any) {
      console.error('[VerificationRoutes] Verify claim failed:', error);
      return res.status(500).json({
        error: 'Claim verification failed',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/v1/verification/status
   * Get verification service status and configuration
   */
  router.get('/status', (_req: Request, res: Response) => {
    const searchConfigured = verificationService.isSearchConfigured();
    return res.json({
      status: 'operational',
      searchProvider: searchConfigured ? 'tavily' : 'mock',
      llmProvider: process.env.OPENAI_API_KEY ? 'openai' : 'none',
      configuration: {
        searchEnabled: true,
        searchApiConfigured: searchConfigured,
        llmEnabled: !!process.env.OPENAI_API_KEY,
        maxSourcesPerVerification: 5,
        defaultTrustScore: 0.8,
      },
    });
  });

  return router;
}
