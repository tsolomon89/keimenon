import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { StreamingJSONParser } from '../services/streaming-json-parser';

export interface TestDataConfig {
  sourceFile: string;
  outputDir: string;
  sizes: Array<{
    name: string;
    conversationCount: number;
  }>;
}

/**
 * Generate synthetic test data from real conversation files
 * Creates smaller samples for testing without loading entire files
 */
export class TestDataGenerator {
  /**
   * Generate test datasets of various sizes
   */
  static async generateTestData(config: TestDataConfig): Promise<void> {
    const { sourceFile, outputDir, sizes } = config;

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Generating test data from: ${sourceFile}`);
    console.log(`Output directory: ${outputDir}`);

    for (const size of sizes) {
      console.log(`\nGenerating ${size.name} dataset (${size.conversationCount} conversations)...`);

      const outputFile = join(outputDir, `${size.name}.json`);
      const conversations: any[] = [];

      const parser = new StreamingJSONParser();

      parser.on('batch', (batch) => {
        conversations.push(...batch);
      });

      try {
        // Parse until we have enough conversations
        parser.setBufferSize(size.conversationCount);

        let collected = 0;
        parser.on('batch', (batch) => {
          conversations.push(...batch.slice(0, size.conversationCount - collected));
          collected = conversations.length;

          // Stop parsing once we have enough
          if (collected >= size.conversationCount) {
            parser.removeAllListeners();
          }
        });

        await parser.parseFile(sourceFile);

        // Write output file
        const output = createWriteStream(outputFile);
        output.write(JSON.stringify(conversations.slice(0, size.conversationCount), null, 2));
        output.end();

        console.log(`  ✓ Created: ${size.name}.json (${conversations.length} conversations)`);

        // Calculate approximate file size
        const fs = require('fs');
        const stats = fs.statSync(outputFile);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`    Size: ${sizeMB} MB`);

      } catch (error: any) {
        console.error(`  ✗ Failed to create ${size.name}:`, error.message);
      }
    }

    console.log('\n✓ Test data generation complete!');
  }

  /**
   * Generate a sample with specific characteristics for testing
   */
  static async generateSample(
    sourceFile: string,
    outputFile: string,
    options: {
      conversationCount?: number;
      includeCode?: boolean;
      includeLongMessages?: boolean;
      platforms?: string[];
    }
  ): Promise<void> {
    const {
      conversationCount = 10,
      includeCode = true,
      includeLongMessages = true,
      platforms = ['chatgpt', 'claude'],
    } = options;

    const conversations: any[] = [];
    const parser = new StreamingJSONParser();

    parser.on('batch', (batch) => {
      for (const conv of batch) {
        // Filter by platform if specified
        if (platforms && !platforms.includes(conv.platform)) {
          continue;
        }

        // Filter for code blocks if needed
        if (includeCode) {
          const hasCode = conv.messages.some((m: any) =>
            m.content.includes('```') || m.content.includes('`')
          );
          if (!hasCode) continue;
        }

        // Filter for long messages if needed
        if (includeLongMessages) {
          const hasLongMessage = conv.messages.some(
            (m: any) => m.content.length > 500
          );
          if (!hasLongMessage) continue;
        }

        conversations.push(conv);

        if (conversations.length >= conversationCount) {
          parser.removeAllListeners();
          break;
        }
      }
    });

    await parser.parseFile(sourceFile);

    // Write output
    const output = createWriteStream(outputFile);
    output.write(JSON.stringify(conversations, null, 2));
    output.end();

    console.log(`Generated sample: ${outputFile} (${conversations.length} conversations)`);
  }

  /**
   * Analyze file structure without loading entire file
   */
  static async analyzeFile(filePath: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    platforms: Record<string, number>;
    avgMessagesPerConv: number;
    sampleConversations: any[];
  }> {
    let totalConversations = 0;
    let totalMessages = 0;
    const platforms: Record<string, number> = {};
    const sampleConversations: any[] = [];

    const parser = new StreamingJSONParser();

    parser.on('batch', (batch) => {
      totalConversations += batch.length;

      for (const conv of batch) {
        totalMessages += conv.messages.length;
        platforms[conv.platform] = (platforms[conv.platform] || 0) + 1;

        // Keep first 5 as samples
        if (sampleConversations.length < 5) {
          sampleConversations.push({
            id: conv.id,
            title: conv.title,
            platform: conv.platform,
            messageCount: conv.messages.length,
          });
        }
      }
    });

    await parser.parseFile(filePath);

    return {
      totalConversations,
      totalMessages,
      platforms,
      avgMessagesPerConv: totalConversations > 0
        ? Math.round(totalMessages / totalConversations)
        : 0,
      sampleConversations,
    };
  }
}

// CLI usage
if (require.main === module) {
  const command = process.argv[2];
  const sourceFile = process.argv[3];

  if (command === 'analyze' && sourceFile) {
    TestDataGenerator.analyzeFile(sourceFile)
      .then((analysis) => {
        console.log('\nFile Analysis:');
        console.log('==============');
        console.log(`Total Conversations: ${analysis.totalConversations}`);
        console.log(`Total Messages: ${analysis.totalMessages}`);
        console.log(`Avg Messages/Conv: ${analysis.avgMessagesPerConv}`);
        console.log('\nPlatforms:');
        Object.entries(analysis.platforms).forEach(([platform, count]) => {
          console.log(`  ${platform}: ${count}`);
        });
        console.log('\nSample Conversations:');
        analysis.sampleConversations.forEach((conv, i) => {
          console.log(`  ${i + 1}. ${conv.title} (${conv.platform}, ${conv.messageCount} msgs)`);
        });
      })
      .catch((err) => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  } else if (command === 'generate' && sourceFile) {
    const outputDir = process.argv[4] || './test-data';

    TestDataGenerator.generateTestData({
      sourceFile,
      outputDir,
      sizes: [
        { name: 'tiny', conversationCount: 5 },
        { name: 'small', conversationCount: 50 },
        { name: 'medium', conversationCount: 500 },
        { name: 'large', conversationCount: 5000 },
      ],
    })
      .catch((err) => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  Analyze: node test-data-generator.js analyze <source-file>');
    console.log('  Generate: node test-data-generator.js generate <source-file> [output-dir]');
    process.exit(1);
  }
}
