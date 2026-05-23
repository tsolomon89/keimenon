{
  "targets": [
    {
      "target_name": "litert_node_bindings",
      "sources": [
        "native/binding.cc"
      ],
      "include_dirs": [],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }]
      ]
    }
  ]
}
