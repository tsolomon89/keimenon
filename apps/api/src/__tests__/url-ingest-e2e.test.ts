import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import ingestRouter, { setAuthDependencies } from '../routes/ingest';
import { URLFetcherService } from '../services/url-fetcher';
import { ContentExtractorService } from '../services/content-extractor';

// Mock the URL fetcher service
vi.mock('../services/url-fetcher', () => {
  return {
    getURLFetcherService: vi.fn(() => ({
      validateUrl: vi.fn().mockResolvedValue({
        valid: true,
        canonicalUrl: 'https://example.com/article',
      }),
      fetch: vi.fn().mockResolvedValue({
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Test Article | Example Site</title>
              <meta name="author" content="Test Author">
            </head>
            <body>
              <article>
                <h1>Test Article</h1>
                <p>This is a test article with enough content to be extracted properly by the readability algorithm.</p>
                <p>It contains multiple paragraphs to ensure proper content extraction.</p>
                <pre><code class="language-javascript">console.log('Hello');</code></pre>
              </article>
            </body>
          </html>
        `,
        status: 200,
        headers: { 'content-type': 'text/html' },
        finalUrl: 'https://example.com/article',
        contentType: 'text/html',
        contentLength: 500,
        fetchedAt: Date.now(),
      }),
    })),
    URLFetchError: class URLFetchError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.name = 'URLFetchError';
        this.code = code;
      }
    },
  };
});

// Mock the local document store
vi.mock('../services/local-document-store', () => ({
  getLocalDocumentStore: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    saveSource: vi.fn().mockResolvedValue({
      id: 'src_test123',
      type: 'source',
      hash: 'testhash123',
      storagePath: 'documents/sources/src_test123.md',
      size: 1024,
      createdAt: Date.now(),
    }),
    getStorageLocation: vi.fn().mockReturnValue('local://documents/sources/src_test123.md'),
  })),
}));

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    findNodeByContentHash: vi.fn().mockResolvedValue(null),
    createNode: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/get-db-client', () => ({
  getDbClient: vi.fn().mockResolvedValue(mockDb),
}));

describe('URL Ingest E2E', () => {
  let app: Express;

  beforeAll(() => {
    setAuthDependencies(null, null, null, null);
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = {
        userId: 'usr_test123',
        accountId: 'acc_test123',
        permissionLevel: 'senior',
      };
      next();
    });
    app.use('/api/v1/ingest', ingestRouter);
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/ingest/url', () => {
    it('should return 400 if URL is missing', async () => {
      const response = await request(app).post('/api/v1/ingest/url').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('URL is required');
    });

    it('should return 400 for invalid URL format', async () => {
      const response = await request(app)
        .post('/api/v1/ingest/url')
        .send({ url: 'not-a-valid-url' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid URL format');
    });

    it('should successfully ingest a valid URL', async () => {
      mockDb.findNodeByContentHash.mockResolvedValueOnce(null);
      mockDb.createNode.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/v1/ingest/url')
        .send({ url: 'https://example.com/article' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.duplicate).toBe(false);
      expect(response.body.source).toBeDefined();
      expect(response.body.source.kind).toBe('Source');
      expect(response.body.source.url).toBe('https://example.com/article');
      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.fingerprint).toBeDefined();
    });

    it('should detect duplicate content by fingerprint', async () => {
      const existingSource = {
        id: 'src_existing123',
        kind: 'Source',
        url: 'https://example.com/original',
        fingerprint: 'existing_fingerprint',
        title: 'Existing Article',
      };

      mockDb.findNodeByContentHash.mockResolvedValueOnce(existingSource);

      const response = await request(app)
        .post('/api/v1/ingest/url')
        .send({ url: 'https://example.com/duplicate' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.duplicate).toBe(true);
      expect(response.body.duplicateOf).toBe('src_existing123');
    });

    it('should include metadata in response', async () => {
      mockDb.findNodeByContentHash.mockResolvedValueOnce(null);
      mockDb.createNode.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/v1/ingest/url')
        .send({ url: 'https://example.com/article' });

      expect(response.status).toBe(200);
      expect(response.body.metadata).toMatchObject({
        url: 'https://example.com/article',
        canonicalUrl: 'https://example.com/article',
        wordCount: expect.any(Number),
        charCount: expect.any(Number),
      });
    });

    it('should create source with proper provenance', async () => {
      mockDb.findNodeByContentHash.mockResolvedValueOnce(null);
      mockDb.createNode.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/v1/ingest/url')
        .send({ url: 'https://example.com/article' });

      expect(response.status).toBe(200);
      expect(response.body.source.provenance).toBeDefined();
      expect(response.body.source.provenance.origin_type).toBe('agent_import');
      expect(response.body.source.provenance.trust_state).toBe('external_claim');
      expect(response.body.source.provenance.original_url).toBe('https://example.com/article');
    });

    it('should use board_id from request if provided', async () => {
      mockDb.findNodeByContentHash.mockResolvedValueOnce(null);
      mockDb.createNode.mockResolvedValueOnce(undefined);

      const response = await request(app).post('/api/v1/ingest/url').send({
        url: 'https://example.com/article',
        board_id: 'my_custom_board',
      });

      expect(response.status).toBe(200);
      expect(response.body.source.metadata?.board_id ?? response.body.source.board_id).toBe(
        'my_custom_board'
      );
    });
  });
});
