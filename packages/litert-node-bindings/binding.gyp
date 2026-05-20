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
        "<(module_root_dir)/native/win32-x64/lib/litert_lm_engine.lib"
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
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.15"
      },
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS=0" ]
    }
  ]
}
