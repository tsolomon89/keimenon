const fs = require('fs');
const path = require('path');

const manifestPath = path.join(
  __dirname,
  '../../packages/litert-node-bindings/native/dependency-manifest.json'
);
const bindingCcPath = path.join(
  __dirname,
  '../../packages/litert-node-bindings/src/native/binding.cc'
);

if (!fs.existsSync(manifestPath)) {
  console.error('FAILED: dependency-manifest.json not found');
  process.exit(1);
}

if (!fs.existsSync(bindingCcPath)) {
  console.error('FAILED: binding.cc not found');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bindingCcContent = fs.readFileSync(bindingCcPath, 'utf8');

const win32Deps = manifest.platforms && manifest.platforms['win32-x64'];
if (!win32Deps) {
  console.error('FAILED: No win32-x64 dependencies in manifest');
  process.exit(1);
}

let allGood = true;

const checkList = (list, type) => {
  if (!list) return;
  for (const dep of list) {
    console.log(`Checking ${type} dependency: ${dep.filename}`);
    if (!bindingCcContent.includes(`"${dep.filename}"`)) {
      console.error(`FAILED: ${dep.filename} not found in binding.cc kDependencies list`);
      allGood = false;
    }
  }
};

checkList(win32Deps.required, 'required');
checkList(win32Deps.optional, 'optional');

const desktopResourceDir = path.join(__dirname, '../../apps/desktop/resources/native/win32-x64');
console.log(`Desktop resource dir: ${desktopResourceDir}`);
if (!fs.existsSync(desktopResourceDir)) {
  console.warn(`WARNING: Desktop resource dir does not exist yet: ${desktopResourceDir}`);
}

const devResourceDir = path.join(
  __dirname,
  '../../packages/litert-node-bindings/native/win32-x64/bin'
);
console.log(`Dev native bin dir: ${devResourceDir}`);
if (!fs.existsSync(devResourceDir)) {
  console.warn(`WARNING: Dev native bin dir does not exist yet: ${devResourceDir}`);
}

if (!allGood) {
  process.exit(1);
}

console.log('SUCCESS: Dependency manifest matches binding.cc');
