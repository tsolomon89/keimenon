import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunkedUpload } from '../useChunkedUpload';

const { mockApiClient, mockAuthenticatedFetch } = vi.hoisted(() => ({
  mockApiClient: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
  mockAuthenticatedFetch: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
  authenticatedFetch: mockAuthenticatedFetch,
}));

vi.mock('@/contexts/AuthContext', () => ({
  getToken: vi.fn(() => 'test_token'),
}));

function createLargeFile(name: string, sizeInMb: number): File {
  const size = sizeInMb * 1024 * 1024;
  const blob = new Blob([new ArrayBuffer(size)], { type: 'application/json' });
  return new File([blob], name, { type: 'application/json' });
}

function createAbortAwareUploadResponse(delayMs: number) {
  return (_url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      const timer = setTimeout(() => {
        resolve({
          ok: true,
          json: async () => ({ success: true }),
        } as Response);
      }, delayMs);

      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        },
        { once: true }
      );
    });
}

describe('useChunkedUpload pause/resume hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns paused state without stale closure when pause is triggered mid-upload', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        session: {
          id: 'upl_pause',
          totalChunks: 2,
          fileName: 'pause.json',
          fileSize: 20 * 1024 * 1024,
          chunkSize: 10 * 1024 * 1024,
          expiresAt: Date.now() + 60_000,
          status: 'uploading',
        },
      },
    });
    mockAuthenticatedFetch.mockImplementation(createAbortAwareUploadResponse(150));

    const { result } = renderHook(() => useChunkedUpload());
    const file = createLargeFile('pause.json', 20);

    let uploadResult:
      | {
          success: boolean;
          jobId?: string | undefined;
          error?: string | undefined;
        }
      | undefined;

    await act(async () => {
      const uploadPromise = result.current.upload(file);
      await new Promise((resolve) => setTimeout(resolve, 20));
      result.current.pause();
      uploadResult = await uploadPromise;
    });

    expect(uploadResult?.success).toBe(false);
    expect(uploadResult?.error).toContain('paused');
    expect(result.current.isPaused).toBe(true);
  });

  it('resumes upload to terminal completed state and resolves job id from session status', async () => {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        session: {
          id: 'upl_resume',
          totalChunks: 2,
          fileName: 'resume.json',
          fileSize: 20 * 1024 * 1024,
          chunkSize: 10 * 1024 * 1024,
          expiresAt: Date.now() + 60_000,
          status: 'uploading',
        },
      },
    });

    mockAuthenticatedFetch.mockImplementation(createAbortAwareUploadResponse(150));

    const { result } = renderHook(() => useChunkedUpload());
    const file = createLargeFile('resume.json', 20);

    await act(async () => {
      const uploadPromise = result.current.upload(file);
      await new Promise((resolve) => setTimeout(resolve, 20));
      result.current.pause();
      await uploadPromise;
    });

    mockApiClient.get
      .mockResolvedValueOnce({
        data: {
          success: true,
          session: {
            id: 'upl_resume',
            totalChunks: 2,
            chunksUploaded: [0],
            missingChunks: [1],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          session: {
            id: 'upl_resume',
            jobId: 'job_resume_1',
            totalChunks: 2,
            chunksUploaded: [0, 1],
            missingChunks: [],
          },
        },
      });

    mockAuthenticatedFetch.mockReset();
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    let resumeResult:
      | {
          success: boolean;
          jobId?: string | undefined;
          error?: string | undefined;
        }
      | undefined;

    await act(async () => {
      resumeResult = await result.current.resume();
    });

    expect(resumeResult?.success).toBe(true);
    expect(resumeResult?.jobId).toBe('job_resume_1');
    expect(result.current.jobId).toBe('job_resume_1');
    expect(result.current.progress.status).toBe('completed');
    expect(result.current.isPaused).toBe(false);
  });
});
