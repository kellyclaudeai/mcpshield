/**
 * mcp-shield add - Add an MCP server to your project
 * 
 * Fetches server metadata from registry, verifies namespace ownership,
 * and displays results. Later we'll add downloading/scanning/lockfile updates.
 */

import chalk from 'chalk';
import { RegistryClient } from '@mcpshield/core';
import { verifyNamespace, isValidNamespaceFormat } from '@mcpshield/core';

/**
 * Add command handler
 * 
 * @param serverName - Server name in format: io.github.user/server-name
 */
export async function addCommand(serverName: string): Promise<void> {
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

  // Step 4: Display results
  console.log(chalk.bold('\n📋 Server Details:\n'));
  console.log(`  ${chalk.bold('Name:')} ${server.name}`);
  console.log(`  ${chalk.bold('Version:')} ${server.version}`);
  console.log(`  ${chalk.bold('Description:')} ${server.description}`);
  
  if (server.repository?.url) {
    console.log(`  ${chalk.bold('Repository:')} ${server.repository.url}`);
  }

  // Publisher identity
  const identity = client.extractPublisherIdentity(response);
  console.log(`\n  ${chalk.bold('Publisher Status:')} ${formatStatus(identity.status)}`);
  
  if (identity.github) {
    console.log(`  ${chalk.bold('GitHub:')} ${identity.github.owner}/${identity.github.repo}`);
  }
  
  if (identity.npm) {
    console.log(`  ${chalk.bold('NPM Package:')} ${identity.npm.package}`);
  }

  // Verification details
  if (verification.details?.githubOwner) {
    console.log(`\n  ${chalk.bold('Verification:')}`);
    console.log(`    ${chalk.dim('Method:')} ${verification.method}`);
    console.log(`    ${chalk.dim('GitHub Owner:')} ${verification.details.githubOwner}`);
    if (verification.details.githubRepo) {
      console.log(`    ${chalk.dim('GitHub Repo:')} ${verification.details.githubRepo}`);
    }
  }

  // Packages
  console.log(`\n  ${chalk.bold('Packages:')} ${server.packages.length}`);
  server.packages.forEach(pkg => {
    console.log(`    • ${chalk.cyan(pkg.type)}: ${pkg.identifier}@${pkg.version}`);
  });

  // Next steps (placeholder for future)
  console.log(chalk.dim('\n→ Next: Download, scan, and add to lockfile'));
  console.log(chalk.yellow('\n⚠ Download/scan/lockfile features coming soon!'));
  console.log(chalk.dim('  For now, this is just fetching and verifying metadata.\n'));
}

/**
 * Format publisher status with colors
 */
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
