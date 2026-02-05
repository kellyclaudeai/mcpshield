import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('/tmp/doctor-output.json', 'utf-8'));

// Check required fields
const requiredFields = [
  'version',
  'node',
  'platform',
  'paths',
  'files',
  'registry',
  'timestamp'
];

const missingFields = requiredFields.filter(field => !(field in data));

if (missingFields.length > 0) {
  console.log('❌ Missing required fields:', missingFields);
  process.exit(1);
}

// Check nested required fields
const checks = [
  { path: 'platform.type', value: data.platform?.type },
  { path: 'platform.release', value: data.platform?.release },
  { path: 'platform.arch', value: data.platform?.arch },
  { path: 'paths.cwd', value: data.paths?.cwd },
  { path: 'paths.cacheDir', value: data.paths?.cacheDir },
  { path: 'paths.lockfile', value: data.paths?.lockfile },
  { path: 'paths.policyFile', value: data.paths?.policyFile },
  { path: 'files.lockfileExists', value: data.files?.lockfileExists },
  { path: 'files.policyExists', value: data.files?.policyExists },
  { path: 'registry.url', value: data.registry?.url },
  { path: 'registry.dnsResolved', value: data.registry?.dnsResolved },
  { path: 'registry.httpsReachable', value: data.registry?.httpsReachable },
];

const missingNested = checks.filter(check => check.value === undefined);

if (missingNested.length > 0) {
  console.log('❌ Missing nested fields:');
  missingNested.forEach(check => console.log(`  - ${check.path}`));
  process.exit(1);
}

console.log('✅ JSON output validates against schema!');
console.log('Required fields present:');
requiredFields.forEach(field => console.log(`  ✓ ${field}`));
