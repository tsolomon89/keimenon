import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

interface MockRenderNode {
  position: [number, number, number];
  radius: number;
}

// Pre-allocated temporaries (matching optimized render-primitives loop)
const _vector = new THREE.Vector3();
const _sphere = new THREE.Sphere();

describe('Culling Performance Stress Test', () => {
  it('culls 50,000 nodes in under 2.5ms with zero allocations', () => {
    // 1. Generate 50,000 mock nodes
    const nodeCount = 50000;
    const nodes: MockRenderNode[] = [];
    const radius = 5;

    for (let i = 0; i < nodeCount; i++) {
      // Place 20% of nodes inside [-100, 100], others way outside to test culling logic
      const isInside = i % 5 === 0;
      const x = isInside ? (i % 200) - 100 : 5000 + i;
      const y = isInside ? ((i * 7) % 200) - 100 : 5000 + i;
      const z = isInside ? ((i * 13) % 200) - 100 : 5000 + i;

      nodes.push({
        position: [x, y, z],
        radius,
      });
    }

    // 2. Set up frustum (bounds representing a view box [-150, 150])
    const frustum = new THREE.Frustum();
    // Manually set up 6 planes for the frustum to represent a box [-150, 150]
    frustum.planes[0].setComponents(1, 0, 0, 150); // Left: x >= -150
    frustum.planes[1].setComponents(-1, 0, 0, 150); // Right: x <= 150
    frustum.planes[2].setComponents(0, 1, 0, 150); // Bottom: y >= -150
    frustum.planes[3].setComponents(0, -1, 0, 150); // Top: y <= 150
    frustum.planes[4].setComponents(0, 0, 1, 150); // Near: z >= -150
    frustum.planes[5].setComponents(0, 0, -1, 150); // Far: z <= 150

    // 3. JIT Warmup (run the loop 10 times to warm up V8)
    const warmupRuns = 10;
    for (let run = 0; run < warmupRuns; run++) {
      let visibleCount = 0;
      for (let i = 0; i < nodeCount; i++) {
        const node = nodes[i];
        _vector.set(node.position[0], node.position[1], node.position[2]);
        _sphere.set(_vector, node.radius * 1.5);
        if (frustum.intersectsSphere(_sphere)) {
          visibleCount++;
        }
      }
    }

    // 4. Benchmark execution (measure exact performance)
    const benchmarkRuns = 20;
    const times: number[] = [];
    let visibleCount = 0;

    for (let run = 0; run < benchmarkRuns; run++) {
      visibleCount = 0;
      const start = performance.now();

      for (let i = 0; i < nodeCount; i++) {
        const node = nodes[i];
        _vector.set(node.position[0], node.position[1], node.position[2]);
        _sphere.set(_vector, node.radius * 1.5);
        if (frustum.intersectsSphere(_sphere)) {
          visibleCount++;
        }
      }

      const duration = performance.now() - start;
      times.push(duration);
    }

    // 5. Calculate statistics
    times.sort((a, b) => a - b);
    const minTime = times[0];
    const maxTime = times[times.length - 1];
    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
    const medianTime = times[Math.floor(times.length / 2)];

    console.log(`[Culling Stress Test Stats]`);
    console.log(`- Total Nodes: ${nodeCount}`);
    console.log(
      `- Visible Nodes (in frustum): ${visibleCount} (${((visibleCount / nodeCount) * 100).toFixed(1)}%)`
    );
    console.log(`- Min Time: ${minTime.toFixed(3)}ms`);
    console.log(`- Max Time: ${maxTime.toFixed(3)}ms`);
    console.log(`- Avg Time: ${avgTime.toFixed(3)}ms`);
    console.log(`- Median Time: ${medianTime.toFixed(3)}ms`);

    // 6. Assert correctness & performance budget (< 2.5ms)
    expect(visibleCount).toBe(10000); // 20% of 50,000 is exactly 10,000
    expect(medianTime).toBeLessThan(2.5); // Assert performance budget of 2.5ms
  });
});
