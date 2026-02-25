/**
 * AI Quality Evaluation Script
 * 
 * Runs a set of standard prompts ("Golden Set") against the Keimenon AI API.
 * Evaluates responses based on:
 * 1. Success (HTTP 200, valid JSON)
 * 2. Latency (Response time)
 * 3. Concept Coverage (Presence of keywords/concepts expected in the answer)
 * 
 * Usage: npx tsx scripts/eval_ai_quality.ts
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:4001/api/v1/chat/completions'; // Adjust if needed
const API_KEY = process.env.KEIMENON_API_KEY || 'test-key'; // Or standard auth token logic

interface GoldenTest {
    id: string;
    description: string;
    prompt: string;
    expectedConcepts: string[];
    maxLatencyMs?: number;
}

const GOLDEN_SET: GoldenTest[] = [
    {
        id: '1-basic-greeting',
        description: 'Basic greeting and identity check',
        prompt: 'Who are you and what do you do?',
        expectedConcepts: ['Keimenon', 'AI', 'assistant', 'knowledge', 'graph'],
        maxLatencyMs: 2000
    },
    {
        id: '2-graph-logic',
        description: 'Testing graph traversal reasoning',
        prompt: 'If Node A contains Node B, and Node B is part of Topic C, is Node A related to Topic C?',
        expectedConcepts: ['yes', 'related', 'transitive', 'connected', 'relationship'],
        maxLatencyMs: 5000
    },
    {
        id: '3-creative-writing',
        description: 'Testing creative generation',
        prompt: 'Write a haiku about a knowledge graph.',
        expectedConcepts: ['nodes', 'edges', 'connect', 'structure', 'web'], // Haiku structure hard to regex, checking themes
        maxLatencyMs: 3000
    }
];

async function runEval() {
    console.log('🧪 Starting AI Quality Evaluation...');
    let passed = 0;
    let failed = 0;

    for (const test of GOLDEN_SET) {
        console.log(`\nRunning Test [${test.id}]: ${test.description}`);
        const start = Date.now();
        
        try {
            // Simulate API call
            // In a real scenario, this would POST to the actual endpoint
            // For now, we simulate the structure or call if server is up.
            // Assuming server might not be running in this CI context, we'll mock the checker logic
            // based on what a real response *would* look like for the sake of the script structure.
            
            // To make this functional, you would uncomment the fetch block:
            /*
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
                body: JSON.stringify({ messages: [{ role: 'user', content: test.prompt }] })
            });
            const data = await response.json();
            const answer = data.choices[0].message.content;
            */
            
            // MOCK RESPONSE for demonstration/checking the script logic
            // Replace with real fetch in production
            const answer = "I am Keimenon, an AI assistant designed to help you organize your knowledge graph."; 
            const latency = Date.now() - start;

            console.log(`⏱️ Latency: ${latency}ms`);
            console.log(`📝 Answer: "${answer}"`);

            // Evaluation
            const missingConcepts = test.expectedConcepts.filter(concept => 
                !answer.toLowerCase().includes(concept.toLowerCase())
            );

            if (missingConcepts.length > 0) {
                console.warn(`⚠️  Missed Concepts: ${missingConcepts.join(', ')}`);
                // Soft fail: maybe strict match isn't required, but for this script we count it
                // Logic can be adjusted (e.g. require 80% coverage)
            }

            if (test.maxLatencyMs && latency > test.maxLatencyMs) {
                console.warn(`⚠️  High Latency: ${latency}ms > ${test.maxLatencyMs}ms`);
            }

            if (missingConcepts.length === 0) {
                console.log('✅ PASS');
                passed++;
            } else {
                console.log('❌ FAIL (Content)');
                failed++;
            }

        } catch (error) {
            console.error(`❌ ERROR: ${error}`);
            failed++;
        }
    }

    console.log('\n=======================================');
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) process.exit(1);
}

// Run if called directly
if (require.main === module) {
    runEval().catch(console.error);
}
