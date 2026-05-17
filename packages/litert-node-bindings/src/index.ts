import bindings from 'bindings';
import fs from 'fs';
import path from 'path';
export type * from './types';
import type { LiteRTNodeBindings } from './types';

export function resolveNativeDepsDir(): string {
  if (process.env.KEIMENON_NATIVE_DEPS_DIR) {
    return process.env.KEIMENON_NATIVE_DEPS_DIR;
  }

  if ((process as any).resourcesPath) {
    const packagedPath = path.join((process as any).resourcesPath, 'native', 'win32-x64');
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }
  }

  const devPath = path.resolve(__dirname, '../native/win32-x64/bin');
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  return '';
}

export function getLiteRTBindings(): LiteRTNodeBindings {
  let nativeBinding: any;
  try {
    nativeBinding = bindings('litert-node-bindings.node');
  } catch (err: any) {
    throw new Error(
      'RUNTIME_DEPENDENCY_MISSING: Native bindings not compiled or failed to load. ' + err.message
    );
  }

  if (
    !nativeBinding ||
    typeof nativeBinding.loadModel !== 'function' ||
    typeof nativeBinding.generate !== 'function'
  ) {
    throw new Error(
      'RUNTIME_BINDING_INCOMPLETE: Native bindings loaded but missing required methods.'
    );
  }

  const nativeDepsDir = resolveNativeDepsDir();

  return {
    status: () => nativeBinding.status(nativeDepsDir),
    loadModel: (modelPath: string) => nativeBinding.loadModel(modelPath, nativeDepsDir),
    generate: (prompt: string) => nativeBinding.generate(prompt, nativeDepsDir),
  };
}
