import neo4j, { Driver, Session, Result } from 'neo4j-driver';

export class Neo4jClient {
  private driver: Driver | null = null;
  private uri: string;
  private user: string;
  private password: string;

  constructor(uri: string, user: string, password: string) {
    this.uri = uri;
    this.user = user;
    this.password = password;
  }

  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.user, this.password),
        {
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 60000,
        }
      );

      // Verify connectivity
      await this.driver.verifyConnectivity();
      console.log('✅ Connected to Neo4j');
    } catch (error) {
      console.error('❌ Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      console.log('👋 Disconnected from Neo4j');
    }
  }

  getDriver(): Driver {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized. Call connect() first.');
    }
    return this.driver;
  }

  getSession(): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized. Call connect() first.');
    }
    return this.driver.session();
  }

  async execute(query: string, params: Record<string, any> = {}): Promise<Result> {
    const session = this.getSession();
    try {
      return await session.run(query, params);
    } finally {
      await session.close();
    }
  }

  async initializeSchema(): Promise<void> {
    console.log('🔧 Initializing Neo4j schema...');

    const constraints = [
      // Node uniqueness constraints
      'CREATE CONSTRAINT node_id IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT source_fingerprint IF NOT EXISTS FOR (s:Source) REQUIRE s.fingerprint IS UNIQUE',
      'CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:UserNode) REQUIRE u.email IS UNIQUE',
      'CREATE CONSTRAINT workspace_id IF NOT EXISTS FOR (w:Workspace) REQUIRE w.id IS UNIQUE',
      'CREATE CONSTRAINT board_id IF NOT EXISTS FOR (b:Board) REQUIRE b.id IS UNIQUE',
    ];

    const indexes = [
      // Performance indexes
      'CREATE INDEX node_kind IF NOT EXISTS FOR (n:Node) ON (n.kind)',
      'CREATE INDEX node_created IF NOT EXISTS FOR (n:Node) ON (n.created_at)',
      'CREATE INDEX source_mime IF NOT EXISTS FOR (s:Source) ON (s.mime_type)',
      'CREATE INDEX group_name IF NOT EXISTS FOR (g:Group) ON (g.name)',
      'CREATE INDEX claim_status IF NOT EXISTS FOR (c:ObjectiveClaim) ON (c.status)',
    ];

    try {
      for (const constraint of constraints) {
        await this.execute(constraint);
      }
      console.log(`✅ Created ${constraints.length} constraints`);

      for (const index of indexes) {
        await this.execute(index);
      }
      console.log(`✅ Created ${indexes.length} indexes`);
    } catch (error) {
      console.error('❌ Schema initialization failed:', error);
      throw error;
    }
  }
}

// Singleton instance
let client: Neo4jClient | null = null;

export function getNeo4jClient(uri?: string, user?: string, password?: string): Neo4jClient {
  if (!client) {
    if (!uri || !user || !password) {
      throw new Error('Neo4j credentials required for first initialization');
    }
    client = new Neo4jClient(uri, user, password);
  }
  return client;
}
