/**
 * mcp-shield init
 * 
 * Initialize MCPShield in the current directory
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { createRequire } from 'module';
import { debugLog, getGlobalOptions, logInfo, logWarn, writeJson } from '../output.js';

const require = createRequire(import.meta.url);
const toolVersion: string = require('../../package.json').version;

const LOCKFILE_TEMPLATE = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  servers: {},
};

const POLICY_TEMPLATE = `# MCPShield Policy Configuration
#
# This file defines security policies for MCP servers in your project.
# See: docs/policy-yaml-spec.md

version: "1.0"

# Global policy settings
global:
  # Require publisher identity verification
  requireVerification: false
  
  # Block servers without verified publishers
  denyUnverified: false
  
  # Maximum acceptable risk score (0-100)
  maxRiskScore: 50
  
  # Block servers with findings at these severities
  blockSeverities:
    - critical

# Server-specific policies
servers: []

# Example server policy (uncomment to use):
# servers:
#   - serverName: "io.github.user/server-name"
#     enabled: true
#     maxRiskScore: 30
`;

export async function initCommand(): Promise<void> {
  const startTime = Date.now();
  const opts = getGlobalOptions();
  if (!opts.json) {
    logInfo(chalk.blue('\n🔒 Initializing MCPShield\n'));
  }
  
  const cwd = process.cwd();
  const lockfilePath = path.join(cwd, 'mcp.lock.json');
  const policyPath = path.join(cwd, 'policy.yaml');
  
  // Check if files already exist
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
  
  // Create mcp.lock.json
  if (lockfileExists) {
    logWarn(chalk.yellow(`⚠ mcp.lock.json already exists, skipping`));
  } else {
    await fs.writeFile(
      lockfilePath,
      JSON.stringify(LOCKFILE_TEMPLATE, null, 2) + '\n',
      'utf-8'
    );
    logInfo(chalk.green(`✓ Created mcp.lock.json`));
  }
  
  // Create policy.yaml
  if (policyExists) {
    logWarn(chalk.yellow(`⚠ policy.yaml already exists, skipping`));
  } else {
    await fs.writeFile(policyPath, POLICY_TEMPLATE, 'utf-8');
    logInfo(chalk.green(`✓ Created policy.yaml`));
  }
  
  if (opts.json) {
    writeJson({
      tool: 'mcpshield',
      toolVersion,
      command: 'init',
      generatedAt: new Date().toISOString(),
      result: {
        lockfile: { path: lockfilePath, created: !lockfileExists },
        policy: { path: policyPath, created: !policyExists },
      },
      errors: [],
    });
  } else {
    logInfo(chalk.dim('\nNext steps:'));
    logInfo(chalk.dim('  1. Run `mcp-shield add <server-name>` to add servers'));
    logInfo(chalk.dim('  2. Edit policy.yaml to configure security policies'));
    logInfo(chalk.dim('  3. Run `mcp-shield verify` to verify all servers\n'));
  }

  debugLog(`init completed in ${Date.now() - startTime}ms`);
}
