/**
 * Output module for CLI commands
 * Handles --json, --ci, --quiet, --no-color flags
 */

import chalk from 'chalk';

export interface GlobalOptions {
  json?: boolean;
  ci?: boolean;
  quiet?: boolean;
  color?: boolean;
  debug?: boolean;
}

// Global state (set by CLI before command execution)
let globalOptions: GlobalOptions = { color: true };

export function setGlobalOptions(opts: GlobalOptions): void {
  globalOptions = { ...opts };
  
  // Disable chalk if --no-color or --json
  if (!opts.color || opts.json) {
    chalk.level = 0;
  }
}

export function getGlobalOptions(): GlobalOptions {
  return globalOptions;
}

/**
 * Write JSON output to stdout (only in --json mode)
 * Ensures stable key ordering for snapshot testing
 */
export function writeJson(data: any): void {
  if (!globalOptions.json) return;
  
  // Sort keys recursively for stable output
  const sortedData = sortKeys(data);
  console.log(JSON.stringify(sortedData, null, 2));
}

/**
 * Log info message (respects --quiet and --json)
 */
export function logInfo(message: string): void {
  if (globalOptions.json || globalOptions.quiet) return;
  console.log(message);
}

/**
 * Log warning message (respects --json, but not --quiet)
 */
export function logWarn(message: string): void {
  if (globalOptions.json) return;
  console.warn(message);
}

/**
 * Log error message (always shown, but respects --json and --no-color)
 */
export function logError(message: string): void {
  if (globalOptions.json) {
    // In JSON mode, errors go to stderr as plain text
    console.error(message);
  } else {
    console.error(message);
  }
}

/**
 * Log debug message (only when --debug is enabled)
 * Always outputs to stderr to avoid interfering with stdout
 */
export function debugLog(message: string): void {
  if (!globalOptions.debug) return;
  const timestamp = new Date().toISOString();
  console.error(`[DEBUG ${timestamp}] ${message}`);
}

/**
 * Recursively sort object keys for stable JSON output
 */
function sortKeys(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  
  if (typeof obj === 'object') {
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = sortKeys(obj[key]);
    });
    return sorted;
  }
  
  return obj;
}

/**
 * Exit codes:
 * 0 = success
 * 1 = general failure (backward compat)
 * 2 = user error (invalid input, missing file, etc.)
 * 3 = unexpected error (network, internal bug, etc.)
 */
export const EXIT_SUCCESS = 0;
export const EXIT_GENERAL_FAILURE = 1;
export const EXIT_USER_ERROR = 2;
export const EXIT_UNEXPECTED = 3;

/**
 * Error classes for standardized exit codes
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export class UnexpectedError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'UnexpectedError';
  }
}

/**
 * Handle command errors and exit with correct code
 */
export function handleCommandError(error: any): never {
  if (error instanceof UserError) {
    logError(`\nError: ${error.message}`);
    process.exit(EXIT_USER_ERROR);
  } else if (error instanceof UnexpectedError) {
    logError(`\nUnexpected error: ${error.message}`);
    if (error.cause && !globalOptions.json) {
      logError(`Cause: ${error.cause.message}`);
    }
    process.exit(EXIT_UNEXPECTED);
  } else {
    // Unknown error type - treat as unexpected
    logError(`\nError: ${error.message || error}`);
    process.exit(EXIT_UNEXPECTED);
  }
}
