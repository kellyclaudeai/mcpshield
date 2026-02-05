/**
 * mcp-shield lock validate
 * 
 * Validate lockfile structure and integrity
 */

import { LockfileManager } from '@mcpshield/core';
import chalk from 'chalk';

interface LockValidateOptions {
  json?: boolean;
  ci?: boolean;
}

export async function lockValidateCommand(options: LockValidateOptions): Promise<number> {
  const lockfileManager = new LockfileManager();
  
  // Check if lockfile exists
  const exists = await lockfileManager.exists();
  
  if (!exists) {
    if (options.json) {
      console.log(JSON.stringify({
        valid: false,
        error: 'Lockfile not found',
        path: lockfileManager.getPath()
      }, null, 2));
    } else {
      console.error(chalk.red('✗ No mcp.lock.json found'));
      console.error(chalk.gray(`  Expected at: ${lockfileManager.getPath()}`));
    }
    return 1;
  }
  
  // Read lockfile
  let lockfile;
  try {
    lockfile = await lockfileManager.read();
  } catch (error: any) {
    if (options.json) {
      console.log(JSON.stringify({
        valid: false,
        error: 'Failed to parse lockfile',
        details: error.message,
        path: lockfileManager.getPath()
      }, null, 2));
    } else {
      console.error(chalk.red('✗ Failed to parse lockfile'));
      console.error(chalk.gray(`  ${error.message}`));
    }
    return 1;
  }
  
  // Validate
  const validation = lockfileManager.validate(lockfile);
  
  if (options.json) {
    // JSON output
    const output: any = {
      valid: validation.valid,
      path: lockfileManager.getPath(),
      version: lockfile.version,
      generatedAt: lockfile.generatedAt,
      serverCount: Object.keys(lockfile.servers).length
    };
    
    if (!validation.valid) {
      output.errors = validation.errors;
    }
    
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Human-readable output
    if (!options.ci) {
      console.log(chalk.bold('🔍 MCPShield Lock Validation\n'));
    }
    
    if (validation.valid) {
      console.log(chalk.green('✓ Lockfile is valid'));
      console.log(chalk.gray(`  Path: ${lockfileManager.getPath()}`));
      console.log(chalk.gray(`  Version: ${lockfile.version}`));
      console.log(chalk.gray(`  Servers: ${Object.keys(lockfile.servers).length}`));
      console.log(chalk.gray(`  Generated: ${lockfile.generatedAt}`));
    } else {
      console.error(chalk.red('✗ Lockfile validation failed'));
      console.error(chalk.gray(`  Path: ${lockfileManager.getPath()}\n`));
      
      console.error(chalk.red('Validation errors:'));
      validation.errors.forEach(err => {
        console.error(chalk.red(`  • ${err}`));
      });
    }
  }
  
  return validation.valid ? 0 : 1;
}
