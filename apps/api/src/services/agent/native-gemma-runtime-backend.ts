import { LocalInferenceState, LocalInferenceStatus } from '@keimenon/types';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { StringDecoder } from 'string_decoder';
import { modelManager } from './model-manager';
import { CandidateNotFoundError } from './errors';

interface PendingRequestEntry {
  resolve: (res: any) => void;
  reject: (err: any) => void;
  timer?: NodeJS.Timeout;
}

export class NativeGemmaRuntimeBackend {
  private helper: ChildProcess | null = null;
  private pendingRequests: Map<number, PendingRequestEntry> = new Map();
  private nextId = 1;
  private stdoutBuffer = '';
  private stdoutDecoder = new StringDecoder('utf8');
  private loadedCandidateId: string | null = null;

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

  public handleStdoutLine(line: string): void {
    try {
      const res = JSON.parse(line);
      if (res.id !== undefined && this.pendingRequests.has(res.id)) {
        const entry = this.pendingRequests.get(res.id)!;
        this.pendingRequests.delete(res.id);
        if (entry.timer) {
          clearTimeout(entry.timer);
        }
        if (!res.ok && res.error) {
          entry.reject(new Error(`[Helper Error] ${res.error.code}: ${res.error.message}`));
        } else if (res.error) {
          // fallback for old format
          entry.reject(res.error);
        } else {
          entry.resolve(res.result);
        }
      }
    } catch (e: any) {
      console.error(`[NativeHelper] JSON Parse Error on stdout line: ${e.message}`, line);
    }
  }

  public processStdoutChunk(chunk: Buffer | string): void {
    if (typeof chunk === 'string') {
      this.stdoutBuffer += chunk;
    } else {
      this.stdoutBuffer += this.stdoutDecoder.write(chunk);
    }
    let newlineIndex: number;
    while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      this.handleStdoutLine(line);
    }

    // Bounded buffer protection: prevent memory leak if malformed output lacks newlines
    if (this.stdoutBuffer.length > 10 * 1024 * 1024) {
      console.error(
        '[NativeHelper] Stdout buffer exceeded 10MB limit without newline delimiter. Clearing buffer.'
      );
      this.stdoutBuffer = '';
    }
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

    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    };

    this.helper = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      env,
    });

    this.stdoutBuffer = '';
    this.stdoutDecoder = new StringDecoder('utf8');

    this.helper.stderr?.on('data', (data) => {
      console.error(`[NativeHelper] STDERR: ${data}`);
    });

    this.helper.stdout?.on('data', (chunk: Buffer) => {
      this.processStdoutChunk(chunk);
    });

    this.helper.on('error', (err) => {
      console.error(`[NativeHelper] Process error: ${err.message}`);
    });

    this.helper.on('exit', (code, signal) => {
      console.error(`[NativeHelper] Helper exited with code=${code} signal=${signal}`);
      this.helper = null;
      this.loadedCandidateId = null;
      this.stdoutBuffer = '';
      for (const req of this.pendingRequests.values()) {
        if (req.timer) {
          clearTimeout(req.timer);
        }
        req.reject(new Error(`Helper process exited (code=${code}, signal=${signal})`));
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
          : parseInt(process.env.KEIMENON_INFERENCE_HELPER_TIMEOUT_MS || '15000', 10);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            const entry = this.pendingRequests.get(id);
            this.pendingRequests.delete(id);
            if (this.helper) {
              console.error(
                `[NativeHelper] Request timeout (${effectiveTimeout}ms) for ${method}. Killing helper process.`
              );
              this.helper.kill();
              this.helper = null;
            }
            if (entry) {
              entry.reject(new Error(`Helper request ${method} timed out`));
            }
          }
        }, effectiveTimeout);

        this.pendingRequests.set(id, { resolve, reject, timer });
        helper.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\n');
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
    return this.sendRequest('validate_model', { model_path: absPath }, 30000);
  }

  public async loadModel(candidateId: string): Promise<any> {
    const absPath = await this.getAbsolutePathForCandidate(candidateId);
    const loadTimeoutMs = parseInt(process.env.GEMMA_LOCAL_LOAD_TIMEOUT_MS || '60000', 10);
    const res = await this.sendRequest('load_model', { model_path: absPath }, loadTimeoutMs);
    if (res && (res.success === true || res.ok === true)) {
      this.loadedCandidateId = candidateId;
    }
    return res;
  }

  public async unloadModel(): Promise<void> {
    try {
      await this.sendRequest('unload_model', undefined, 15000);
    } finally {
      this.loadedCandidateId = null;
    }
  }

  public getLoadedCandidateId(): string | null {
    return this.loadedCandidateId;
  }

  public async getLoadedModelInfo(): Promise<{
    model_id: string | null;
    candidate_id: string | null;
    checksum: string | null;
  }> {
    if (!this.loadedCandidateId) {
      return { model_id: null, candidate_id: null, checksum: null };
    }
    try {
      const manifest = await modelManager.getManifestByCandidateId(this.loadedCandidateId);
      return {
        model_id: manifest?.model_id || this.loadedCandidateId,
        candidate_id: this.loadedCandidateId,
        checksum: manifest?.checksum || null,
      };
    } catch (_) {
      return {
        model_id: this.loadedCandidateId,
        candidate_id: this.loadedCandidateId,
        checksum: null,
      };
    }
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

      let observedModelId: string | null = null;
      if (res.state === 'model_loaded' && this.loadedCandidateId) {
        try {
          const manifest = await modelManager.getManifestByCandidateId(this.loadedCandidateId);
          observedModelId = manifest?.model_id || this.loadedCandidateId;
        } catch (_) {
          observedModelId = this.loadedCandidateId;
        }
      }

      let resolvedState: LocalInferenceState =
        (res.state as LocalInferenceState) || 'runtime_unimplemented';
      if (res.state === 'runtime_dependency_found') {
        try {
          const models = await modelManager.getInstalledModels();
          const hasInstalled = models.some(
            (m) =>
              m.installed ||
              m.verification_status === 'verified' ||
              m.verification_status === 'presence_verified'
          );
          resolvedState = hasInstalled ? 'ready' : 'model_missing';
        } catch (_) {
          resolvedState = 'ready';
        }
      }

      return {
        model_family: 'gemma',
        preferred_backend: 'native-gemma',
        state: resolvedState,
        can_run_offline: true,
        requires_admin: false,
        model_id: observedModelId,
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
