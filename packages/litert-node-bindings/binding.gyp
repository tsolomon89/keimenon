{
  "#": "NOTE: This node-gyp build file is temporary and will be replaced by CMakeLists.txt and cmake-js during the LiteRT-LM source integration phase.",
  "targets": [
    {
      "target_name": "litert-node-bindings",
      "sources": [
        "src/native/binding.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/win32-x64/include"
      ],
      "libraries": [
        "<(module_root_dir)/native/win32-x64/lib/litert_lm_engine.lib",
        "<(module_root_dir)/native/win32-x64/lib/libGemmaModelConstraintProvider.lib",
        "ws2_32.lib",
        "userenv.lib",
        "ntdll.lib",
        "ucrt.lib",
        "vcruntime.lib",
        "msvcrt.lib",
        "user32.lib",
        "kernel32.lib",
        "advapi32.lib",
        "shell32.lib"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1
        }
      },
      "configurations": {
        "Release": {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "RuntimeLibrary": 2
            }
          }
        },
        "Debug": {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "RuntimeLibrary": 3
            }
          }
        }
      },
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.15"
      },
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS=0",
        "LITERT_LM_C_API_STATIC"
      ]
    }
  ]
}
