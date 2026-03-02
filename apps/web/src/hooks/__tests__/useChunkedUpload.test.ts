/**
 * useChunkedUpload Hook E2E Tests
 *
 * Tests for the frontend chunked upload hook.
 * Validates complete upload flow from React component to API backend.
 *
 * Related: Chunked Upload System - Phase 7 (Testing)
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mocked,
  type MockedFunction,
} from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChunkedUpload } from '../useChunkedUpload';
import { apiClient } from '@/lib/api-client';

const jest = vi; // Alias for compatibility

// ============================================================================
// Mocks
// ============================================================================

// Mock apiClient
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock fetch for chunk uploads
global.fetch = jest.fn() as unknown as typeof fetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useChunkedUpload Hook (E2E)', () => {
  const mockApiClient = apiClient as Mocked<typeof apiClient>;
  const mockFetch = global.fetch as MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function createMockFile(name: string, sizeInMB: number): File {
    const size = sizeInMB * 1024 * 1024;
    const blob = new Blob([new ArrayBuffer(size)], { type: 'application/json' });
    return new File([blob], name, { type: 'application/json' });
  }

  function mockSuccessfulInitiate(sessionId: string, totalChunks: number) {
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        session: {
          id: sessionId,
          fileName: 'test.json',
          fileSize: totalChunks * 10 * 1024 * 1024,
          chunkSize: 10 * 1024 * 1024,
          totalChunks,
          expiresAt: Date.now() + 4 * 60 * 60 * 1000,
          status: 'uploading',
        },
        jobId: 'job_test123',
      },
    } as any);
  }

  function mockSuccessfulChunkUpload() {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);
  }

  // ============================================================================
  // Basic Upload Flow
  // ============================================================================

  describe('Basic Upload Flow', () => {
    it('should upload a small file successfully', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      const sessionId = 'upl_test123';
      mockSuccessfulInitiate(sessionId, 5);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 50);

      let uploadResult: any;

      await act(async () => {
        uploadResult = await result.current.upload(file);
      });

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.jobId).toBe('job_test123');
      expect(result.current.progress.status).toBe('completed');
      expect(result.current.progress.percentage).toBe(100);
    });

    it('should initialize upload session', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 10);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/uploads/initiate',
        expect.objectContaining({
          fileName: 'test.json',
          fileSize: expect.any(Number),
          mimeType: 'application/json',
          chunkSize: 10 * 1024 * 1024,
        })
      );
    });

    it('should upload all chunks', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 3);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 30);

      await act(async () => {
        await result.current.upload(file);
      });

      // Should upload 3 chunks
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify chunk endpoints
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/uploads/upl_test123/chunks/0'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/uploads/upl_test123/chunks/1'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/uploads/upl_test123/chunks/2'),
        expect.any(Object)
      );
    });

    it('should update progress during upload', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 5);

      // Mock chunk uploads with delay to capture progress
      let chunkCount = 0;
      mockFetch.mockImplementation(async () => {
        chunkCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      });

      const file = createMockFile('test.json', 50);

      await act(async () => {
        await result.current.upload(file);
      });

      // Progress should reach 100%
      expect(result.current.progress.percentage).toBe(100);
      expect(result.current.progress.chunksUploaded).toBe(5);
    });

    it('should track bytes uploaded', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 2);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 20);

      await act(async () => {
        await result.current.upload(file);
      });

      // Should track bytes for both chunks
      expect(result.current.progress.bytesUploaded).toBeGreaterThan(0);
    });

    it('should set session ID after initiation', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 10);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(result.current.sessionId).toBe('upl_test123');
    });

    it('should set job ID after initiation', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 10);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(result.current.jobId).toBe('job_test123');
    });
  });

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  describe('Progress Tracking', () => {
    it('should start with 0% progress', () => {
      const { result } = renderHook(() => useChunkedUpload());

      expect(result.current.progress.percentage).toBe(0);
      expect(result.current.progress.chunksUploaded).toBe(0);
      expect(result.current.progress.status).toBe('idle');
    });

    it('should update status to "uploading" when upload starts', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 10);

      act(() => {
        result.current.upload(file);
      });

      await waitFor(() => {
        expect(result.current.progress.status).toBe('uploading');
      });
    });

    it('should calculate upload speed', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 2);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 20);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(result.current.progress.uploadSpeed).toBeDefined();
      expect(result.current.progress.uploadSpeed).toBeGreaterThan(0);
    });

    it('should estimate time remaining', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 3);

      // Mock chunk uploads with delay
      mockFetch.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      });

      const file = createMockFile('test.json', 30);

      await act(async () => {
        await result.current.upload(file);
      });

      // ETA should be calculated (may be 0 at completion)
      expect(result.current.progress.estimatedTimeRemaining).toBeDefined();
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle initiation error', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'));

      const file = createMockFile('test.json', 10);

      let uploadResult: any;

      await act(async () => {
        uploadResult = await result.current.upload(file);
      });

      expect(uploadResult.success).toBe(false);
      expect(uploadResult.error).toContain('Network error');
      expect(result.current.progress.status).toBe('failed');
    });

    it('should handle chunk upload error', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 2);

      // First chunk succeeds, second fails
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        } as Response)
        .mockRejectedValueOnce(new Error('Chunk upload failed'));

      const file = createMockFile('test.json', 20);

      await act(async () => {
        await result.current.upload(file);
      });

      // Should retry failed chunk up to 3 times
      expect(
        mockFetch.mock.calls.filter((call: any[]) => String(call[0]).includes('chunks/1')).length
      ).toBe(3);
    });

    it('should retry failed chunks', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);

      // Fail first 2 attempts, succeed on 3rd
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        } as Response);

      const file = createMockFile('test.json', 10);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);

      // Fail all attempts
      mockFetch.mockRejectedValue(new Error('Network error'));

      const file = createMockFile('test.json', 10);

      let uploadResult: any;

      await act(async () => {
        uploadResult = await result.current.upload(file);
      });

      expect(uploadResult.success).toBe(false);
      expect(result.current.progress.status).toBe('failed');

      // Should retry 3 times (initial + 2 retries)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should set error message on failure', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockApiClient.post.mockRejectedValueOnce(new Error('Upload initiation failed'));

      const file = createMockFile('test.json', 10);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(result.current.progress.error).toBeDefined();
      expect(result.current.progress.error).toContain('Upload initiation failed');
    });
  });

  // ============================================================================
  // Pause and Resume
  // ============================================================================

  describe('Pause and Resume', () => {
    it('should pause upload', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 5);

      // Mock slow chunk uploads
      mockFetch.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      });

      const file = createMockFile('test.json', 50);

      act(() => {
        result.current.upload(file);
      });

      // Wait a bit then pause
      await new Promise((resolve) => setTimeout(resolve, 50));

      act(() => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(true);
    });

    it('should resume upload', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 3);
      mockSuccessfulChunkUpload();

      // Mock get session status for resume
      mockApiClient.get.mockResolvedValueOnce({
        data: {
          success: true,
          session: {
            id: 'upl_test123',
            totalChunks: 3,
            chunksUploaded: [0], // Already uploaded chunk 0
            missingChunks: [1, 2],
          },
        },
      } as any);

      const file = createMockFile('test.json', 30);

      // Start upload, pause, then resume
      await act(async () => {
        const uploadPromise = result.current.upload(file);
        result.current.pause();
        await result.current.resume();
        await uploadPromise;
      });

      expect(result.current.isPaused).toBe(false);
    });

    it('should save progress to localStorage', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 2);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 20);

      await act(async () => {
        await result.current.upload(file);
      });

      // Check localStorage for saved session
      const savedData = localStorage.getItem('chunked_upload_upl_test123');
      expect(savedData).toBeDefined();

      const parsed = JSON.parse(savedData!);
      expect(parsed.sessionId).toBe('upl_test123');
      expect(parsed.fileName).toBe('test.json');
    });

    it('should clear localStorage on completion', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();

      const file = createMockFile('test.json', 10);

      await act(async () => {
        await result.current.upload(file);
      });

      // Should be cleared after completion
      const savedData = localStorage.getItem('chunked_upload_upl_test123');
      expect(savedData).toBeNull();
    });
  });

  // ============================================================================
  // Cancel Upload
  // ============================================================================

  describe('Cancel Upload', () => {
    it('should cancel upload', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 5);

      // Mock slow chunk uploads
      mockFetch.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      });

      mockApiClient.delete.mockResolvedValueOnce({ data: { success: true } } as any);

      const file = createMockFile('test.json', 50);

      act(() => {
        result.current.upload(file);
      });

      // Wait a bit then cancel
      await new Promise((resolve) => setTimeout(resolve, 50));

      await act(async () => {
        await result.current.cancel();
      });

      expect(result.current.isCanceled).toBe(true);
      expect(result.current.progress.status).toBe('canceled');
    });

    it('should call delete endpoint on cancel', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();
      mockApiClient.delete.mockResolvedValueOnce({ data: { success: true } } as any);

      const file = createMockFile('test.json', 10);

      await act(async () => {
        const uploadPromise = result.current.upload(file);
        await result.current.cancel();
        await uploadPromise.catch(() => {}); // Ignore error
      });

      expect(mockApiClient.delete).toHaveBeenCalledWith('/uploads/upl_test123');
    });

    it('should clear localStorage on cancel', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();
      mockApiClient.delete.mockResolvedValueOnce({ data: { success: true } } as any);

      const file = createMockFile('test.json', 10);

      await act(async () => {
        const uploadPromise = result.current.upload(file);
        await result.current.cancel();
        await uploadPromise.catch(() => {});
      });

      const savedData = localStorage.getItem('chunked_upload_upl_test123');
      expect(savedData).toBeNull();
    });
  });

  // ============================================================================
  // Concurrent Uploads
  // ============================================================================

  describe('Concurrent Uploads', () => {
    it('should upload chunks concurrently', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 10);

      const uploadTimestamps: number[] = [];

      mockFetch.mockImplementation(async () => {
        uploadTimestamps.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      });

      const file = createMockFile('test.json', 100);

      await act(async () => {
        await result.current.upload(file);
      });

      // Should have 10 chunks uploaded
      expect(mockFetch).toHaveBeenCalledTimes(10);

      // First 6 chunks should start within a short time window (concurrent)
      const firstBatch = uploadTimestamps.slice(0, 6);
      const timeSpread = Math.max(...firstBatch) - Math.min(...firstBatch);

      expect(timeSpread).toBeLessThan(50); // Started within 50ms of each other
    });

    it('should respect max concurrent uploads limit (6)', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 12);

      let activeUploads = 0;
      let maxConcurrent = 0;

      mockFetch.mockImplementation(async () => {
        activeUploads++;
        maxConcurrent = Math.max(maxConcurrent, activeUploads);

        await new Promise((resolve) => setTimeout(resolve, 20));

        activeUploads--;

        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      });

      const file = createMockFile('test.json', 120);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(maxConcurrent).toBeLessThanOrEqual(6);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle single chunk file', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();

      const file = createMockFile('tiny.json', 5); // Less than 10MB chunk size

      await act(async () => {
        await result.current.upload(file);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.progress.percentage).toBe(100);
    });

    it('should handle very large file (2GB)', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      const totalChunks = Math.ceil((2 * 1024) / 10); // 2GB / 10MB chunks = ~205 chunks

      mockSuccessfulInitiate('upl_test123', totalChunks);
      mockSuccessfulChunkUpload();

      const file = createMockFile('large.json', 2048); // 2GB

      await act(async () => {
        await result.current.upload(file);
      });

      expect(mockFetch.mock.calls.length).toBe(totalChunks);
    });

    it('should handle special characters in file name', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();

      const fileName = 'test (file) [with] {special} chars & quotes.json';
      const file = createMockFile(fileName, 10);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/uploads/initiate',
        expect.objectContaining({
          fileName,
        })
      );
    });

    it('should handle unicode file name', async () => {
      const { result } = renderHook(() => useChunkedUpload());

      mockSuccessfulInitiate('upl_test123', 1);
      mockSuccessfulChunkUpload();

      const fileName = '测试文件_테스트_ファイル.json';
      const file = createMockFile(fileName, 10);

      await act(async () => {
        await result.current.upload(file);
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/uploads/initiate',
        expect.objectContaining({
          fileName,
        })
      );
    });
  });
});
