import { z } from 'zod';
/**
 * Storage mode configuration
 */
export declare const StorageModeSchema: z.ZodEnum<["local", "canvas", "hybrid"]>;
export type StorageMode = z.infer<typeof StorageModeSchema>;
/**
 * Grouping configuration
 */
export declare const GroupingConfigSchema: z.ZodObject<{
    mode: z.ZodEnum<["auto", "manual", "hybrid"]>;
    auto: z.ZodOptional<z.ZodObject<{
        targetGroupCount: z.ZodDefault<z.ZodNumber>;
        createCatchAll: z.ZodDefault<z.ZodBoolean>;
        minGroupSize: z.ZodDefault<z.ZodNumber>;
        algorithm: z.ZodDefault<z.ZodEnum<["keyword", "tfidf", "embedding"]>>;
    }, "strip", z.ZodTypeAny, {
        targetGroupCount: number;
        createCatchAll: boolean;
        minGroupSize: number;
        algorithm: "keyword" | "tfidf" | "embedding";
    }, {
        targetGroupCount?: number | undefined;
        createCatchAll?: boolean | undefined;
        minGroupSize?: number | undefined;
        algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
    }>>;
    manual: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        keywords: z.ZodArray<z.ZodString, "many">;
        color: z.ZodOptional<z.ZodString>;
        icon: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        keywords: string[];
        color?: string | undefined;
        icon?: string | undefined;
    }, {
        name: string;
        keywords: string[];
        color?: string | undefined;
        icon?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    mode: "hybrid" | "auto" | "manual";
    manual: {
        name: string;
        keywords: string[];
        color?: string | undefined;
        icon?: string | undefined;
    }[];
    auto?: {
        targetGroupCount: number;
        createCatchAll: boolean;
        minGroupSize: number;
        algorithm: "keyword" | "tfidf" | "embedding";
    } | undefined;
}, {
    mode: "hybrid" | "auto" | "manual";
    auto?: {
        targetGroupCount?: number | undefined;
        createCatchAll?: boolean | undefined;
        minGroupSize?: number | undefined;
        algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
    } | undefined;
    manual?: {
        name: string;
        keywords: string[];
        color?: string | undefined;
        icon?: string | undefined;
    }[] | undefined;
}>;
export type GroupingConfig = z.infer<typeof GroupingConfigSchema>;
/**
 * Source configuration
 */
export declare const SourceConfigSchema: z.ZodObject<{
    scope: z.ZodDefault<z.ZodEnum<["message", "conversation", "auto"]>>;
    roleFilter: z.ZodObject<{
        user: z.ZodDefault<z.ZodBoolean>;
        ai: z.ZodDefault<z.ZodBoolean>;
        separate: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        user: boolean;
        ai: boolean;
        separate: boolean;
    }, {
        user?: boolean | undefined;
        ai?: boolean | undefined;
        separate?: boolean | undefined;
    }>;
    minLengthUser: z.ZodDefault<z.ZodNumber>;
    minLengthAI: z.ZodDefault<z.ZodNumber>;
    bundling: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        method: z.ZodDefault<z.ZodEnum<["keyword", "embedding", "none"]>>;
        similarityThreshold: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        method: "keyword" | "embedding" | "none";
        similarityThreshold: number;
    }, {
        enabled?: boolean | undefined;
        method?: "keyword" | "embedding" | "none" | undefined;
        similarityThreshold?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    scope: "message" | "auto" | "conversation";
    roleFilter: {
        user: boolean;
        ai: boolean;
        separate: boolean;
    };
    minLengthUser: number;
    minLengthAI: number;
    bundling: {
        enabled: boolean;
        method: "keyword" | "embedding" | "none";
        similarityThreshold: number;
    };
}, {
    roleFilter: {
        user?: boolean | undefined;
        ai?: boolean | undefined;
        separate?: boolean | undefined;
    };
    bundling: {
        enabled?: boolean | undefined;
        method?: "keyword" | "embedding" | "none" | undefined;
        similarityThreshold?: number | undefined;
    };
    scope?: "message" | "auto" | "conversation" | undefined;
    minLengthUser?: number | undefined;
    minLengthAI?: number | undefined;
}>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
/**
 * Code extraction configuration
 */
export declare const CodeConfigSchema: z.ZodObject<{
    extract: z.ZodDefault<z.ZodBoolean>;
    removeFromSource: z.ZodDefault<z.ZodBoolean>;
    createEdges: z.ZodDefault<z.ZodBoolean>;
    minLength: z.ZodDefault<z.ZodNumber>;
    deduplicate: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    extract: boolean;
    removeFromSource: boolean;
    createEdges: boolean;
    minLength: number;
    deduplicate: boolean;
}, {
    extract?: boolean | undefined;
    removeFromSource?: boolean | undefined;
    createEdges?: boolean | undefined;
    minLength?: number | undefined;
    deduplicate?: boolean | undefined;
}>;
export type CodeConfig = z.infer<typeof CodeConfigSchema>;
/**
 * Duplicate detection configuration
 */
export declare const DuplicateConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    level: z.ZodDefault<z.ZodEnum<["message", "conversation", "both"]>>;
    detectExact: z.ZodDefault<z.ZodBoolean>;
    detectNear: z.ZodDefault<z.ZodBoolean>;
    nearThreshold: z.ZodDefault<z.ZodNumber>;
    detectSemantic: z.ZodDefault<z.ZodBoolean>;
    semanticThreshold: z.ZodDefault<z.ZodNumber>;
    createReviewFolders: z.ZodDefault<z.ZodBoolean>;
    autoMergeSuggestions: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    level: "message" | "conversation" | "both";
    enabled: boolean;
    detectExact: boolean;
    detectNear: boolean;
    nearThreshold: number;
    detectSemantic: boolean;
    semanticThreshold: number;
    createReviewFolders: boolean;
    autoMergeSuggestions: boolean;
}, {
    level?: "message" | "conversation" | "both" | undefined;
    enabled?: boolean | undefined;
    detectExact?: boolean | undefined;
    detectNear?: boolean | undefined;
    nearThreshold?: number | undefined;
    detectSemantic?: boolean | undefined;
    semanticThreshold?: number | undefined;
    createReviewFolders?: boolean | undefined;
    autoMergeSuggestions?: boolean | undefined;
}>;
export type DuplicateConfig = z.infer<typeof DuplicateConfigSchema>;
/**
 * Privacy configuration
 */
export declare const PrivacyConfigSchema: z.ZodObject<{
    storageMode: z.ZodDefault<z.ZodEnum<["local", "canvas", "hybrid"]>>;
    allowExternalAPIs: z.ZodDefault<z.ZodBoolean>;
    apiKey: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    storageMode: "local" | "canvas" | "hybrid";
    allowExternalAPIs: boolean;
    apiKey: string | null;
}, {
    storageMode?: "local" | "canvas" | "hybrid" | undefined;
    allowExternalAPIs?: boolean | undefined;
    apiKey?: string | null | undefined;
}>;
export type PrivacyConfig = z.infer<typeof PrivacyConfigSchema>;
/**
 * Complete import configuration
 */
export declare const ImportConfigurationSchema: z.ZodObject<{
    grouping: z.ZodObject<{
        mode: z.ZodEnum<["auto", "manual", "hybrid"]>;
        auto: z.ZodOptional<z.ZodObject<{
            targetGroupCount: z.ZodDefault<z.ZodNumber>;
            createCatchAll: z.ZodDefault<z.ZodBoolean>;
            minGroupSize: z.ZodDefault<z.ZodNumber>;
            algorithm: z.ZodDefault<z.ZodEnum<["keyword", "tfidf", "embedding"]>>;
        }, "strip", z.ZodTypeAny, {
            targetGroupCount: number;
            createCatchAll: boolean;
            minGroupSize: number;
            algorithm: "keyword" | "tfidf" | "embedding";
        }, {
            targetGroupCount?: number | undefined;
            createCatchAll?: boolean | undefined;
            minGroupSize?: number | undefined;
            algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
        }>>;
        manual: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            keywords: z.ZodArray<z.ZodString, "many">;
            color: z.ZodOptional<z.ZodString>;
            icon: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            keywords: string[];
            color?: string | undefined;
            icon?: string | undefined;
        }, {
            name: string;
            keywords: string[];
            color?: string | undefined;
            icon?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        mode: "hybrid" | "auto" | "manual";
        manual: {
            name: string;
            keywords: string[];
            color?: string | undefined;
            icon?: string | undefined;
        }[];
        auto?: {
            targetGroupCount: number;
            createCatchAll: boolean;
            minGroupSize: number;
            algorithm: "keyword" | "tfidf" | "embedding";
        } | undefined;
    }, {
        mode: "hybrid" | "auto" | "manual";
        auto?: {
            targetGroupCount?: number | undefined;
            createCatchAll?: boolean | undefined;
            minGroupSize?: number | undefined;
            algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
        } | undefined;
        manual?: {
            name: string;
            keywords: string[];
            color?: string | undefined;
            icon?: string | undefined;
        }[] | undefined;
    }>;
    sources: z.ZodObject<{
        scope: z.ZodDefault<z.ZodEnum<["message", "conversation", "auto"]>>;
        roleFilter: z.ZodObject<{
            user: z.ZodDefault<z.ZodBoolean>;
            ai: z.ZodDefault<z.ZodBoolean>;
            separate: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            user: boolean;
            ai: boolean;
            separate: boolean;
        }, {
            user?: boolean | undefined;
            ai?: boolean | undefined;
            separate?: boolean | undefined;
        }>;
        minLengthUser: z.ZodDefault<z.ZodNumber>;
        minLengthAI: z.ZodDefault<z.ZodNumber>;
        bundling: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            method: z.ZodDefault<z.ZodEnum<["keyword", "embedding", "none"]>>;
            similarityThreshold: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            method: "keyword" | "embedding" | "none";
            similarityThreshold: number;
        }, {
            enabled?: boolean | undefined;
            method?: "keyword" | "embedding" | "none" | undefined;
            similarityThreshold?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        scope: "message" | "auto" | "conversation";
        roleFilter: {
            user: boolean;
            ai: boolean;
            separate: boolean;
        };
        minLengthUser: number;
        minLengthAI: number;
        bundling: {
            enabled: boolean;
            method: "keyword" | "embedding" | "none";
            similarityThreshold: number;
        };
    }, {
        roleFilter: {
            user?: boolean | undefined;
            ai?: boolean | undefined;
            separate?: boolean | undefined;
        };
        bundling: {
            enabled?: boolean | undefined;
            method?: "keyword" | "embedding" | "none" | undefined;
            similarityThreshold?: number | undefined;
        };
        scope?: "message" | "auto" | "conversation" | undefined;
        minLengthUser?: number | undefined;
        minLengthAI?: number | undefined;
    }>;
    code: z.ZodObject<{
        extract: z.ZodDefault<z.ZodBoolean>;
        removeFromSource: z.ZodDefault<z.ZodBoolean>;
        createEdges: z.ZodDefault<z.ZodBoolean>;
        minLength: z.ZodDefault<z.ZodNumber>;
        deduplicate: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        extract: boolean;
        removeFromSource: boolean;
        createEdges: boolean;
        minLength: number;
        deduplicate: boolean;
    }, {
        extract?: boolean | undefined;
        removeFromSource?: boolean | undefined;
        createEdges?: boolean | undefined;
        minLength?: number | undefined;
        deduplicate?: boolean | undefined;
    }>;
    duplicates: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        level: z.ZodDefault<z.ZodEnum<["message", "conversation", "both"]>>;
        detectExact: z.ZodDefault<z.ZodBoolean>;
        detectNear: z.ZodDefault<z.ZodBoolean>;
        nearThreshold: z.ZodDefault<z.ZodNumber>;
        detectSemantic: z.ZodDefault<z.ZodBoolean>;
        semanticThreshold: z.ZodDefault<z.ZodNumber>;
        createReviewFolders: z.ZodDefault<z.ZodBoolean>;
        autoMergeSuggestions: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        level: "message" | "conversation" | "both";
        enabled: boolean;
        detectExact: boolean;
        detectNear: boolean;
        nearThreshold: number;
        detectSemantic: boolean;
        semanticThreshold: number;
        createReviewFolders: boolean;
        autoMergeSuggestions: boolean;
    }, {
        level?: "message" | "conversation" | "both" | undefined;
        enabled?: boolean | undefined;
        detectExact?: boolean | undefined;
        detectNear?: boolean | undefined;
        nearThreshold?: number | undefined;
        detectSemantic?: boolean | undefined;
        semanticThreshold?: number | undefined;
        createReviewFolders?: boolean | undefined;
        autoMergeSuggestions?: boolean | undefined;
    }>;
    privacy: z.ZodObject<{
        storageMode: z.ZodDefault<z.ZodEnum<["local", "canvas", "hybrid"]>>;
        allowExternalAPIs: z.ZodDefault<z.ZodBoolean>;
        apiKey: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        storageMode: "local" | "canvas" | "hybrid";
        allowExternalAPIs: boolean;
        apiKey: string | null;
    }, {
        storageMode?: "local" | "canvas" | "hybrid" | undefined;
        allowExternalAPIs?: boolean | undefined;
        apiKey?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    code: {
        extract: boolean;
        removeFromSource: boolean;
        createEdges: boolean;
        minLength: number;
        deduplicate: boolean;
    };
    sources: {
        scope: "message" | "auto" | "conversation";
        roleFilter: {
            user: boolean;
            ai: boolean;
            separate: boolean;
        };
        minLengthUser: number;
        minLengthAI: number;
        bundling: {
            enabled: boolean;
            method: "keyword" | "embedding" | "none";
            similarityThreshold: number;
        };
    };
    grouping: {
        mode: "hybrid" | "auto" | "manual";
        manual: {
            name: string;
            keywords: string[];
            color?: string | undefined;
            icon?: string | undefined;
        }[];
        auto?: {
            targetGroupCount: number;
            createCatchAll: boolean;
            minGroupSize: number;
            algorithm: "keyword" | "tfidf" | "embedding";
        } | undefined;
    };
    duplicates: {
        level: "message" | "conversation" | "both";
        enabled: boolean;
        detectExact: boolean;
        detectNear: boolean;
        nearThreshold: number;
        detectSemantic: boolean;
        semanticThreshold: number;
        createReviewFolders: boolean;
        autoMergeSuggestions: boolean;
    };
    privacy: {
        storageMode: "local" | "canvas" | "hybrid";
        allowExternalAPIs: boolean;
        apiKey: string | null;
    };
}, {
    code: {
        extract?: boolean | undefined;
        removeFromSource?: boolean | undefined;
        createEdges?: boolean | undefined;
        minLength?: number | undefined;
        deduplicate?: boolean | undefined;
    };
    sources: {
        roleFilter: {
            user?: boolean | undefined;
            ai?: boolean | undefined;
            separate?: boolean | undefined;
        };
        bundling: {
            enabled?: boolean | undefined;
            method?: "keyword" | "embedding" | "none" | undefined;
            similarityThreshold?: number | undefined;
        };
        scope?: "message" | "auto" | "conversation" | undefined;
        minLengthUser?: number | undefined;
        minLengthAI?: number | undefined;
    };
    grouping: {
        mode: "hybrid" | "auto" | "manual";
        auto?: {
            targetGroupCount?: number | undefined;
            createCatchAll?: boolean | undefined;
            minGroupSize?: number | undefined;
            algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
        } | undefined;
        manual?: {
            name: string;
            keywords: string[];
            color?: string | undefined;
            icon?: string | undefined;
        }[] | undefined;
    };
    duplicates: {
        level?: "message" | "conversation" | "both" | undefined;
        enabled?: boolean | undefined;
        detectExact?: boolean | undefined;
        detectNear?: boolean | undefined;
        nearThreshold?: number | undefined;
        detectSemantic?: boolean | undefined;
        semanticThreshold?: number | undefined;
        createReviewFolders?: boolean | undefined;
        autoMergeSuggestions?: boolean | undefined;
    };
    privacy: {
        storageMode?: "local" | "canvas" | "hybrid" | undefined;
        allowExternalAPIs?: boolean | undefined;
        apiKey?: string | null | undefined;
    };
}>;
export type ImportConfiguration = z.infer<typeof ImportConfigurationSchema>;
/**
 * Application configuration (stored in ~/.canvas-memory/config.json)
 */
export declare const AppConfigSchema: z.ZodObject<{
    version: z.ZodDefault<z.ZodString>;
    storageMode: z.ZodDefault<z.ZodEnum<["local", "canvas", "hybrid"]>>;
    database: z.ZodObject<{
        local: z.ZodObject<{
            path: z.ZodString;
            autoBackup: z.ZodDefault<z.ZodBoolean>;
            verbose: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            path: string;
            autoBackup: boolean;
            verbose: boolean;
        }, {
            path: string;
            autoBackup?: boolean | undefined;
            verbose?: boolean | undefined;
        }>;
        cloud: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            neo4jUri: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            neo4jUser: z.ZodDefault<z.ZodNullable<z.ZodString>>;
            neo4jPassword: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            neo4jUri: string | null;
            neo4jUser: string | null;
            neo4jPassword: string | null;
        }, {
            enabled?: boolean | undefined;
            neo4jUri?: string | null | undefined;
            neo4jUser?: string | null | undefined;
            neo4jPassword?: string | null | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        local: {
            path: string;
            autoBackup: boolean;
            verbose: boolean;
        };
        cloud: {
            enabled: boolean;
            neo4jUri: string | null;
            neo4jUser: string | null;
            neo4jPassword: string | null;
        };
    }, {
        local: {
            path: string;
            autoBackup?: boolean | undefined;
            verbose?: boolean | undefined;
        };
        cloud: {
            enabled?: boolean | undefined;
            neo4jUri?: string | null | undefined;
            neo4jUser?: string | null | undefined;
            neo4jPassword?: string | null | undefined;
        };
    }>;
    documentStore: z.ZodObject<{
        path: z.ZodString;
        enableDeduplication: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        enableDeduplication: boolean;
    }, {
        path: string;
        enableDeduplication?: boolean | undefined;
    }>;
    defaults: z.ZodOptional<z.ZodObject<{
        grouping: z.ZodObject<{
            mode: z.ZodEnum<["auto", "manual", "hybrid"]>;
            auto: z.ZodOptional<z.ZodObject<{
                targetGroupCount: z.ZodDefault<z.ZodNumber>;
                createCatchAll: z.ZodDefault<z.ZodBoolean>;
                minGroupSize: z.ZodDefault<z.ZodNumber>;
                algorithm: z.ZodDefault<z.ZodEnum<["keyword", "tfidf", "embedding"]>>;
            }, "strip", z.ZodTypeAny, {
                targetGroupCount: number;
                createCatchAll: boolean;
                minGroupSize: number;
                algorithm: "keyword" | "tfidf" | "embedding";
            }, {
                targetGroupCount?: number | undefined;
                createCatchAll?: boolean | undefined;
                minGroupSize?: number | undefined;
                algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
            }>>;
            manual: z.ZodDefault<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                keywords: z.ZodArray<z.ZodString, "many">;
                color: z.ZodOptional<z.ZodString>;
                icon: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                name: string;
                keywords: string[];
                color?: string | undefined;
                icon?: string | undefined;
            }, {
                name: string;
                keywords: string[];
                color?: string | undefined;
                icon?: string | undefined;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            mode: "hybrid" | "auto" | "manual";
            manual: {
                name: string;
                keywords: string[];
                color?: string | undefined;
                icon?: string | undefined;
            }[];
            auto?: {
                targetGroupCount: number;
                createCatchAll: boolean;
                minGroupSize: number;
                algorithm: "keyword" | "tfidf" | "embedding";
            } | undefined;
        }, {
            mode: "hybrid" | "auto" | "manual";
            auto?: {
                targetGroupCount?: number | undefined;
                createCatchAll?: boolean | undefined;
                minGroupSize?: number | undefined;
                algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
            } | undefined;
            manual?: {
                name: string;
                keywords: string[];
                color?: string | undefined;
                icon?: string | undefined;
            }[] | undefined;
        }>;
        sources: z.ZodObject<{
            scope: z.ZodDefault<z.ZodEnum<["message", "conversation", "auto"]>>;
            roleFilter: z.ZodObject<{
                user: z.ZodDefault<z.ZodBoolean>;
                ai: z.ZodDefault<z.ZodBoolean>;
                separate: z.ZodDefault<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                user: boolean;
                ai: boolean;
                separate: boolean;
            }, {
                user?: boolean | undefined;
                ai?: boolean | undefined;
                separate?: boolean | undefined;
            }>;
            minLengthUser: z.ZodDefault<z.ZodNumber>;
            minLengthAI: z.ZodDefault<z.ZodNumber>;
            bundling: z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                method: z.ZodDefault<z.ZodEnum<["keyword", "embedding", "none"]>>;
                similarityThreshold: z.ZodDefault<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                enabled: boolean;
                method: "keyword" | "embedding" | "none";
                similarityThreshold: number;
            }, {
                enabled?: boolean | undefined;
                method?: "keyword" | "embedding" | "none" | undefined;
                similarityThreshold?: number | undefined;
            }>;
        }, "strip", z.ZodTypeAny, {
            scope: "message" | "auto" | "conversation";
            roleFilter: {
                user: boolean;
                ai: boolean;
                separate: boolean;
            };
            minLengthUser: number;
            minLengthAI: number;
            bundling: {
                enabled: boolean;
                method: "keyword" | "embedding" | "none";
                similarityThreshold: number;
            };
        }, {
            roleFilter: {
                user?: boolean | undefined;
                ai?: boolean | undefined;
                separate?: boolean | undefined;
            };
            bundling: {
                enabled?: boolean | undefined;
                method?: "keyword" | "embedding" | "none" | undefined;
                similarityThreshold?: number | undefined;
            };
            scope?: "message" | "auto" | "conversation" | undefined;
            minLengthUser?: number | undefined;
            minLengthAI?: number | undefined;
        }>;
        code: z.ZodObject<{
            extract: z.ZodDefault<z.ZodBoolean>;
            removeFromSource: z.ZodDefault<z.ZodBoolean>;
            createEdges: z.ZodDefault<z.ZodBoolean>;
            minLength: z.ZodDefault<z.ZodNumber>;
            deduplicate: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            extract: boolean;
            removeFromSource: boolean;
            createEdges: boolean;
            minLength: number;
            deduplicate: boolean;
        }, {
            extract?: boolean | undefined;
            removeFromSource?: boolean | undefined;
            createEdges?: boolean | undefined;
            minLength?: number | undefined;
            deduplicate?: boolean | undefined;
        }>;
        duplicates: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            level: z.ZodDefault<z.ZodEnum<["message", "conversation", "both"]>>;
            detectExact: z.ZodDefault<z.ZodBoolean>;
            detectNear: z.ZodDefault<z.ZodBoolean>;
            nearThreshold: z.ZodDefault<z.ZodNumber>;
            detectSemantic: z.ZodDefault<z.ZodBoolean>;
            semanticThreshold: z.ZodDefault<z.ZodNumber>;
            createReviewFolders: z.ZodDefault<z.ZodBoolean>;
            autoMergeSuggestions: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            level: "message" | "conversation" | "both";
            enabled: boolean;
            detectExact: boolean;
            detectNear: boolean;
            nearThreshold: number;
            detectSemantic: boolean;
            semanticThreshold: number;
            createReviewFolders: boolean;
            autoMergeSuggestions: boolean;
        }, {
            level?: "message" | "conversation" | "both" | undefined;
            enabled?: boolean | undefined;
            detectExact?: boolean | undefined;
            detectNear?: boolean | undefined;
            nearThreshold?: number | undefined;
            detectSemantic?: boolean | undefined;
            semanticThreshold?: number | undefined;
            createReviewFolders?: boolean | undefined;
            autoMergeSuggestions?: boolean | undefined;
        }>;
        privacy: z.ZodObject<{
            storageMode: z.ZodDefault<z.ZodEnum<["local", "canvas", "hybrid"]>>;
            allowExternalAPIs: z.ZodDefault<z.ZodBoolean>;
            apiKey: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            storageMode: "local" | "canvas" | "hybrid";
            allowExternalAPIs: boolean;
            apiKey: string | null;
        }, {
            storageMode?: "local" | "canvas" | "hybrid" | undefined;
            allowExternalAPIs?: boolean | undefined;
            apiKey?: string | null | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        code: {
            extract: boolean;
            removeFromSource: boolean;
            createEdges: boolean;
            minLength: number;
            deduplicate: boolean;
        };
        sources: {
            scope: "message" | "auto" | "conversation";
            roleFilter: {
                user: boolean;
                ai: boolean;
                separate: boolean;
            };
            minLengthUser: number;
            minLengthAI: number;
            bundling: {
                enabled: boolean;
                method: "keyword" | "embedding" | "none";
                similarityThreshold: number;
            };
        };
        grouping: {
            mode: "hybrid" | "auto" | "manual";
            manual: {
                name: string;
                keywords: string[];
                color?: string | undefined;
                icon?: string | undefined;
            }[];
            auto?: {
                targetGroupCount: number;
                createCatchAll: boolean;
                minGroupSize: number;
                algorithm: "keyword" | "tfidf" | "embedding";
            } | undefined;
        };
        duplicates: {
            level: "message" | "conversation" | "both";
            enabled: boolean;
            detectExact: boolean;
            detectNear: boolean;
            nearThreshold: number;
            detectSemantic: boolean;
            semanticThreshold: number;
            createReviewFolders: boolean;
            autoMergeSuggestions: boolean;
        };
        privacy: {
            storageMode: "local" | "canvas" | "hybrid";
            allowExternalAPIs: boolean;
            apiKey: string | null;
        };
    }, {
        code: {
            extract?: boolean | undefined;
            removeFromSource?: boolean | undefined;
            createEdges?: boolean | undefined;
            minLength?: number | undefined;
            deduplicate?: boolean | undefined;
        };
        sources: {
            roleFilter: {
                user?: boolean | undefined;
                ai?: boolean | undefined;
                separate?: boolean | undefined;
            };
            bundling: {
                enabled?: boolean | undefined;
                method?: "keyword" | "embedding" | "none" | undefined;
                similarityThreshold?: number | undefined;
            };
            scope?: "message" | "auto" | "conversation" | undefined;
            minLengthUser?: number | undefined;
            minLengthAI?: number | undefined;
        };
        grouping: {
            mode: "hybrid" | "auto" | "manual";
            auto?: {
                targetGroupCount?: number | undefined;
                createCatchAll?: boolean | undefined;
                minGroupSize?: number | undefined;
                algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
            } | undefined;
            manual?: {
                name: string;
                keywords: string[];
                color?: string | undefined;
                icon?: string | undefined;
            }[] | undefined;
        };
        duplicates: {
            level?: "message" | "conversation" | "both" | undefined;
            enabled?: boolean | undefined;
            detectExact?: boolean | undefined;
            detectNear?: boolean | undefined;
            nearThreshold?: number | undefined;
            detectSemantic?: boolean | undefined;
            semanticThreshold?: number | undefined;
            createReviewFolders?: boolean | undefined;
            autoMergeSuggestions?: boolean | undefined;
        };
        privacy: {
            storageMode?: "local" | "canvas" | "hybrid" | undefined;
            allowExternalAPIs?: boolean | undefined;
            apiKey?: string | null | undefined;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    storageMode: "local" | "canvas" | "hybrid";
    version: string;
    database: {
        local: {
            path: string;
            autoBackup: boolean;
            verbose: boolean;
        };
        cloud: {
            enabled: boolean;
            neo4jUri: string | null;
            neo4jUser: string | null;
            neo4jPassword: string | null;
        };
    };
    documentStore: {
        path: string;
        enableDeduplication: boolean;
    };
    defaults?: {
        code: {
            extract: boolean;
            removeFromSource: boolean;
            createEdges: boolean;
            minLength: number;
            deduplicate: boolean;
        };
        sources: {
            scope: "message" | "auto" | "conversation";
            roleFilter: {
                user: boolean;
                ai: boolean;
                separate: boolean;
            };
            minLengthUser: number;
            minLengthAI: number;
            bundling: {
                enabled: boolean;
                method: "keyword" | "embedding" | "none";
                similarityThreshold: number;
            };
        };
        grouping: {
            mode: "hybrid" | "auto" | "manual";
            manual: {
                name: string;
                keywords: string[];
                color?: string | undefined;
                icon?: string | undefined;
            }[];
            auto?: {
                targetGroupCount: number;
                createCatchAll: boolean;
                minGroupSize: number;
                algorithm: "keyword" | "tfidf" | "embedding";
            } | undefined;
        };
        duplicates: {
            level: "message" | "conversation" | "both";
            enabled: boolean;
            detectExact: boolean;
            detectNear: boolean;
            nearThreshold: number;
            detectSemantic: boolean;
            semanticThreshold: number;
            createReviewFolders: boolean;
            autoMergeSuggestions: boolean;
        };
        privacy: {
            storageMode: "local" | "canvas" | "hybrid";
            allowExternalAPIs: boolean;
            apiKey: string | null;
        };
    } | undefined;
}, {
    database: {
        local: {
            path: string;
            autoBackup?: boolean | undefined;
            verbose?: boolean | undefined;
        };
        cloud: {
            enabled?: boolean | undefined;
            neo4jUri?: string | null | undefined;
            neo4jUser?: string | null | undefined;
            neo4jPassword?: string | null | undefined;
        };
    };
    documentStore: {
        path: string;
        enableDeduplication?: boolean | undefined;
    };
    storageMode?: "local" | "canvas" | "hybrid" | undefined;
    version?: string | undefined;
    defaults?: {
        code: {
            extract?: boolean | undefined;
            removeFromSource?: boolean | undefined;
            createEdges?: boolean | undefined;
            minLength?: number | undefined;
            deduplicate?: boolean | undefined;
        };
        sources: {
            roleFilter: {
                user?: boolean | undefined;
                ai?: boolean | undefined;
                separate?: boolean | undefined;
            };
            bundling: {
                enabled?: boolean | undefined;
                method?: "keyword" | "embedding" | "none" | undefined;
                similarityThreshold?: number | undefined;
            };
            scope?: "message" | "auto" | "conversation" | undefined;
            minLengthUser?: number | undefined;
            minLengthAI?: number | undefined;
        };
        grouping: {
            mode: "hybrid" | "auto" | "manual";
            auto?: {
                targetGroupCount?: number | undefined;
                createCatchAll?: boolean | undefined;
                minGroupSize?: number | undefined;
                algorithm?: "keyword" | "tfidf" | "embedding" | undefined;
            } | undefined;
            manual?: {
                name: string;
                keywords: string[];
                color?: string | undefined;
                icon?: string | undefined;
            }[] | undefined;
        };
        duplicates: {
            level?: "message" | "conversation" | "both" | undefined;
            enabled?: boolean | undefined;
            detectExact?: boolean | undefined;
            detectNear?: boolean | undefined;
            nearThreshold?: number | undefined;
            detectSemantic?: boolean | undefined;
            semanticThreshold?: number | undefined;
            createReviewFolders?: boolean | undefined;
            autoMergeSuggestions?: boolean | undefined;
        };
        privacy: {
            storageMode?: "local" | "canvas" | "hybrid" | undefined;
            allowExternalAPIs?: boolean | undefined;
            apiKey?: string | null | undefined;
        };
    } | undefined;
}>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
/**
 * Default configurations
 */
export declare const DEFAULT_GROUPING_CONFIG: GroupingConfig;
export declare const DEFAULT_SOURCE_CONFIG: SourceConfig;
export declare const DEFAULT_CODE_CONFIG: CodeConfig;
export declare const DEFAULT_DUPLICATE_CONFIG: DuplicateConfig;
export declare const DEFAULT_PRIVACY_CONFIG: PrivacyConfig;
export declare const DEFAULT_IMPORT_CONFIGURATION: ImportConfiguration;
//# sourceMappingURL=config.d.ts.map