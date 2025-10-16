"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Neo4jClient = void 0;
exports.getNeo4jClient = getNeo4jClient;
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
class Neo4jClient {
    constructor(uri, user, password) {
        this.driver = null;
        this.uri = uri;
        this.user = user;
        this.password = password;
    }
    async connect() {
        try {
            this.driver = neo4j_driver_1.default.driver(this.uri, neo4j_driver_1.default.auth.basic(this.user, this.password), {
                maxConnectionPoolSize: 50,
                connectionAcquisitionTimeout: 60000,
            });
            // Verify connectivity
            await this.driver.verifyConnectivity();
            console.log('✅ Connected to Neo4j');
        }
        catch (error) {
            console.error('❌ Failed to connect to Neo4j:', error);
            throw error;
        }
    }
    async disconnect() {
        if (this.driver) {
            await this.driver.close();
            console.log('👋 Disconnected from Neo4j');
        }
    }
    getSession() {
        if (!this.driver) {
            throw new Error('Neo4j driver not initialized. Call connect() first.');
        }
        return this.driver.session();
    }
    async execute(query, params = {}) {
        const session = this.getSession();
        try {
            return await session.run(query, params);
        }
        finally {
            await session.close();
        }
    }
    async initializeSchema() {
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
        }
        catch (error) {
            console.error('❌ Schema initialization failed:', error);
            throw error;
        }
    }
}
exports.Neo4jClient = Neo4jClient;
// Singleton instance
let client = null;
function getNeo4jClient(uri, user, password) {
    if (!client) {
        if (!uri || !user || !password) {
            throw new Error('Neo4j credentials required for first initialization');
        }
        client = new Neo4jClient(uri, user, password);
    }
    return client;
}
//# sourceMappingURL=neo4j.js.map