/**
 * Cache management commands
 */

import { CacheManager } from '@mcpshield/core';
import chalk from 'chalk';
import { getGlobalOptions } from '../output.js';

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
  
  if (!opts.quiet) {
    console.log(chalk.dim(`Cleaning cache entries older than ${maxAgeDays} days...`));
    console.log(chalk.dim(`Cache directory: ${cacheManager.getCacheDir()}`));
  }
  
  const removed = await cacheManager.cleanup(maxAgeMs);
  
  if (opts.json) {
    console.log(JSON.stringify({
      action: 'gc',
      removed,
      maxAgeDays,
      cacheDir: cacheManager.getCacheDir(),
    }, null, 2));
  } else {
    console.log(chalk.green(`✓ Removed ${removed} cache ${removed === 1 ? 'entry' : 'entries'}`));
  }
}

/**
 * Purge entire cache
 */
export async function cachePurgeCommand(): Promise<void> {
  const opts = getGlobalOptions();
  const cacheManager = new CacheManager();
  
  if (!opts.quiet) {
    console.log(chalk.dim('Purging entire cache...'));
    console.log(chalk.dim(`Cache directory: ${cacheManager.getCacheDir()}`));
  }
  
  const removed = await cacheManager.purge();
  
  if (opts.json) {
    console.log(JSON.stringify({
      action: 'purge',
      removed,
      cacheDir: cacheManager.getCacheDir(),
    }, null, 2));
  } else {
    console.log(chalk.green(`✓ Purged cache (removed ${removed} ${removed === 1 ? 'file' : 'files'})`));
  }
}
