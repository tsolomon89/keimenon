export interface GraphReadModelNode {
  id: string;
  kind: string;
  properties: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
}

export interface GraphReadModelEdge {
  id: string;
  kind: string;
  from: string;
  to: string;
  properties: Record<string, unknown>;
  created_at?: number;
}

export interface GraphReadModelMetadataDetail {
  requestedNodeBudget: number;
  effectiveNodeBudget: number;
  requestedEdgeBudget: number;
  effectiveEdgeBudget: number;
  totalNodes: number;
  returnedNodes: number;
  totalEdges: number;
  returnedEdges: number;
  structuralAnchorsRequested: number;
  structuralAnchorsReturned: number;
  structuralAnchorsPreserved: boolean;
  truncated: boolean;
}

export interface GraphReadModelMetadata {
  // Snapshot-compatible fields
  total_nodes: number;
  total_edges: number;
  selected_node_count: number;
  selected_edge_count: number;
  truncated: boolean;

  // Read-model specific bounds metadata
  readModel: GraphReadModelMetadataDetail;

  pagination?: {
    page: number;
    limit: number;
    offset: number;
  };
}

export interface GraphReadModelResponse {
  nodes: GraphReadModelNode[];
  edges: GraphReadModelEdge[];
  metadata: GraphReadModelMetadata;
}
