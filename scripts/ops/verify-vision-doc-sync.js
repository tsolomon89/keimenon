#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function readNormalized(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return raw.replace(/\r\n/g, '\n').trimEnd();
}

function main() {
  const errors = [];

  const agents = readNormalized('AGENTS.md');
  const gemini = readNormalized('GEMINI.md');
  const contextAgents = readNormalized('agent_context/AGENTS.md');
  const contract = readNormalized('docs/specs/vision-contract-v1.md');
  const traceability = readNormalized('docs/specs/vision-traceability-matrix.md');
  const gapAnalysis = readNormalized('agent_context/vision_gap_analysis.md');

  if (agents !== gemini) {
    errors.push('GEMINI.md must mirror AGENTS.md exactly.');
  }

  const requiredStubFragments = [
    '# agent_context/AGENTS.md',
    'This file is intentionally a pointer to the canonical vision contract.',
    'Canonical source of truth:',
    '- `AGENTS.md` at repository root.',
  ];
  for (const fragment of requiredStubFragments) {
    if (!contextAgents.includes(fragment)) {
      errors.push(`agent_context/AGENTS.md missing required fragment: "${fragment}"`);
    }
  }

  const forbiddenContextPatterns = [
    /Vision Brief/i,
    /Want me to:/i,
    /Wdyt\?/i,
    /Obsidian meets Poppy/i,
  ];
  for (const pattern of forbiddenContextPatterns) {
    if (pattern.test(contextAgents)) {
      errors.push(
        `agent_context/AGENTS.md contains historical transcript content matching ${pattern}`
      );
    }
  }

  if (!contract.includes('# Vision Contract v1 (Derived from AGENTS.md)')) {
    errors.push('vision-contract-v1.md must be marked as derived from AGENTS.md.');
  }
  if (!contract.includes('On conflict, `AGENTS.md` is authoritative.')) {
    errors.push('vision-contract-v1.md must state AGENTS.md conflict precedence.');
  }

  if (!traceability.includes('Derived from `AGENTS.md`')) {
    errors.push('vision-traceability-matrix.md must declare AGENTS derivation.');
  }

  if (!gapAnalysis.includes('canonical `AGENTS.md` at repository root')) {
    errors.push('vision_gap_analysis.md must scope against canonical root AGENTS.md.');
  }

  if (errors.length > 0) {
    console.error('[vision-doc-sync] FAILED');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('[vision-doc-sync] OK');
}

main();
