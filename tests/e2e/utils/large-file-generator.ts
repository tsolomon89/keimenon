import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Generate a large CSV file for testing
 * @param sizeMB Target size in megabytes
 * @returns Path to the generated file
 */
export async function generateLargeDataset(sizeMB: number): Promise<string> {
  const tempDir = os.tmpdir();
  const filePath = path.join(tempDir, `large_dataset_${sizeMB}MB_${Date.now()}.csv`);
  const writeStream = fs.createWriteStream(filePath);

  // Header
  writeStream.write('id,name,email,description,score,category,timestamp\n');

  const chunk = '123e4567-e89b-12d3-a456-426614174000,John Doe,john.doe@example.com,"This is a long description text to pad out the file size and make it substantial enough for testing chunked uploads.",99.9,Enterprise,2023-01-01T00:00:00Z\n';
  const chunkSize = Buffer.byteLength(chunk);
  const targetBytes = sizeMB * 1024 * 1024;
  let currentBytes = 0;

  return new Promise((resolve, reject) => {
    function write() {
      let ok = true;
      while (currentBytes < targetBytes && ok) {
        currentBytes += chunkSize;
        if (currentBytes >= targetBytes) {
          writeStream.write(chunk, () => {
             writeStream.end();
             resolve(filePath);
          });
          return;
        }
        ok = writeStream.write(chunk);
      }
      if (currentBytes < targetBytes) {
        writeStream.once('drain', write);
      }
    }
    write();
    writeStream.on('error', reject);
  });
}

export function cleanupLargeFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
