/**
 * mcp-shield doctor
 * 
 * Diagnostic command to check tool health and environment
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as dns from 'dns/promises';
import * as https from 'https';
import { fileURLToPath } from 'url';
import { LockfileManager, CacheManager } from '@mcpshield/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DoctorOutput {
  version: string;
  node: string;
  platform: {
    type: string;
    release: string;
    arch: string;
  };
  paths: {
    cwd: string;
    cacheDir: string;
    lockfile: string;
    policyFile: string;
  };
  files: {
    lockfileExists: boolean;
    policyExists: boolean;
  };
  registry: {
    url: string;
    dnsResolved: boolean;
    httpsReachable: boolean;
    error?: string;
  };
  timestamp: string;
}

interface DoctorOptions {
  json?: boolean;
  ci?: boolean;
  offline?: boolean;
}

const DEFAULT_REGISTRY_URL = 'https://registry.modelcontextprotocol.io';
const POLICY_FILE = 'mcpshield-policy.yaml';

/**
 * Redact sensitive information from paths and URLs
 */
function redactSecrets(text: string): string {
  // Redact home directory paths
  const homeDir = os.homedir();
  return text.replace(new RegExp(homeDir, 'g'), '~');
}

/**
 * Check DNS resolution for registry
 */
async function checkDNS(hostname: string): Promise<boolean> {
  try {
    await dns.resolve(hostname);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check HTTPS HEAD request to registry
 */
async function checkHTTPS(url: string): Promise<{ reachable: boolean; error?: string }> {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname || '/',
      method: 'HEAD',
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      resolve({ reachable: res.statusCode !== undefined && res.statusCode < 500 });
    });

    req.on('error', (error) => {
      resolve({ reachable: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, error: 'Request timeout' });
    });

    req.end();
  });
}

/**
 * Run diagnostics
 */
async function runDiagnostics(options: DoctorOptions): Promise<DoctorOutput> {
  const cwd = process.cwd();
  const cache = new CacheManager();
  const cacheDir = cache['cacheDir']; // Access private property
  const lockfileManager = new LockfileManager();
  
  // Check file existence
  const lockfilePath = path.join(cwd, 'mcp.lock.json');
  const policyPath = path.join(cwd, POLICY_FILE);
  
  let lockfileExists = false;
  let policyExists = false;
  
  try {
    await fs.access(lockfilePath);
    lockfileExists = true;
  } catch {
    // File doesn't exist
  }
  
  try {
    await fs.access(policyPath);
    policyExists = true;
  } catch {
    // File doesn't exist
  }
  
  // Registry checks (skip in offline mode)
  let dnsResolved = false;
  let httpsReachable = false;
  let registryError: string | undefined;
  
  if (!options.offline) {
    const registryUrl = new URL(DEFAULT_REGISTRY_URL);
    dnsResolved = await checkDNS(registryUrl.hostname);
    
    if (dnsResolved) {
      const httpsResult = await checkHTTPS(DEFAULT_REGISTRY_URL);
      httpsReachable = httpsResult.reachable;
      registryError = httpsResult.error;
    } else {
      registryError = 'DNS resolution failed';
    }
  }
  
  // Get package version
  const packageJsonPath = path.join(__dirname, '../../package.json');
  let version = '0.1.0';
  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    version = packageJson.version;
  } catch {
    // Use default version
  }
  
  const output: DoctorOutput = {
    version,
    node: process.version,
    platform: {
      type: os.platform(),
      release: os.release(),
      arch: os.arch(),
    },
    paths: {
      cwd: redactSecrets(cwd),
      cacheDir: redactSecrets(cacheDir),
      lockfile: redactSecrets(lockfilePath),
      policyFile: redactSecrets(policyPath),
    },
    files: {
      lockfileExists,
      policyExists,
    },
    registry: {
      url: DEFAULT_REGISTRY_URL,
      dnsResolved,
      httpsReachable,
      ...(registryError && { error: registryError }),
    },
    timestamp: new Date().toISOString(),
  };
  
  return output;
}

/**
 * Format output for human-readable display
 */
function formatHumanOutput(data: DoctorOutput): string {
  const lines: string[] = [];
  
  lines.push('🏥 MCPShield Doctor');
  lines.push('');
  
  lines.push('Tool Information:');
  lines.push(`  Version: ${data.version}`);
  lines.push(`  Node: ${data.node}`);
  lines.push('');
  
  lines.push('Platform:');
  lines.push(`  Type: ${data.platform.type}`);
  lines.push(`  Release: ${data.platform.release}`);
  lines.push(`  Arch: ${data.platform.arch}`);
  lines.push('');
  
  lines.push('Paths:');
  lines.push(`  Working Directory: ${data.paths.cwd}`);
  lines.push(`  Cache Directory: ${data.paths.cacheDir}`);
  lines.push(`  Lockfile: ${data.paths.lockfile}`);
  lines.push(`  Policy File: ${data.paths.policyFile}`);
  lines.push('');
  
  lines.push('Files:');
  lines.push(`  ${data.files.lockfileExists ? '✓' : '✗'} mcp.lock.json ${data.files.lockfileExists ? 'exists' : 'not found'}`);
  lines.push(`  ${data.files.policyExists ? '✓' : '✗'} ${POLICY_FILE} ${data.files.policyExists ? 'exists' : 'not found'}`);
  lines.push('');
  
  lines.push('Registry:');
  lines.push(`  URL: ${data.registry.url}`);
  lines.push(`  ${data.registry.dnsResolved ? '✓' : '✗'} DNS Resolution ${data.registry.dnsResolved ? 'OK' : 'FAILED'}`);
  lines.push(`  ${data.registry.httpsReachable ? '✓' : '✗'} HTTPS Connectivity ${data.registry.httpsReachable ? 'OK' : 'FAILED'}`);
  if (data.registry.error) {
    lines.push(`  Error: ${data.registry.error}`);
  }
  lines.push('');
  
  lines.push(`Timestamp: ${data.timestamp}`);
  
  // Summary
  const allChecks = [
    data.files.lockfileExists,
    data.registry.dnsResolved,
    data.registry.httpsReachable,
  ];
  const passedChecks = allChecks.filter(Boolean).length;
  const totalChecks = allChecks.length;
  
  lines.push('');
  lines.push('─'.repeat(60));
  if (passedChecks === totalChecks) {
    lines.push('✅ All checks passed');
  } else {
    lines.push(`⚠️  ${passedChecks}/${totalChecks} checks passed`);
  }
  
  return lines.join('\n');
}

/**
 * Doctor command implementation
 */
export async function doctorCommand(options: DoctorOptions = {}): Promise<number> {
  try {
    const diagnostics = await runDiagnostics(options);
    
    if (options.json) {
      console.log(JSON.stringify(diagnostics, null, 2));
    } else {
      console.log(formatHumanOutput(diagnostics));
    }
    
    // Exit with error code if critical checks fail
    if (!diagnostics.registry.dnsResolved || !diagnostics.registry.httpsReachable) {
      return 1;
    }
    
    return 0;
  } catch (error: any) {
    console.error(`❌ Doctor command failed: ${error.message}`);
    return 1;
  }
}
