/**
 * mcp-shield init
 * 
 * Initialize MCPShield in the current directory
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

const LOCKFILE_TEMPLATE = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  servers: {},
};

const POLICY_TEMPLATE = `# MCPShield Policy Configuration
#
# This file defines security policies for MCP servers in your project.
# See: https://github.com/yourusername/mcpshield/docs/policy-spec.md

version: "1.0"

# Global policy settings
global:
  # Require all servers to be verified
  requireVerified: false
  
  # Maximum allowed risk score (0-100)
  maxRiskScore: 50
  
  # Block servers with these verdicts
  blockVerdicts:
    - malicious
    - suspicious

# Server-specific policies
servers: {}

# Example server policy (uncomment to use):
# servers:
#   io.github.user/server-name:
#     enabled: true
#     maxRiskScore: 30
#     allowedTools:
#       - read_file
#       - write_file
#     deniedTools:
#       - execute_command
`;

export async function initCommand(): Promise<void> {
  console.log(chalk.blue('\n🔒 Initializing MCPShield\n'));
  
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
    console.log(chalk.yellow(`⚠ mcp.lock.json already exists, skipping`));
  } else {
    await fs.writeFile(
      lockfilePath,
      JSON.stringify(LOCKFILE_TEMPLATE, null, 2) + '\n',
      'utf-8'
    );
    console.log(chalk.green(`✓ Created mcp.lock.json`));
  }
  
  // Create policy.yaml
  if (policyExists) {
    console.log(chalk.yellow(`⚠ policy.yaml already exists, skipping`));
  } else {
    await fs.writeFile(policyPath, POLICY_TEMPLATE, 'utf-8');
    console.log(chalk.green(`✓ Created policy.yaml`));
  }
  
  console.log(chalk.dim('\nNext steps:'));
  console.log(chalk.dim('  1. Run `mcp-shield add <server-name>` to add servers'));
  console.log(chalk.dim('  2. Edit policy.yaml to configure security policies'));
  console.log(chalk.dim('  3. Run `mcp-shield verify` to verify all servers\n'));
}
