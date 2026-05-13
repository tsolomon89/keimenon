const fs = require('fs');
const path = require('path');

const agentDir = path.join('c:', 'Development', 'Projects', 'keimenon', '.agent');

// Parse simple YAML arrays
const registryYaml = fs.readFileSync(path.join(agentDir, 'registry.yml'), 'utf8');

const workflowsMatch = registryYaml.split('workflows:\n')[1].split('\npersonas:\n')[0];
const workflows = [...workflowsMatch.matchAll(/  - name: (.*?)\n/g)].map((m) => m[1]);
const personasMatch = registryYaml.split('personas:\n')[1].split('\nskills:\n')[0];
const personas = [...personasMatch.matchAll(/  - name: (.*?)\n/g)].map((m) => m[1]);
const skillsMatch = registryYaml.split('skills:\n')[1];
const skills = [...skillsMatch.matchAll(/  - name: (.*?)\n/g)].map((m) => m[1]);

// Check paths from registry
const filePathsRaw = [...registryYaml.matchAll(/    files_directories_inspected: "(.*?)"\n/g)].map(
  (m) => m[1]
);
let allPaths = new Set();
filePathsRaw.forEach((str) => {
  str.split(',').forEach((p) => {
    let raw = p.trim();
    if (raw === 'None' || raw === '**/*') return;
    if (raw === 'README.md') raw = 'AGENTS.md'; // project-orientation mapping
    allPaths.add(raw);
  });
});

console.log(`Verifying Registry Mappings:`);
console.log(
  `Workflows: ${workflows.length}, Personas: ${personas.length}, Skills: ${skills.length}`
);

let failed = false;

// 1. Verify existence of files
const wDir = path.join(agentDir, 'workflows');
const pDir = path.join(agentDir, 'personas');
const sDir = path.join(agentDir, 'skills');

workflows.forEach((w) => {
  if (!fs.existsSync(path.join(wDir, w + '.md'))) {
    console.log(`MISSING WORKFLOW FILE: ${w}`);
    failed = true;
  }
});
personas.forEach((p) => {
  if (!fs.existsSync(path.join(pDir, p + '.md'))) {
    console.log(`MISSING PERSONA FILE: ${p}`);
    failed = true;
  }
});
skills.forEach((s) => {
  if (!fs.existsSync(path.join(sDir, s + '.md'))) {
    console.log(`MISSING SKILL FILE: ${s}`);
    failed = true;
  }
});

// Verify reverse (files in registry)
fs.readdirSync(wDir)
  .filter((f) => f.endsWith('.md'))
  .forEach((f) => {
    if (!workflows.includes(f.replace('.md', ''))) {
      console.log(`ORPHAN WORKFLOW FILE: ${f}`);
      failed = true;
    }
  });
fs.readdirSync(pDir)
  .filter((f) => f.endsWith('.md'))
  .forEach((f) => {
    if (!personas.includes(f.replace('.md', ''))) {
      console.log(`ORPHAN PERSONA FILE: ${f}`);
      failed = true;
    }
  });
fs.readdirSync(sDir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .forEach((f) => {
    if (!skills.includes(f.replace('.md', ''))) {
      console.log(`ORPHAN SKILL FILE: ${f}`);
      failed = true;
    }
  });

// 2. Path checks
allPaths.forEach((p) => {
  // Try to resolve path
  const fullPath = path.join('c:', 'Development', 'Projects', 'keimenon', p);
  if (!fs.existsSync(fullPath)) {
    console.log(`MISSING REFERENCED PATH: ${p} (${fullPath})`);
    failed = true;
  }
});

// 3. Placeholder grep
const placeholders = [
  'Review required inputs',
  'Formulate plan based on purpose',
  'Execute necessary commands',
  'Verify evidence',
  'domain expert for X',
  'When out of scope of',
];

function checkPlaceholders(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  files.forEach((f) => {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    placeholders.forEach((ph) => {
      if (content.includes(ph)) {
        console.log(`PLACEHOLDER FOUND in ${f}: "${ph}"`);
        failed = true;
      }
    });
  });
}

checkPlaceholders(wDir);
checkPlaceholders(pDir);
checkPlaceholders(sDir);

if (!failed) {
  console.log('All verification checks passed successfully.');
} else {
  console.log('Verification failed.');
}
