import os from 'node:os';
import path from 'node:path';

export function getImportArtifactsRoot(): string {
  return path.join(os.tmpdir(), 'chat-imports');
}

export function getUploadChunksRoot(): string {
  return path.join(os.tmpdir(), 'keimenon-uploads');
}

export function isPathUnder(root: string, target: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

export function isManagedImportArtifactPath(targetPath: string): boolean {
  return (
    isPathUnder(getImportArtifactsRoot(), targetPath) ||
    isPathUnder(getUploadChunksRoot(), targetPath)
  );
}
