/**
 * Cache management commands
 */

import { CacheManager } from '@kellyclaude/mcpshield-core';
import chalk from 'chalk';
import { getGlobalOptions, logInfo, writeJson } from '../output.js';

interface CacheGcOptions {
  maxAgeDays?: number;
}

/**
 * Garbage collect old cache entries
 */
export async function cacheGcCommand(options: CacheGcOptions = {}): Promise<void> {
  const opts = getGlobalOptions();
  const cacheManager = new CacheManager();
  
  const maxAgeDays = options.maxAgeDays || 30;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  
  logInfo(chalk.dim(`Cleaning cache entries older than ${maxAgeDays} days...`));
  logInfo(chalk.dim(`Cache directory: ${cacheManager.getCacheDir()}`));
  
  const removed = await cacheManager.cleanup(maxAgeMs);
  
  if (opts.json) {
    writeJson({
      action: 'gc',
      removed,
      maxAgeDays,
      cacheDir: cacheManager.getCacheDir(),
    });
  } else {
    logInfo(
      chalk.green(
        `✓ Removed ${removed} ${removed === 1 ? 'cache entry' : 'cache entries'} older than ${maxAgeDays} days`
      )
    );
  }
}

/**
 * Purge entire cache
 */
export async function cachePurgeCommand(): Promise<void> {
  const opts = getGlobalOptions();
  const cacheManager = new CacheManager();
  
  logInfo(chalk.dim('Purging entire cache...'));
  logInfo(chalk.dim(`Cache directory: ${cacheManager.getCacheDir()}`));
  
  const removed = await cacheManager.purge();
  
  if (opts.json) {
    writeJson({
      action: 'purge',
      removed,
      cacheDir: cacheManager.getCacheDir(),
    });
  } else {
    logInfo(chalk.green(`✓ Purged cache (removed ${removed} ${removed === 1 ? 'file' : 'files'})`));
  }
}
