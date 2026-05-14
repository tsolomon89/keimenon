export interface EvidenceItem {
  node_id: string;
  kind: string;
  source_id?: string;
  group_id?: string;
  text?: string;
  label?: string;
  provenance?: unknown;
}

export interface ConversationContextPack {
  conversation_id: string;
  source_ids: string[];
  group_ids: string[];
  evidence: EvidenceItem[];
  limits: {
    max_sources: number;
    max_groups: number;
    max_evidence_items: number;
  };
  truncation: {
    sources_truncated: boolean;
    groups_truncated: boolean;
    evidence_truncated: boolean;
    requested_sources: number;
    returned_sources: number;
    requested_groups: number;
    returned_groups: number;
    returned_evidence_items: number;
  };
}
