/**
 * mcp-shield add - Add an MCP server to your project
 * 
 * Full workflow:
 * 1. Fetch server metadata from registry
 * 2. Verify namespace ownership
 * 3. Download artifact
 * 4. Verify digest
 * 5. Run security scan
 * 6. Generate policy stub
 * 7. Write to lockfile
 * 8. Interactive approval
 */

import chalk from 'chalk';
import prompts from 'prompts';
import {
  RegistryClient,
  verifyNamespace,
  isValidNamespaceFormat,
  LockfileManager,
  LockfileEntry,
  NpmResolver,
  CacheManager,
  loadPolicy,
  validatePolicy,
  evaluateAdd,
  PolicyEvaluationResult,
} from '@mcpshield/core';
import { BasicScanner } from '@mcpshield/scanner';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Add command handler
 */
export async function addCommand(serverName: string, options: { yes?: boolean; ci?: boolean } = {}): Promise<void> {
  const isNonInteractive = options.yes || options.ci;
  console.log(chalk.blue(`\n📦 Adding MCP server: ${serverName}\n`));

  // Step 1: Validate namespace format
  console.log(chalk.dim('→ Validating namespace format...'));
  if (!isValidNamespaceFormat(serverName)) {
    console.error(
      chalk.red(`✗ Invalid namespace format\n`) +
      chalk.dim(`  Expected: reverse-DNS format like io.github.user/server-name\n`) +
      chalk.dim(`  Got: ${serverName}`)
    );
    process.exit(1);
  }
  console.log(chalk.green('✓ Valid namespace format'));

  // Step 2: Fetch from registry
  console.log(chalk.dim('\n→ Fetching metadata from registry...'));
  const client = new RegistryClient();
  let response;
  
  try {
    response = await client.getServer(serverName);
  } catch (error: any) {
    console.error(
      chalk.red('\n✗ Failed to fetch server from registry\n') +
      chalk.dim(`  ${error.message}`)
    );
    process.exit(1);
  }

  const server = response.server;
  console.log(chalk.green('✓ Server found in registry'));

  // Step 3: Verify namespace ownership
  console.log(chalk.dim('\n→ Verifying namespace ownership...'));
  const verification = verifyNamespace(serverName, response);

  if (verification.verified) {
    console.log(
      chalk.green(`✓ Namespace verified`) +
      chalk.dim(` (${verification.method})`)
    );
  } else {
    console.log(
      chalk.yellow(`⚠ Namespace not verified`) +
      chalk.dim(`\n  ${verification.details?.reason || 'Unknown reason'}`)
    );
  }

  // Step 4: Display server details
  console.log(chalk.bold('\n📋 Server Details:\n'));
  console.log(`  ${chalk.bold('Name:')} ${server.name}`);
  console.log(`  ${chalk.bold('Version:')} ${server.version}`);
  console.log(`  ${chalk.bold('Description:')} ${server.description}`);
  
  if (server.repository?.url) {
    console.log(`  ${chalk.bold('Repository:')} ${server.repository.url}`);
  }

  const identity = client.extractPublisherIdentity(response);
  console.log(`\n  ${chalk.bold('Publisher Status:')} ${formatStatus(identity.status)}`);
  
  if (identity.github) {
    console.log(`  ${chalk.bold('GitHub:')} ${identity.github.owner}/${identity.github.repo}`);
  }
  
  if (identity.npm) {
    console.log(`  ${chalk.bold('NPM Package:')} ${identity.npm.package}`);
  }

  console.log(`\n  ${chalk.bold('Packages:')} ${server.packages.length}`);
  server.packages.forEach(pkg => {
    console.log(`    • ${chalk.cyan(pkg.type)}: ${pkg.identifier}@${pkg.version}`);
  });

  // Step 5: Download and verify artifacts
  console.log(chalk.bold('\n📥 Downloading artifacts...\n'));
  
  const artifacts: Array<{ type: string; url: string; digest: string; size?: number; scanResult?: any }> = [];
  const cache = new CacheManager();
  const scanner = new BasicScanner();
  
  for (const pkg of server.packages) {
    console.log(chalk.dim(`→ Processing ${pkg.type} package: ${pkg.identifier}@${pkg.version}`));
    
    try {
      if (pkg.type === 'npm') {
        const resolver = new NpmResolver();
        const result = await resolver.resolve(`${pkg.identifier}@${pkg.version}`);
        
        // Download to temp file
        const tempPath = path.join(os.tmpdir(), `mcpshield-${Date.now()}.tgz`);
        const digest = await resolver.download(result.artifact, tempPath);
        
        console.log(chalk.green(`  ✓ Downloaded and verified`));
        console.log(chalk.dim(`    Digest: ${digest}`));
        
        // Store in cache
        await cache.put(digest, tempPath);
        
        // Step 6: Run security scan
        console.log(chalk.dim('  → Running security scan...'));
        const buffer = await fs.readFile(tempPath);
        const scanResult = await scanner.scanPackage(pkg, buffer);
        
        artifacts.push({
          type: pkg.type,
          url: result.artifact.url,
          digest,
          size: result.artifact.size,
          scanResult,
        });
        
        console.log(`  ${formatVerdict(scanResult.verdict)} Risk Score: ${scanResult.riskScore}/100`);
        
        if (scanResult.findings.length > 0) {
          console.log(chalk.dim(`  → ${scanResult.findings.length} finding(s):`));
          for (const finding of scanResult.findings.slice(0, 3)) {
            const icon = getSeverityIcon(finding.severity);
            console.log(`     ${icon} ${chalk.dim(finding.category)}: ${finding.message}`);
          }
          if (scanResult.findings.length > 3) {
            console.log(chalk.dim(`     ... and ${scanResult.findings.length - 3} more`));
          }
        }
        
        // Clean up temp file
        await fs.unlink(tempPath);
        
      } else if (pkg.type === 'pypi') {
        console.log(chalk.yellow(`  ⚠ PyPI packages not fully supported yet`));
      } else {
        console.log(chalk.dim(`  → Skipping ${pkg.type} package (not yet supported)`));
      }
    } catch (err: any) {
      console.error(chalk.red(`  ✗ Failed: ${err.message}`));
    }
  }
  
  if (artifacts.length === 0) {
    console.error(chalk.red('\n✗ No artifacts could be downloaded. Aborting.'));
    process.exit(1);
  }

  // Step 7: Policy evaluation
  console.log(chalk.dim('\n→ Evaluating policy...'));
  
  const policy = await loadPolicy();
  let policyResult: PolicyEvaluationResult = { allowed: true, reasons: [] };
  let allFindings: any[] = [];
  let maxRiskScore = 0;
  
  // Collect all findings and max risk score from scans
  for (const artifact of artifacts) {
    if ((artifact as any).scanResult) {
      const scanResult = (artifact as any).scanResult;
      allFindings.push(...scanResult.findings);
      maxRiskScore = Math.max(maxRiskScore, scanResult.riskScore);
    }
  }
  
  if (policy) {
    const validation = await validatePolicy(policy);
    if (!validation.valid) {
      console.error(
        chalk.red('\n✗ Invalid policy configuration:\n') +
        validation.errors!.map(e => chalk.dim(`  - ${e}`)).join('\n')
      );
      process.exit(1);
    }
    
    policyResult = evaluateAdd({
      serverName,
      verified: verification.verified,
      verificationMethod: verification.method,
      riskScore: maxRiskScore,
      findings: allFindings,
      policy,
    });
    
    if (!policyResult.allowed) {
      console.log(chalk.red('✗ Policy check failed'));
      console.log(chalk.red('\nReasons:'));
      policyResult.reasons.forEach(reason => {
        console.log(chalk.red(`  • ${reason}`));
      });
      
      if (isNonInteractive) {
        // In CI/non-interactive mode, output JSON and exit
        console.error(JSON.stringify({
          error: 'policy_violation',
          serverName,
          reasons: policyResult.reasons,
        }, null, 2));
        process.exit(1);
      } else {
        // In interactive mode, prompt for override
        console.log();
        const { override } = await prompts({
          type: 'confirm',
          name: 'override',
          message: chalk.yellow('Policy check failed. Override and continue anyway?'),
          initial: false,
        });
        
        if (!override) {
          console.log(chalk.yellow('\n⚠ Aborted. Server not added.'));
          process.exit(1);
        }
        
        console.log(chalk.yellow('\n⚠ Policy override granted. Proceeding with caution...'));
      }
    } else {
      console.log(chalk.green('✓ Policy check passed'));
      
      if (policyResult.requiresApproval) {
        console.log(chalk.yellow('⚠ This server requires approval due to sensitive capabilities'));
      }
    }
  } else {
    console.log(chalk.dim('  (No policy.yaml found, skipping policy check)'));
  }

  // Step 8: Interactive approval
  if (!isNonInteractive) {
    console.log();
    const { approve } = await prompts({
      type: 'confirm',
      name: 'approve',
      message: 'Add this server to mcp.lock.json?',
      initial: true,
    });
    
    if (!approve) {
      console.log(chalk.yellow('\n⚠ Aborted. Server not added.'));
      return;
    }
  }

  // Step 9: Write to lockfile
  console.log(chalk.dim('\n→ Updating lockfile...'));
  
  const lockfileManager = new LockfileManager();
  
  const entry: LockfileEntry = {
    namespace: server.name,
    version: server.version,
    resolved: response.server.repository?.url,
    verified: verification.verified,
    verificationMethod: verification.method,
    verifiedOwner: verification.details?.githubOwner || null,
    fetchedAt: new Date().toISOString(),
    artifacts,
  };
  
  await lockfileManager.addServer(entry);
  
  console.log(chalk.green('✓ Server added to mcp.lock.json'));
  console.log(chalk.dim('\nNext steps:'));
  console.log(chalk.dim('  • Run `mcp-shield verify` to re-verify all servers'));
  console.log(chalk.dim('  • Run `mcp-shield scan` for a security report'));
  console.log(chalk.dim('  • Edit policy.yaml to configure server policies\n'));
}

function formatStatus(status: string | undefined): string {
  switch (status) {
    case 'official':
      return chalk.green('✓ Official');
    case 'verified':
      return chalk.blue('✓ Verified');
    case 'community':
      return chalk.yellow('Community');
    default:
      return chalk.gray('Unknown');
  }
}

function formatVerdict(verdict: string): string {
  switch (verdict) {
    case 'clean':
      return chalk.green('✓ Clean');
    case 'warning':
      return chalk.yellow('⚠ Warning');
    case 'suspicious':
      return chalk.red('⚠ Suspicious');
    case 'malicious':
      return chalk.red('✗ Malicious');
    default:
      return chalk.gray('? Unknown');
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return chalk.red('●');
    case 'high':
      return chalk.red('●');
    case 'medium':
      return chalk.yellow('●');
    case 'low':
      return chalk.blue('●');
    default:
      return chalk.gray('●');
  }
}
