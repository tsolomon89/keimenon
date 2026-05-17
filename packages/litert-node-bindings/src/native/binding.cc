#include <napi.h>
#include <filesystem>
#include <string>
#include <vector>
#include <cstdlib>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

// A dummy flag to track if a model is loaded (will stay false until real implementation)
static bool isModelLoaded = false;

struct DependencyDef {
  std::string filename;
  bool required;
};

#ifdef _WIN32
static const std::vector<DependencyDef> kDependencies = {
  {"libLiteRt.dll", true},
  {"libLiteRtWebGpuAccelerator.dll", false}
};
#else
static const std::vector<DependencyDef> kDependencies = {
  {"libLiteRt.so", true}
};
#endif

struct DependencyStatus {
  std::string filename;
  std::string path;
  bool required;
  bool present;
};

std::vector<DependencyStatus> CheckDependencies(const std::string& nativeDepsDir) {
  std::vector<DependencyStatus> results;
  
  if (nativeDepsDir.empty()) {
    for (const auto& dep : kDependencies) {
      results.push_back({dep.filename, "", dep.required, false});
    }
    return results;
  }

  std::filesystem::path depsDirPath(nativeDepsDir);

  for (const auto& dep : kDependencies) {
    bool present = false;
    std::filesystem::path absPath = depsDirPath / dep.filename;
    std::string pathStr = absPath.string();

#ifdef _WIN32
    HMODULE handle = LoadLibraryA(pathStr.c_str());
    if (handle) {
      FreeLibrary(handle);
      present = true;
    }
#else
    void* handle = dlopen(pathStr.c_str(), RTLD_LAZY);
    if (handle) {
      dlclose(handle);
      present = true;
    }
#endif
    results.push_back({dep.filename, pathStr, dep.required, present});
  }
  return results;
}

Napi::Value Status(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);
  result.Set("runtime", Napi::String::New(env, "litert-lm"));
  
  std::string nativeDepsDir = "";
  if (info.Length() > 0 && info[0].IsString()) {
    nativeDepsDir = info[0].As<Napi::String>().Utf8Value();
  }
  
  result.Set("native_deps_dir", Napi::String::New(env, nativeDepsDir));
  
#ifdef _WIN32
  result.Set("platform", Napi::String::New(env, "win32"));
#else
  result.Set("platform", Napi::String::New(env, "unix"));
#endif
  result.Set("arch", Napi::String::New(env, "x64"));

  auto deps = CheckDependencies(nativeDepsDir);
  Napi::Array depsArray = Napi::Array::New(env, deps.size());
  
  bool allRequiredPresent = true;
  bool allOptionalPresent = true;
  
  for (size_t i = 0; i < deps.size(); i++) {
    Napi::Object depObj = Napi::Object::New(env);
    depObj.Set("filename", Napi::String::New(env, deps[i].filename));
    if (!deps[i].path.empty()) {
      depObj.Set("path", Napi::String::New(env, deps[i].path));
    }
    depObj.Set("required", Napi::Boolean::New(env, deps[i].required));
    depObj.Set("present", Napi::Boolean::New(env, deps[i].present));
    depsArray.Set(i, depObj);
    
    if (deps[i].required && !deps[i].present) {
      allRequiredPresent = false;
    }
    if (!deps[i].required && !deps[i].present) {
      allOptionalPresent = false;
    }
  }
  
  result.Set("dependencies", depsArray);

  if (nativeDepsDir.empty()) {
    result.Set("state", Napi::String::New(env, "runtime_dependency_missing"));
    result.Set("details", Napi::String::New(env, "KEIMENON_NATIVE_DEPS_DIR is not configured."));
  } else if (!allRequiredPresent) {
    result.Set("state", Napi::String::New(env, "runtime_dependency_missing"));
    result.Set("details", Napi::String::New(env, "Required dependencies are missing."));
  } else if (!allOptionalPresent) {
    result.Set("state", Napi::String::New(env, "runtime_dependency_partial"));
    result.Set("details", Napi::String::New(env, "Required dependencies found, but optional dependencies are missing."));
  } else {
    // Both required and optional present, but C++ API isn't linked yet
    result.Set("state", Napi::String::New(env, "runtime_binding_incomplete"));
    result.Set("details", Napi::String::New(env, "All dependencies found, but C++ API is not fully linked."));
  }
  
  return result;
}

void LoadModel(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected for modelPath").ThrowAsJavaScriptException();
    return;
  }
  
  std::string modelPath = info[0].As<Napi::String>().Utf8Value();
  std::string nativeDepsDir = "";
  if (info.Length() > 1 && info[1].IsString()) {
    nativeDepsDir = info[1].As<Napi::String>().Utf8Value();
  }
  
  if (modelPath.length() < 9 || modelPath.substr(modelPath.length() - 9) != ".litertlm") {
    Napi::Error::New(env, "MODEL_INVALID: File extension must be .litertlm")
        .ThrowAsJavaScriptException();
    return;
  }
  
  if (!std::filesystem::exists(modelPath)) {
    Napi::Error::New(env, "MODEL_MISSING: Model file does not exist at path")
        .ThrowAsJavaScriptException();
    return;
  }
  
  auto deps = CheckDependencies(nativeDepsDir);
  for (const auto& dep : deps) {
    if (dep.required && !dep.present) {
      Napi::Error::New(env, ("RUNTIME_DEPENDENCY_MISSING: " + dep.filename + " is not available.").c_str())
          .ThrowAsJavaScriptException();
      return;
    }
  }
  
  Napi::Error::New(env, "RUNTIME_BINDING_INCOMPLETE: LiteRT-LM C++ model loading is not linked yet.")
      .ThrowAsJavaScriptException();
}

void Generate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  if (!isModelLoaded) {
    Napi::Error::New(env, "MODEL_NOT_LOADED: No model is currently loaded.")
        .ThrowAsJavaScriptException();
    return;
  }
  
  std::string nativeDepsDir = "";
  if (info.Length() > 1 && info[1].IsString()) {
    nativeDepsDir = info[1].As<Napi::String>().Utf8Value();
  }
  
  auto deps = CheckDependencies(nativeDepsDir);
  for (const auto& dep : deps) {
    if (dep.required && !dep.present) {
      Napi::Error::New(env, ("RUNTIME_DEPENDENCY_MISSING: " + dep.filename + " is not available.").c_str())
          .ThrowAsJavaScriptException();
      return;
    }
  }

  Napi::Error::New(env, "RUNTIME_BINDING_INCOMPLETE: LiteRT-LM C++ generation is not linked yet.")
      .ThrowAsJavaScriptException();
}

void UnloadModel(const Napi::CallbackInfo& info) {
  isModelLoaded = false;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "status"), Napi::Function::New(env, Status));
  exports.Set(Napi::String::New(env, "loadModel"), Napi::Function::New(env, LoadModel));
  exports.Set(Napi::String::New(env, "generate"), Napi::Function::New(env, Generate));
  exports.Set(Napi::String::New(env, "unloadModel"), Napi::Function::New(env, UnloadModel));
  return exports;
}

NODE_API_MODULE(litert_node_bindings, Init)
