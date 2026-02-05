#!/usr/bin/env node

/**
 * MCPShield CLI Entry Point
 */

import { Command } from 'commander';
import { RegistryClient } from '@mcpshield/core';
import { addCommand, initCommand, verifyCommand, scanCommand } from './commands/index.js';

const program = new Command();

program
  .name('mcp-shield')
  .description('Supply chain security tool for MCP servers')
  .version('0.1.0');

// init command
program
  .command('init')
  .description('Initialize MCPShield in current directory')
  .action(async () => {
    try {
      await initCommand();
    } catch (error: any) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  });

// add command
program
  .command('add')
  .description('Add an MCP server to your project')
  .argument('<server-name>', 'Server name from registry (e.g., io.github.user/server-name)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (serverName: string, options: { yes?: boolean }) => {
    try {
      await addCommand(serverName, options);
    } catch (error: any) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  });

// verify command
program
  .command('verify')
  .description('Verify all servers in lockfile')
  .action(async () => {
    try {
      const exitCode = await verifyCommand();
      process.exit(exitCode);
    } catch (error: any) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  });

// scan command
program
  .command('scan')
  .description('Scan all servers for security issues')
  .action(async () => {
    try {
      await scanCommand();
    } catch (error: any) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  });

// Dev/test commands
program
  .command('test-registry')
  .description('[DEV] Test registry client with a server name')
  .argument('<server-name>', 'Server name to fetch from registry')
  .action(async (serverName: string) => {
    try {
      console.log(`Fetching ${serverName} from registry...`);
      const client = new RegistryClient();
      const response = await client.getServer(serverName);
      
      console.log('\n✓ Server found:');
      console.log(`  Name: ${response.server.name}`);
      console.log(`  Version: ${response.server.version}`);
      console.log(`  Description: ${response.server.description}`);
      console.log(`  Packages: ${response.server.packages.length}`);
      
      const identity = client.extractPublisherIdentity(response);
      console.log(`  Status: ${identity.status}`);
      
      if (identity.github) {
        console.log(`  GitHub: ${identity.github.owner}/${identity.github.repo}`);
      }
      
      const isVerified = client.isVerified(response);
      console.log(`  Verified: ${isVerified ? '✓' : '✗'}`);
      
    } catch (error: any) {
      console.error(`\n✗ Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
