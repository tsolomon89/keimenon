import type { LiteRTNodeBindings } from '@keimenon/litert-node-bindings';
import { HelperStatusState } from './adapter';

export interface BindingResolution {
  state: HelperStatusState;
  bindings: LiteRTNodeBindings | null;
  native_deps_dir?: string;
  dependencies?: { filename: string; path?: string; present: boolean; required: boolean }[];
}

export function tryLoadBindings(
  moduleName = '@keimenon/litert-node-bindings',
  bindingsOverride?: any
): BindingResolution {
  let bindings: any;
  if (bindingsOverride !== undefined) {
    bindings = bindingsOverride;
  } else {
    try {
      const litertMod = require('@keimenon/litert-node-bindings');
      bindings = litertMod.getLiteRTBindings();
    } catch (err: any) {
      if (err.message && err.message.includes('RUNTIME_BINDING_INCOMPLETE')) {
        return {
          state: 'runtime_binding_incomplete',
          bindings: null,
        };
      }
      return {
        state: 'runtime_dependency_missing',
        bindings: null,
      };
    }
  }

  // Ensure the binding object is present
  if (!bindings) {
    return {
      state: 'runtime_dependency_missing',
      bindings: null,
    };
  }

  // Verify completeness of the ABI contract
  if (typeof bindings.loadModel !== 'function') {
    return {
      state: 'runtime_binding_incomplete',
      bindings: null,
    };
  }

  if (typeof bindings.generate !== 'function') {
    return {
      state: 'runtime_binding_incomplete',
      bindings: null,
    };
  }

  let dependencyInfo: any = undefined;
  let nativeDepsDir: string | undefined = undefined;

  // Probe status
  try {
    const status = bindings.status();
    if (status) {
      dependencyInfo = status.dependencies;
      nativeDepsDir = status.native_deps_dir;
      if (status.state) {
        if (
          status.state === 'runtime_dependency_missing' ||
          status.state === 'runtime_dependency_partial' ||
          status.state === 'runtime_dependency_found' ||
          status.state === 'runtime_binding_incomplete'
        ) {
          return {
            state: status.state as HelperStatusState,
            bindings: null,
            native_deps_dir: nativeDepsDir,
            dependencies: dependencyInfo,
          };
        }
      }
    }
  } catch (err: any) {
    // If status() throws, assume bindings are broken
    return {
      state: 'runtime_binding_incomplete',
      bindings: null,
    };
  }

  return {
    state: 'ready',
    bindings: bindings as LiteRTNodeBindings,
    native_deps_dir: nativeDepsDir,
    dependencies: dependencyInfo,
  };
}
