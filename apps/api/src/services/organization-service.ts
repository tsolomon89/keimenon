import { BoardNode, FolderNode, GroupNode } from '@keimenon/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Organization Service
 * 
 * Manages the hierarchical and organizational structures of the graph:
 * - Boards (Kanban/List views)
 * - Folders (Nesting)
 * - Smart Groups (Dynamic collections)
 */
export class OrganizationService {
  
  /**
   * Create a new Board
   */
  createBoard(name: string, options: { 
    viewMode?: 'kanban' | 'list' | 'grid',
    description?: string,
    columns?: { title: string, query?: any }[] 
  } = {}): BoardNode {
    const timestamp = Date.now();
    
    // Default columns for a generic Kanban
    const defaultColumns = [
      { id: uuidv4(), title: 'To Do' },
      { id: uuidv4(), title: 'In Progress' },
      { id: uuidv4(), title: 'Done' }
    ];

    return {
      id: uuidv4(),
      kind: 'Board',
      name,
      description: options.description,
      view_mode: options.viewMode || 'kanban',
      columns: options.columns ? options.columns.map(c => ({
        id: uuidv4(),
        title: c.title,
        query: c.query
      })) : defaultColumns,
      created_at: timestamp,
      updated_at: timestamp,
      metadata: {}
    };
  }

  /**
   * Create a Folder
   */
  createFolder(name: string, parentId?: string): FolderNode {
    const timestamp = Date.now();
    return {
      id: uuidv4(),
      kind: 'Folder',
      name,
      parent_id: parentId,
      created_at: timestamp,
      updated_at: timestamp,
      metadata: {}
    };
  }

  /**
   * Create a Smart Group
   */
  createSmartGroup(name: string, criteria: any): GroupNode {
    const timestamp = Date.now();
    return {
      id: uuidv4(),
      kind: 'Group',
      name,
      purpose: 'Smart Group',
      member_count: 0, // Calculated dynamically
      created_at: timestamp,
      updated_at: timestamp,
      metadata: {
        is_smart: true,
        criteria
      }
    };
  }
}
