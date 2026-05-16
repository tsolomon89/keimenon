import { LocalInferenceStatus } from '@keimenon/types';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { modelManager } from './model-manager';
import { CandidateNotFoundError } from './errors';

export class NativeGemmaRuntimeBackend {
  private helper: ChildProcess | null = null;
  private pendingRequests: Map<
    number,
    { resolve: (res: any) => void; reject: (err: any) => void }
  > = new Map();
  private nextId = 1;

  private resolveHelperPath(): string | null {
    if (
      process.env.KEIMENON_INFERENCE_HELPER_PATH &&
      fs.existsSync(process.env.KEIMENON_INFERENCE_HELPER_PATH)
    ) {
      return process.env.KEIMENON_INFERENCE_HELPER_PATH;
    }

    const devPath = path.resolve(__dirname, '../../../../inference-helper/dist/index.js');
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    return null;
  }

  private async getOrStartHelper(): Promise<ChildProcess> {
    if (this.helper) return this.helper;

    const helperPath = this.resolveHelperPath();
    if (!helperPath) {
      throw new Error('Helper path not found');
    }

    const isJs = helperPath.endsWith('.js');
    const command = isJs ? process.execPath : helperPath;
    const args = isJs ? [helperPath] : [];

    this.helper = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    this.helper.stderr?.on('data', (data) => {
      console.error(`[NativeHelper] STDERR: ${data}`);
    });

    this.helper.stdout?.on('data', (data) => {
      const lines = data
        .toString()
        .split('\n')
        .filter((l: string) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const res = JSON.parse(line);
          if (res.id !== undefined && this.pendingRequests.has(res.id)) {
            const { resolve, reject } = this.pendingRequests.get(res.id)!;
            this.pendingRequests.delete(res.id);
            if (!res.ok && res.error) {
              reject(new Error(`[Helper Error] ${res.error.code}: ${res.error.message}`));
            } else if (res.error) {
              // fallback for old format
              reject(res.error);
            } else {
              resolve(res.result);
            }
          }
        } catch (e: any) {
          console.error(`[NativeHelper] JSON Parse Error on stdout: ${e.message}`, line);
        }
      }
    });

    this.helper.on('exit', () => {
      this.helper = null;
      for (const req of this.pendingRequests.values()) {
        req.reject(new Error('Helper process exited'));
      }
      this.pendingRequests.clear();
    });

    return this.helper;
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    try {
      const helper = await this.getOrStartHelper();
      const id = this.nextId++;
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });
        helper.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\n');

        // Timeout
        setTimeout(
          () => {
            if (this.pendingRequests.has(id)) {
              this.pendingRequests.delete(id);
              if (this.helper) {
                console.error(`[NativeHelper] Request timeout. Killing helper process.`);
                this.helper.kill();
                this.helper = null;
              }
              reject(new Error(`Helper request ${method} timed out`));
            }
          },
          parseInt(process.env.KEIMENON_INFERENCE_HELPER_TIMEOUT_MS || '5000', 10)
        );
      });
    } catch (e: any) {
      throw new Error(`Failed to send request to helper: ${e.message}`);
    }
  }

  private async getAbsolutePathForCandidate(candidateId: string): Promise<string> {
    const manifest = await modelManager.getManifestByCandidateId(candidateId);
    if (!manifest) throw new CandidateNotFoundError(candidateId);
    if (!manifest.local_path) throw new Error('Candidate has no local path');

    // Safety check reusing verifyModelFile logic
    const verification = await modelManager.verifyModelFile({ candidate_id: candidateId });
    if (!verification.verified && verification.verification_status !== 'presence_verified') {
      throw new Error('Candidate file is not verified or present');
    }

    const baseDir = modelManager.getModelDirectory();
    return path.resolve(baseDir, manifest.local_path);
  }

  public async validateModel(candidateId: string): Promise<any> {
    const absPath = await this.getAbsolutePathForCandidate(candidateId);
    return this.sendRequest('validate_model', { model_path: absPath });
  }

  public async loadModel(candidateId: string): Promise<any> {
    const absPath = await this.getAbsolutePathForCandidate(candidateId);
    return this.sendRequest('load_model', { model_path: absPath });
  }

  public async getHelperStatus(): Promise<any> {
    const res = await this.sendRequest('status');
    return {
      ...res,
      platform: os.platform(),
      arch: os.arch(),
      helper_path: this.resolveHelperPath(),
    };
  }

  public async checkStatus(): Promise<LocalInferenceStatus> {
    try {
      const res = await this.getHelperStatus();
      return {
        model_family: 'gemma',
        preferred_backend: 'native-gemma',
        state: res.state || 'runtime_unimplemented',
        can_run_offline: true,
        requires_admin: false,
        model_id: null,
        message: res.message || 'Keimenon native local Gemma runtime check failed.',
        next_actions: [],
      };
    } catch (err: any) {
      if (err.message.includes('Helper path not found')) {
        return this.getMissingStatus();
      }
      return this.getErrorStatus(`Exception in checkStatus: ${err.message}`);
    }
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
