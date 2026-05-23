#include <node_api.h>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

// LiteRT C API opaque handles
typedef struct LiteRtLmEngineSettings LiteRtLmEngineSettings;
typedef struct LiteRtLmEngine LiteRtLmEngine;
typedef struct LiteRtLmSession LiteRtLmSession;
typedef struct LiteRtLmResponses LiteRtLmResponses;
typedef struct LiteRtLmInputData LiteRtLmInputData;

// Function pointer definitions matching c/engine.h symbols
typedef LiteRtLmEngineSettings* (*FnEngineSettingsCreate)(const char*, const char*, const char*, const char*);
typedef void (*FnEngineSettingsSetMaxNumTokens)(LiteRtLmEngineSettings*, int);
typedef void (*FnEngineSettingsDelete)(LiteRtLmEngineSettings*);
typedef LiteRtLmEngine* (*FnEngineCreate)(const LiteRtLmEngineSettings*);
typedef void (*FnEngineDelete)(LiteRtLmEngine*);
typedef LiteRtLmSession* (*FnEngineCreateSession)(LiteRtLmEngine*, void*);
typedef void (*FnSessionDelete)(LiteRtLmSession*);
typedef LiteRtLmResponses* (*FnSessionGenerateContent)(LiteRtLmSession*, const void*, size_t);
typedef int (*FnResponsesGetNumCandidates)(const LiteRtLmResponses*);
typedef const char* (*FnResponsesGetResponseTextAt)(const LiteRtLmResponses*, int);
typedef void (*FnResponsesDelete)(LiteRtLmResponses*);

// Global C++ module handles
#ifdef _WIN32
static HMODULE g_liteRtDll = NULL;
#else
static void* g_liteRtDll = NULL;
#endif

static FnEngineSettingsCreate fnSettingsCreate = nullptr;
static FnEngineSettingsSetMaxNumTokens fnSettingsSetMax = nullptr;
static FnEngineSettingsDelete fnSettingsDelete = nullptr;
static FnEngineCreate fnEngineCreate = nullptr;
static FnEngineDelete fnEngineDelete = nullptr;
static FnEngineCreateSession fnEngineCreateSession = nullptr;
static FnSessionDelete fnSessionDelete = nullptr;
static FnSessionGenerateContent fnSessionGenerateContent = nullptr;
static FnResponsesGetNumCandidates fnResponsesGetNum = nullptr;
static FnResponsesGetResponseTextAt fnResponsesGetText = nullptr;
static FnResponsesDelete fnResponsesDelete = nullptr;

static LiteRtLmEngine* g_engine = nullptr;
static LiteRtLmSession* g_session = nullptr;
static bool g_isModelLoaded = false;
static std::string g_loadedModelPath = "";

// Dynamic Library Loader Utility
static bool LoadLiteRtLibrary() {
    if (g_liteRtDll != NULL) return true;

#ifdef _WIN32
    g_liteRtDll = LoadLibraryA("libLiteRt.dll");
    if (!g_liteRtDll) return false;

    fnSettingsCreate = (FnEngineSettingsCreate)GetProcAddress(g_liteRtDll, "litert_lm_engine_settings_create");
    fnSettingsSetMax = (FnEngineSettingsSetMaxNumTokens)GetProcAddress(g_liteRtDll, "litert_lm_engine_settings_set_max_num_tokens");
    fnSettingsDelete = (FnEngineSettingsDelete)GetProcAddress(g_liteRtDll, "litert_lm_engine_settings_delete");
    fnEngineCreate = (FnEngineCreate)GetProcAddress(g_liteRtDll, "litert_lm_engine_create");
    fnEngineDelete = (FnEngineDelete)GetProcAddress(g_liteRtDll, "litert_lm_engine_delete");
    fnEngineCreateSession = (FnEngineCreateSession)GetProcAddress(g_liteRtDll, "litert_lm_engine_create_session");
    fnSessionDelete = (FnSessionDelete)GetProcAddress(g_liteRtDll, "litert_lm_session_delete");
    fnSessionGenerateContent = (FnSessionGenerateContent)GetProcAddress(g_liteRtDll, "litert_lm_session_generate_content");
    fnResponsesGetNum = (FnResponsesGetNumCandidates)GetProcAddress(g_liteRtDll, "litert_lm_responses_get_num_candidates");
    fnResponsesGetText = (FnResponsesGetResponseTextAt)GetProcAddress(g_liteRtDll, "litert_lm_responses_get_response_text_at");
    fnResponsesDelete = (FnResponsesDelete)GetProcAddress(g_liteRtDll, "litert_lm_responses_delete");
#else
    g_liteRtDll = dlopen("libLiteRt.so", RTLD_LAZY);
    if (!g_liteRtDll) return false;

    fnSettingsCreate = (FnEngineSettingsCreate)dlsym(g_liteRtDll, "litert_lm_engine_settings_create");
    fnSettingsSetMax = (FnEngineSettingsSetMaxNumTokens)dlsym(g_liteRtDll, "litert_lm_engine_settings_set_max_num_tokens");
    fnSettingsDelete = (FnEngineSettingsDelete)dlsym(g_liteRtDll, "litert_lm_engine_settings_delete");
    fnEngineCreate = (FnEngineCreate)dlsym(g_liteRtDll, "litert_lm_engine_create");
    fnEngineDelete = (FnEngineDelete)dlsym(g_liteRtDll, "litert_lm_engine_delete");
    fnEngineCreateSession = (FnEngineCreateSession)dlsym(g_liteRtDll, "litert_lm_engine_create_session");
    fnSessionDelete = (FnSessionDelete)dlsym(g_liteRtDll, "litert_lm_session_delete");
    fnSessionGenerateContent = (FnSessionGenerateContent)dlsym(g_liteRtDll, "litert_lm_session_generate_content");
    fnResponsesGetNum = (FnResponsesGetNumCandidates)dlsym(g_liteRtDll, "litert_lm_responses_get_num_candidates");
    fnResponsesGetText = (FnResponsesGetResponseTextAt)dlsym(g_liteRtDll, "litert_lm_responses_get_response_text_at");
    fnResponsesDelete = (FnResponsesDelete)dlsym(g_liteRtDll, "litert_lm_responses_delete");
#endif

    // Verify all functions loaded successfully
    if (!fnSettingsCreate || !fnSettingsSetMax || !fnSettingsDelete ||
        !fnEngineCreate || !fnEngineDelete || !fnEngineCreateSession ||
        !fnSessionDelete || !fnSessionGenerateContent || !fnResponsesGetNum ||
        !fnResponsesGetText || !fnResponsesDelete) {
        
#ifdef _WIN32
        FreeLibrary(g_liteRtDll);
#else
        dlclose(g_liteRtDll);
#endif
        g_liteRtDll = NULL;
        return false;
    }

    return true;
}

// N-API helper to throw JS errors
static void ThrowJsError(napi_env env, const char* code, const char* msg) {
    napi_value error, jsCode, jsMsg;
    napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &jsCode);
    napi_create_string_utf8(env, msg, NAPI_AUTO_LENGTH, &jsMsg);
    napi_create_error(env, jsCode, jsMsg, &error);
    napi_throw(env, error);
}

// JS: status() -> { ok: boolean, state: string, message: string }
static napi_value BindingStatus(napi_env env, napi_callback_info info) {
    napi_value resultObj;
    napi_create_object(env, &resultObj);

    bool libOk = LoadLiteRtLibrary();

    napi_value okVal, stateVal, msgVal;
    if (!libOk) {
        napi_get_boolean(env, false, &okVal);
        napi_create_string_utf8(env, "runtime_dependency_missing", NAPI_AUTO_LENGTH, &stateVal);
        napi_create_string_utf8(env, "Required LiteRT dynamic libraries (libLiteRt.dll) are missing in environment.", NAPI_AUTO_LENGTH, &msgVal);
    } else if (!g_isModelLoaded) {
        napi_get_boolean(env, true, &okVal);
        napi_create_string_utf8(env, "runtime_dependency_found", NAPI_AUTO_LENGTH, &stateVal);
        napi_create_string_utf8(env, "LiteRT-LM native binaries loaded successfully. Ready to load model.", NAPI_AUTO_LENGTH, &msgVal);
    } else {
        napi_get_boolean(env, true, &okVal);
        napi_create_string_utf8(env, "model_loaded", NAPI_AUTO_LENGTH, &stateVal);
        napi_create_string_utf8(env, ("Model is loaded and active: " + g_loadedModelPath).c_str(), NAPI_AUTO_LENGTH, &msgVal);
    }

    napi_set_named_property(env, resultObj, "ok", okVal);
    napi_set_named_property(env, resultObj, "state", stateVal);
    napi_set_named_property(env, resultObj, "message", msgVal);

    return resultObj;
}

// JS: unloadModel() -> Promise<void>
static napi_value UnloadModel(napi_env env, napi_callback_info info) {
    if (g_session && fnSessionDelete) {
        fnSessionDelete(g_session);
        g_session = nullptr;
    }
    if (g_engine && fnEngineDelete) {
        fnEngineDelete(g_engine);
        g_engine = nullptr;
    }
    g_isModelLoaded = false;
    g_loadedModelPath = "";

    napi_deferred deferred;
    napi_value promise;
    napi_create_promise(env, &deferred, &promise);
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    napi_resolve_deferred(env, deferred, undefined);

    return promise;
}

// JS: loadModel(path) -> Promise<{ success: boolean, message: string }>
static napi_value LoadModel(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    napi_deferred deferred;
    napi_value promise;
    napi_create_promise(env, &deferred, &promise);

    if (argc < 1) {
        napi_value rejectVal;
        napi_create_string_utf8(env, "Missing model path argument", NAPI_AUTO_LENGTH, &rejectVal);
        napi_reject_deferred(env, deferred, rejectVal);
        return promise;
    }

    char modelPath[1024];
    size_t pathLen;
    napi_get_value_string_utf8(env, args[0], modelPath, sizeof(modelPath), &pathLen);

    if (!LoadLiteRtLibrary()) {
        napi_value rejectVal;
        napi_create_string_utf8(env, "LiteRT-LM native binaries not loaded", NAPI_AUTO_LENGTH, &rejectVal);
        napi_reject_deferred(env, deferred, rejectVal);
        return promise;
    }

    // Unload existing if loaded
    if (g_isModelLoaded) {
        if (g_session) fnSessionDelete(g_session);
        if (g_engine) fnEngineDelete(g_engine);
        g_session = nullptr;
        g_engine = nullptr;
        g_isModelLoaded = false;
    }

    // Attempt to load settings and engine
    LiteRtLmEngineSettings* settings = fnSettingsCreate(modelPath, "cpu", nullptr, nullptr);
    if (!settings) {
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, msg;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "Failed to create LiteRT-LM engine settings.", NAPI_AUTO_LENGTH, &msg);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "message", msg);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    // Set max tokens standard
    fnSettingsSetMax(settings, 1024);

    g_engine = fnEngineCreate(settings);
    fnSettingsDelete(settings); // Settings are copied in engine creation, we must free.

    if (!g_engine) {
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, msg;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "Failed to instantiate LiteRT-LM engine. Verify weight compatibility.", NAPI_AUTO_LENGTH, &msg);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "message", msg);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    g_session = fnEngineCreateSession(g_engine, nullptr);
    if (!g_session) {
        fnEngineDelete(g_engine);
        g_engine = nullptr;
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, msg;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "Failed to create inference session from engine.", NAPI_AUTO_LENGTH, &msg);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "message", msg);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    g_isModelLoaded = true;
    g_loadedModelPath = modelPath;

    napi_value resObj;
    napi_create_object(env, &resObj);
    napi_value success, msg;
    napi_get_boolean(env, true, &success);
    napi_create_string_utf8(env, "Model loaded successfully into CPU session.", NAPI_AUTO_LENGTH, &msg);
    napi_set_named_property(env, resObj, "success", success);
    napi_set_named_property(env, resObj, "message", msg);
    napi_resolve_deferred(env, deferred, resObj);

    return promise;
}

// JS: generate(prompt, maxTokens) -> Promise<{ success: boolean, text?: string, error?: string }>
static napi_value Generate(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    napi_deferred deferred;
    napi_value promise;
    napi_create_promise(env, &deferred, &promise);

    if (!g_isModelLoaded || !g_session || !fnSessionGenerateContent) {
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, error;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "Inference engine is not loaded.", NAPI_AUTO_LENGTH, &error);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "error", error);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    char prompt[4096];
    size_t promptLen;
    napi_get_value_string_utf8(env, args[0], prompt, sizeof(prompt), &promptLen);

    // Call generate API (LiteRT-LM generate input maps standard raw bytes)
    LiteRtLmResponses* responses = fnSessionGenerateContent(g_session, prompt, promptLen);
    if (!responses) {
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, error;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "LiteRT-LM inference execution failed.", NAPI_AUTO_LENGTH, &error);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "error", error);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    int candidates = fnResponsesGetNum(responses);
    napi_value resObj;
    napi_create_object(env, &resObj);

    if (candidates <= 0) {
        fnResponsesDelete(responses);
        napi_value success, text;
        napi_get_boolean(env, true, &success);
        napi_create_string_utf8(env, "", 0, &text);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "text", text);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    const char* textContent = fnResponsesGetText(responses, 0);
    napi_value success, text;
    napi_get_boolean(env, true, &success);
    napi_create_string_utf8(env, textContent ? textContent : "", NAPI_AUTO_LENGTH, &text);
    napi_set_named_property(env, resObj, "success", success);
    napi_set_named_property(env, resObj, "text", text);

    fnResponsesDelete(responses);
    napi_resolve_deferred(env, deferred, resObj);

    return promise;
}

// Module registration
static napi_value Init(napi_env env, napi_value exports) {
    napi_value fnStatus, fnLoad, fnGen, fnUnload;

    napi_create_function(env, "status", NAPI_AUTO_LENGTH, BindingStatus, nullptr, &fnStatus);
    napi_create_function(env, "loadModel", NAPI_AUTO_LENGTH, LoadModel, nullptr, &fnLoad);
    napi_create_function(env, "generate", NAPI_AUTO_LENGTH, Generate, nullptr, &fnGen);
    napi_create_function(env, "unloadModel", NAPI_AUTO_LENGTH, UnloadModel, nullptr, &fnUnload);

    napi_set_named_property(env, exports, "status", fnStatus);
    napi_set_named_property(env, exports, "loadModel", fnLoad);
    napi_set_named_property(env, exports, "generate", fnGen);
    napi_set_named_property(env, exports, "unloadModel", fnUnload);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
