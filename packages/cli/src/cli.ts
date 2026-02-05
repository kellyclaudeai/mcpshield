#!/usr/bin/env node

/**
 * MCPShield CLI Entry Point
 */

import { Command } from 'commander';
import { RegistryClient } from '@mcpshield/core';
import { addCommand, initCommand, verifyCommand, scanCommand, cacheGcCommand, cachePurgeCommand, doctorCommand, lockValidateCommand } from './commands/index.js';
import { setGlobalOptions, handleCommandError, debugLog } from './output.js';

const program = new Command();

program
  .name('mcp-shield')
  .description('Supply chain security tool for MCP servers')
  .version('0.1.0')
  .option('--json', 'Output results as JSON (disables ANSI colors and progress)')
  .option('--ci', 'CI mode: no prompts, fail fast (implies --no-color)')
  .option('--quiet', 'Suppress non-essential output')
  .option('--no-color', 'Disable ANSI color output')
  .option('--debug', 'Enable debug output (timing and decisions to stderr)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    
    // CI mode implies no-color
    if (opts.ci) {
      opts.color = false;
    }
    
    setGlobalOptions({
      json: opts.json,
      ci: opts.ci,
      quiet: opts.quiet,
      color: opts.color !== false,
      debug: opts.debug || false,
    });
    
    if (opts.debug) {
      debugLog('Debug mode enabled');
      debugLog(`Command: ${thisCommand.name()}`);
      debugLog(`Options: ${JSON.stringify(opts)}`);
    }
  });

// init command
program
  .command('init')
  .description('Initialize MCPShield in current directory')
  .action(async () => {
    const startTime = Date.now();
    try {
      await initCommand();
      debugLog(`init completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      handleCommandError(error);
    }
  });

// add command
program
  .command('add')
  .description('Add an MCP server to your project')
  .argument('<server-name>', 'Server name from registry (e.g., io.github.user/server-name)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (serverName: string, options: { yes?: boolean }) => {
    const startTime = Date.now();
    debugLog(`Adding server: ${serverName}`);
    try {
      await addCommand(serverName, options);
      debugLog(`add completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      handleCommandError(error);
    }
  });

// verify command
program
  .command('verify')
  .description('Verify all servers in lockfile')
  .action(async () => {
    const startTime = Date.now();
    try {
      const exitCode = await verifyCommand();
      debugLog(`verify completed in ${Date.now() - startTime}ms with exit code ${exitCode}`);
      process.exit(exitCode);
    } catch (error: any) {
      handleCommandError(error);
    }
  });

// scan command
program
  .command('scan')
  .description('Scan all servers for security issues')
  .option('--sarif', 'Output results in SARIF v2.1.0 format')
  .option('--enforce', 'Enforce policy (exit 1 on violations)')
  .action(async (options: { sarif?: boolean; enforce?: boolean }, command: Command) => {
    const startTime = Date.now();
    try {
      const globalOpts = command.optsWithGlobals();
      await scanCommand({ ...options, ci: globalOpts.ci });
      debugLog(`scan completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      handleCommandError(error);
    }
  });


// lock commands
const lock = program
  .command('lock')
  .description('Lockfile operations');

lock
  .command('validate')
  .description('Validate lockfile structure and integrity')
  .option('--json', 'Output as JSON')
  .option('--ci', 'CI mode (no colors, fail fast)')
  .action(async (options: { json?: boolean; ci?: boolean }) => {
    try {
      const exitCode = await lockValidateCommand(options);
      process.exit(exitCode);
    } catch (error: any) {
      handleCommandError(error);
    }
  });

// doctor command
program
  .command('doctor')
  .description('Run diagnostics to check tool health and environment')
  .action(async (options, command: Command) => {
    const startTime = Date.now();
    try {
      const globalOpts = command.optsWithGlobals();
      const exitCode = await doctorCommand({
        json: globalOpts.json,
        ci: globalOpts.ci,
      });
      debugLog(`doctor completed in ${Date.now() - startTime}ms with exit code ${exitCode}`);
      process.exit(exitCode);
    } catch (error: any) {
      handleCommandError(error);
    }
  });

// cache commands
const cache = program
  .command('cache')
  .description('Manage artifact cache');

cache
  .command('gc')
  .description('Garbage collect old cache entries')
  .option('--max-age-days <days>', 'Maximum age in days (default: 30)', (val) => parseInt(val, 10))
  .action(async (options: { maxAgeDays?: number }) => {
    const startTime = Date.now();
    try {
      await cacheGcCommand(options);
      debugLog(`cache gc completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      handleCommandError(error);
    }
  });

cache
  .command('purge')
  .description('Purge entire cache')
  .action(async () => {
    const startTime = Date.now();
    try {
      await cachePurgeCommand();
      debugLog(`cache purge completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      handleCommandError(error);
    }
  });

// Dev/test commands
program
  .command('test-registry')
  .description('[DEV] Test registry client with a server name')
  .argument('<server-name>', 'Server name to fetch from registry')
  .action(async (serverName: string) => {
    const startTime = Date.now();
    try {
      debugLog(`Testing registry with server: ${serverName}`);
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
      
      debugLog(`test-registry completed in ${Date.now() - startTime}ms`);
    } catch (error: any) {
      handleCommandError(error);
    }
  });

program.parse();
