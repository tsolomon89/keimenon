import { LocalInferenceStatus } from '@keimenon/types';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class NativeGemmaRuntimeBackend {
  private resolveHelperPath(): string | null {
    // 1. Explicit env var (could be set by user or by Electron main process for packaged resource)
    if (
      process.env.KEIMENON_INFERENCE_HELPER_PATH &&
      fs.existsSync(process.env.KEIMENON_INFERENCE_HELPER_PATH)
    ) {
      return process.env.KEIMENON_INFERENCE_HELPER_PATH;
    }

    // 2. Dev workspace dist path fallback
    const devPath = path.resolve(__dirname, '../../../../inference-helper/dist/index.js');
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    return null;
  }

  public async checkStatus(): Promise<LocalInferenceStatus> {
    return new Promise((resolve) => {
      try {
        const helperPath = this.resolveHelperPath();

        if (!helperPath) {
          resolve(this.getMissingStatus());
          return;
        }

        const isJs = helperPath.endsWith('.js');
        const command = isJs ? process.execPath : helperPath;
        const args = isJs ? [helperPath] : [];

        const helper = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          shell: false,
        });

        let resolved = false;
        let stderrData = '';

        helper.stderr.on('data', (data) => {
          stderrData += data.toString();
        });

        helper.stdout.on('data', (data) => {
          if (resolved) return;
          try {
            const lines = data
              .toString()
              .split('\n')
              .filter((l: string) => l.trim().length > 0);
            for (const line of lines) {
              const res = JSON.parse(line);
              if (res.id === 1 && res.result) {
                resolved = true;
                resolve({
                  model_family: 'gemma',
                  preferred_backend: 'native-gemma',
                  state: res.result.state || 'runtime_unimplemented',
                  can_run_offline: true,
                  requires_admin: false,
                  model_id: null,
                  message:
                    res.result.message || 'Keimenon native local Gemma runtime check failed.',
                  next_actions: [],
                });
                helper.stdin.write(
                  JSON.stringify({ jsonrpc: '2.0', method: 'shutdown', id: 2 }) + '\n'
                );
                return;
              } else if (res.id === 1 && res.error) {
                resolved = true;
                resolve({
                  model_family: 'gemma',
                  preferred_backend: 'native-gemma',
                  state:
                    res.error.code === 'RUNTIME_UNIMPLEMENTED' ? 'runtime_unimplemented' : 'error',
                  can_run_offline: true,
                  requires_admin: false,
                  model_id: null,
                  message: res.error.message || 'Helper returned an error',
                  next_actions: [],
                });
                helper.stdin.write(
                  JSON.stringify({ jsonrpc: '2.0', method: 'shutdown', id: 2 }) + '\n'
                );
                return;
              }
            }
          } catch (e) {
            // ignore parse errors for now
          }
        });

        helper.on('error', (err) => {
          if (!resolved) {
            resolved = true;
            resolve(this.getErrorStatus(`Failed to launch native helper: ${err.message}`));
          }
        });

        helper.on('exit', (code) => {
          if (!resolved) {
            resolved = true;
            resolve(
              this.getErrorStatus(`Helper exited unexpectedly with code ${code}. ${stderrData}`)
            );
          }
        });

        // Send status request
        helper.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'status', id: 1 }) + '\n');

        const timeoutMs = parseInt(process.env.KEIMENON_INFERENCE_HELPER_TIMEOUT_MS || '2000', 10);

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            helper.kill();
            resolve(this.getErrorStatus('Helper process timed out.'));
          }
        }, timeoutMs);
      } catch (err: any) {
        resolve(this.getErrorStatus(`Exception in checkStatus: ${err.message}`));
      }
    });
  }

  private getMissingStatus(): LocalInferenceStatus {
    return {
      model_family: 'gemma',
      preferred_backend: 'native-gemma',
      state: 'runtime_missing',
      can_run_offline: true,
      requires_admin: false,
      model_id: null,
      message: 'Native helper process not found.',
      next_actions: [],
    };
  }

  private getErrorStatus(message: string): LocalInferenceStatus {
    return {
      model_family: 'gemma',
      preferred_backend: 'native-gemma',
      state: 'error',
      can_run_offline: true,
      requires_admin: false,
      model_id: null,
      message,
      next_actions: [],
    };
  }
}

export const nativeGemmaBackend = new NativeGemmaRuntimeBackend();
