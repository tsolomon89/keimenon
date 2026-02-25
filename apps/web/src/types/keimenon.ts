// Keimenon visualization types

export interface KeimenonNode {
  id: string;
  type:
    | 'source'
    | 'group'
    | 'conversation'
    | 'code'
    | 'message'
    // V2: UGC Spine nodes
    | 'Lexeme'
    | 'Phrase'
    | 'Topic'
    // V2: Verified layer nodes
    | 'VerifiedSource'
    | 'VerifiedClaim';
  position: { x: number; y: number };
  data: {
    title: string;
    subtitle?: string;
    label?: string;
    metadata?: Record<string, any>;
  };
  selected?: boolean;
}

export interface KeimenonGroup {
  id: string;
  name: string;
  color?: string;
  nodes: string[]; // node IDs
  expanded?: boolean;
}

export interface SourceNode {
  id: string;
  title: string;
  type: 'conversation' | 'source_doc' | 'code_asset';
  platform?: 'chatgpt' | 'claude' | 'gemini';
  messageCount?: number;
  charCount?: number;
  createdAt: number;
  metadata: Record<string, any>;
  parentId?: string; // for folder hierarchy
  children?: string[]; // child node IDs
}

export interface FolderNode {
  id: string;
  name: string;
  type: 'folder';
  children: string[]; // IDs of sources or folders
  expanded: boolean;
  color?: string;
}

export type TreeNode = SourceNode | FolderNode;

export interface KeimenonState {
  nodes: KeimenonNode[];
  groups: KeimenonGroup[];
  selectedNodeIds: string[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface InspectorData {
  nodeId: string;
  type: string;
  title: string;
  details: Array<{
    label: string;
    value: string | number;
    type?: 'text' | 'number' | 'date' | 'badge';
  }>;
  metadata: Record<string, any>;
  actions?: Array<{
    label: string;
    icon?: string;
    onClick: () => void;
  }>;
}
