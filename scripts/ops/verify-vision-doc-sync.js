#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function readNormalized(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return raw.replace(/\r\n/g, '\n').trimEnd();
}

function parseStatusSummary(markdown, label) {
  const match = markdown.match(
    /Status summary:\s*`implemented=(\d+)`,\s*`partial=(\d+)`,\s*`missing=(\d+)`,\s*`conflict=(\d+)`\./i
  );
  if (!match) {
    return { error: `${label} missing required status summary line.` };
  }

  return {
    implemented: Number(match[1]),
    partial: Number(match[2]),
    missing: Number(match[3]),
    conflict: Number(match[4]),
  };
}

function parseRequirementStatuses(markdown, label) {
  const rows = new Map();
  const lines = markdown.split('\n');

  for (const line of lines) {
    if (!line.startsWith('| KV-')) {
      continue;
    }

    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

    if (cells.length < 3) {
      continue;
    }

    const requirementId = cells[0];
    const expectedBehavior = cells[1];
    const status = cells[2];
    const implementationRefs = cells[3] || '';
    rows.set(requirementId, { expectedBehavior, status, implementationRefs });
  }

  if (rows.size === 0) {
    return { error: `${label} has no requirement status rows.` };
  }

  return { rows };
}

function parseGapAnalysisCounts(markdown) {
  const inventoryMatch = markdown.match(/Requirement inventory:\s*(\d+)/i);
  const implementedMatch = markdown.match(/Implemented:\s*(\d+)/i);
  const partialMatch = markdown.match(/Partial:\s*(\d+)/i);
  const conflictMatch = markdown.match(/Conflict.*:\s*(\d+)/i);

  if (!inventoryMatch || !implementedMatch || !partialMatch || !conflictMatch) {
    return { error: 'vision_gap_analysis.md missing required status count lines.' };
  }

  return {
    inventory: Number(inventoryMatch[1]),
    implemented: Number(implementedMatch[1]),
    partial: Number(partialMatch[1]),
    conflict: Number(conflictMatch[1]),
  };
}

function main() {
  const errors = [];

  const agents = readNormalized('AGENTS.md');
  const gemini = readNormalized('GEMINI.md');
  const contextAgents = readNormalized('agent_context/AGENTS.md');
  const contract = readNormalized('docs/specs/vision-contract-v1.md');
  const ledger = readNormalized('docs/specs/kiemenon-requirement-ledger.md');
  const traceability = readNormalized('docs/specs/vision-traceability-matrix.md');
  const traceabilityMirror = readNormalized('docs/specs/kiemenon-vision-traceability-matrix.md');
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
  if (!/Three\.js is the required canonical renderer/i.test(agents)) {
    errors.push('AGENTS.md must explicitly declare Three.js as canonical renderer.');
  }
  if (!/Three\.js is the required canonical renderer/i.test(contract)) {
    errors.push('vision-contract-v1.md must declare Three.js as canonical renderer.');
  }
  if (!/objective creation\/enrichment is user-driven after import/i.test(agents)) {
    errors.push(
      'AGENTS.md must declare objective creation/enrichment as user-driven after import.'
    );
  }
  if (!/objective creation\/enrichment is user-driven after import/i.test(contract)) {
    errors.push(
      'vision-contract-v1.md must declare objective creation/enrichment as user-driven after import.'
    );
  }
  const requiredCanvasClauses = [
    /Edge inspection hover/i,
    /Marquee multi-select/i,
    /Node drag(ging)?/i,
    /shared across all graph canvas surfaces/i,
    /desktop-full/i,
  ];
  for (const clause of requiredCanvasClauses) {
    if (!clause.test(agents)) {
      errors.push(`AGENTS.md missing required canvas clause matching ${clause}.`);
    }
    if (!clause.test(contract)) {
      errors.push(`vision-contract-v1.md missing required canvas clause matching ${clause}.`);
    }
  }
  const requiredHierarchyClauses = [
    /AccountNode/i,
    /Account\s*->\s*Principal/i,
    /Conversation creation must resolve\/validate .*principal/i,
    /context_spec references must be account-scoped/i,
  ];
  for (const clause of requiredHierarchyClauses) {
    if (!clause.test(agents)) {
      errors.push(`AGENTS.md missing required hierarchy/context clause matching ${clause}.`);
    }
    if (!clause.test(contract)) {
      errors.push(
        `vision-contract-v1.md missing required hierarchy/context clause matching ${clause}.`
      );
    }
  }

  if (!traceability.includes('Derived from `AGENTS.md`')) {
    errors.push('vision-traceability-matrix.md must declare AGENTS derivation.');
  }

  const forbiddenPrecedencePatterns = [
    /Kiemenon-first/i,
    /Kiemenon first/i,
    /conflicts?\s+with\s+AGENTS.*(drift|override)/i,
    /AGENTS.*(secondary|non-canonical)/i,
  ];
  const derivedDocs = [
    ['docs/specs/vision-contract-v1.md', contract],
    ['docs/specs/vision-traceability-matrix.md', traceability],
    ['docs/specs/kiemenon-vision-traceability-matrix.md', traceabilityMirror],
    ['agent_context/vision_gap_analysis.md', gapAnalysis],
  ];
  const forbiddenRendererPatterns = [/2d-only/i, /2D-only/i, /2d only/i];
  const forbiddenObjectiveMaterializationPatterns = [
    /objective baseline\/provisional/i,
    /provisional objective layer (is|are) materialized/i,
    /provisional objective nodes exist at import completion/i,
    /objective auto-?materializ(es|ation)/i,
  ];
  for (const [docPath, content] of derivedDocs) {
    for (const pattern of forbiddenPrecedencePatterns) {
      if (pattern.test(content)) {
        errors.push(`${docPath} contains forbidden precedence text matching ${pattern}.`);
      }
    }
    for (const pattern of forbiddenRendererPatterns) {
      if (pattern.test(content)) {
        errors.push(`${docPath} contains forbidden renderer wording matching ${pattern}.`);
      }
    }
    for (const pattern of forbiddenObjectiveMaterializationPatterns) {
      if (pattern.test(content)) {
        errors.push(
          `${docPath} contains forbidden objective auto-materialization wording matching ${pattern}.`
        );
      }
    }
  }

  if (!gapAnalysis.includes('canonical `AGENTS.md` at repository root')) {
    errors.push('vision_gap_analysis.md must scope against canonical root AGENTS.md.');
  }

  const primarySummary = parseStatusSummary(traceability, 'vision-traceability-matrix.md');
  const mirrorSummary = parseStatusSummary(
    traceabilityMirror,
    'kiemenon-vision-traceability-matrix.md'
  );

  if ('error' in primarySummary) {
    errors.push(primarySummary.error);
  }
  if ('error' in mirrorSummary) {
    errors.push(mirrorSummary.error);
  }

  if (!('error' in primarySummary) && !('error' in mirrorSummary)) {
    const summaryKeys = ['implemented', 'partial', 'missing', 'conflict'];
    for (const key of summaryKeys) {
      if (primarySummary[key] !== mirrorSummary[key]) {
        errors.push(
          `Traceability summary mismatch for "${key}": vision=${primarySummary[key]} vs kiemenon=${mirrorSummary[key]}`
        );
      }
    }
  }

  const primaryRows = parseRequirementStatuses(traceability, 'vision-traceability-matrix.md');
  const mirrorRows = parseRequirementStatuses(
    traceabilityMirror,
    'kiemenon-vision-traceability-matrix.md'
  );
  const ledgerRows = parseRequirementStatuses(ledger, 'kiemenon-requirement-ledger.md');

  if ('error' in primaryRows) {
    errors.push(primaryRows.error);
  }
  if ('error' in mirrorRows) {
    errors.push(mirrorRows.error);
  }
  if ('error' in ledgerRows) {
    errors.push(ledgerRows.error);
  }

  if (!('error' in primaryRows) && !('error' in mirrorRows) && !('error' in ledgerRows)) {
    const lensRequirements = ['KV-UX-004', 'KV-FEAT-003'];
    for (const requirementId of lensRequirements) {
      const primary = primaryRows.rows.get(requirementId);
      const mirror = mirrorRows.rows.get(requirementId);
      if (!primary || !mirror) {
        errors.push(`Missing required lens row in one or both matrices: ${requirementId}`);
        continue;
      }
      const expectedText = `${primary.expectedBehavior} ${mirror.expectedBehavior}`;
      if (!/2D/i.test(expectedText) || !/3D/i.test(expectedText) || !/ND/i.test(expectedText)) {
        errors.push(`${requirementId} must reference 2D/3D/ND lens semantics in both matrices.`);
      }
    }

    for (const [requirementId, primaryRow] of primaryRows.rows.entries()) {
      const mirrorRow = mirrorRows.rows.get(requirementId);
      if (!mirrorRow) {
        errors.push(
          `Missing requirement row in kiemenon-vision-traceability-matrix.md: ${requirementId}`
        );
        continue;
      }
      if (mirrorRow.status !== primaryRow.status) {
        errors.push(
          `Requirement status mismatch for ${requirementId}: vision=${primaryRow.status} vs kiemenon=${mirrorRow.status}`
        );
      }
      if (primaryRow.status === 'implemented' && /^none$/i.test(primaryRow.implementationRefs)) {
        errors.push(`Implemented row ${requirementId} must include implementation references.`);
      }
    }

    for (const requirementId of mirrorRows.rows.keys()) {
      if (!primaryRows.rows.has(requirementId)) {
        errors.push(`Missing requirement row in vision-traceability-matrix.md: ${requirementId}`);
      }
    }

    const requiredExtensionRows = [
      'KV-UX-009',
      'KV-UX-010',
      'KV-UX-011',
      'KV-UX-012',
      'KV-FEAT-005',
      'KV-UX-013',
      'KV-FEAT-006',
      'KV-AGENT-004',
    ];
    for (const requirementId of requiredExtensionRows) {
      const primary = primaryRows.rows.get(requirementId);
      const mirror = mirrorRows.rows.get(requirementId);
      if (!primary || !mirror) {
        errors.push(`Missing required extension traceability row: ${requirementId}`);
        continue;
      }
      if (primary.status !== mirror.status) {
        errors.push(
          `Extension row status mismatch for ${requirementId}: vision=${primary.status} vs kiemenon=${mirror.status}`
        );
      }
      if (!primary.expectedBehavior || !mirror.expectedBehavior) {
        errors.push(`Extension row ${requirementId} must include expected behavior text.`);
      }
    }

    for (const requirementId of primaryRows.rows.keys()) {
      if (!ledgerRows.rows.has(requirementId)) {
        errors.push(`Traceability requirement missing from ledger: ${requirementId}`);
      }
    }
    for (const requirementId of ledgerRows.rows.keys()) {
      if (!primaryRows.rows.has(requirementId)) {
        errors.push(`Ledger requirement missing from traceability matrix: ${requirementId}`);
      }
    }
  }

  const gapCounts = parseGapAnalysisCounts(gapAnalysis);
  if ('error' in gapCounts) {
    errors.push(gapCounts.error);
  } else if (!('error' in primarySummary)) {
    const totalFromSummary =
      primarySummary.implemented +
      primarySummary.partial +
      primarySummary.missing +
      primarySummary.conflict;
    if (gapCounts.inventory !== totalFromSummary) {
      errors.push(
        `Gap analysis inventory (${gapCounts.inventory}) must match matrix total (${totalFromSummary}).`
      );
    }
    if (gapCounts.implemented !== primarySummary.implemented) {
      errors.push(
        `Gap analysis implemented count (${gapCounts.implemented}) must match matrix implemented count (${primarySummary.implemented}).`
      );
    }
    if (gapCounts.partial !== primarySummary.partial) {
      errors.push(
        `Gap analysis partial count (${gapCounts.partial}) must match matrix partial count (${primarySummary.partial}).`
      );
    }
    if (gapCounts.conflict !== primarySummary.conflict) {
      errors.push(
        `Gap analysis conflict count (${gapCounts.conflict}) must match matrix conflict count (${primarySummary.conflict}).`
      );
    }
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
