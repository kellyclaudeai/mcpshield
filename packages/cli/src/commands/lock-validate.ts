/**
 * mcp-shield lock validate
 *
 * Validate lockfile structure against the canonical schema.
 */

import chalk from 'chalk';
import { createRequire } from 'module';
import { LockfileManager } from '@kellyclaude/mcpshield-core';
import {
  EXIT_SUCCESS,
  EXIT_USER_ERROR,
  getGlobalOptions,
  logError,
  logInfo,
  writeJson,
} from '../output.js';

const require = createRequire(import.meta.url);
const toolVersion: string = require('../../package.json').version;

interface LockValidateJsonOutput {
  tool: 'mcpshield';
  toolVersion: string;
  command: 'lock validate';
  generatedAt: string;
  valid: boolean;
  path: string;
  lockfile: {
    version: string | null;
    generatedAt: string | null;
    serverCount: number | null;
  };
  errors: string[];
}

export async function lockValidateCommand(_options: { json?: boolean; ci?: boolean } = {}): Promise<number> {
  const opts = getGlobalOptions();
  const lockfileManager = new LockfileManager();

  const outputBase: Omit<LockValidateJsonOutput, 'valid' | 'errors' | 'lockfile'> = {
    tool: 'mcpshield',
    toolVersion,
    command: 'lock validate',
    generatedAt: new Date().toISOString(),
    path: lockfileManager.getPath(),
  };

  if (!(await lockfileManager.exists())) {
    const output: LockValidateJsonOutput = {
      ...outputBase,
      valid: false,
      lockfile: { version: null, generatedAt: null, serverCount: null },
      errors: ['Lockfile not found'],
    };

    if (opts.json) writeJson(output);
    else {
      logError('No mcp.lock.json found.');
      logError(chalk.dim(`Expected at: ${lockfileManager.getPath()}`));
    }
    return EXIT_USER_ERROR;
  }

  let lockfile: any;
  try {
    lockfile = await lockfileManager.read();
  } catch (error: any) {
    const output: LockValidateJsonOutput = {
      ...outputBase,
      valid: false,
      lockfile: { version: null, generatedAt: null, serverCount: null },
      errors: [`Failed to read/parse lockfile: ${error.message}`],
    };

    if (opts.json) writeJson(output);
    else {
      logError('Failed to read/parse mcp.lock.json.');
      logError(chalk.dim(error.message));
    }
    return EXIT_USER_ERROR;
  }

  const validation = lockfileManager.validate(lockfile);
  const output: LockValidateJsonOutput = {
    ...outputBase,
    valid: validation.valid,
    lockfile: {
      version: typeof lockfile.version === 'string' ? lockfile.version : null,
      generatedAt: typeof lockfile.generatedAt === 'string' ? lockfile.generatedAt : null,
      serverCount: lockfile.servers && typeof lockfile.servers === 'object' ? Object.keys(lockfile.servers).length : null,
    },
    errors: validation.valid ? [] : validation.errors,
  };

  if (opts.json) {
    writeJson(output);
  } else if (validation.valid) {
    logInfo(chalk.green('✓ Lockfile is valid'));
    logInfo(chalk.dim(`Path: ${lockfileManager.getPath()}`));
    logInfo(chalk.dim(`Servers: ${output.lockfile.serverCount ?? 0}`));
    logInfo(chalk.dim(`Generated: ${output.lockfile.generatedAt ?? 'unknown'}`));
  } else {
    logError('Lockfile validation failed:');
    for (const err of output.errors) {
      logError(`- ${err}`);
    }
  }

  return validation.valid ? EXIT_SUCCESS : EXIT_USER_ERROR;
}
