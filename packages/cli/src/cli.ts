#!/usr/bin/env node

/**
 * MCPShield CLI Entry Point
 */

import { Command } from 'commander';
import { createRequire } from 'module';
import { RegistryClient } from '@kellyclaude/mcpshield-core';
import { addCommand, initCommand, verifyCommand, scanCommand, cacheGcCommand, cachePurgeCommand, doctorCommand, lockValidateCommand } from './commands/index.js';
import { setGlobalOptions, handleCommandError, debugLog } from './output.js';

const require = createRequire(import.meta.url);
const toolVersion: string = require('../package.json').version;

const program = new Command();

program
  .name('mcp-shield')
  .description('Supply chain security tool for MCP servers')
  .version(toolVersion)
  .option('--json', 'Output results as JSON (disables ANSI colors and progress)')
  .option('--ci', 'CI mode: no prompts, fail fast (implies --no-color)')
  .option('--quiet', 'Suppress non-essential output')
  .option('--no-color', 'Disable ANSI color output')
  .option('--offline', 'Offline mode: refuse network and use cache only')
  .option('--debug', 'Enable debug output (timing and decisions to stderr)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    
    // CI mode implies --quiet and --no-color
    if (opts.ci) {
      opts.color = false;
      opts.quiet = true;
    }
    
    setGlobalOptions({
      json: opts.json,
      ci: opts.ci,
      quiet: opts.quiet,
      color: opts.color !== false,
      offline: opts.offline || false,
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
      handleCommandError(error, 'init');
    }
  });

// add command
program
  .command('add')
  .description('Add an MCP server to your project')
  .argument('<server-name>', 'Server name from registry (e.g., io.github.user/server-name)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (serverName: string, options: { yes?: boolean }, command: Command) => {
    const startTime = Date.now();
    const globalOpts = command.optsWithGlobals();
    debugLog(`Adding server: ${serverName}`);
    try {
      const exitCode = await addCommand(serverName, { ...options, ci: globalOpts.ci });
      debugLog(`add completed in ${Date.now() - startTime}ms`);
      process.exit(exitCode);
    } catch (error: any) {
      handleCommandError(error, 'add');
    }
  });

// verify command
program
  .command('verify')
  .description('Verify all servers in lockfile')
  .action(async (_options, command: Command) => {
    const startTime = Date.now();
    try {
      const globalOpts = command.optsWithGlobals();
      const exitCode = await verifyCommand({ offline: globalOpts.offline });
      debugLog(`verify completed in ${Date.now() - startTime}ms with exit code ${exitCode}`);
      process.exit(exitCode);
    } catch (error: any) {
      handleCommandError(error, 'verify');
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
      const exitCode = await scanCommand({
        ...options,
        ci: globalOpts.ci,
        offline: globalOpts.offline,
      });
      debugLog(`scan completed in ${Date.now() - startTime}ms with exit code ${exitCode}`);
      process.exit(exitCode);
    } catch (error: any) {
      handleCommandError(error, 'scan');
    }
  });


// lock commands
const lock = program
  .command('lock')
  .description('Lockfile operations');

lock
  .command('validate')
  .description('Validate lockfile structure and integrity')
  .action(async (_options, command: Command) => {
    try {
      const globalOpts = command.optsWithGlobals();
      const exitCode = await lockValidateCommand({ json: globalOpts.json, ci: globalOpts.ci });
      process.exit(exitCode);
    } catch (error: any) {
      handleCommandError(error, 'lock validate');
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
        offline: globalOpts.offline,
      });
      debugLog(`doctor completed in ${Date.now() - startTime}ms with exit code ${exitCode}`);
      process.exit(exitCode);
    } catch (error: any) {
      handleCommandError(error, 'doctor');
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
      handleCommandError(error, 'cache gc');
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
      handleCommandError(error, 'cache purge');
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
      handleCommandError(error, 'test-registry');
    }
  });

program.parse();
