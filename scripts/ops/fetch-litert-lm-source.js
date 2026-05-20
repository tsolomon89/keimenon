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
        "python -c \\"f = 'litert/cc/litert_macros.h'; c = open(f, 'r', encoding='utf-8', errors='ignore').read(); p = '#if defined(_MSC_VER) && !defined(__clang__)\\\\n#pragma optimize(\\\\\\\"\\\\\\\", off)\\\\n#endif\\\\n'; c = p + c; m = '\\\\n#if defined(_MSC_VER) && !defined(__clang__)\\\\n#undef LITERT_RETURN_IF_ERROR_2\\\\n#define LITERT_RETURN_IF_ERROR_2(EXPR, RETURN_VALUE) do { if (auto status = (EXPR); ::litert::ErrorStatusBuilder::IsError(status)) { return (RETURN_VALUE); } } while (0)\\\\nnamespace litert { template <class T> struct ErrorStatusChecker { std::decay_t<T> status; explicit ErrorStatusChecker(T&& val) : status(std::forward<T>(val)) {} explicit operator bool() const { return ::litert::ErrorStatusBuilder::IsError(status); } }; }\\\\n#undef LITERT_RETURN_IF_ERROR_1\\\\n#define LITERT_RETURN_IF_ERROR_1(EXPR) if (auto checker = ::litert::ErrorStatusChecker<decltype(EXPR)>(EXPR)) return ::litert::ErrorStatusBuilder(std::move(checker.status))\\\\n#endif\\\\n'; c = c.replace('#endif  // ODML_LITERT_LITERT_CC_LITERT_MACROS_H_', m + '\\\\n#endif  // ODML_LITERT_LITERT_CC_LITERT_MACROS_H_'); open(f, 'w', encoding='utf-8').write(c)\\\"",
    ],`;

    wContent = wContent.replace(oldSentencePiece, newSentencePiece);
    wContent = wContent.replace(oldLiteRT, newLiteRT);
    fs.writeFileSync(workspacePath, wContent, 'utf8');
    console.log(`[Fetch] WORKSPACE successfully patched.`);
  }

  fs.writeFileSync(path.join(VENDOR_DIR, 'VERSION.json'), JSON.stringify(versionInfo, null, 2));
  console.log(`[Fetch] Pinned version info written to vendor/litert-lm/VERSION.json`);
  console.log(`[Fetch] Complete. Currently at ${commitHash.substring(0, 7)}`);
}

main();
