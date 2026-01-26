# Duplicate Detection Performance - Baseline Metrics

**Date**: 2025-11-22
**Benchmark Suite**: [apps/api/src/**tests**/duplicate-detection-benchmark.test.ts](apps/api/src/__tests__/duplicate-detection-benchmark.test.ts)
**Algorithm**: Current O(n²) implementation in [duplicate-detection.ts:89-135](apps/api/src/services/duplicate-detection.ts#L89-L135)

## Executive Summary

The current duplicate detection implementation has **critical performance issues** that will cause timeouts on imports with >5000 messages.

**Problem**: O(n²) nested loop performs `n*(n-1)/2` comparisons
**Impact**: 5000 messages = 12.5 million comparisons = 81 seconds
**Risk**: Production imports will timeout, fail, or cause poor UX

## Baseline Performance Results

### Throughput by Dataset Size

| Messages | Duration            | Throughput | Comparisons | Status          |
| -------- | ------------------- | ---------- | ----------- | --------------- |
| 100      | 111ms               | 900 msg/s  | 4,950       | ✅ Acceptable   |
| 500      | 1,117ms (1.1s)      | 447 msg/s  | 124,750     | ⚠️ Marginal     |
| 1,000    | 2,806ms (2.8s)      | 356 msg/s  | 499,500     | ⚠️ Slow         |
| 5,000    | 81,622ms (81.6s)    | 61 msg/s   | 12,497,500  | ❌ UNACCEPTABLE |
| 10,000   | ~320,000ms (5.3min) | ~31 msg/s  | 49,995,000  | ❌ WILL TIMEOUT |

### O(n²) Growth Pattern Confirmation

Tested with 100, 200, 400, 800 messages to verify quadratic scaling:

| Size Increase | Expected Slowdown | Measured Slowdown | Result                          |
| ------------- | ----------------- | ----------------- | ------------------------------- |
| 100→200 (2x)  | 4x                | 5.54x             | Slightly worse than O(n²)       |
| 200→400 (2x)  | 4x                | 2.94x             | Better than expected (variance) |
| 400→800 (2x)  | 4x                | 4.62x             | Close to expected               |
| **Average**   | **4x**            | **4.37x**         | **Confirms O(n²)**              |

### Algorithm Comparison (500 messages)

| Algorithm       | Duration | Throughput | Relative Speed   | Duplicates Found |
| --------------- | -------- | ---------- | ---------------- | ---------------- |
| **Cosine**      | 757ms    | 660 msg/s  | **1.21x faster** | 53               |
| **Jaccard**     | 915ms    | 546 msg/s  | Baseline         | 53               |
| **Levenshtein** | 3,400ms  | 147 msg/s  | **3.72x slower** | 53               |

**Key Finding**: Cosine similarity is fastest, Levenshtein is slowest. All algorithms find the same duplicates (accuracy parity).

## Performance Projections

Extrapolating from baseline data:

| Import Size     | Projected Duration         | User Impact                          |
| --------------- | -------------------------- | ------------------------------------ |
| 1,000 messages  | ~3 seconds                 | Acceptable                           |
| 5,000 messages  | ~80 seconds                | Poor UX, no timeout                  |
| 10,000 messages | ~320 seconds (5.3 min)     | **API timeout (typical 2min limit)** |
| 20,000 messages | ~1,280 seconds (21 min)    | **Will fail**                        |
| 50,000 messages | ~8,000 seconds (2.2 hours) | **Unusable**                         |

## Root Cause Analysis

**File**: [apps/api/src/services/duplicate-detection.ts](apps/api/src/services/duplicate-detection.ts)
**Lines**: 89-135
**Issue**: Nested loop over all messages

```typescript
for (let i = 0; i < allMessages.length; i++) {
  for (let j = i + 1; j < allMessages.length; j++) {
    // ❌ O(n²)
    const msgA = allMessages[i];
    const msgB = allMessages[j];

    // Check if messages are duplicates
    const result = this.checkDuplicate(msgA.content, msgB.content, config);

    if (result.isDuplicate) {
      candidates.push(candidate);
    }
  }
}
```

**Why This Fails**:

- Every message compared with every other message
- No early exit for obvious non-duplicates
- No indexing or bucketing to reduce search space
- Scales catastrophically with size (O(n²))

## Recommended Optimizations

### Phase 3: Algorithm Optimizations (High Priority)

1. **Hash Bucketing** (Expected: 10-50x speedup)
   - Group messages by length ranges (±20%)
   - Group by first N characters hash
   - Only compare within buckets
   - Reduces search space from O(n²) to O(n\*k) where k << n

2. **Early Exit Pre-filtering** (Expected: 2-5x speedup)
   - Check length ratio before expensive similarity calculation
   - Skip if `|len(a) - len(b)| / max(len(a), len(b)) > tolerance`
   - Saves ~60% of comparisons for non-duplicates

3. **Batching for Large Datasets** (Expected: Memory efficiency)
   - Process 1000 messages at a time
   - Write results incrementally
   - Prevents memory exhaustion on huge imports

### Phase 4: Database Optimizations (Medium Priority)

4. **FTS5 Full-Text Index** (Expected: 5-10x speedup for near-duplicates)
   - Add SQLite FTS5 index on message content
   - Use `MATCH` queries to find candidates
   - Database does the heavy lifting

5. **Database Migration** (Expected: One-time setup)
   - Create migration: `020_add_duplicate_detection_index.sql`
   - Add index on `(account_id, content_hash, created_at)`

### Expected Combined Impact

| Optimization     | Before (5000 msgs) | After (5000 msgs) | Speedup        |
| ---------------- | ------------------ | ----------------- | -------------- |
| Baseline         | 81.6s              | 81.6s             | 1x             |
| + Hash Bucketing | 81.6s              | ~8s               | **10x**        |
| + Early Exit     | ~8s                | ~3s               | **27x total**  |
| + FTS5 Index     | ~3s                | <1s               | **80x+ total** |

**Target**: <1 second for 5000 messages, <10 seconds for 50,000 messages

## Accuracy Validation

All three algorithms (Jaccard, Levenshtein, Cosine) found **identical duplicate sets**:

- 53 duplicates detected across 500 messages (10% duplicate rate)
- No false positives observed
- No false negatives observed

**Critical**: Optimizations must maintain this accuracy. Any optimization that reduces accuracy is unacceptable.

## Next Steps

1. ✅ **Phase 1 Complete**: Sentry UI integration (already implemented)
2. ✅ **Phase 2 Complete**: Baseline benchmarking (this document)
3. ⏳ **Phase 3**: Implement hash bucketing + early exit optimizations
4. ⏳ **Phase 4**: Add FTS5 database index
5. ⏳ **Phase 5**: Re-run benchmarks, verify no accuracy regression, update docs

## References

- **Benchmark Test**: [apps/api/src/**tests**/duplicate-detection-benchmark.test.ts](apps/api/src/__tests__/duplicate-detection-benchmark.test.ts)
- **Service Under Test**: [apps/api/src/services/duplicate-detection.ts](apps/api/src/services/duplicate-detection.ts)
- **Integration Test**: [apps/api/src/**tests**/duplicate-detection-integration.test.ts](apps/api/src/__tests__/duplicate-detection-integration.test.ts)

---

**Generated**: 2025-11-22
**Status**: Phase 2 Complete - Ready for Optimization
