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

  private async sendRequest(method: string, params?: any, timeoutMs?: number): Promise<any> {
    try {
      const helper = await this.getOrStartHelper();
      const id = this.nextId++;
      const effectiveTimeout =
        timeoutMs !== undefined
          ? timeoutMs
          : parseInt(process.env.KEIMENON_INFERENCE_HELPER_TIMEOUT_MS || '5000', 10);
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, { resolve, reject });
        helper.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\n');

        // Timeout
        setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            if (this.helper) {
              console.error(`[NativeHelper] Request timeout. Killing helper process.`);
              this.helper.kill();
              this.helper = null;
            }
            reject(new Error(`Helper request ${method} timed out`));
          }
        }, effectiveTimeout);
      });
    } catch (e: any) {
      throw new Error(`Failed to send request to helper: ${e.message}`);
    }
  }

  public async ensureModelLoaded(): Promise<void> {
    try {
      const status = await this.getHelperStatus();
      if (status.state === 'model_loaded') {
        return;
      }
    } catch (_) {
      // If status check fails or model not yet loaded, proceed to attempt load
    }

    const models = await modelManager.getInstalledModels();
    const candidate = models.find(
      (m) =>
        m.installed ||
        m.verification_status === 'verified' ||
        m.verification_status === 'presence_verified'
    );

    if (!candidate || !candidate.candidate_id) {
      throw new Error(
        'GEMMA_MODEL_NOT_FOUND: No verified local Gemma model candidate is installed.'
      );
    }

    const loadRes = await this.loadModel(candidate.candidate_id);
    if (!loadRes.success) {
      throw new Error(
        `GEMMA_LOCAL_RUNTIME_UNAVAILABLE: Failed to load model ${candidate.candidate_id}: ${loadRes.message}`
      );
    }
  }

  public async generate(
    prompt: string,
    maxTokens?: number
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    await this.ensureModelLoaded();
    const timeoutMs = parseInt(process.env.GEMMA_LOCAL_TIMEOUT_MS || '60000', 10);
    return this.sendRequest('generate', { prompt, max_tokens: maxTokens }, timeoutMs);
  }

  public async cancel(): Promise<void> {
    return this.sendRequest('cancel', undefined, 5000);
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
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    return {
      ...res,
      platform: os.platform(),
      arch: os.arch(),
      helper_path: this.resolveHelperPath(),
      telemetry: {
        total_memory_bytes: totalMem,
        free_memory_bytes: freeMem,
        memory_used_percent: memPercent,
        cpu_cores: os.cpus().length,
      },
    };
  }

  public async checkStatus(): Promise<LocalInferenceStatus> {
    try {
      const res = await this.getHelperStatus();
      const next_actions: any[] = [];

      if (res.telemetry?.memory_used_percent > 90) {
        next_actions.push({
          id: 'hardware-warning-ram',
          label: 'System RAM Constrained',
          description: `Your system is utilizing ${res.telemetry.memory_used_percent}% of its RAM. Local inference may be slow or unresponsive.`,
          requires_user_confirmation: false,
          action_type: 'run_check',
        });
      }

      return {
        model_family: 'gemma',
        preferred_backend: 'native-gemma',
        state: res.state || 'runtime_unimplemented',
        can_run_offline: true,
        requires_admin: false,
        model_id: null,
        message: res.message || 'Keimenon native local Gemma runtime check failed.',
        next_actions,
      };
    } catch (err: any) {
      if (err.message.includes('Helper path not found')) {
        return this.getMissingStatus();
      }
      if (err.message.includes('RUNTIME_UNIMPLEMENTED')) {
        const cleanMsg = err.message.split(':').slice(1).join(':').trim() || 'Not implemented';
        return {
          model_family: 'gemma',
          preferred_backend: 'native-gemma',
          state: 'runtime_unimplemented',
          can_run_offline: true,
          requires_admin: false,
          model_id: null,
          message: cleanMsg,
          next_actions: [],
        };
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
