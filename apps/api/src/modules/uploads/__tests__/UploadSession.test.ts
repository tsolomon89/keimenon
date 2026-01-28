/**
 * UploadSession Domain Model Tests
 *
 * Tests for the UploadSession aggregate root.
 * Validates business rules, invariants, and state transitions.
 *
 * Related: Chunked Upload System - Phase 7 (Testing)
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { UploadSession, UploadSessionSpec } from '../domain/UploadSession';

describe('UploadSession Domain Model', () => {
  let sessionSpec: UploadSessionSpec;

  beforeEach(() => {
    sessionSpec = {
      accountId: 'acc_test123',
      userId: 'usr_test456',
      jobId: 'job_test789',
      fileName: 'test-file.json',
      fileSize: 50 * 1024 * 1024, // 50MB
      mimeType: 'application/json',
      chunkSize: 10 * 1024 * 1024, // 10MB
    };
  });

  describe('create()', () => {
    it('should create a new upload session with correct properties', () => {
      const session = UploadSession.create(sessionSpec);

      expect(session.id).toMatch(/^upl_/);
      expect(session.accountId).toBe('acc_test123');
      expect(session.userId).toBe('usr_test456');
      expect(session.jobId).toBe('job_test789');
      expect(session.fileName).toBe('test-file.json');
      expect(session.fileSize).toBe(50 * 1024 * 1024);
      expect(session.mimeType).toBe('application/json');
      expect(session.chunkSize).toBe(10 * 1024 * 1024);
      expect(session.totalChunks).toBe(5); // 50MB / 10MB = 5 chunks
      expect(session.status).toBe('uploading');
      expect(session.isLocal).toBe(true);
      expect(session.dataTag).toBe('real');
    });

    it('should use default chunk size of 10MB if not specified', () => {
      const specWithoutChunkSize = { ...sessionSpec };
      delete specWithoutChunkSize.chunkSize;

      const session = UploadSession.create(specWithoutChunkSize);

      expect(session.chunkSize).toBe(10 * 1024 * 1024);
    });

    it('should calculate total chunks correctly for various file sizes', () => {
      // Exactly 10MB (1 chunk)
      const session1 = UploadSession.create({ ...sessionSpec, fileSize: 10 * 1024 * 1024 });
      expect(session1.totalChunks).toBe(1);

      // 15MB (2 chunks)
      const session2 = UploadSession.create({ ...sessionSpec, fileSize: 15 * 1024 * 1024 });
      expect(session2.totalChunks).toBe(2);

      // 100MB (10 chunks)
      const session3 = UploadSession.create({ ...sessionSpec, fileSize: 100 * 1024 * 1024 });
      expect(session3.totalChunks).toBe(10);
    });

    it('should set expiry to 4 hours from creation', () => {
      const beforeCreate = Date.now();
      const session = UploadSession.create(sessionSpec);
      const afterCreate = Date.now();

      const fourHours = 4 * 60 * 60 * 1000;
      expect(session.expiresAt).toBeGreaterThanOrEqual(beforeCreate + fourHours);
      expect(session.expiresAt).toBeLessThanOrEqual(afterCreate + fourHours);
    });

    it('should initialize with no chunks received', () => {
      const session = UploadSession.create(sessionSpec);

      expect(session.isComplete()).toBe(false);
      expect(session.getProgress()).toBe(0);
      expect(session.getMissingChunks()).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('recordChunk()', () => {
    let session: UploadSession;

    beforeEach(() => {
      session = UploadSession.create(sessionSpec);
    });

    it('should record a chunk successfully', () => {
      session.recordChunk(0);

      expect(session.getProgress()).toBe(20); // 1/5 = 20%
      expect(session.getMissingChunks()).toEqual([1, 2, 3, 4]);
    });

    it('should record multiple chunks', () => {
      session.recordChunk(0);
      session.recordChunk(2);
      session.recordChunk(4);

      expect(session.getProgress()).toBe(60); // 3/5 = 60%
      expect(session.getMissingChunks()).toEqual([1, 3]);
    });

    it('should allow recording chunks out of order', () => {
      session.recordChunk(4);
      session.recordChunk(1);
      session.recordChunk(3);

      expect(session.getProgress()).toBe(60);
      expect(session.getMissingChunks()).toEqual([0, 2]);
    });

    it('should transition to "assembling" when all chunks received', () => {
      session.recordChunk(0);
      session.recordChunk(1);
      session.recordChunk(2);
      session.recordChunk(3);

      expect(session.status).toBe('uploading');

      session.recordChunk(4); // Last chunk

      expect(session.status).toBe('assembling');
      expect(session.isComplete()).toBe(true);
    });

    it('should throw error for invalid chunk index (negative)', () => {
      expect(() => {
        session.recordChunk(-1);
      }).toThrow('Invalid chunk index: -1');
    });

    it('should throw error for invalid chunk index (too large)', () => {
      expect(() => {
        session.recordChunk(5); // totalChunks = 5, so max index is 4
      }).toThrow('Invalid chunk index: 5');
    });

    it('should throw error when recording chunk for expired session', () => {
      // Manually expire the session
      session.expire();

      expect(() => {
        session.recordChunk(0);
      }).toThrow('Cannot record chunk: session has expired');
    });

    it('should throw error when recording chunk for failed session', () => {
      session.markFailed('Test error');

      expect(() => {
        session.recordChunk(0);
      }).toThrow('Cannot record chunk: session has failed');
    });

    it('should allow recording same chunk multiple times (idempotent)', () => {
      session.recordChunk(0);
      session.recordChunk(0);
      session.recordChunk(0);

      expect(session.getProgress()).toBe(20); // Still 1/5
    });
  });

  describe('isComplete()', () => {
    let session: UploadSession;

    beforeEach(() => {
      session = UploadSession.create(sessionSpec);
    });

    it('should return false when no chunks received', () => {
      expect(session.isComplete()).toBe(false);
    });

    it('should return false when some chunks received', () => {
      session.recordChunk(0);
      session.recordChunk(1);

      expect(session.isComplete()).toBe(false);
    });

    it('should return true when all chunks received', () => {
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }

      expect(session.isComplete()).toBe(true);
    });
  });

  describe('getMissingChunks()', () => {
    let session: UploadSession;

    beforeEach(() => {
      session = UploadSession.create(sessionSpec);
    });

    it('should return all chunks when none received', () => {
      expect(session.getMissingChunks()).toEqual([0, 1, 2, 3, 4]);
    });

    it('should return only missing chunks', () => {
      session.recordChunk(0);
      session.recordChunk(2);
      session.recordChunk(4);

      expect(session.getMissingChunks()).toEqual([1, 3]);
    });

    it('should return empty array when all chunks received', () => {
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }

      expect(session.getMissingChunks()).toEqual([]);
    });
  });

  describe('getProgress()', () => {
    let session: UploadSession;

    beforeEach(() => {
      session = UploadSession.create(sessionSpec);
    });

    it('should return 0 when no chunks received', () => {
      expect(session.getProgress()).toBe(0);
    });

    it('should return correct percentage', () => {
      session.recordChunk(0);
      expect(session.getProgress()).toBe(20); // 1/5

      session.recordChunk(1);
      expect(session.getProgress()).toBe(40); // 2/5

      session.recordChunk(2);
      expect(session.getProgress()).toBe(60); // 3/5
    });

    it('should return 100 when all chunks received', () => {
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }

      expect(session.getProgress()).toBe(100);
    });

    it('should round to nearest integer', () => {
      // 3 chunks total: 33.33%, 66.66%, 100%
      const smallSession = UploadSession.create({ ...sessionSpec, fileSize: 30 * 1024 * 1024 });

      smallSession.recordChunk(0);
      expect(smallSession.getProgress()).toBe(33); // Rounded from 33.33
    });
  });

  describe('isExpired()', () => {
    it('should return false for newly created session', () => {
      const session = UploadSession.create(sessionSpec);
      expect(session.isExpired()).toBe(false);
    });

    it('should return true for expired session', () => {
      const session = UploadSession.create(sessionSpec);

      // Manually set expiry to past
      const json = session.toJSON();
      json.expiresAt = Date.now() - 1000; // 1 second ago

      const expiredSession = UploadSession.fromJSON(json);
      expect(expiredSession.isExpired()).toBe(true);
    });
  });

  describe('markCompleted()', () => {
    let session: UploadSession;

    beforeEach(() => {
      session = UploadSession.create(sessionSpec);
    });

    it('should mark session as completed when all chunks received', () => {
      // Record all chunks
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }

      session.markCompleted();

      expect(session.status).toBe('completed');
      expect(session.completedAt).toBeDefined();
      expect(session.completedAt).toBeGreaterThan(0);
    });

    it('should throw error when not all chunks received', () => {
      session.recordChunk(0);
      session.recordChunk(1);

      expect(() => {
        session.markCompleted();
      }).toThrow('Cannot mark completed: not all chunks received');
    });
  });

  describe('markFailed()', () => {
    let session: UploadSession;

    beforeEach(() => {
      session = UploadSession.create(sessionSpec);
    });

    it('should mark session as failed with error message', () => {
      session.markFailed('Network error');

      expect(session.status).toBe('failed');
      expect(session.errorMessage).toBe('Network error');
    });

    it('should allow marking as failed at any time', () => {
      session.recordChunk(0);
      session.recordChunk(1);

      session.markFailed('Aborted by user');

      expect(session.status).toBe('failed');
      expect(session.errorMessage).toBe('Aborted by user');
    });
  });

  describe('expire()', () => {
    let session: UploadSession;

    beforeEach(() => {
      session = UploadSession.create(sessionSpec);
    });

    it('should expire uploading session', () => {
      session.expire();

      expect(session.status).toBe('expired');
      expect(session.errorMessage).toBe('Session expired after 4 hours');
    });

    it('should expire assembling session', () => {
      // Record all chunks to transition to assembling
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }

      expect(session.status).toBe('assembling');

      session.expire();

      expect(session.status).toBe('expired');
    });

    it('should not expire completed session', () => {
      for (let i = 0; i < session.totalChunks; i++) {
        session.recordChunk(i);
      }
      session.markCompleted();

      session.expire();

      expect(session.status).toBe('completed'); // Should remain completed
    });

    it('should not expire failed session', () => {
      session.markFailed('Test error');

      session.expire();

      expect(session.status).toBe('failed'); // Should remain failed
    });
  });

  describe('setDataTag()', () => {
    it('should set data tag to test', () => {
      const session = UploadSession.create(sessionSpec);
      session.setDataTag('test');

      expect(session.dataTag).toBe('test');
    });

    it('should set data tag to real', () => {
      const session = UploadSession.create(sessionSpec);
      session.setDataTag('test');
      session.setDataTag('real');

      expect(session.dataTag).toBe('real');
    });
  });

  describe('toJSON() and fromJSON()', () => {
    let session: UploadSession;

    beforeEach(() => {
      session = UploadSession.create(sessionSpec);
      session.recordChunk(0);
      session.recordChunk(2);
      session.recordChunk(4);
    });

    it('should serialize session to JSON', () => {
      const json = session.toJSON();

      expect(json.id).toBe(session.id);
      expect(json.accountId).toBe(session.accountId);
      expect(json.fileName).toBe(session.fileName);
      expect(json.status).toBe(session.status);
      expect(json.chunksReceived).toEqual({ 0: true, 2: true, 4: true });
    });

    it('should deserialize session from JSON', () => {
      const json = session.toJSON();
      const deserialized = UploadSession.fromJSON(json);

      expect(deserialized.id).toBe(session.id);
      expect(deserialized.accountId).toBe(session.accountId);
      expect(deserialized.fileName).toBe(session.fileName);
      expect(deserialized.getProgress()).toBe(session.getProgress());
      expect(deserialized.getMissingChunks()).toEqual(session.getMissingChunks());
    });

    it('should handle JSON string chunksReceived field', () => {
      const json = session.toJSON();
      const jsonWithString = {
        ...json,
        chunksReceived: JSON.stringify(json.chunksReceived),
      };

      const deserialized = UploadSession.fromJSON(jsonWithString as any);

      expect(deserialized.getProgress()).toBe(60); // 3/5 chunks
    });

    it('should preserve all state through serialization cycle', () => {
      const json = session.toJSON();
      const deserialized = UploadSession.fromJSON(json);
      const jsonAgain = deserialized.toJSON();

      expect(jsonAgain).toEqual(json);
    });
  });

  describe('toString()', () => {
    it('should return human-readable summary', () => {
      const session = UploadSession.create(sessionSpec);
      session.recordChunk(0);
      session.recordChunk(1);

      const str = session.toString();

      expect(str).toContain(session.id);
      expect(str).toContain(session.fileName);
      expect(str).toContain('40%'); // 2/5 chunks
      expect(str).toContain('2/5 chunks');
      expect(str).toContain('uploading');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single chunk file', () => {
      const singleChunkSpec = {
        ...sessionSpec,
        fileSize: 5 * 1024 * 1024, // 5MB (less than chunk size)
      };

      const session = UploadSession.create(singleChunkSpec);

      expect(session.totalChunks).toBe(1);
      expect(session.getProgress()).toBe(0);

      session.recordChunk(0);

      expect(session.getProgress()).toBe(100);
      expect(session.isComplete()).toBe(true);
    });

    it('should handle very large files (2GB)', () => {
      const largeFileSpec = {
        ...sessionSpec,
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB
      };

      const session = UploadSession.create(largeFileSpec);

      expect(session.totalChunks).toBe(205); // ceil(2GB / 10MB)
      expect(session.getMissingChunks().length).toBe(205);
    });

    it('should handle file size exactly divisible by chunk size', () => {
      const exactSpec = {
        ...sessionSpec,
        fileSize: 50 * 1024 * 1024, // Exactly 5 chunks
      };

      const session = UploadSession.create(exactSpec);

      expect(session.totalChunks).toBe(5);
    });
  });
});
