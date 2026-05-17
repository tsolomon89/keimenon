#include <napi.h>
#include <filesystem>
#include <string>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

// A dummy flag to track if a model is loaded (will stay false until real implementation)
static bool isModelLoaded = false;

bool CheckLiteRTDependency() {
#ifdef _WIN32
  HMODULE handle = LoadLibraryA("libLiteRt.dll");
  if (handle) {
    FreeLibrary(handle);
    return true;
  }
  return false;
#else
  void* handle = dlopen("libLiteRt.so", RTLD_LAZY);
  if (handle) {
    dlclose(handle);
    return true;
  }
  return false;
#endif
}

Napi::Value Status(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);
  result.Set("runtime", Napi::String::New(env, "litert-lm"));
  
#ifdef _WIN32
  result.Set("platform", Napi::String::New(env, "win32"));
#else
  result.Set("platform", Napi::String::New(env, "unix"));
#endif
  // To keep it simple, assume x64 for the bindings (which is standard for the project target)
  result.Set("arch", Napi::String::New(env, "x64"));

  if (CheckLiteRTDependency()) {
    result.Set("state", Napi::String::New(env, "runtime_binding_incomplete"));
    result.Set("details", Napi::String::New(env, "LiteRT-LM DLL found, but C++ API is not fully linked."));
  } else {
    result.Set("state", Napi::String::New(env, "runtime_dependency_missing"));
    result.Set("details", Napi::String::New(env, "libLiteRt.dll missing from native directories."));
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
  
  // Extension check
  if (modelPath.length() < 9 || modelPath.substr(modelPath.length() - 9) != ".litertlm") {
    Napi::Error::New(env, "MODEL_INVALID: File extension must be .litertlm")
        .ThrowAsJavaScriptException();
    return;
  }
  
  // File exists check
  if (!std::filesystem::exists(modelPath)) {
    Napi::Error::New(env, "MODEL_MISSING: Model file does not exist at path")
        .ThrowAsJavaScriptException();
    return;
  }
  
  // Dependency check
  if (!CheckLiteRTDependency()) {
    Napi::Error::New(env, "RUNTIME_DEPENDENCY_MISSING: libLiteRt.dll is not available.")
        .ThrowAsJavaScriptException();
    return;
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
  
  if (!CheckLiteRTDependency()) {
    Napi::Error::New(env, "RUNTIME_DEPENDENCY_MISSING: libLiteRt.dll is not available.")
        .ThrowAsJavaScriptException();
    return;
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
