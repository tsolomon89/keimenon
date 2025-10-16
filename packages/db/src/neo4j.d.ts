import { Session, Result } from 'neo4j-driver';
export declare class Neo4jClient {
    private driver;
    private uri;
    private user;
    private password;
    constructor(uri: string, user: string, password: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getSession(): Session;
    execute(query: string, params?: Record<string, any>): Promise<Result>;
    initializeSchema(): Promise<void>;
}
export declare function getNeo4jClient(uri?: string, user?: string, password?: string): Neo4jClient;
//# sourceMappingURL=neo4j.d.ts.map