/**
 * Benchmark Script for Visual Feedback MCP Server
 *
 * Tests the performance of screenshot comparison to validate
 * the claimed ~420ms performance for 1920x1080 screenshots.
 */

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Test Image Generation
// ============================================================================

/**
 * Generate a test image at specified resolution
 */
async function generateTestImage(
  width: number,
  height: number,
  variant: 'base' | 'slight' | 'major'
): Promise<Buffer> {
  const keimenon = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // Add some visual elements based on variant
  let composite: any[] = [];

  if (variant === 'base' || variant === 'slight') {
    // Add header bar
    composite.push({
      input: Buffer.from(`<svg width="${width}" height="80">
        <rect width="${width}" height="80" fill="#3b82f6"/>
        <text x="20" y="50" font-family="Arial" font-size="32" fill="white">Keimenon</text>
      </svg>`),
      top: 0,
      left: 0,
    });

    // Add sidebar
    composite.push({
      input: Buffer.from(`<svg width="200" height="${height - 80}">
        <rect width="200" height="${height - 80}" fill="#f3f4f6"/>
        <text x="20" y="40" font-family="Arial" font-size="16" fill="#374151">Dashboard</text>
        <text x="20" y="80" font-family="Arial" font-size="16" fill="#374151">Nodes</text>
        <text x="20" y="120" font-family="Arial" font-size="16" fill="#374151">Settings</text>
      </svg>`),
      top: 80,
      left: 0,
    });

    // Add main content area
    composite.push({
      input: Buffer.from(`<svg width="${width - 200}" height="${height - 80}">
        <rect width="${width - 200}" height="${height - 80}" fill="#ffffff"/>
        <text x="40" y="60" font-family="Arial" font-size="24" fill="#111827">Main Content</text>
        <rect x="40" y="100" width="400" height="200" fill="#e5e7eb" stroke="#d1d5db" stroke-width="2"/>
        <rect x="40" y="320" width="400" height="200" fill="#e5e7eb" stroke="#d1d5db" stroke-width="2"/>
      </svg>`),
      top: 80,
      left: 200,
    });
  }

  if (variant === 'slight') {
    // Add a small difference - button color change
    composite.push({
      input: Buffer.from(`<svg width="120" height="40">
        <rect width="120" height="40" rx="4" fill="#ef4444"/>
        <text x="30" y="25" font-family="Arial" font-size="14" fill="white">Save</text>
      </svg>`),
      top: 150,
      left: 260,
    });
  }

  if (variant === 'major') {
    // Completely different layout
    composite.push({
      input: Buffer.from(`<svg width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="#111827"/>
        <text x="${width / 2 - 100}" y="${height / 2}" font-family="Arial" font-size="48" fill="white">Error 404</text>
      </svg>`),
      top: 0,
      left: 0,
    });
  }

  if (composite.length > 0) {
    keimenon.composite(composite);
  }

  return await keimenon.png().toBuffer();
}

/**
 * Convert buffer to PNG object for pixelmatch
 */
function bufferToPNG(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

// ============================================================================
// Benchmark Functions
// ============================================================================

/**
 * Benchmark screenshot comparison
 */
async function benchmarkComparison(
  width: number,
  height: number,
  iterations: number = 10
): Promise<{
  avgMs: number;
  minMs: number;
  maxMs: number;
  medianMs: number;
  iterations: number;
}> {
  console.log(`\n📊 Benchmarking ${width}x${height} comparison (${iterations} iterations)...`);

  // Generate test images
  console.log('  Generating test images...');
  const baseImage = await generateTestImage(width, height, 'base');
  const slightDiffImage = await generateTestImage(width, height, 'slight');

  const basePNG = bufferToPNG(baseImage);
  const diffPNG = bufferToPNG(slightDiffImage);

  const diffImage = new PNG({ width, height });

  // Warmup
  console.log('  Warming up...');
  for (let i = 0; i < 3; i++) {
    pixelmatch(basePNG.data, diffPNG.data, diffImage.data, width, height, {
      threshold: 0.1,
      includeAA: true,
    });
  }

  // Benchmark
  console.log('  Running benchmark...');
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    const mismatchedPixels = pixelmatch(basePNG.data, diffPNG.data, diffImage.data, width, height, {
      threshold: 0.1,
      includeAA: true,
    });

    const end = performance.now();
    const duration = end - start;
    times.push(duration);

    if (i === 0) {
      console.log(`  First run: ${duration.toFixed(2)}ms (${mismatchedPixels} pixels different)`);
    }
  }

  // Calculate statistics
  times.sort((a, b) => a - b);
  const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
  const min = times[0];
  const max = times[times.length - 1];
  const median = times[Math.floor(times.length / 2)];

  return { avgMs: avg, minMs: min, maxMs: max, medianMs: median, iterations };
}

/**
 * Benchmark with sharp preprocessing (resize, optimization)
 */
async function benchmarkWithPreprocessing(width: number, height: number): Promise<number> {
  console.log(`\n🔧 Benchmarking with Sharp preprocessing...`);

  const baseImage = await generateTestImage(width, height, 'base');
  const diffImage = await generateTestImage(width, height, 'slight');

  const start = performance.now();

  // Preprocessing with sharp
  const [optimizedBase, optimizedDiff] = await Promise.all([
    sharp(baseImage).png({ compressionLevel: 6 }).toBuffer(),
    sharp(diffImage).png({ compressionLevel: 6 }).toBuffer(),
  ]);

  const basePNG = bufferToPNG(optimizedBase);
  const diffPNG = bufferToPNG(optimizedDiff);
  const outputPNG = new PNG({ width, height });

  // Comparison
  pixelmatch(basePNG.data, diffPNG.data, outputPNG.data, width, height, {
    threshold: 0.1,
    includeAA: true,
  });

  const end = performance.now();
  return end - start;
}

// ============================================================================
// Main Benchmark Suite
// ============================================================================

async function runBenchmarkSuite() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Visual Feedback MCP Server Performance Benchmark           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const results: any[] = [];

  // Test common resolutions
  const resolutions = [
    { name: 'Mobile (390x844)', width: 390, height: 844 },
    { name: 'Tablet (768x1024)', width: 768, height: 1024 },
    { name: 'Desktop HD (1920x1080)', width: 1920, height: 1080 },
    { name: '4K (3840x2160)', width: 3840, height: 2160 },
  ];

  for (const res of resolutions) {
    const result = await benchmarkComparison(res.width, res.height, 10);
    results.push({
      resolution: res.name,
      ...result,
    });

    console.log(`  ✅ Average: ${result.avgMs.toFixed(2)}ms`);
    console.log(
      `  📊 Min: ${result.minMs.toFixed(2)}ms | Max: ${result.maxMs.toFixed(2)}ms | Median: ${result.medianMs.toFixed(2)}ms`
    );
  }

  // Test with preprocessing
  console.log('\n─────────────────────────────────────────────────────────────');
  const preprocessTime = await benchmarkWithPreprocessing(1920, 1080);
  console.log(`  ✅ Full pipeline (preprocessing + comparison): ${preprocessTime.toFixed(2)}ms`);

  // Summary Report
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Benchmark Summary                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n📊 Performance by Resolution:\n');

  console.log('┌─────────────────────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ Resolution              │ Avg (ms) │ Min (ms) │ Max (ms) │ Median   │');
  console.log('├─────────────────────────┼──────────┼──────────┼──────────┼──────────┤');

  for (const result of results) {
    const resolution = result.resolution.padEnd(23);
    const avg = result.avgMs.toFixed(2).padStart(8);
    const min = result.minMs.toFixed(2).padStart(8);
    const max = result.maxMs.toFixed(2).padStart(8);
    const median = result.medianMs.toFixed(2).padStart(8);
    console.log(`│ ${resolution} │ ${avg} │ ${min} │ ${max} │ ${median} │`);
  }

  console.log('└─────────────────────────┴──────────┴──────────┴──────────┴──────────┘');

  // Validation against claimed performance
  console.log('\n🎯 Claim Validation:\n');
  const desktopResult = results.find((r) => r.resolution === 'Desktop HD (1920x1080)');
  const claimed = 420;
  const actual = desktopResult.avgMs;
  const difference = Math.abs(actual - claimed);
  const percentDiff = ((difference / claimed) * 100).toFixed(1);

  console.log(`   Claimed:  ${claimed}ms (for 1920x1080)`);
  console.log(`   Actual:   ${actual.toFixed(2)}ms`);
  console.log(`   Difference: ${difference.toFixed(2)}ms (${percentDiff}%)`);

  if (actual <= claimed * 1.1) {
    console.log(`   Status:   ✅ CLAIM VALIDATED (within 10% margin)`);
  } else if (actual <= claimed * 1.25) {
    console.log(`   Status:   ⚠️  CLAIM MOSTLY ACCURATE (within 25% margin)`);
  } else {
    console.log(`   Status:   ❌ CLAIM INACCURATE (exceeds 25% margin)`);
  }

  console.log('\n📈 Performance Insights:\n');

  // Calculate pixels/ms throughput
  const throughput = (1920 * 1080) / actual;
  console.log(`   Throughput: ${Math.round(throughput).toLocaleString()} pixels/ms`);
  console.log(`   Efficiency: ${Math.round(throughput / 1000).toLocaleString()}K pixels/ms`);

  // Scaling analysis
  const mobileResult = results.find((r) => r.resolution.includes('Mobile'));
  const tabletResult = results.find((r) => r.resolution.includes('Tablet'));
  const fourKResult = results.find((r) => r.resolution.includes('4K'));

  const mobilePixels = 390 * 844;
  const desktopPixels = 1920 * 1080;
  const fourKPixels = 3840 * 2160;

  const scalingEfficiency =
    desktopResult.avgMs / mobileResult.avgMs / (desktopPixels / mobilePixels);

  console.log(`\n   Scaling Efficiency: ${scalingEfficiency.toFixed(2)}x`);
  console.log(`   (1.0 = perfectly linear scaling with pixel count)`);

  console.log('\n💡 Recommendations:\n');

  if (actual < 500) {
    console.log('   ✅ Performance is excellent for real-time visual regression testing');
    console.log('   ✅ Suitable for CI/CD pipelines');
    console.log('   ✅ Can handle multiple viewport testing efficiently');
  } else if (actual < 1000) {
    console.log('   ⚠️  Performance is acceptable but consider optimization for large test suites');
    console.log('   💡 Use parallel processing for multiple comparisons');
  } else {
    console.log('   ❌ Performance needs optimization');
    console.log('   💡 Consider using lower resolution screenshots');
    console.log('   💡 Enable preprocessing caching');
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  // Save results to file
  const resultsFile = path.join(process.cwd(), 'test-results', 'visual-feedback-benchmark.json');
  await fs.mkdir(path.dirname(resultsFile), { recursive: true });
  await fs.writeFile(
    resultsFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        claim: { resolution: '1920x1080', performanceMs: 420 },
        actual: {
          resolution: '1920x1080',
          performanceMs: actual,
          validated: actual <= claimed * 1.1,
        },
        allResults: results,
        preprocessing: {
          fullPipelineMs: preprocessTime,
        },
        system: {
          platform: process.platform,
          nodeVersion: process.version,
          arch: process.arch,
        },
      },
      null,
      2
    )
  );

  console.log(`📁 Results saved to: ${resultsFile}\n`);
}

// ============================================================================
// Run if executed directly
// ============================================================================

if (require.main === module) {
  runBenchmarkSuite()
    .then(() => {
      console.log('✅ Benchmark complete!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    });
}

export { benchmarkComparison, benchmarkWithPreprocessing, runBenchmarkSuite };
