/**
 * Local Proof Adapter
 *
 * Executes Lean/Coq command-line verification when toolchains are available.
 */

import type { ProofAdapter, ProofResult } from '@keimenon/agent-core';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface LocalProofConfig {
  leanCommand?: string;
  coqCommand?: string;
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Required<LocalProofConfig> = {
  leanCommand: process.env.TOOL_PROOF_LEAN_CMD || 'lean',
  coqCommand: process.env.TOOL_PROOF_COQ_CMD || 'coqc',
  timeoutMs: Number.parseInt(process.env.TOOL_PROOF_TIMEOUT_MS || '90000', 10),
};

function parseProofOutput(
  stderr: string,
  stdout: string
): { errors: string[]; warnings: string[] } {
  const combined = `${stderr}\n${stdout}`.split('\n');
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const line of combined) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (/\berror\b/i.test(trimmed)) {
      errors.push(trimmed);
      continue;
    }
    if (/\bwarn(ing)?\b/i.test(trimmed)) {
      warnings.push(trimmed);
    }
  }

  return { errors, warnings };
}

export class LocalProofAdapter implements ProofAdapter {
  private readonly config: Required<LocalProofConfig>;
  private available = false;
  private unavailableReason: string | null = null;

  constructor(config: LocalProofConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.refresh().catch(() => {
      // Adapter remains unavailable until next successful refresh.
    });
  }

  isAvailable(): boolean {
    return this.available;
  }

  getProvider(): string {
    return 'local-proof-cli';
  }

  getUnavailableReason(): string | undefined {
    return this.unavailableReason || undefined;
  }

  async refresh(): Promise<void> {
    const [leanOk, coqOk] = await Promise.allSettled([
      this.checkCommand(this.config.leanCommand),
      this.checkCommand(this.config.coqCommand),
    ]);

    const failures: string[] = [];
    if (leanOk.status !== 'fulfilled') {
      failures.push('lean unavailable');
    }
    if (coqOk.status !== 'fulfilled') {
      failures.push('coq unavailable');
    }

    // Proof adapter is considered available when at least one prover is present.
    this.available = failures.length < 2;
    this.unavailableReason = this.available ? null : failures.join('; ');
  }

  async checkLean(file: string): Promise<ProofResult> {
    return this.runProofCheck(file, '.lean', this.config.leanCommand, ['--quiet']);
  }

  async checkCoq(file: string): Promise<ProofResult> {
    return this.runProofCheck(file, '.v', this.config.coqCommand, []);
  }

  private async checkCommand(command: string): Promise<void> {
    const result = await this.runProcess(command, ['--version'], 10000);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `${command} check failed`);
    }
  }

  private async runProofCheck(
    input: string,
    suffix: '.lean' | '.v',
    command: string,
    commandArgs: string[]
  ): Promise<ProofResult> {
    const tempRoot = await mkdtemp(join(tmpdir(), 'keimenon-proof-'));
    let cleanupPath = tempRoot;

    try {
      const filePath = await this.resolveProofInputPath(input, suffix, tempRoot);
      cleanupPath = tempRoot;
      const result = await this.runProcess(
        command,
        [...commandArgs, filePath],
        this.config.timeoutMs
      );
      const parsed = parseProofOutput(result.stderr, result.stdout);

      return {
        valid: result.exitCode === 0 && parsed.errors.length === 0,
        errors: parsed.errors,
        warnings: parsed.warnings,
      };
    } catch (error: any) {
      return {
        valid: false,
        errors: [error?.message || String(error)],
        warnings: [],
      };
    } finally {
      await rm(cleanupPath, { recursive: true, force: true }).catch(() => {
        // Best-effort cleanup.
      });
    }
  }

  private async resolveProofInputPath(
    input: string,
    suffix: '.lean' | '.v',
    tempRoot: string
  ): Promise<string> {
    try {
      await access(input, constants.F_OK);
      const existing = await readFile(input, 'utf8');
      if (existing.length > 0) {
        return input;
      }
    } catch {
      // Treat as inline proof source.
    }

    const filePath = join(tempRoot, `proof${suffix}`);
    await writeFile(filePath, input, 'utf8');
    return filePath;
  }

  private async runProcess(
    command: string,
    args: string[],
    timeoutMs: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
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
        reject(new Error(`Proof process timed out after ${timeoutMs}ms`));
      }, timeoutMs);

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
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
        });
      });
    });
  }
}
