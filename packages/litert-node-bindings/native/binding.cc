#include <node_api.h>
#include <string>
#include <vector>
#include <mutex>
#include <cstdio>

#ifdef _WIN32
#include <windows.h>
#include <io.h>
#else
#include <dlfcn.h>
#include <unistd.h>
#endif

// LiteRT C API opaque handles matching vendor/litert-lm/c/engine.h
typedef struct LiteRtLmEngineSettings LiteRtLmEngineSettings;
typedef struct LiteRtLmEngine LiteRtLmEngine;
typedef struct LiteRtLmSession LiteRtLmSession;
typedef struct LiteRtLmResponses LiteRtLmResponses;
typedef struct LiteRtLmSessionConfig LiteRtLmSessionConfig;

// Represents the type of input data in LiteRT-LM C API
typedef enum {
  kLiteRtLmInputDataTypeText = 0,
  kLiteRtLmInputDataTypeImage = 1,
  kLiteRtLmInputDataTypeImageEnd = 2,
  kLiteRtLmInputDataTypeAudio = 3,
  kLiteRtLmInputDataTypeAudioEnd = 4,
} LiteRtLmInputDataType;

// Represents a single piece of input data in LiteRT-LM C API
typedef struct {
  LiteRtLmInputDataType type;
  const void* data;
  size_t size;
} LiteRtLmInputData;

// Function pointer definitions matching vendor/litert-lm/c/engine.h symbols
typedef LiteRtLmEngineSettings* (*FnEngineSettingsCreate)(const char*, const char*, const char*, const char*);
typedef void (*FnEngineSettingsSetMaxNumTokens)(LiteRtLmEngineSettings*, int);
typedef void (*FnEngineSettingsDelete)(LiteRtLmEngineSettings*);
typedef LiteRtLmEngine* (*FnEngineCreate)(const LiteRtLmEngineSettings*);
typedef void (*FnEngineDelete)(LiteRtLmEngine*);
typedef LiteRtLmSessionConfig* (*FnSessionConfigCreate)();
typedef void (*FnSessionConfigSetMaxOutputTokens)(LiteRtLmSessionConfig*, int);
typedef void (*FnSessionConfigDelete)(LiteRtLmSessionConfig*);
typedef LiteRtLmSession* (*FnEngineCreateSession)(LiteRtLmEngine*, LiteRtLmSessionConfig*);
typedef void (*FnSessionDelete)(LiteRtLmSession*);
typedef void (*FnSessionCancelProcess)(LiteRtLmSession*);
typedef LiteRtLmResponses* (*FnSessionGenerateContent)(LiteRtLmSession*, const LiteRtLmInputData*, size_t);
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
static FnSessionConfigCreate fnSessionConfigCreate = nullptr;
static FnSessionConfigSetMaxOutputTokens fnSessionConfigSetMaxOutputTokens = nullptr;
static FnSessionConfigDelete fnSessionConfigDelete = nullptr;
static FnEngineCreateSession fnEngineCreateSession = nullptr;
static FnSessionDelete fnSessionDelete = nullptr;
static FnSessionCancelProcess fnSessionCancelProcess = nullptr;
static FnSessionGenerateContent fnSessionGenerateContent = nullptr;
static FnResponsesGetNumCandidates fnResponsesGetNum = nullptr;
static FnResponsesGetResponseTextAt fnResponsesGetText = nullptr;
static FnResponsesDelete fnResponsesDelete = nullptr;

static std::mutex g_inferenceMutex;
static LiteRtLmEngine* g_engine = nullptr;
static LiteRtLmSession* g_session = nullptr;
static bool g_isModelLoaded = false;
static std::string g_loadedModelPath = "";

#ifdef _WIN32
static std::string GetCurrentModuleDirectory() {
    char path[MAX_PATH];
    HMODULE hModule = NULL;
    GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | 
                       GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                       (LPCSTR)&GetCurrentModuleDirectory, &hModule);
    GetModuleFileNameA(hModule, path, sizeof(path));
    std::string sPath(path);
    size_t lastSlash = sPath.find_last_of("\\/");
    if (lastSlash != std::string::npos) {
        return sPath.substr(0, lastSlash);
    }
    return "";
}
#endif

static void ResetFunctionPointers() {
    fnSettingsCreate = nullptr;
    fnSettingsSetMax = nullptr;
    fnSettingsDelete = nullptr;
    fnEngineCreate = nullptr;
    fnEngineDelete = nullptr;
    fnSessionConfigCreate = nullptr;
    fnSessionConfigSetMaxOutputTokens = nullptr;
    fnSessionConfigDelete = nullptr;
    fnEngineCreateSession = nullptr;
    fnSessionDelete = nullptr;
    fnSessionCancelProcess = nullptr;
    fnSessionGenerateContent = nullptr;
    fnResponsesGetNum = nullptr;
    fnResponsesGetText = nullptr;
    fnResponsesDelete = nullptr;
}

// Dynamic Library Loader Utility - Truthful symbol resolution and strict production gating
static bool LoadLiteRtLibrary() {
    if (g_liteRtDll != NULL && fnEngineCreate != nullptr && fnSessionGenerateContent != nullptr) {
        return true;
    }

#ifdef _WIN32
    if (g_liteRtDll == NULL) {
        std::string moduleDir = GetCurrentModuleDirectory();
        if (!moduleDir.empty()) {
            std::string binDir = moduleDir + "\\bin";
            SetDllDirectoryA(binDir.c_str());
        }
        g_liteRtDll = LoadLibraryA("libLiteRt.dll");
        SetDllDirectoryA(NULL);
    }
    if (!g_liteRtDll) {
        ResetFunctionPointers();
        return false;
    }

    fnSettingsCreate = (FnEngineSettingsCreate)GetProcAddress(g_liteRtDll, "litert_lm_engine_settings_create");
    fnSettingsSetMax = (FnEngineSettingsSetMaxNumTokens)GetProcAddress(g_liteRtDll, "litert_lm_engine_settings_set_max_num_tokens");
    fnSettingsDelete = (FnEngineSettingsDelete)GetProcAddress(g_liteRtDll, "litert_lm_engine_settings_delete");
    fnEngineCreate = (FnEngineCreate)GetProcAddress(g_liteRtDll, "litert_lm_engine_create");
    fnEngineDelete = (FnEngineDelete)GetProcAddress(g_liteRtDll, "litert_lm_engine_delete");
    fnSessionConfigCreate = (FnSessionConfigCreate)GetProcAddress(g_liteRtDll, "litert_lm_session_config_create");
    fnSessionConfigSetMaxOutputTokens = (FnSessionConfigSetMaxOutputTokens)GetProcAddress(g_liteRtDll, "litert_lm_session_config_set_max_output_tokens");
    fnSessionConfigDelete = (FnSessionConfigDelete)GetProcAddress(g_liteRtDll, "litert_lm_session_config_delete");
    fnEngineCreateSession = (FnEngineCreateSession)GetProcAddress(g_liteRtDll, "litert_lm_engine_create_session");
    fnSessionDelete = (FnSessionDelete)GetProcAddress(g_liteRtDll, "litert_lm_session_delete");
    fnSessionCancelProcess = (FnSessionCancelProcess)GetProcAddress(g_liteRtDll, "litert_lm_session_cancel_process");
    fnSessionGenerateContent = (FnSessionGenerateContent)GetProcAddress(g_liteRtDll, "litert_lm_session_generate_content");
    fnResponsesGetNum = (FnResponsesGetNumCandidates)GetProcAddress(g_liteRtDll, "litert_lm_responses_get_num_candidates");
    fnResponsesGetText = (FnResponsesGetResponseTextAt)GetProcAddress(g_liteRtDll, "litert_lm_responses_get_response_text_at");
    fnResponsesDelete = (FnResponsesDelete)GetProcAddress(g_liteRtDll, "litert_lm_responses_delete");
#else
    if (g_liteRtDll == NULL) {
        g_liteRtDll = dlopen("libLiteRt.so", RTLD_LAZY);
    }
    if (!g_liteRtDll) {
        ResetFunctionPointers();
        return false;
    }

    fnSettingsCreate = (FnEngineSettingsCreate)dlsym(g_liteRtDll, "litert_lm_engine_settings_create");
    fnSettingsSetMax = (FnEngineSettingsSetMaxNumTokens)dlsym(g_liteRtDll, "litert_lm_engine_settings_set_max_num_tokens");
    fnSettingsDelete = (FnEngineSettingsDelete)dlsym(g_liteRtDll, "litert_lm_engine_settings_delete");
    fnEngineCreate = (FnEngineCreate)dlsym(g_liteRtDll, "litert_lm_engine_create");
    fnEngineDelete = (FnEngineDelete)dlsym(g_liteRtDll, "litert_lm_engine_delete");
    fnSessionConfigCreate = (FnSessionConfigCreate)dlsym(g_liteRtDll, "litert_lm_session_config_create");
    fnSessionConfigSetMaxOutputTokens = (FnSessionConfigSetMaxOutputTokens)dlsym(g_liteRtDll, "litert_lm_session_config_set_max_output_tokens");
    fnSessionConfigDelete = (FnSessionConfigDelete)dlsym(g_liteRtDll, "litert_lm_session_config_delete");
    fnEngineCreateSession = (FnEngineCreateSession)dlsym(g_liteRtDll, "litert_lm_engine_create_session");
    fnSessionDelete = (FnSessionDelete)dlsym(g_liteRtDll, "litert_lm_session_delete");
    fnSessionCancelProcess = (FnSessionCancelProcess)dlsym(g_liteRtDll, "litert_lm_session_cancel_process");
    fnSessionGenerateContent = (FnSessionGenerateContent)dlsym(g_liteRtDll, "litert_lm_session_generate_content");
    fnResponsesGetNum = (FnResponsesGetNumCandidates)dlsym(g_liteRtDll, "litert_lm_responses_get_num_candidates");
    fnResponsesGetText = (FnResponsesGetResponseTextAt)dlsym(g_liteRtDll, "litert_lm_responses_get_response_text_at");
    fnResponsesDelete = (FnResponsesDelete)dlsym(g_liteRtDll, "litert_lm_responses_delete");
#endif

    // Strict validation: Every required LiteRT-LM C API function MUST be exported.
    // Production runtime requires authentic LiteRT-LM libraries and symbols.
    if (!fnSettingsCreate || !fnSettingsDelete ||
        !fnEngineCreate || !fnEngineDelete || !fnEngineCreateSession ||
        !fnSessionDelete || !fnSessionGenerateContent || !fnResponsesGetNum ||
        !fnResponsesGetText || !fnResponsesDelete) {
        
        // Output diagnostics exclusively to stderr to keep JSON-RPC stdio clean
        fprintf(stderr, "[LiteRtNodeBindings] Verification failed: Required LiteRT-LM C API symbols missing in shared library.\n");
        ResetFunctionPointers();
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

// JS: status() -> { ok: boolean, state: string, message: string }
static napi_value BindingStatus(napi_env env, napi_callback_info info) {
    std::lock_guard<std::mutex> lock(g_inferenceMutex);

    napi_value resultObj;
    napi_create_object(env, &resultObj);

    bool libOk = LoadLiteRtLibrary();

    napi_value okVal, stateVal, msgVal;
    if (!libOk) {
        napi_get_boolean(env, false, &okVal);
        napi_create_string_utf8(env, "runtime_dependency_missing", NAPI_AUTO_LENGTH, &stateVal);
        napi_create_string_utf8(env, "Required LiteRT dynamic libraries (libLiteRt.dll) or LiteRT-LM symbols are missing in environment.", NAPI_AUTO_LENGTH, &msgVal);
    } else if (!g_isModelLoaded) {
        napi_get_boolean(env, true, &okVal);
        napi_create_string_utf8(env, "runtime_dependency_found", NAPI_AUTO_LENGTH, &stateVal);
        napi_create_string_utf8(env, "LiteRT-LM native binaries and symbols loaded successfully. Ready to load model.", NAPI_AUTO_LENGTH, &msgVal);
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
    std::lock_guard<std::mutex> lock(g_inferenceMutex);

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

    // Dynamic model path extraction avoiding arbitrary buffer limits
    size_t pathLen = 0;
    napi_get_value_string_utf8(env, args[0], nullptr, 0, &pathLen);
    std::string modelPath(pathLen + 1, '\0');
    size_t pathCopied = 0;
    napi_get_value_string_utf8(env, args[0], &modelPath[0], modelPath.size(), &pathCopied);
    modelPath.resize(pathCopied);

    std::lock_guard<std::mutex> lock(g_inferenceMutex);

    if (!LoadLiteRtLibrary()) {
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, msg;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "LiteRT-LM native binaries or required symbols not available.", NAPI_AUTO_LENGTH, &msg);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "message", msg);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    // Validate model file presence on disk
#ifdef _WIN32
    DWORD dwAttrib = GetFileAttributesA(modelPath.c_str());
    if (dwAttrib == INVALID_FILE_ATTRIBUTES || (dwAttrib & FILE_ATTRIBUTE_DIRECTORY)) {
#else
    if (access(modelPath.c_str(), R_OK) != 0) {
#endif
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, msg;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, ("Model file does not exist or cannot be read: " + modelPath).c_str(), NAPI_AUTO_LENGTH, &msg);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "message", msg);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    // Unload existing session if loaded
    if (g_isModelLoaded) {
        if (g_session && fnSessionDelete) fnSessionDelete(g_session);
        if (g_engine && fnEngineDelete) fnEngineDelete(g_engine);
        g_session = nullptr;
        g_engine = nullptr;
        g_isModelLoaded = false;
    }

    // Instantiate LiteRT LM Engine Settings
    LiteRtLmEngineSettings* settings = fnSettingsCreate(modelPath.c_str(), "cpu", nullptr, nullptr);
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

    if (fnSettingsSetMax) {
        fnSettingsSetMax(settings, 1024);
    }

    g_engine = fnEngineCreate(settings);
    fnSettingsDelete(settings); // Settings are copied in engine creation

    if (!g_engine) {
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, msg;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "Failed to instantiate LiteRT-LM engine. Verify model format.", NAPI_AUTO_LENGTH, &msg);
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

#include <atomic>

static std::atomic<LiteRtLmSession*> g_activeSession{nullptr};
static std::atomic<bool> g_isGenerating{false};

struct GenerateCarrier {
    napi_async_work work;
    napi_deferred deferred;
    std::string prompt;
    int32_t maxTokens;
    bool success;
    std::string text;
    std::string error;
};

// JS: cancel() -> Promise<void>
static napi_value Cancel(napi_env env, napi_callback_info info) {
    LiteRtLmSession* active = g_activeSession.load();
    if (active && fnSessionCancelProcess) {
        fnSessionCancelProcess(active);
    }

    napi_deferred deferred;
    napi_value promise;
    napi_create_promise(env, &deferred, &promise);
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    napi_resolve_deferred(env, deferred, undefined);
    return promise;
}

// Background thread execution for LiteRT-LM generation
static void GenerateExecute(napi_env env, void* data) {
    GenerateCarrier* carrier = static_cast<GenerateCarrier*>(data);

    // Serialize inferences across worker threads
    std::unique_lock<std::mutex> lock(g_inferenceMutex);

    if (!g_isModelLoaded || !g_engine || !fnEngineCreateSession || !fnSessionGenerateContent) {
        carrier->success = false;
        carrier->error = "Inference engine is not loaded or ready.";
        return;
    }

    LiteRtLmSessionConfig* sessionConfig = nullptr;
    if (fnSessionConfigCreate) {
        sessionConfig = fnSessionConfigCreate();
        if (sessionConfig && fnSessionConfigSetMaxOutputTokens) {
            fnSessionConfigSetMaxOutputTokens(sessionConfig, carrier->maxTokens > 0 ? carrier->maxTokens : 1024);
        }
    }

    LiteRtLmSession* session = fnEngineCreateSession(g_engine, sessionConfig);
    if (sessionConfig && fnSessionConfigDelete) {
        fnSessionConfigDelete(sessionConfig);
    }

    if (!session) {
        carrier->success = false;
        carrier->error = "Failed to instantiate inference session for generation.";
        return;
    }

    // Publish active session pointer so Cancel() can reach it concurrently without waiting on mutex
    g_activeSession.store(session);
    g_isGenerating.store(true);

    // Release lock during long-running generation so cancel() and status() are non-blocking
    lock.unlock();

    LiteRtLmInputData inputData;
    inputData.type = kLiteRtLmInputDataTypeText;
    inputData.data = reinterpret_cast<const void*>(carrier->prompt.data());
    inputData.size = carrier->prompt.size();

    LiteRtLmResponses* responses = fnSessionGenerateContent(session, &inputData, 1);

    // Clear active session pointer immediately after generation completes/aborts
    g_activeSession.store(nullptr);
    g_isGenerating.store(false);

    if (!responses) {
        if (fnSessionDelete) {
            fnSessionDelete(session);
        }
        carrier->success = false;
        carrier->error = "LiteRT-LM inference execution failed or was cancelled.";
        return;
    }

    int candidates = fnResponsesGetNum ? fnResponsesGetNum(responses) : 0;
    if (candidates <= 0) {
        carrier->success = true;
        carrier->text = "";
    } else {
        const char* textContent = fnResponsesGetText ? fnResponsesGetText(responses, 0) : nullptr;
        carrier->success = true;
        carrier->text = textContent ? textContent : "";
    }

    if (fnResponsesDelete) {
        fnResponsesDelete(responses);
    }
    if (fnSessionDelete) {
        fnSessionDelete(session);
    }
}

// Event loop callback once background generation completes
static void GenerateComplete(napi_env env, napi_status status, void* data) {
    GenerateCarrier* carrier = static_cast<GenerateCarrier*>(data);

    napi_value resObj;
    napi_create_object(env, &resObj);

    napi_value successVal;
    napi_get_boolean(env, carrier->success, &successVal);
    napi_set_named_property(env, resObj, "success", successVal);

    if (carrier->success) {
        napi_value textVal;
        napi_create_string_utf8(env, carrier->text.c_str(), carrier->text.size(), &textVal);
        napi_set_named_property(env, resObj, "text", textVal);
    } else {
        napi_value errVal;
        napi_create_string_utf8(env, carrier->error.c_str(), carrier->error.size(), &errVal);
        napi_set_named_property(env, resObj, "error", errVal);
    }

    napi_resolve_deferred(env, carrier->deferred, resObj);

    napi_delete_async_work(env, carrier->work);
    delete carrier;
}

// JS: generate(prompt, maxTokens) -> Promise<{ success: boolean, text?: string, error?: string }>
static napi_value Generate(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    napi_deferred deferred;
    napi_value promise;
    napi_create_promise(env, &deferred, &promise);

    if (argc < 1) {
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, error;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "Missing prompt argument", NAPI_AUTO_LENGTH, &error);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "error", error);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    // Dynamic prompt allocation - handles arbitrary length without fixed buffer truncation
    size_t promptLen = 0;
    napi_get_value_string_utf8(env, args[0], nullptr, 0, &promptLen);
    std::string promptStr(promptLen + 1, '\0');
    size_t promptCopied = 0;
    napi_get_value_string_utf8(env, args[0], &promptStr[0], promptStr.size(), &promptCopied);
    promptStr.resize(promptCopied);

    int32_t maxTokens = 1024;
    if (argc > 1) {
        napi_valuetype arg1Type;
        napi_typeof(env, args[1], &arg1Type);
        if (arg1Type == napi_number) {
            napi_get_value_int32(env, args[1], &maxTokens);
        }
    }

    GenerateCarrier* carrier = new GenerateCarrier();
    carrier->deferred = deferred;
    carrier->prompt = std::move(promptStr);
    carrier->maxTokens = maxTokens;
    carrier->success = false;

    napi_value resourceName;
    napi_create_string_utf8(env, "LiteRtLmGenerate", NAPI_AUTO_LENGTH, &resourceName);

    napi_status createStatus = napi_create_async_work(
        env,
        nullptr,
        resourceName,
        GenerateExecute,
        GenerateComplete,
        carrier,
        &carrier->work
    );

    if (createStatus != napi_ok) {
        delete carrier;
        napi_value resObj;
        napi_create_object(env, &resObj);
        napi_value success, error;
        napi_get_boolean(env, false, &success);
        napi_create_string_utf8(env, "Failed to schedule async generation work", NAPI_AUTO_LENGTH, &error);
        napi_set_named_property(env, resObj, "success", success);
        napi_set_named_property(env, resObj, "error", error);
        napi_resolve_deferred(env, deferred, resObj);
        return promise;
    }

    napi_queue_async_work(env, carrier->work);
    return promise;
}

// Module registration
static napi_value Init(napi_env env, napi_value exports) {
    napi_value fnStatus, fnLoad, fnGen, fnUnload, fnCancel;

    napi_create_function(env, "status", NAPI_AUTO_LENGTH, BindingStatus, nullptr, &fnStatus);
    napi_create_function(env, "loadModel", NAPI_AUTO_LENGTH, LoadModel, nullptr, &fnLoad);
    napi_create_function(env, "generate", NAPI_AUTO_LENGTH, Generate, nullptr, &fnGen);
    napi_create_function(env, "unloadModel", NAPI_AUTO_LENGTH, UnloadModel, nullptr, &fnUnload);
    napi_create_function(env, "cancel", NAPI_AUTO_LENGTH, Cancel, nullptr, &fnCancel);

    napi_set_named_property(env, exports, "status", fnStatus);
    napi_set_named_property(env, exports, "loadModel", fnLoad);
    napi_set_named_property(env, exports, "generate", fnGen);
    napi_set_named_property(env, exports, "unloadModel", fnUnload);
    napi_set_named_property(env, exports, "cancel", fnCancel);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
