#include <napi.h>

Napi::Value Status(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);
  result.Set("runtime", Napi::String::New(env, "litert-lm"));
  result.Set("state", Napi::String::New(env, "runtime_binding_incomplete"));
  result.Set("message", Napi::String::New(env, "LiteRT-LM C++ runtime is not linked yet."));
  return result;
}

void LoadModel(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Error::New(env, "RUNTIME_BINDING_INCOMPLETE: LiteRT-LM C++ model loading is not linked yet.")
      .ThrowAsJavaScriptException();
}

void Generate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Error::New(env, "RUNTIME_BINDING_INCOMPLETE: LiteRT-LM C++ generation is not linked yet.")
      .ThrowAsJavaScriptException();
}

void UnloadModel(const Napi::CallbackInfo& info) {
  // No-op
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "status"), Napi::Function::New(env, Status));
  exports.Set(Napi::String::New(env, "loadModel"), Napi::Function::New(env, LoadModel));
  exports.Set(Napi::String::New(env, "generate"), Napi::Function::New(env, Generate));
  exports.Set(Napi::String::New(env, "unloadModel"), Napi::Function::New(env, UnloadModel));
  return exports;
}

NODE_API_MODULE(litert_node_bindings, Init)
