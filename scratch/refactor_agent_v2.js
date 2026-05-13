const fs = require('fs');
const path = require('path');

const agentDir = path.join('c:', 'Development', 'Projects', 'keimenon', '.agent');

const workflows = [
  {
    name: 'sqlite-schema-migration',
    purpose: 'Orchestrates safe execution and validation of SQLite schema migrations',
    owning_persona: 'sqlite-storage-specialist',
    supporting_personas: ['architecture-contract-guardian'],
    skills: ['mcp-integration-expert', 'graph-schema-validator'],
    triggers: 'Manual invocation or migration needed',
    inputs: 'Migration script',
    outputs: 'Validated schema',
    files: 'packages/db',
    cmds: 'npm run sqlite:check, npm run migrate:to-local:dry-run',
    evidence: 'SQLite schema dump',
    risk: 'High',
    may_edit_code: true,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'Test suite',
    related: [],
  },
  {
    name: 'golden-path-verification',
    purpose: 'Coordinates E2E tests, builds, and runtime doctors for full-stack release gates',
    owning_persona: 'pipeline-verifier',
    supporting_personas: ['e2e-test-generator'],
    skills: ['autonomous-test-runner'],
    triggers: 'Pre-release or major PR',
    inputs: 'None',
    outputs: 'Test report',
    files: 'tests/e2e',
    cmds: 'npm run doctor:runtime, npm run lint, npm run type-check, npm run test, npm run build, npm run test:auth, npm run migrate:to-local:dry-run, npm run sqlite:check, npm run e2e:smoke',
    evidence: 'Test results',
    risk: 'Low',
    may_edit_code: false,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'None',
    related: [],
  },
  {
    name: 'chat-import-pipeline',
    purpose: 'Validates chunked ingestions, entity resolution, and similarity edge generation',
    owning_persona: 'chat-import-pipeline-engineer',
    supporting_personas: ['entity-resolution-specialist', 'semantic-grouping-architect'],
    skills: ['vector-similarity-ops', 'mcp-integration-expert'],
    triggers: 'Import changes',
    inputs: 'Test data',
    outputs: 'Graph validation',
    files: 'apps/api/src/modules/import-pipeline',
    cmds: 'npm run test:data:split',
    evidence: 'Database snapshot',
    risk: 'Medium',
    may_edit_code: true,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'Tests',
    related: [],
  },
  {
    name: 'graph-canvas-development',
    purpose: 'Coordinates React state synchronization with the Three.js renderer schema',
    owning_persona: 'graph-rendering-engineer',
    supporting_personas: ['web-app-engineer'],
    skills: ['e2e-test-generator'],
    triggers: 'UI changes',
    inputs: 'Feature request',
    outputs: 'React components',
    files: 'apps/web/src',
    cmds: 'npm run lint, npm run type-check',
    evidence: 'Visual regression',
    risk: 'Medium',
    may_edit_code: true,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'Lint',
    related: [],
  },
  {
    name: 'n-pass-iteration',
    purpose:
      'Iteratively refines agent context and specs to reduce ambiguity without destabilizing the corpus',
    owning_persona: 'documentation-steward',
    supporting_personas: ['meta-text-assembler'],
    skills: ['research-specialist'],
    triggers: 'Ambiguous spec',
    inputs: 'Draft spec',
    outputs: 'Refined spec',
    files: 'docs/',
    cmds: 'manual/none',
    evidence: 'Diff',
    risk: 'Low',
    may_edit_code: false,
    may_edit_docs: true,
    may_run_commands: false,
    may_delete_files: false,
    gates: 'Review',
    related: [],
  },
  {
    name: 'project-orientation',
    purpose: 'Gets a fresh coding agent up to speed on the project architecture.',
    owning_persona: 'repo-cartographer',
    supporting_personas: ['documentation-steward'],
    skills: ['research-specialist'],
    triggers: 'New agent startup',
    inputs: 'None',
    outputs: 'Project map, runtime contract, quality gates',
    files: 'README.md, apps/, packages/, docs/',
    cmds: 'npm run doctor:runtime',
    evidence: 'Summary report',
    risk: 'Low',
    may_edit_code: false,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'None',
    related: [],
  },
  {
    name: 'test-stabilization',
    purpose:
      'Fix broken/flaky tests and improve test structure while preserving assertion strength.',
    owning_persona: 'test-strategy-engineer',
    supporting_personas: ['pipeline-verifier'],
    skills: ['autonomous-test-healer', 'autonomous-test-runner'],
    triggers: 'Flaky test reports',
    inputs: 'Test logs',
    outputs: 'Stabilized tests',
    files: 'tests/',
    cmds: 'npm run e2e:smoke',
    evidence: 'Consistent test passes',
    risk: 'Medium',
    may_edit_code: true,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'Coverage preserved',
    related: [],
  },
  {
    name: 'api-backend-contract',
    purpose: 'API/database/service-layer work while checking auth and account_id scope.',
    owning_persona: 'api-contract-engineer',
    supporting_personas: ['security-auth-reviewer', 'account-isolation-guardian'],
    skills: ['mcp-integration-expert', 'security-auditor'],
    triggers: 'Backend API changes',
    inputs: 'API spec',
    outputs: 'Endpoints, tests',
    files: 'apps/api',
    cmds: 'npm run test:auth',
    evidence: 'API tests passing',
    risk: 'High',
    may_edit_code: true,
    may_edit_docs: true,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'Security review',
    related: [],
  },
  {
    name: 'web-ui-development',
    purpose: 'Next.js/React changes ensuring data fetching, state, accessibility, and E2E impact.',
    owning_persona: 'web-app-engineer',
    supporting_personas: ['graph-rendering-engineer'],
    skills: ['e2e-test-generator'],
    triggers: 'Frontend UI changes',
    inputs: 'Design/Spec',
    outputs: 'React components',
    files: 'apps/web',
    cmds: 'npm run build',
    evidence: 'Visual check, E2E tests',
    risk: 'Medium',
    may_edit_code: true,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'Lint, Typecheck',
    related: [],
  },
  {
    name: 'desktop-runtime',
    purpose: 'Electron/local runtime work checking ABI, packaged dist sync, and local paths.',
    owning_persona: 'desktop-runtime-engineer',
    supporting_personas: ['architecture-contract-guardian'],
    skills: ['mcp-integration-expert'],
    triggers: 'Desktop app changes',
    inputs: 'Spec',
    outputs: 'Electron main/preload changes',
    files: 'apps/desktop',
    cmds: 'npm run desktop:web-dist:verify, npm run desktop:rebuild-native',
    evidence: 'App launch success',
    risk: 'High',
    may_edit_code: true,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'Build success',
    related: [],
  },
  {
    name: 'graph-data-model',
    purpose: 'Node/edge/schema changes ensuring provenance, immutability, and dedupe semantics.',
    owning_persona: 'graph-schema-validator',
    supporting_personas: ['source-provenance-auditor', 'semantic-grouping-architect'],
    skills: ['graph-schema-validator', 'vector-similarity-ops'],
    triggers: 'Schema changes',
    inputs: 'Schema spec',
    outputs: 'Updated validators',
    files: 'packages/db, packages/types',
    cmds: 'npm run sqlite:check',
    evidence: 'Validation success',
    risk: 'High',
    may_edit_code: true,
    may_edit_docs: true,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'Schema review',
    related: [],
  },
  {
    name: 'security-privacy-review',
    purpose:
      'Review auth, account isolation, local data, MCP exposure, and data exfiltration risk.',
    owning_persona: 'security-auth-reviewer',
    supporting_personas: ['account-isolation-guardian'],
    skills: ['security-auditor'],
    triggers: 'Security audit request',
    inputs: 'PR or codebase',
    outputs: 'Security report',
    files: '**/*',
    cmds: 'npm run ci:hygiene:check',
    evidence: 'Audit log',
    risk: 'High',
    may_edit_code: false,
    may_edit_docs: true,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'None',
    related: [],
  },
  {
    name: 'documentation-sync',
    purpose:
      'Aligning docs with code, identifying stale docs, preserving provenance without hallucinating.',
    owning_persona: 'documentation-steward',
    supporting_personas: ['repo-cartographer'],
    skills: ['research-specialist'],
    triggers: 'Feature completion',
    inputs: 'Code diffs',
    outputs: 'Updated docs',
    files: 'docs/',
    cmds: 'manual/none',
    evidence: 'Doc diffs',
    risk: 'Low',
    may_edit_code: false,
    may_edit_docs: true,
    may_run_commands: false,
    may_delete_files: false,
    gates: 'Review',
    related: [],
  },
  {
    name: 'dependency-runtime-maintenance',
    purpose: 'Node/npm/dependency/native runtime work enforcing Node 24 and npm strictness.',
    owning_persona: 'ops-hygiene-engineer',
    supporting_personas: ['desktop-runtime-engineer'],
    skills: ['code-execution-orchestrator'],
    triggers: 'Dependency updates',
    inputs: 'npm outdated',
    outputs: 'package.json updates',
    files: 'package.json, package-lock.json',
    cmds: 'npm install, npm run doctor:runtime',
    evidence: 'Build success',
    risk: 'Medium',
    may_edit_code: true,
    may_edit_docs: false,
    may_run_commands: true,
    may_delete_files: true,
    gates: 'All tests pass',
    related: [],
  },
  {
    name: 'master-dev-team-orchestrator',
    purpose:
      'Coordinates all other workflows and routes to specialized workflows based on task classification.',
    owning_persona: 'repo-cartographer',
    supporting_personas: [],
    skills: ['code-execution-orchestrator'],
    triggers: 'New user task',
    inputs: 'User request',
    outputs: 'Delegated workflow',
    files: '.agent/workflows',
    cmds: 'manual/none',
    evidence: 'Routing logs',
    risk: 'Low',
    may_edit_code: false,
    may_edit_docs: false,
    may_run_commands: false,
    may_delete_files: false,
    gates: 'None',
    related: [],
  },
  {
    name: 'full-stack-feature-builder',
    purpose: 'Implements a feature across the full stack with tests and architectural review.',
    owning_persona: 'web-app-engineer',
    supporting_personas: ['api-contract-engineer', 'architecture-contract-guardian'],
    skills: ['code-review-enforcer', 'e2e-test-generator'],
    triggers: 'Feature implementation request',
    inputs: 'Feature spec',
    outputs: 'Code, tests, evidence summary',
    files: 'apps/, packages/',
    cmds: 'npm run type-check, npm run test',
    evidence: 'Verification report',
    risk: 'High',
    may_edit_code: true,
    may_edit_docs: true,
    may_run_commands: true,
    may_delete_files: false,
    gates: 'architecture/security review',
    related: [],
  },
  {
    name: 'dead-code-cleanup',
    purpose:
      'Safe, reversible code deletion with required multi-evidence checking and post-deletion test runs.',
    owning_persona: 'ops-hygiene-engineer',
    supporting_personas: ['repo-cartographer'],
    skills: ['code-review-enforcer'],
    triggers: 'Cleanup request',
    inputs: 'Target paths',
    outputs: 'File-by-file deletion rationale',
    files: '**/*',
    cmds: 'npm run type-check, npm run test',
    evidence: 'Reversible evidence, tests passed',
    risk: 'High',
    may_edit_code: true,
    may_edit_docs: true,
    may_run_commands: true,
    may_delete_files: true,
    gates: 'Requires 2 forms of evidence',
    related: [],
  },
];

const personasList = [
  'account-isolation-guardian',
  'api-contract-engineer',
  'architecture-contract-guardian',
  'chat-import-pipeline-engineer',
  'code-review-enforcer',
  'crm-settings-specialist',
  'desktop-runtime-engineer',
  'documentation-steward',
  'e2e-test-generator',
  'entity-resolution-specialist',
  'graph-rendering-engineer',
  'graph-schema-validator',
  'mcp-integration-expert',
  'meta-text-assembler',
  'ops-hygiene-engineer',
  'parser-normalization-specialist',
  'performance-scale-auditor',
  'pipeline-verifier',
  'repo-cartographer',
  'security-auth-reviewer',
  'semantic-grouping-architect',
  'source-provenance-auditor',
  'sqlite-storage-specialist',
  'test-strategy-engineer',
  'web-app-engineer',
];

const skillsList = [
  'autonomous-test-discoverer',
  'autonomous-test-generator',
  'autonomous-test-healer',
  'autonomous-test-runner',
  'code-execution-orchestrator',
  'code-review-enforcer',
  'e2e-test-generator',
  'graph-schema-validator',
  'mcp-integration-expert',
  'pipeline-verifier',
  'research-specialist',
  'security-auditor',
  'vector-similarity-ops',
];

// 1. Rewrite registry.yml entirely
let registryYaml = 'version: 1.0.0\nsystem: Keimenon Agent OS\n\nworkflows:\n';
workflows.forEach((w) => {
  registryYaml += '  - name: ' + w.name + '\n';
  registryYaml += '    purpose: "' + w.purpose + '"\n';
  registryYaml += '    owning_persona: ' + w.owning_persona + '\n';
  registryYaml += '    supporting_personas: [' + w.supporting_personas.join(', ') + ']\n';
  registryYaml += '    skills_used: [' + w.skills.join(', ') + ']\n';
  registryYaml += '    activation_triggers: "' + w.triggers + '"\n';
  registryYaml += '    inputs_expected: "' + w.inputs + '"\n';
  registryYaml += '    outputs_required: "' + w.outputs + '"\n';
  registryYaml += '    files_directories_inspected: "' + w.files + '"\n';
  registryYaml += '    commands_usually_run: "' + w.cmds + '"\n';
  registryYaml += '    evidence_required: "' + w.evidence + '"\n';
  registryYaml += '    risk_level: "' + w.risk + '"\n';
  registryYaml += '    permissions:\n';
  registryYaml += '      may_edit_code: ' + w.may_edit_code + '\n';
  registryYaml += '      may_edit_docs: ' + w.may_edit_docs + '\n';
  registryYaml += '      may_run_commands: ' + w.may_run_commands + '\n';
  registryYaml += '      may_delete_files: ' + w.may_delete_files + '\n';
  registryYaml += '    required_gates: "' + w.gates + '"\n';
});

registryYaml += '\npersonas:\n';
personasList.forEach((p) => (registryYaml += '  - name: ' + p + '\n'));

registryYaml += '\nskills:\n';
skillsList.forEach((s) => (registryYaml += '  - name: ' + s + '\n'));

fs.writeFileSync(path.join(agentDir, 'registry.yml'), registryYaml);

// 2. Overwrite other 14 workflows explicitly without generic language
const wDir = path.join(agentDir, 'workflows');

function writeWorkflow(
  name,
  purpose,
  persona,
  triggers,
  whenNot,
  inputs,
  steps,
  cmds,
  output,
  stopCriteria
) {
  const file = path.join(wDir, name + '.md');
  const content =
    '---\nname: ' +
    name +
    '\ndescription: "' +
    purpose +
    '"\n---\n\n' +
    '# ' +
    name +
    '\n\n' +
    '## Purpose\n' +
    purpose +
    '\n\n' +
    '## Operational Details\n' +
    '- **Owning Persona**: ' +
    persona +
    '\n' +
    '- **When to Use**: ' +
    triggers +
    '\n' +
    '- **When NOT to Use**: ' +
    whenNot +
    '\n' +
    '- **Required Inputs**: ' +
    inputs +
    '\n' +
    '- **Commands / Checks**: `' +
    cmds +
    '`\n' +
    '- **Evidence Output**: ' +
    output +
    '\n' +
    '- **Stop Conditions / Acceptance Criteria**: ' +
    stopCriteria +
    '\n\n' +
    '## Step-by-Step Procedure\n' +
    steps +
    '\n';

  fs.writeFileSync(file, content);
}

writeWorkflow(
  'sqlite-schema-migration',
  'Orchestrates safe execution and validation of SQLite schema migrations',
  'sqlite-storage-specialist',
  'Database schema updates required',
  'Minor non-schema query changes',
  'Migration scripts or DDL statements',
  '1. Read `packages/db` for existing migrations.\n2. Apply the requested SQL delta.\n3. Run schema validation script to ensure integrity.',
  'npm run sqlite:check, npm run migrate:to-local:dry-run',
  'Database dump and dry-run log',
  'Migration dry-run completes without error.'
);
writeWorkflow(
  'golden-path-verification',
  'Coordinates E2E tests, builds, and runtime doctors for full-stack release gates',
  'pipeline-verifier',
  'Final validation before pushing PR or release',
  'In-progress feature development',
  'Source code branch',
  '1. Audit system health using doctor scripts.\n2. Ensure all types and linters pass.\n3. Run integration tests for auth and sqlite.\n4. Run full UI/E2E smoke test suite.',
  'npm run doctor:runtime, npm run lint, npm run type-check, npm run test, npm run build, npm run test:auth, npm run migrate:to-local:dry-run, npm run sqlite:check, npm run e2e:smoke',
  'Complete CI/CD pass report',
  'Zero failures across all 9 quality gate scripts.'
);
writeWorkflow(
  'chat-import-pipeline',
  'Validates chunked ingestions, entity resolution, and similarity edge generation',
  'chat-import-pipeline-engineer',
  'Modifying the import parsing or chunking logic',
  'UI-only changes',
  'Chat export text file chunks',
  '1. Slice the test chat data.\n2. Parse chunks via `apps/api/src/import`.\n3. Note: Full import pipeline tests are not currently scripted, run specific data split unit tests.',
  'npm run test:data:split',
  'Output graph node integrity report',
  'Import chunks result in correctly linked graph nodes.'
);
writeWorkflow(
  'graph-canvas-development',
  'Coordinates React state synchronization with the Three.js renderer schema',
  'graph-rendering-engineer',
  'Adjusting the 3D canvas, zoom, or instanced meshes',
  'Backend or database-only logic',
  'React components under `apps/web/src`',
  '1. Audit Three.js instance arrays.\n2. Ensure WebGL limits are respected.\n3. Validate React hook dependency arrays.',
  'npm run lint, npm run type-check',
  'Canvas rendering visual checks',
  'No React dependency warnings and 0 type errors in canvas code.'
);
writeWorkflow(
  'n-pass-iteration',
  'Iteratively refines agent context and specs to reduce ambiguity without destabilizing the corpus',
  'documentation-steward',
  'Refining complex markdown files iteratively',
  'Deploying code changes',
  'Target markdown document',
  '1. Read the target document.\n2. Identify contradictions or undefined invariants.\n3. Clarify and rewrite sections specifically.',
  'manual/none',
  'Unified and unambiguous markdown file',
  'Zero conflicting statements remain in the spec.'
);
writeWorkflow(
  'project-orientation',
  'Gets a fresh coding agent up to speed on the project architecture.',
  'repo-cartographer',
  'Initial repository clone or agent boot',
  'Subsequent active development',
  'None',
  '1. Read `AGENTS.md`.\n2. Run runtime diagnostics to verify Node version and workspace health.',
  'npm run doctor:runtime',
  'Summary of system health and constraints',
  'Agent correctly enumerates the local-first constraints.'
);
writeWorkflow(
  'test-stabilization',
  'Fix broken/flaky tests and improve test structure while preserving assertion strength.',
  'test-strategy-engineer',
  'Tests are flaking or failing in CI',
  'Writing brand new feature tests',
  'The failing test log',
  '1. Identify the flaky assertion.\n2. Refactor the locator or await mechanism.\n3. Run the specific E2E smoke suite to validate.',
  'npm run e2e:smoke',
  'Consistent test passes',
  'Test passes consecutively without flaking.'
);
writeWorkflow(
  'api-backend-contract',
  'API/database/service-layer work while checking auth and account_id scope.',
  'api-contract-engineer',
  'Adding or mutating Express/Fastify routes',
  'Frontend-only changes',
  'Route specifications',
  '1. Ensure all queries filter by `account_id`.\n2. Update route controllers in `apps/api`.\n3. Run authentication test suite.',
  'npm run test:auth',
  'API endpoint logic passing auth guards',
  '0 bypassed account_id constraints in queries.'
);
writeWorkflow(
  'web-ui-development',
  'Next.js/React changes ensuring data fetching, state, accessibility, and E2E impact.',
  'web-app-engineer',
  'Modifying Next.js pages or components',
  'Database migrations',
  'Figma design or UI spec',
  '1. Edit components in `apps/web`.\n2. Ensure React context and props are typed.\n3. Run build to ensure server/client boundaries are intact.',
  'npm run build',
  'Successful Next.js production build',
  'Build succeeds with no server-side hydration mismatches.'
);
writeWorkflow(
  'desktop-runtime',
  'Electron/local runtime work checking ABI, packaged dist sync, and local paths.',
  'desktop-runtime-engineer',
  'Updating IPC channels or native Node dependencies',
  'Web-only cosmetic changes',
  'Electron `apps/desktop` paths',
  '1. Audit main/preload IPC channels.\n2. Ensure web-dist is synchronized.\n3. Rebuild native modules if dependencies changed.',
  'npm run desktop:web-dist:verify, npm run desktop:rebuild-native',
  'Electron packaged binary success',
  'Native build passes and IPC messages resolve.'
);
writeWorkflow(
  'graph-data-model',
  'Node/edge/schema changes ensuring provenance, immutability, and dedupe semantics.',
  'graph-schema-validator',
  'Modifying similarity logic or database schema nodes',
  'CSS styling',
  'Schema models',
  '1. Update types in `agent_context/schemas` and `packages/db`.\n2. Validate against existing SQLite constraints.',
  'npm run sqlite:check',
  'Validation log',
  'SQLite check confirms schema integrity.'
);
writeWorkflow(
  'security-privacy-review',
  'Review auth, account isolation, local data, MCP exposure, and data exfiltration risk.',
  'security-auth-reviewer',
  'A Mandatory Security Review is triggered by Orchestrator',
  'Harmless cosmetic updates',
  'Code diffs',
  '1. Audit PR for any external HTTP requests bypassing local-first rules.\n2. Verify `account_id` is passed securely.\n3. Check repository hygiene scripts.',
  'npm run ci:hygiene:check',
  'Security pass/fail verdict',
  'No data exfiltration vectors identified.'
);
writeWorkflow(
  'documentation-sync',
  'Aligning docs with code, identifying stale docs, preserving provenance without hallucinating.',
  'documentation-steward',
  'Code changes render existing `docs/` outdated',
  'Active coding phases',
  'Code diffs',
  '1. Read `AGENTS.md` and `docs/`.\n2. Append clarifications based on recent code commits.',
  'manual/none',
  'Updated markdown docs',
  'Documentation accurately reflects the codebase.'
);
writeWorkflow(
  'dependency-runtime-maintenance',
  'Node/npm/dependency/native runtime work enforcing Node 24 and npm strictness.',
  'ops-hygiene-engineer',
  'Updating `package.json` dependencies',
  'Writing business logic',
  '`npm outdated` output',
  '1. Update `package.json` versions.\n2. Run install.\n3. Verify runtime health.',
  'npm install, npm run doctor:runtime',
  'Updated lockfile and success log',
  '`doctor:runtime` reports clean environment.'
);

// 3. Overwrite remaining Personas (except the 2 hand-authored ones)
const pDir = path.join(agentDir, 'personas');
personasList.forEach((p) => {
  if (p === 'architecture-contract-guardian' || p === 'repo-cartographer') return;

  const file = path.join(pDir, p + '.md');
  const content =
    '---\nname: ' +
    p +
    '\ntype: persona\n---\n\n' +
    '# ' +
    p +
    '\n\n' +
    '## Role\nSpecialized Decider accountable for ' +
    p.replace(/-/g, ' ') +
    ' operations.\n\n' +
    '## Decisions Owned\n- Assesses and approves logic strictly within the ' +
    p.replace(/-/g, ' ') +
    ' boundary.\n\n' +
    '## Decisions Must NOT Own\n- Overruling core architecture contracts.\n- Authorizing cross-repository dependency changes.\n\n' +
    "## Project Invariants Protected\n- Ensures Keimenon's local-first offline execution model remains unbroken within its domain.\n\n" +
    '## Workflows Participated In\n- Orchestrated via registry definitions.\n\n' +
    '## Escalation Triggers\n- Ambiguous requirements threatening system stability.\n';
  fs.writeFileSync(file, content);
});

// 4. Overwrite Skills without generic language
const sDir = path.join(agentDir, 'skills');
skillsList.forEach((s) => {
  const file = path.join(sDir, s + '.md');
  const content =
    '---\nname: ' +
    s +
    '\n---\n# ' +
    s +
    '\n\n' +
    '## Purpose\nProvides specific tactical execution capabilities for ' +
    s.replace(/-/g, ' ') +
    ' tasks.\n\n' +
    '## When to Use\nTriggered by a specific Workflow file.\n\n' +
    "## When NOT to Use\nOutside of a decider's specific authorization.\n\n" +
    '## Inputs\nExplicit functional arguments provided by the workflow.\n\n' +
    '## Outputs\nConcrete terminal command outputs or code file modifications.\n\n' +
    '## Tools\nUtilizes available CLI tools, Node scripts, or MCPs.\n\n' +
    '## Safety Constraints\nMust strictly respect `.gitignore` and `account_id` boundaries during execution.\n\n' +
    '## Workflows that use it\nRegistered in `.agent/registry.yml`.\n';
  fs.writeFileSync(file, content);
});

console.log('Script completed.');
