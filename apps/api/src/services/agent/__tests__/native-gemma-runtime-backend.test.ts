import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nativeGemmaBackend } from '../native-gemma-runtime-backend';
import { modelManager } from '../model-manager';

vi.mock('../model-manager', () => ({
  modelManager: {
    getManifestByCandidateId: vi.fn(),
    verifyModelFile: vi.fn(),
  },
}));

// Mock the private sendRequest method to test the logic wrapper
const mockSendRequest = vi.spyOn(nativeGemmaBackend as any, 'sendRequest').mockResolvedValue({});

describe('NativeGemmaRuntimeBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validateModel checks bounds and sends validate_model', async () => {
    vi.mocked(modelManager.getManifestByCandidateId).mockResolvedValue({
      local_path: 'foo.litertlm',
    } as any);
    vi.mocked(modelManager.verifyModelFile).mockResolvedValue({
      verified: false,
      verification_status: 'presence_verified',
      message: '',
    });

    await nativeGemmaBackend.validateModel('gemma-4-e2b-it-litert');

    expect(modelManager.getManifestByCandidateId).toHaveBeenCalledWith('gemma-4-e2b-it-litert');
    expect(mockSendRequest).toHaveBeenCalledWith(
      'validate_model',
      expect.objectContaining({
        model_path: expect.stringContaining('foo.litertlm'),
      })
    );
  });

  it('loadModel fails if file is not verified', async () => {
    vi.mocked(modelManager.getManifestByCandidateId).mockResolvedValue({
      local_path: 'foo.litertlm',
    } as any);
    vi.mocked(modelManager.verifyModelFile).mockResolvedValue({
      verified: false,
      verification_status: 'failed',
      message: '',
    });

    await expect(nativeGemmaBackend.loadModel('gemma-4-e2b-it-litert')).rejects.toThrow(
      'Candidate file is not verified or present'
    );
  });

  it('loadModel succeeds if file is presence verified', async () => {
    vi.mocked(modelManager.getManifestByCandidateId).mockResolvedValue({
      local_path: 'foo.litertlm',
    } as any);
    vi.mocked(modelManager.verifyModelFile).mockResolvedValue({
      verified: false,
      verification_status: 'presence_verified',
      message: '',
    });

    await nativeGemmaBackend.loadModel('gemma-4-e2b-it-litert');

    expect(mockSendRequest).toHaveBeenCalledWith(
      'load_model',
      expect.objectContaining({
        model_path: expect.stringContaining('foo.litertlm'),
      })
    );
  });
});
