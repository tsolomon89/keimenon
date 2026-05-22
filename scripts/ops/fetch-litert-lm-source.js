const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VENDOR_DIR = path.resolve(__dirname, '../../vendor/litert-lm');
const OFFICIAL_REPO = 'https://github.com/google-ai-edge/LiteRT-LM.git';
// For stable development, pinning to main branch. A specific SHA can be provided if needed.
const TARGET_COMMIT = 'main';

function main() {
  console.log(`[Fetch] Starting fetch for LiteRT-LM source...`);

  if (!fs.existsSync(path.dirname(VENDOR_DIR))) {
    fs.mkdirSync(path.dirname(VENDOR_DIR), { recursive: true });
  }

  if (fs.existsSync(VENDOR_DIR)) {
    console.log(`[Fetch] Directory already exists at ${VENDOR_DIR}. Fetching updates...`);
    try {
      // Check if it's the official repo
      const remoteUrl = execSync('git config --get remote.origin.url', { cwd: VENDOR_DIR })
        .toString()
        .trim();
      // Allow without .git suffix just in case
      if (
        remoteUrl !== OFFICIAL_REPO &&
        remoteUrl !== 'https://github.com/google-ai-edge/LiteRT-LM'
      ) {
        console.error(`[Error] Non-official repo URL detected: ${remoteUrl}. Refusing to proceed.`);
        process.exit(1);
      }

      execSync('git fetch origin', { cwd: VENDOR_DIR, stdio: 'inherit' });
      execSync(`git checkout ${TARGET_COMMIT}`, { cwd: VENDOR_DIR, stdio: 'inherit' });
      // If target is a branch, pull. If it's a specific SHA, this might fail, so we wrap in try/catch or just ignore
      try {
        execSync(`git pull origin ${TARGET_COMMIT}`, { cwd: VENDOR_DIR, stdio: 'inherit' });
      } catch (e) {
        // Not a branch or network error
        console.log(
          `[Fetch] Note: 'git pull' returned non-zero, this is normal if targeting a detached HEAD.`
        );
      }
    } catch (e) {
      console.error(`[Error] Failed to update repository:`, e.message);
      process.exit(1);
    }
  } else {
    console.log(`[Fetch] Cloning from ${OFFICIAL_REPO}...`);
    try {
      execSync(`git clone ${OFFICIAL_REPO} "${VENDOR_DIR}"`, { stdio: 'inherit' });
      execSync(`git checkout ${TARGET_COMMIT}`, { cwd: VENDOR_DIR, stdio: 'inherit' });
    } catch (e) {
      console.error(`[Error] Failed to clone repository:`, e.message);
      process.exit(1);
    }
  }

  // Get current commit hash
  const commitHash = execSync('git rev-parse HEAD', { cwd: VENDOR_DIR }).toString().trim();

  const versionInfo = {
    repository: OFFICIAL_REPO,
    commit: commitHash,
    target: TARGET_COMMIT,
    fetchedAt: new Date().toISOString(),
  };

  // 3. Patch WORKSPACE for Windows compatibility (replace Unix sed/touch with Python and apply MSVC overrides)
  const workspacePath = path.join(VENDOR_DIR, 'WORKSPACE');
  if (fs.existsSync(workspacePath)) {
    console.log(
      `[Fetch] Applying Windows-specific MSVC and Python compatibility patches to WORKSPACE...`
    );
    try {
      execSync('git checkout WORKSPACE', { cwd: VENDOR_DIR, stdio: 'ignore' });
    } catch (e) {
      // Ignore if not a git repository or workspace file doesn't exist in git yet
    }
    let wContent = fs.readFileSync(workspacePath, 'utf8').replace(/\r\n/g, '\n');

    // Replace touch/sed with Python for sentencepiece
    const oldSentencePiece = `    patch_cmds = [
        # Empty config.h seems enough.
        "touch config.h",
        # Replace third_party/absl/ with absl/ in *.h and *.cc files.
        "sed -i -e 's|#include \"third_party/absl/|#include \"absl/|g' *.h *.cc",
        # Replace third_party/darts_clone/ with include/ in *.h and *.cc files.
        "sed -i -e 's|#include \"third_party/darts_clone/|#include \"include/|g' *.h *.cc",
    ],`;
    const newSentencePiece = `    patch_cmds = [
        "python -c \\"open('config.h', 'w').close()\\"",
        "python -c \\"import glob, os; [open(f, 'w', encoding='utf-8', errors='ignore').write(c) for f in glob.glob('*.h') + glob.glob('*.cc') if os.path.isfile(f) for c in [open(f, 'r', encoding='utf-8', errors='ignore').read().replace('third_party/absl/', 'absl/').replace('third_party/darts_clone/', 'include/')]]\\"",
    ],`;

    // Replace sed with Python + MSVC overrides for litert
    const oldLiteRT = `    patch_cmds = [
        # Replace @//third_party with @litert//third_party in files under third_party/.
        "sed -i -e 's|\\"@//third_party/|\\"@litert//third_party/|g' third_party/*/*",
    ],`;
    const newLiteRT = `    patch_cmds = [
        "python -c \\"import glob, os; [open(f, 'w', encoding='utf-8', errors='ignore').write(c) for f in glob.glob('third_party/*/*') if os.path.isfile(f) for c in [open(f, 'r', encoding='utf-8', errors='ignore').read().replace('@//third_party/', '@litert//third_party/')]]\\"",
        "python -c \\"f = 'litert/cc/litert_macros.h'; c = open(f, 'r', encoding='utf-8', errors='ignore').read(); m = '\\\\n#if defined(_MSC_VER) && !defined(__clang__)\\\\n#undef LITERT_RETURN_IF_ERROR_2\\\\n#define LITERT_RETURN_IF_ERROR_2(EXPR, RETURN_VALUE) if (auto status_msc = (EXPR); ::litert::ErrorStatusBuilder::IsError(status_msc)) if (::litert::ErrorStatusBuilder _(std::move(status_msc)); true) return static_cast<typename ::std::remove_reference<decltype(RETURN_VALUE)>::type&&>(RETURN_VALUE)\\\\n#undef LITERT_ASSIGN_OR_RETURN_HELPER_3\\\\n#define LITERT_ASSIGN_OR_RETURN_HELPER_3(TMP_VAR, DECL, EXPR, RETURN_VALUE) auto&& TMP_VAR = (EXPR); if (::litert::ErrorStatusBuilder::IsError(TMP_VAR)) { [[maybe_unused]] ::litert::ErrorStatusBuilder _(std::move(TMP_VAR)); return static_cast<typename ::std::remove_reference<decltype(RETURN_VALUE)>::type&&>(RETURN_VALUE); } _LITERT_STRIP_PARENS(DECL) = ::litert::ErrorStatusBuilder::ForwardWrappedValue(TMP_VAR)\\\\n#endif\\\\n'; c = c.replace('#endif  // ODML_LITERT_LITERT_CC_LITERT_MACROS_H_', m + '\\\\n#endif  // ODML_LITERT_LITERT_CC_LITERT_MACROS_H_'); open(f, 'w', encoding='utf-8').write(c)\\\"",
        "python -c \\"import os; f = 'litert/cc/litert_event.h'; c = open(f, 'r', encoding='utf-8', errors='ignore').read().replace('\\\\r\\\\n', '\\\\n'); c = c.replace('extern \\\\\\"C\\\\\\" {\\\\n#endif  // __cplusplus\\\\n\\\\nnamespace litert {', 'extern \\\\\\"C\\\\\\" {\\\\n#endif  // __cplusplus\\\\n\\\\n#ifdef __cplusplus\\\\n}  // extern \\\\\\"C\\\\\\"\\\\n#endif  // __cplusplus\\\\n\\\\nnamespace litert {'); c = c.replace('#ifdef __cplusplus\\\\n}  // extern \\\\\\"C\\\\\\"\\\\n#endif  // __cplusplus\\\\n\\\\n#endif  // ODML_LITERT_LITERT_CC_LITERT_EVENT_H_', '#endif  // ODML_LITERT_LITERT_CC_LITERT_EVENT_H_'); c = c.replace('#include <cstdint>', '#include <cstdint>\\\\n#include <utility>') if '#include <utility>' not in c else c; decl = '  /// @brief Creates an ' + chr(96) + 'Event' + chr(96) + ' object from a sync fence file descriptor.\\\\n  static Expected<Event> CreateFromSyncFenceFd(const Environment& env,\\\\n                                               int sync_fence_fd,\\\\n                                               bool owns_fd);\\\\n\\\\n  /// @brief Creates an ' + chr(96) + 'Event' + chr(96) + ' object from an OpenCL event.\\\\n  static Expected<Event> CreateFromOpenClEvent(const Environment& env,\\\\n                                               LiteRtClEvent cl_event);\\\\n\\\\n  /// @brief Creates an ' + chr(96) + 'Event' + chr(96) + ' object from an EGL sync fence.\\\\n  /// @note This function assumes that all GL operations have already been\\\\n  /// added to the GPU command queue.\\\\n  static Expected<Event> CreateFromEglSyncFence(const Environment& env,\\\\n                                                LiteRtEglSyncKhr egl_sync);\\\\n\\\\n  /// @brief Creates a managed event of a given type.\\\\n  ///\\\\n  /// Currently, only ' + chr(96) + 'LiteRtEventTypeOpenCl' + chr(96) + ' is supported.\\\\n  static Expected<Event> CreateManaged(const Environment& env, enum Event::Type type);'; start_marker = '  /// @brief Creates an ' + chr(96) + 'Event' + chr(96) + ' object from a sync fence file descriptor.'; end_marker = '  Expected<int> GetSyncFenceFd()'; start_idx = c.find(start_marker); end_idx = c.find(end_marker); c = c[:start_idx] + decl + '\\\\n\\\\n' + c[end_idx:] if start_idx != -1 and end_idx != -1 else c; defs = 'inline Expected<Event> Event::CreateFromSyncFenceFd(const Environment& env,\\\\n                                                    int sync_fence_fd,\\\\n                                                    bool owns_fd) {\\\\n  LiteRtEvent event;\\\\n  auto env_holder = env.GetHolder();\\\\n  LiteRtStatus status = env_holder.runtime->CreateEventFromSyncFenceFd(\\\\n      env_holder.handle, sync_fence_fd, owns_fd, &event);\\\\n  if (::litert::ErrorStatusBuilder::IsError(status)) {\\\\n    Expected<Event> err = Unexpected(status);\\\\n    return err;\\\\n  }\\\\n  Expected<Event> ok = WrapCObject(env_holder, event, OwnHandle::kYes);\\\\n  return ok;\\\\n}\\\\n\\\\ninline Expected<Event> Event::CreateFromOpenClEvent(const Environment& env,\\\\n                                                    LiteRtClEvent cl_event) {\\\\n  LiteRtEvent event;\\\\n  auto env_holder = env.GetHolder();\\\\n  LiteRtStatus status = env_holder.runtime->CreateEventFromOpenClEvent(\\\\n      env_holder.handle, cl_event, &event);\\\\n  if (::litert::ErrorStatusBuilder::IsError(status)) {\\\\n    Expected<Event> err = Unexpected(status);\\\\n    return err;\\\\n  }\\\\n  Expected<Event> ok = WrapCObject(env_holder, event, OwnHandle::kYes);\\\\n  return ok;\\\\n}\\\\n\\\\ninline Expected<Event> Event::CreateFromEglSyncFence(const Environment& env,\\\\n                                                     LiteRtEglSyncKhr egl_sync) {\\\\n  LiteRtEvent event;\\\\n  auto env_holder = env.GetHolder();\\\\n  LiteRtStatus status = env_holder.runtime->CreateEventFromEglSyncFence(\\\\n      env_holder.handle, egl_sync, &event);\\\\n  if (::litert::ErrorStatusBuilder::IsError(status)) {\\\\n    Expected<Event> err = Unexpected(status);\\\\n    return err;\\\\n  }\\\\n  Expected<Event> ok = WrapCObject(env_holder, event, OwnHandle::kYes);\\\\n  return ok;\\\\n}\\\\n\\\\ninline Expected<Event> Event::CreateManaged(const Environment& env, enum Event::Type type) {\\\\n  LiteRtEvent event;\\\\n  auto env_holder = env.GetHolder();\\\\n  LiteRtStatus status = env_holder.runtime->CreateManagedEvent(\\\\n      env_holder.handle, static_cast<LiteRtEventType>(type), &event);\\\\n  if (::litert::ErrorStatusBuilder::IsError(status)) {\\\\n    Expected<Event> err = Unexpected(status);\\\\n    return err;\\\\n  }\\\\n  Expected<Event> ok = WrapCObject(env_holder, event, OwnHandle::kYes);\\\\n  return ok;\\\\n}'; ns = '}  // namespace litert'; ns_idx = c.rfind(ns); c = c[:ns_idx] + defs + '\\\\n\\\\n' + c[ns_idx:] if ns_idx != -1 else c; open(f, 'w', encoding='utf-8').write(c)\\\"",
    ],`;

    wContent = wContent.replace(oldSentencePiece, newSentencePiece);
    wContent = wContent.replace(oldLiteRT, newLiteRT);
    fs.writeFileSync(workspacePath, wContent, 'utf8');
    console.log(`[Fetch] WORKSPACE successfully patched.`);
  }

  // Patch c/engine.h to support static linking on Windows
  const engineHPath = path.join(VENDOR_DIR, 'c', 'engine.h');
  if (fs.existsSync(engineHPath)) {
    console.log(`[Fetch] Patching c/engine.h for static linking on Windows...`);
    let ehContent = fs.readFileSync(engineHPath, 'utf8');

    // Find the definition of LITERT_LM_C_API_EXPORT on Windows and make it conditional on LITERT_LM_C_API_STATIC
    const oldExport = '#if defined(_WIN32)\\n#define LITERT_LM_C_API_EXPORT __declspec(dllexport)';
    const newExport =
      '#if defined(_WIN32)\\n#if defined(LITERT_LM_C_API_STATIC)\\n#define LITERT_LM_C_API_EXPORT\\n#else\\n#define LITERT_LM_C_API_EXPORT __declspec(dllexport)\\n#endif';

    ehContent = ehContent.replace(
      /#if defined\(_WIN32\)\r?\n#define LITERT_LM_C_API_EXPORT __declspec\(dllexport\)/g,
      (match) => {
        const usesCRLF = match.includes('\r');
        return `#if defined(_WIN32)${usesCRLF ? '\r' : ''}\n#if defined(LITERT_LM_C_API_STATIC)${usesCRLF ? '\r' : ''}\n#define LITERT_LM_C_API_EXPORT${usesCRLF ? '\r' : ''}\n#else${usesCRLF ? '\r' : ''}\n#define LITERT_LM_C_API_EXPORT __declspec(dllexport)${usesCRLF ? '\r' : ''}\n#endif`;
      }
    );

    fs.writeFileSync(engineHPath, ehContent, 'utf8');
    console.log(`[Fetch] c/engine.h successfully patched.`);
  }

  fs.writeFileSync(path.join(VENDOR_DIR, 'VERSION.json'), JSON.stringify(versionInfo, null, 2));
  console.log(`[Fetch] Pinned version info written to vendor/litert-lm/VERSION.json`);
  console.log(`[Fetch] Complete. Currently at ${commitHash.substring(0, 7)}`);
}

main();
