import { SourceNode } from '@canvas-memory/types';
import mime from 'mime-types';

export interface GroupSuggestion {
  groupId: string;
  name: string;
  reason: string;
  members: string[]; // Source node IDs
}

/**
 * Rule-based autogrouping for MVP
 * Groups sources by mime type, domain, and simple heuristics
 */
export class AutogroupService {
  /**
   * Generate group suggestions for a set of sources
   */
  suggestGroups(sources: SourceNode[]): GroupSuggestion[] {
    const suggestions: GroupSuggestion[] = [];

    // Group by MIME type category
    const mimeGroups = this.groupByMimeCategory(sources);
    suggestions.push(...mimeGroups);

    // Group by domain (for URLs)
    const domainGroups = this.groupByDomain(sources);
    suggestions.push(...domainGroups);

    // Merge overlapping groups
    return this.mergeOverlappingGroups(suggestions);
  }

  /**
   * Group sources by MIME type category
   */
  private groupByMimeCategory(sources: SourceNode[]): GroupSuggestion[] {
    const groups = new Map<string, SourceNode[]>();

    for (const source of sources) {
      const category = this.getMimeCategory(source.mime_type);
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(source);
    }

    const suggestions: GroupSuggestion[] = [];

    for (const [category, members] of groups.entries()) {
      if (members.length >= 2) {
        // Only create group if 2+ members
        suggestions.push({
          groupId: `grp_${category}_${Date.now()}`,
          name: this.getCategoryName(category),
          reason: `Grouped by file type: ${category}`,
          members: members.map((s) => s.id),
        });
      }
    }

    return suggestions;
  }

  /**
   * Group sources by domain
   */
  private groupByDomain(sources: SourceNode[]): GroupSuggestion[] {
    const groups = new Map<string, SourceNode[]>();

    for (const source of sources) {
      if (source.url) {
        const domain = this.extractDomain(source.url);
        if (domain) {
          if (!groups.has(domain)) {
            groups.set(domain, []);
          }
          groups.get(domain)!.push(source);
        }
      }
    }

    const suggestions: GroupSuggestion[] = [];

    for (const [domain, members] of groups.entries()) {
      if (members.length >= 2) {
        suggestions.push({
          groupId: `grp_domain_${domain}_${Date.now()}`,
          name: `${domain} sources`,
          reason: `Grouped by domain: ${domain}`,
          members: members.map((s) => s.id),
        });
      }
    }

    return suggestions;
  }

  /**
   * Get MIME category from full MIME type
   */
  private getMimeCategory(mimeType: string): string {
    const [category] = mimeType.split('/');
    return category || 'unknown';
  }

  /**
   * Get friendly name for MIME category
   */
  private getCategoryName(category: string): string {
    const names: Record<string, string> = {
      image: 'Images',
      video: 'Videos',
      audio: 'Audio',
      text: 'Text Files',
      application: 'Documents',
      unknown: 'Other Files',
    };
    return names[category] || category;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return null;
    }
  }

  /**
   * Merge groups with significant overlap
   */
  private mergeOverlappingGroups(
    groups: GroupSuggestion[]
  ): GroupSuggestion[] {
    // For MVP, just return as-is
    // Future: implement sophisticated merging based on Jaccard similarity
    return groups;
  }

  /**
   * Detect duplicate sources by fingerprint
   */
  detectDuplicates(sources: SourceNode[]): Array<{
    canonical: string;
    duplicates: string[];
  }> {
    const fingerprintMap = new Map<string, string[]>();

    for (const source of sources) {
      const fp = source.fingerprint;
      if (!fingerprintMap.has(fp)) {
        fingerprintMap.set(fp, []);
      }
      fingerprintMap.get(fp)!.push(source.id);
    }

    const duplicates: Array<{ canonical: string; duplicates: string[] }> = [];

    for (const [fingerprint, ids] of fingerprintMap.entries()) {
      if (ids.length > 1) {
        // First ID is canonical
        const [canonical, ...dups] = ids;
        duplicates.push({ canonical, duplicates: dups });
      }
    }

    return duplicates;
  }

  /**
   * Suggest group name based on content analysis
   */
  suggestGroupName(sources: SourceNode[]): string {
    if (sources.length === 0) return 'Untitled Group';

    // Check if all same domain
    const domains = sources
      .map((s) => (s.url ? this.extractDomain(s.url) : null))
      .filter((d): d is string => d !== null);

    const uniqueDomains = new Set(domains);
    if (uniqueDomains.size === 1) {
      return `${Array.from(uniqueDomains)[0]} sources`;
    }

    // Check if all same mime category
    const categories = sources.map((s) => this.getMimeCategory(s.mime_type));
    const uniqueCategories = new Set(categories);
    if (uniqueCategories.size === 1) {
      return this.getCategoryName(Array.from(uniqueCategories)[0]);
    }

    // Default to generic name
    return 'Mixed Sources';
  }
}
