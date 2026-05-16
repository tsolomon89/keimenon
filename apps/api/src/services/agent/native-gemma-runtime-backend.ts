import { LocalInferenceStatus } from '@keimenon/types';
import { spawn } from 'child_process';
import * as path from 'path';

export class NativeGemmaRuntimeBackend {
  public async checkStatus(): Promise<LocalInferenceStatus> {
    return new Promise((resolve) => {
      try {
        const helperPath = path.resolve(__dirname, '../../../../inference-helper/dist/index.js');
        const helper = spawn('node', [helperPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let resolved = false;

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
              }
            }
          } catch (e) {
            // ignore parse errors for now
          }
        });

        helper.on('error', () => {
          if (!resolved) {
            resolved = true;
            resolve(this.getFallbackStatus());
          }
        });

        helper.on('exit', () => {
          if (!resolved) {
            resolved = true;
            resolve(this.getFallbackStatus());
          }
        });

        // Send status request
        helper.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'status', id: 1 }) + '\n');

        // Timeout after 2 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            helper.kill();
            resolve(this.getFallbackStatus());
          }
        }, 2000);
      } catch (err) {
        resolve(this.getFallbackStatus());
      }
    });
  }

  private getFallbackStatus(): LocalInferenceStatus {
    return {
      model_family: 'gemma',
      preferred_backend: 'native-gemma',
      state: 'runtime_unimplemented',
      can_run_offline: true,
      requires_admin: false,
      model_id: null,
      message: 'Failed to launch native helper process.',
      next_actions: [],
    };
  }
}

export const nativeGemmaBackend = new NativeGemmaRuntimeBackend();
