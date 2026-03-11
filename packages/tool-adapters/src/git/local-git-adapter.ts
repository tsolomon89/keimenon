/**
 * Local Git Adapter
 *
 * Provides file + commit operations against a local git working tree.
 */

import type { GitAdapter } from '@keimenon/agent-core';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

export interface LocalGitConfig {
  repoRoot?: string;
  gitCommand?: string;
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Required<LocalGitConfig> = {
  repoRoot: resolve(process.env.TOOL_GIT_REPO_ROOT || process.cwd()),
  gitCommand: process.env.TOOL_GIT_CMD || 'git',
  timeoutMs: Number.parseInt(process.env.TOOL_GIT_TIMEOUT_MS || '20000', 10),
};

function ensurePathInsideRoot(root: string, filePath: string): string {
  const absoluteRoot = resolve(root);
  const absoluteTarget = resolve(absoluteRoot, filePath);
  const prefix = absoluteRoot.endsWith(sep) ? absoluteRoot : `${absoluteRoot}${sep}`;
  if (absoluteTarget !== absoluteRoot && !absoluteTarget.startsWith(prefix)) {
    throw new Error(`Path escapes repository root: ${filePath}`);
  }
  return absoluteTarget;
}

export class LocalGitAdapter implements GitAdapter {
  private readonly config: Required<LocalGitConfig>;
  private available = false;
  private unavailableReason: string | null = null;

  constructor(config: LocalGitConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.refresh().catch(() => {
      // Adapter remains unavailable until next successful refresh.
    });
  }

  isAvailable(): boolean {
    return this.available;
  }

  getProvider(): string {
    return 'local-git';
  }

  getUnavailableReason(): string | undefined {
    return this.unavailableReason || undefined;
  }

  async refresh(): Promise<void> {
    try {
      await this.runGit(['--version']);
      const insideWorkTree = await this.runGit(['rev-parse', '--is-inside-work-tree']);
      if (insideWorkTree.stdout.trim() !== 'true') {
        throw new Error('Not inside a git working tree');
      }
      this.available = true;
      this.unavailableReason = null;
    } catch (error: any) {
      this.available = false;
      this.unavailableReason = error?.message || String(error);
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const target = ensurePathInsideRoot(this.config.repoRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }

  async readFile(path: string): Promise<string | null> {
    const target = ensurePathInsideRoot(this.config.repoRoot, path);
    try {
      await access(target, constants.F_OK);
      return await readFile(target, 'utf8');
    } catch {
      return null;
    }
  }

  async commit(message: string): Promise<string> {
    await this.runGit(['add', '-A']);

    // Commit can fail when there are no staged changes; return current head in that case.
    try {
      await this.runGit(['commit', '--no-gpg-sign', '-m', message]);
    } catch (error: any) {
      const text = String(error?.message || '');
      if (!text.includes('nothing to commit') && !text.includes('no changes added to commit')) {
        throw error;
      }
    }

    return this.getHead();
  }

  async getHead(): Promise<string> {
    const result = await this.runGit(['rev-parse', 'HEAD']);
    return result.stdout.trim();
  }

  private async runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(this.config.gitCommand, args, {
        cwd: this.config.repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGKILL');
        rejectPromise(new Error(`git ${args.join(' ')} timed out`));
      }, this.config.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        rejectPromise(error);
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if ((code ?? -1) !== 0) {
          rejectPromise(new Error(stderr.trim() || stdout.trim() || 'git command failed'));
          return;
        }
        resolvePromise({ stdout, stderr });
      });
    });
  }
}
