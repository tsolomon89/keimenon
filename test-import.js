#!/usr/bin/env node

const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testImport() {
  console.log('🧪 Testing Enhanced Import with Large File\n');

  const filePath = './ai_context/chat_data/gpt_conversations.json';
  const fileSize = fs.statSync(filePath).size;
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

  console.log(`📄 File: ${filePath}`);
  console.log(`📏 Size: ${fileSizeMB} MB (${fileSize} bytes)`);
  console.log(`🔀 Expected endpoint: ${fileSize > 10 * 1024 * 1024 ? '/api/v1/import/enhanced' : '/api/v1/import/chat/batch'}\n`);

  // Create form data
  const form = new FormData();
  form.append('files', fs.createReadStream(filePath));

  // Config matching frontend default
  const config = {
    sources_role_subset: 'both',
    sources_min_chars_user: 400,
    sources_min_chars_assistant: 400,
    sources_stitch_strategy: 'by_chat',
    sources_preserve_chat_integrity: true,
    sources_cap: 150,
    export_code: true,
    code_min_chars: 50,
    code_global_dedupe: true,
    duplicate_detection_enabled: true,
    duplicate_similarity_threshold: 0.85,
    duplicate_cross_conversation: true,
  };

  form.append('config', JSON.stringify(config));

  console.log('⏳ Starting import...\n');
  const startTime = Date.now();

  try {
    const response = await fetch('http://localhost:4001/api/v1/import/enhanced', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Import failed (${response.status}): ${error}`);
      return;
    }

    const result = await response.json();

    console.log(`✅ Import completed in ${duration}s\n`);
    console.log('📊 Results:');
    console.log(JSON.stringify(result, null, 2));

    // Verify response structure
    if (result.success && result.results && result.results[0]) {
      const firstResult = result.results[0];
      console.log('\n✅ Response Structure Validation:');
      console.log(`  - Has 'file' field: ${!!firstResult.file}`);
      console.log(`  - Has 'success' field: ${!!firstResult.success}`);
      console.log(`  - Has 'result' object: ${!!firstResult.result}`);

      if (firstResult.result) {
        console.log(`  - Has conversations array: ${!!firstResult.result.conversations}`);
        console.log(`  - Has sources array: ${!!firstResult.result.sources}`);
        console.log(`  - Has code_assets array: ${!!firstResult.result.code_assets}`);
        console.log(`  - Has stats object: ${!!firstResult.result.stats}`);

        if (firstResult.result.stats) {
          console.log(`\n📈 Stats:`);
          console.log(`  - Conversations: ${firstResult.result.stats.total_conversations}`);
          console.log(`  - Messages: ${firstResult.result.stats.total_messages}`);
          console.log(`  - Sources: ${firstResult.result.stats.total_sources}`);
          console.log(`  - Code Blocks: ${firstResult.result.stats.total_code_blocks} ⭐`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testImport();
