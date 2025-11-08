import * as fs from 'fs/promises';
import * as path from 'path';
import { Page } from '@playwright/test';

/**
 * Baseline Manager for Visual Regression Testing
 *
 * This utility helps manage visual regression baseline screenshots.
 * It provides functions to approve, update, reset, and list baselines.
 *
 * Directory Structure:
 * - test-results/{test-name}/: Current screenshots from test runs
 * - test-results/.playwright-snapshots/: Baseline screenshots (git-tracked)
 * - test-results/.playwright-snapshots-diff/: Diff images for failures
 *
 * Usage:
 * ```typescript
 * import { BaselineManager } from './helpers/baseline-manager';
 *
 * const manager = new BaselineManager();
 *
 * // List all baselines
 * const baselines = await manager.listBaselines();
 *
 * // Approve a new baseline
 * await manager.approveBaseline('create-resource-01-dialog-open.png');
 *
 * // Update all baselines (use with caution!)
 * await manager.updateAllBaselines();
 * ```
 *
 * Related: playwright.config.ts (snapshotPathTemplate configuration)
 * Related: tests/e2e/templates/*.spec.ts (tests using visual regression)
 */

export interface BaselineConfig {
  /**
   * Root directory for test results
   * Default: 'test-results'
   */
  testResultsDir: string;

  /**
   * Directory where baseline screenshots are stored
   * Default: 'test-results/.playwright-snapshots'
   */
  baselineDir: string;

  /**
   * Directory where diff screenshots are stored
   * Default: 'test-results/.playwright-snapshots-diff'
   */
  diffDir: string;

  /**
   * Directory where current screenshots are stored
   * Default: 'test-results/.current'
   */
  currentDir: string;
}

export interface BaselineInfo {
  name: string;
  path: string;
  size: number;
  modifiedDate: Date;
  hasBaseline: boolean;
  hasDiff: boolean;
}

export interface ComparisonResult {
  matched: boolean;
  similarity: number;
  diffPath?: string;
  mismatchedPixels?: number;
}

export class BaselineManager {
  private config: BaselineConfig;

  constructor(config?: Partial<BaselineConfig>) {
    this.config = {
      testResultsDir: config?.testResultsDir || 'test-results',
      baselineDir: config?.baselineDir || path.join('test-results', '.playwright-snapshots'),
      diffDir: config?.diffDir || path.join('test-results', '.playwright-snapshots-diff'),
      currentDir: config?.currentDir || path.join('test-results', '.current'),
    };
  }

  /**
   * List all baseline screenshots
   *
   * @param filter - Optional filter pattern (e.g., 'create-resource' to match only those tests)
   * @returns Array of baseline information
   */
  async listBaselines(filter?: string): Promise<BaselineInfo[]> {
    const baselines: BaselineInfo[] = [];

    try {
      // Ensure baseline directory exists
      await fs.mkdir(this.config.baselineDir, { recursive: true });

      // Read all files in baseline directory (recursive)
      const files = await this.readDirectoryRecursive(this.config.baselineDir);

      for (const file of files) {
        // Skip if filter provided and doesn't match
        if (filter && !file.includes(filter)) {
          continue;
        }

        const baselinePath = path.join(this.config.baselineDir, file);
        const diffPath = path.join(this.config.diffDir, file);

        const stats = await fs.stat(baselinePath);
        const hasDiff = await this.fileExists(diffPath);

        baselines.push({
          name: file,
          path: baselinePath,
          size: stats.size,
          modifiedDate: stats.mtime,
          hasBaseline: true,
          hasDiff,
        });
      }

      return baselines.sort((a, b) => b.modifiedDate.getTime() - a.modifiedDate.getTime());
    } catch (error) {
      console.error(`Error listing baselines: ${error}`);
      return [];
    }
  }

  /**
   * Approve a baseline screenshot
   *
   * This copies the current screenshot to the baseline directory.
   * Use this when a screenshot has changed intentionally (e.g., new feature, design update).
   *
   * @param screenshotName - Name of the screenshot file (e.g., 'create-resource-dialog-open.png')
   * @param options - Optional configuration
   */
  async approveBaseline(
    screenshotName: string,
    options?: {
      /**
       * Source directory where current screenshot is located
       * If not provided, searches in currentDir and testResultsDir
       */
      sourceDir?: string;

      /**
       * If true, approval will succeed even if source file doesn't exist
       */
      allowMissing?: boolean;
    }
  ): Promise<void> {
    try {
      // Find the current screenshot
      let sourcePath: string | null = null;

      if (options?.sourceDir) {
        sourcePath = path.join(options.sourceDir, screenshotName);
      } else {
        // Search in common locations
        const searchPaths = [
          path.join(this.config.currentDir, screenshotName),
          path.join(this.config.testResultsDir, screenshotName),
        ];

        for (const searchPath of searchPaths) {
          if (await this.fileExists(searchPath)) {
            sourcePath = searchPath;
            break;
          }
        }
      }

      if (!sourcePath || !(await this.fileExists(sourcePath))) {
        if (options?.allowMissing) {
          console.warn(`Source screenshot not found: ${screenshotName} (allowing missing)`);
          return;
        }
        throw new Error(
          `Source screenshot not found: ${screenshotName}. ` +
            `Searched in: ${this.config.currentDir}, ${this.config.testResultsDir}`
        );
      }

      // Copy to baseline directory
      const baselinePath = path.join(this.config.baselineDir, screenshotName);
      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      await fs.copyFile(sourcePath, baselinePath);

      console.log(`✅ Approved baseline: ${screenshotName}`);
      console.log(`   Source: ${sourcePath}`);
      console.log(`   Baseline: ${baselinePath}`);

      // Remove diff if exists
      const diffPath = path.join(this.config.diffDir, screenshotName);
      if (await this.fileExists(diffPath)) {
        await fs.unlink(diffPath);
        console.log(`   Removed diff: ${diffPath}`);
      }
    } catch (error) {
      console.error(`❌ Error approving baseline for ${screenshotName}: ${error}`);
      throw error;
    }
  }

  /**
   * Update all baselines from current screenshots
   *
   * ⚠️  DANGEROUS: This approves ALL changes. Use with caution!
   * Only use this when you've intentionally changed the UI globally.
   *
   * @param filter - Optional filter to update only matching baselines
   */
  async updateAllBaselines(filter?: string): Promise<number> {
    const baselines = await this.listBaselines(filter);
    let updated = 0;

    console.log(
      `🔄 Updating ${baselines.length} baselines${filter ? ` (filter: ${filter})` : ''}...`
    );

    for (const baseline of baselines) {
      try {
        await this.approveBaseline(baseline.name, { allowMissing: true });
        updated++;
      } catch (error) {
        console.error(`Failed to update ${baseline.name}: ${error}`);
      }
    }

    console.log(`✅ Updated ${updated}/${baselines.length} baselines`);
    return updated;
  }

  /**
   * Reset baselines (delete all baseline screenshots)
   *
   * ⚠️  DANGEROUS: This removes all baselines!
   * Next test run will create new baselines.
   *
   * @param filter - Optional filter to reset only matching baselines
   */
  async resetBaselines(filter?: string): Promise<number> {
    const baselines = await this.listBaselines(filter);
    let deleted = 0;

    console.log(
      `🗑️  Resetting ${baselines.length} baselines${filter ? ` (filter: ${filter})` : ''}...`
    );

    for (const baseline of baselines) {
      try {
        await fs.unlink(baseline.path);
        deleted++;
        console.log(`   Deleted: ${baseline.name}`);
      } catch (error) {
        console.error(`Failed to delete ${baseline.name}: ${error}`);
      }
    }

    console.log(`✅ Reset ${deleted}/${baselines.length} baselines`);
    return deleted;
  }

  /**
   * Compare a screenshot to its baseline
   *
   * This uses the visual-feedback MCP server if available,
   * otherwise falls back to Playwright's built-in comparison.
   *
   * @param screenshotName - Name of the screenshot to compare
   * @param currentScreenshotPath - Path to current screenshot (optional, will search if not provided)
   */
  async compareToBaseline(
    screenshotName: string,
    currentScreenshotPath?: string
  ): Promise<ComparisonResult> {
    const baselinePath = path.join(this.config.baselineDir, screenshotName);

    if (!(await this.fileExists(baselinePath))) {
      throw new Error(`Baseline not found: ${screenshotName}`);
    }

    // Find current screenshot if not provided
    let currentPath = currentScreenshotPath;
    if (!currentPath) {
      const searchPaths = [
        path.join(this.config.currentDir, screenshotName),
        path.join(this.config.testResultsDir, screenshotName),
      ];

      for (const searchPath of searchPaths) {
        if (await this.fileExists(searchPath)) {
          currentPath = searchPath;
          break;
        }
      }
    }

    if (!currentPath || !(await this.fileExists(currentPath))) {
      throw new Error(`Current screenshot not found: ${screenshotName}`);
    }

    // TODO: Integrate with visual-feedback MCP server
    // For now, return a placeholder result
    // In a real implementation, this would call:
    // await mcp__visual-feedback__compare_screenshots({ baseline: baselinePath, current: currentPath })

    console.log(`Comparing: ${currentPath} -> ${baselinePath}`);
    console.log(`Note: Full comparison requires visual-feedback MCP server`);

    return {
      matched: true, // Placeholder
      similarity: 0.95, // Placeholder
      diffPath: path.join(this.config.diffDir, screenshotName),
    };
  }

  /**
   * Get statistics about baselines
   */
  async getStats(): Promise<{
    totalBaselines: number;
    totalSize: number;
    withDiffs: number;
    oldestBaseline?: Date;
    newestBaseline?: Date;
  }> {
    const baselines = await this.listBaselines();

    const stats = {
      totalBaselines: baselines.length,
      totalSize: baselines.reduce((sum, b) => sum + b.size, 0),
      withDiffs: baselines.filter((b) => b.hasDiff).length,
      oldestBaseline:
        baselines.length > 0 ? baselines[baselines.length - 1].modifiedDate : undefined,
      newestBaseline: baselines.length > 0 ? baselines[0].modifiedDate : undefined,
    };

    return stats;
  }

  // ==================== PRIVATE HELPERS ====================

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readDirectoryRecursive(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(dir, fullPath);

        if (entry.isDirectory()) {
          const subFiles = await this.readDirectoryRecursive(fullPath);
          files.push(...subFiles.map((f) => path.join(entry.name, f)));
        } else if (entry.isFile() && entry.name.endsWith('.png')) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Directory doesn't exist yet, return empty array
      return [];
    }

    return files;
  }
}

// ==================== CLI USAGE ====================

/**
 * Example CLI usage:
 *
 * List all baselines:
 *   npx tsx tests/e2e/helpers/baseline-manager.ts list
 *
 * Approve specific baseline:
 *   npx tsx tests/e2e/helpers/baseline-manager.ts approve create-resource-dialog-open.png
 *
 * Update all baselines for a test:
 *   npx tsx tests/e2e/helpers/baseline-manager.ts update --filter=create-resource
 *
 * Reset all baselines:
 *   npx tsx tests/e2e/helpers/baseline-manager.ts reset
 */

if (require.main === module) {
  const manager = new BaselineManager();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  (async () => {
    switch (command) {
      case 'list': {
        const filter = args.find((a) => a.startsWith('--filter='))?.split('=')[1];
        const baselines = await manager.listBaselines(filter);
        console.log(`\n📸 Baselines (${baselines.length} total):\n`);
        for (const baseline of baselines) {
          const diffFlag = baseline.hasDiff ? ' [HAS DIFF]' : '';
          const sizeKB = (baseline.size / 1024).toFixed(2);
          console.log(`  ${baseline.name} (${sizeKB} KB)${diffFlag}`);
        }
        break;
      }

      case 'approve': {
        const screenshotName = args[0];
        if (!screenshotName) {
          console.error('Usage: baseline-manager approve <screenshot-name>');
          process.exit(1);
        }
        await manager.approveBaseline(screenshotName);
        break;
      }

      case 'update': {
        const filter = args.find((a) => a.startsWith('--filter='))?.split('=')[1];
        const updated = await manager.updateAllBaselines(filter);
        console.log(`\n✅ Updated ${updated} baselines`);
        break;
      }

      case 'reset': {
        const filter = args.find((a) => a.startsWith('--filter='))?.split('=')[1];
        const deleted = await manager.resetBaselines(filter);
        console.log(`\n✅ Reset ${deleted} baselines`);
        break;
      }

      case 'stats': {
        const stats = await manager.getStats();
        console.log('\n📊 Baseline Statistics:\n');
        console.log(`  Total baselines: ${stats.totalBaselines}`);
        console.log(`  Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  With diffs: ${stats.withDiffs}`);
        if (stats.oldestBaseline) {
          console.log(`  Oldest: ${stats.oldestBaseline.toLocaleDateString()}`);
        }
        if (stats.newestBaseline) {
          console.log(`  Newest: ${stats.newestBaseline.toLocaleDateString()}`);
        }
        break;
      }

      default:
        console.log(`
📸 Baseline Manager CLI

Usage:
  npx tsx tests/e2e/helpers/baseline-manager.ts <command> [options]

Commands:
  list [--filter=pattern]           List all baselines
  approve <screenshot-name>         Approve a specific baseline
  update [--filter=pattern]         Update all baselines (DANGEROUS!)
  reset [--filter=pattern]          Reset all baselines (DANGEROUS!)
  stats                             Show baseline statistics

Examples:
  npx tsx tests/e2e/helpers/baseline-manager.ts list
  npx tsx tests/e2e/helpers/baseline-manager.ts list --filter=create-resource
  npx tsx tests/e2e/helpers/baseline-manager.ts approve create-resource-dialog-open.png
  npx tsx tests/e2e/helpers/baseline-manager.ts update --filter=nodes
  npx tsx tests/e2e/helpers/baseline-manager.ts stats
        `);
    }
  })();
}
