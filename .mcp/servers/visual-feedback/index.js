#!/usr/bin/env node

/**
 * Visual Feedback MCP Server
 *
 * Provides visual testing and analysis tools for E2E test automation:
 * - Screenshot comparison (pixelmatch)
 * - Layout analysis
 * - Visual regression detection
 * - Element property extraction
 * - Multi-viewport capture orchestration
 *
 * Used by autonomous-test-healer and autonomous-test-generator skills
 * to implement Anthropic's visual feedback pattern.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Server Setup
// ============================================================================

const server = new Server(
  {
    name: 'keimenon-visual-feedback',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load PNG image from file
 */
async function loadPNG(filepath) {
  try {
    const buffer = await fs.readFile(filepath);
    return PNG.sync.read(buffer);
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Failed to load image: ${filepath} - ${error.message}`
    );
  }
}

/**
 * Save PNG image to file
 */
async function savePNG(png, filepath) {
  try {
    const buffer = PNG.sync.write(png);
    await fs.writeFile(filepath, buffer);
    return filepath;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to save image: ${filepath} - ${error.message}`
    );
  }
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

/**
 * Calculate similarity percentage from mismatch pixels
 */
function calculateSimilarity(mismatchedPixels, totalPixels) {
  if (totalPixels === 0) return 1.0;
  const matchedPixels = totalPixels - mismatchedPixels;
  return matchedPixels / totalPixels;
}

/**
 * Determine regression severity based on similarity
 */
function determineRegressionSeverity(similarity, threshold) {
  if (similarity >= threshold) {
    return 'none';
  } else if (similarity >= threshold - 0.05) {
    return 'minor';
  } else if (similarity >= threshold - 0.15) {
    return 'moderate';
  } else {
    return 'major';
  }
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * compare_screenshots
 *
 * Compares two screenshots and returns similarity score and diff image
 *
 * @param {string} baseline - Path to baseline screenshot
 * @param {string} current - Path to current screenshot
 * @param {number} threshold - Similarity threshold (default: 0.95)
 * @param {object} options - Additional options (threshold for pixelmatch, output path)
 * @returns {object} Comparison result with similarity, diff_regions, diff_image
 */
async function compareScreenshots(baseline, current, threshold = 0.95, options = {}) {
  try {
    // Load images
    const img1 = await loadPNG(baseline);
    const img2 = await loadPNG(current);

    // Check dimensions match
    if (img1.width !== img2.width || img1.height !== img2.height) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Image dimensions don't match: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`
      );
    }

    const { width, height } = img1;
    const totalPixels = width * height;

    // Create diff image
    const diff = new PNG({ width, height });

    // Run pixelmatch comparison
    const pixelmatchThreshold = options.pixelmatchThreshold || 0.1;
    const mismatchedPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
      threshold: pixelmatchThreshold,
    });

    // Calculate similarity
    const similarity = calculateSimilarity(mismatchedPixels, totalPixels);

    // Save diff image
    const diffDir = options.diffOutputDir || path.join(process.cwd(), '.claude', 'visual-diff');
    await ensureDir(diffDir);
    const diffFilename = options.diffFilename || `diff-${Date.now()}.png`;
    const diffPath = path.join(diffDir, diffFilename);
    await savePNG(diff, diffPath);

    // Identify diff regions (simplified - find bounding boxes of different areas)
    const diffRegions = identifyDiffRegions(diff, width, height);

    return {
      similarity: Math.round(similarity * 10000) / 10000, // 4 decimal places
      matched: similarity >= threshold,
      mismatch_percentage: Math.round((1 - similarity) * 10000) / 100, // as percentage
      mismatched_pixels: mismatchedPixels,
      total_pixels: totalPixels,
      diff_image: diffPath,
      diff_regions: diffRegions,
      threshold_used: threshold,
      images_compared: {
        baseline,
        current,
      },
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(ErrorCode.InternalError, `Screenshot comparison failed: ${error.message}`);
  }
}

/**
 * Identify regions with differences (simplified bounding box approach)
 */
function identifyDiffRegions(diffPNG, width, height) {
  const regions = [];
  const threshold = 100; // Minimum diff intensity to consider

  // Simple grid-based approach: divide image into 16 regions
  const gridSize = 4;
  const cellWidth = Math.floor(width / gridSize);
  const cellHeight = Math.floor(height / gridSize);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = col * cellWidth;
      const y = row * cellHeight;
      const w = cellWidth;
      const h = cellHeight;

      // Count diff pixels in this region
      let diffCount = 0;
      for (let py = y; py < Math.min(y + h, height); py++) {
        for (let px = x; px < Math.min(x + w, width); px++) {
          const idx = (py * width + px) * 4;
          const r = diffPNG.data[idx];
          if (r > threshold) {
            // Red channel indicates diff in pixelmatch
            diffCount++;
          }
        }
      }

      if (diffCount > w * h * 0.01) {
        // If >1% of region has diffs
        regions.push({
          x,
          y,
          width: w,
          height: h,
          diff_pixels: diffCount,
          diff_percentage: Math.round((diffCount / (w * h)) * 10000) / 100,
        });
      }
    }
  }

  return regions;
}

/**
 * analyze_layout
 *
 * Analyzes screenshot for layout issues (spacing, alignment)
 *
 * @param {string} screenshot_path - Path to screenshot
 * @returns {object} Layout analysis with elements, spacing_issues, alignment_issues
 */
async function analyzeLayout(screenshot_path) {
  try {
    // Load image with sharp for analysis
    const image = sharp(screenshot_path);
    const metadata = await image.metadata();

    const { width, height, format } = metadata;

    // For now, return basic metadata
    // In production, this would use image processing to detect elements,
    // spacing irregularities, misalignments, etc.

    // Placeholder analysis (in production, would use edge detection, etc.)
    const analysis = {
      screenshot: screenshot_path,
      dimensions: {
        width,
        height,
        format,
        aspect_ratio: Math.round((width / height) * 100) / 100,
      },
      elements: [
        // Placeholder: In production, would detect UI elements
        // Using edge detection, color clustering, etc.
      ],
      spacing_issues: [
        // Placeholder: Would detect irregular spacing
      ],
      alignment_issues: [
        // Placeholder: Would detect misaligned elements
      ],
      notes: [
        'Layout analysis is a placeholder in current version',
        'Full implementation requires computer vision libraries (OpenCV, TensorFlow)',
        'Consider using Playwright Healer agent browser tools for live DOM analysis',
      ],
    };

    return analysis;
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Layout analysis failed: ${error.message}`);
  }
}

/**
 * detect_visual_regression
 *
 * Detects visual regressions between baseline and current screenshot
 *
 * @param {string} baseline - Path to baseline screenshot
 * @param {string} current - Path to current screenshot
 * @param {number} threshold - Regression threshold (default: 0.90)
 * @returns {object} Regression detection result
 */
async function detectVisualRegression(baseline, current, threshold = 0.9) {
  try {
    // Use compare_screenshots as basis
    const comparison = await compareScreenshots(baseline, current, threshold, {
      diffFilename: `regression-diff-${Date.now()}.png`,
    });

    const hasRegression = !comparison.matched;
    const severity = determineRegressionSeverity(comparison.similarity, threshold);

    // Analyze diff regions for details
    const regressionDetails = comparison.diff_regions.map((region) => ({
      region: `(${region.x}, ${region.y}) ${region.width}x${region.height}`,
      severity:
        region.diff_percentage > 10 ? 'high' : region.diff_percentage > 5 ? 'medium' : 'low',
      diff_percentage: region.diff_percentage,
      description: `Visual change detected in region covering ${region.diff_percentage}% of area`,
    }));

    return {
      has_regression: hasRegression,
      severity,
      similarity: comparison.similarity,
      details: regressionDetails,
      diff_image_path: comparison.diff_image,
      summary: hasRegression
        ? `Visual regression detected (${severity}): ${comparison.mismatch_percentage}% of pixels differ`
        : 'No significant visual regression detected',
      threshold_used: threshold,
      recommendations: hasRegression
        ? [
            severity === 'major'
              ? 'Manual review required - significant visual changes detected'
              : null,
            regressionDetails.length > 3
              ? 'Multiple regions affected - check for layout shifts'
              : null,
            'Review diff image at: ' + comparison.diff_image,
          ].filter(Boolean)
        : [],
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `Visual regression detection failed: ${error.message}`
    );
  }
}

/**
 * extract_element_properties
 *
 * Extracts visual properties of an element from screenshot
 * (Placeholder - requires integration with Playwright for live DOM access)
 *
 * @param {string} screenshot_path - Path to screenshot
 * @param {string} locator - Playwright locator for element
 * @returns {object} Element properties
 */
async function extractElementProperties(screenshot_path, locator) {
  try {
    // Load image metadata
    const image = sharp(screenshot_path);
    const metadata = await image.metadata();

    // This is a placeholder implementation
    // In production, this would require:
    // 1. Playwright browser instance running
    // 2. DOM query using locator
    // 3. Element bounding box from browser
    // 4. Crop screenshot to element region
    // 5. Analyze cropped region

    return {
      screenshot: screenshot_path,
      locator,
      found: null, // Cannot determine without live browser
      visible: null,
      text: null,
      color: null,
      size: null,
      position: null,
      notes: [
        'Element property extraction requires live browser access',
        'Use Playwright Healer agent tools: browser_snapshot, browser_evaluate',
        'This tool is best used for post-test screenshot analysis',
        'For live element inspection, invoke Playwright test agents directly',
      ],
      recommendation:
        'Use mcp__playwright-test__browser_evaluate to extract element properties from live page',
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Element property extraction failed: ${error.message}`
    );
  }
}

/**
 * capture_multi_viewport
 *
 * Orchestrates multi-viewport screenshot capture
 * (Delegates to Playwright E2E MCP server)
 *
 * @param {string} url - URL to capture
 * @param {array} viewports - Array of viewport sizes
 * @returns {object} Paths to captured screenshots
 */
async function captureMultiViewport(url, viewports = null) {
  const defaultViewports = viewports || [
    { name: 'mobile', width: 375, height: 667 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1920, height: 1080 },
  ];

  return {
    url,
    viewports: defaultViewports,
    screenshots: {},
    notes: [
      'Multi-viewport capture requires Playwright E2E MCP server',
      'Use mcp__playwright-e2e__pw_run with viewport configuration',
      'This tool provides orchestration guidance only',
      'Actual capture should be performed by Playwright agents',
    ],
    implementation_guide: {
      step1: 'Invoke playwright-test-planner agent to navigate to URL',
      step2: 'For each viewport, set page.setViewportSize(viewport)',
      step3: 'Capture screenshot with page.screenshot()',
      step4: 'Return paths to all captured screenshots',
      example_code: `
        for (const viewport of viewports) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.screenshot({ path: \`screenshot-\${viewport.name}.png\` });
        }
      `,
    },
  };
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Handle tool list requests
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'compare_screenshots',
        description:
          'Compare two screenshots and return similarity score with diff image. Used for validating test fixes and detecting visual changes.',
        inputSchema: {
          type: 'object',
          properties: {
            baseline: {
              type: 'string',
              description: 'Path to baseline screenshot (e.g., test-results/baseline.png)',
            },
            current: {
              type: 'string',
              description: 'Path to current screenshot to compare (e.g., test-results/current.png)',
            },
            threshold: {
              type: 'number',
              description:
                'Similarity threshold (0.0-1.0). Default: 0.95. Scores above threshold are considered matching.',
              default: 0.95,
            },
            options: {
              type: 'object',
              description:
                'Additional options: pixelmatchThreshold (0.0-1.0), diffOutputDir, diffFilename',
              properties: {
                pixelmatchThreshold: {
                  type: 'number',
                  description: 'Pixelmatch threshold for pixel comparison (0.0-1.0). Default: 0.1',
                },
                diffOutputDir: {
                  type: 'string',
                  description: 'Directory to save diff image. Default: .claude/visual-diff',
                },
                diffFilename: {
                  type: 'string',
                  description: 'Filename for diff image. Default: diff-{timestamp}.png',
                },
              },
            },
          },
          required: ['baseline', 'current'],
        },
      },
      {
        name: 'analyze_layout',
        description:
          'Analyze screenshot for layout issues like spacing and alignment problems. Placeholder implementation - use Playwright browser tools for detailed analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            screenshot_path: {
              type: 'string',
              description: 'Path to screenshot to analyze',
            },
          },
          required: ['screenshot_path'],
        },
      },
      {
        name: 'detect_visual_regression',
        description:
          'Detect visual regressions between baseline and current screenshot. Returns severity (none/minor/moderate/major) and detailed diff analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            baseline: {
              type: 'string',
              description: 'Path to baseline screenshot',
            },
            current: {
              type: 'string',
              description: 'Path to current screenshot',
            },
            threshold: {
              type: 'number',
              description:
                'Regression threshold (0.0-1.0). Default: 0.90. Differences below threshold indicate regression.',
              default: 0.9,
            },
          },
          required: ['baseline', 'current'],
        },
      },
      {
        name: 'extract_element_properties',
        description:
          'Extract visual properties of an element from screenshot. Placeholder - requires live browser. Use Playwright agent tools for actual implementation.',
        inputSchema: {
          type: 'object',
          properties: {
            screenshot_path: {
              type: 'string',
              description: 'Path to screenshot',
            },
            locator: {
              type: 'string',
              description: 'Playwright locator for element (e.g., "button:has-text(\'Create\')")',
            },
          },
          required: ['screenshot_path', 'locator'],
        },
      },
      {
        name: 'capture_multi_viewport',
        description:
          'Orchestrates multi-viewport screenshot capture (mobile, tablet, desktop). Provides implementation guidance - actual capture via Playwright E2E MCP.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to capture screenshots of',
            },
            viewports: {
              type: 'array',
              description:
                'Array of viewport configurations. Default: mobile (375x667), tablet (768x1024), desktop (1920x1080)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  width: { type: 'number' },
                  height: { type: 'number' },
                },
              },
            },
          },
          required: ['url'],
        },
      },
    ],
  };
});

/**
 * Handle tool execution requests
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'compare_screenshots': {
        const result = await compareScreenshots(
          args.baseline,
          args.current,
          args.threshold,
          args.options || {}
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'analyze_layout': {
        const result = await analyzeLayout(args.screenshot_path);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'detect_visual_regression': {
        const result = await detectVisualRegression(args.baseline, args.current, args.threshold);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'extract_element_properties': {
        const result = await extractElementProperties(args.screenshot_path, args.locator);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'capture_multi_viewport': {
        const result = await captureMultiViewport(args.url, args.viewports);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
  }
});

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Keimenon Visual Feedback MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
