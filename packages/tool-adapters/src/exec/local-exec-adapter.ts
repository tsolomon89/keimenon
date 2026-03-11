/**
 * Local Exec Adapter
 *
 * Provides local Python/Node script execution with timeout control.
 */

import type { ExecAdapter, ExecResult } from '@keimenon/agent-core';
import { spawn } from 'node:child_process';

export interface LocalExecConfig {
  pythonCommand?: string;
  nodeCommand?: string;
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Required<LocalExecConfig> = {
  pythonCommand: process.env.TOOL_EXEC_PYTHON_CMD || 'python',
  nodeCommand: process.env.TOOL_EXEC_NODE_CMD || process.execPath,
  timeoutMs: Number.parseInt(process.env.TOOL_EXEC_TIMEOUT_MS || '60000', 10),
};

function resolveSpawnErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class LocalExecAdapter implements ExecAdapter {
  private readonly config: Required<LocalExecConfig>;
  private available = false;
  private unavailableReason: string | null = null;

  constructor(config: LocalExecConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.refresh().catch(() => {
      // Adapter remains unavailable until next successful refresh.
    });
  }

  isAvailable(): boolean {
    return this.available;
  }

  getProvider(): string {
    return 'local-process';
  }

  getUnavailableReason(): string | undefined {
    return this.unavailableReason || undefined;
  }

  async refresh(): Promise<void> {
    const [pythonOk, nodeOk] = await Promise.allSettled([
      this.checkCommand(this.config.pythonCommand, ['--version']),
      this.checkCommand(this.config.nodeCommand, ['--version']),
    ]);

    const failures: string[] = [];
    if (pythonOk.status !== 'fulfilled') {
      failures.push(`python unavailable (${resolveSpawnErrorMessage(pythonOk.reason)})`);
    }
    if (nodeOk.status !== 'fulfilled') {
      failures.push(`node unavailable (${resolveSpawnErrorMessage(nodeOk.reason)})`);
    }

    this.available = failures.length === 0;
    this.unavailableReason = failures.length > 0 ? failures.join('; ') : null;
  }

  async runPython(script: string, args: string[] = []): Promise<ExecResult> {
    return this.runProcess(this.config.pythonCommand, ['-c', script, ...args]);
  }

  async runNode(script: string, args: string[] = []): Promise<ExecResult> {
    return this.runProcess(this.config.nodeCommand, ['-e', script, ...args]);
  }

  private async checkCommand(command: string, args: string[]): Promise<void> {
    const result = await this.runProcess(command, args, {
      timeoutMs: 10000,
      allowNonZeroExit: false,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `${command} check failed`);
    }
  }

  private async runProcess(
    command: string,
    args: string[],
    options?: { timeoutMs?: number; allowNonZeroExit?: boolean }
  ): Promise<ExecResult> {
    const startedAt = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const allowNonZeroExit = options?.allowNonZeroExit ?? true;

    return new Promise<ExecResult>((resolve, reject) => {
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
        reject(new Error(`Process timed out after ${timeoutMs}ms`));
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

        const result: ExecResult = {
          stdout,
          stderr,
          exitCode: code ?? -1,
          duration_ms: Date.now() - startedAt,
        };

        if (!allowNonZeroExit && result.exitCode !== 0) {
          reject(new Error(result.stderr || result.stdout || 'Process exited with non-zero code'));
          return;
        }

        resolve(result);
      });
    });
  }
}
