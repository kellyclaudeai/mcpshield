/**
 * MCPShield Cache Persistence E2E Test
 * 
 * Tests that the cache persists across runs and uses correct OS locations
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CacheManager } from '../../packages/core/src/artifact-resolver.js';
import { NpmResolver } from '../../packages/core/src/artifact-resolver.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('MCPShield E2E: Cache Persistence', () => {
  let testCacheDir: string;
  let testDigest: string;
  let testArtifactPath: string;

  test('setup - create test cache directory', async () => {
    // Use a temp dir for testing to avoid polluting real cache
    testCacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-cache-test-'));
    console.log(`Test cache directory: ${testCacheDir}`);
  });

  test('cache manager - uses correct OS location by default', () => {
    const cacheManager = new CacheManager();
    const cacheDir = cacheManager.getCacheDir();
    
    // Verify it's using an OS-appropriate location
    if (process.env.MCPSHIELD_CACHE_DIR) {
      assert.equal(cacheDir, process.env.MCPSHIELD_CACHE_DIR);
      console.log(`✓ Using MCPSHIELD_CACHE_DIR: ${cacheDir}`);
    } else if (process.env.XDG_CACHE_HOME) {
      assert.equal(cacheDir, path.join(process.env.XDG_CACHE_HOME, 'mcpshield'));
      console.log(`✓ Using XDG_CACHE_HOME: ${cacheDir}`);
    } else if (process.platform === 'darwin') {
      const home = process.env.HOME || '';
      assert.equal(cacheDir, path.join(home, 'Library', 'Caches', 'mcpshield'));
      console.log(`✓ Using macOS cache location: ${cacheDir}`);
    } else {
      const home = process.env.HOME || '';
      assert.equal(cacheDir, path.join(home, '.cache', 'mcpshield'));
      console.log(`✓ Using Linux/Unix cache location: ${cacheDir}`);
    }
  });

  test('cache manager - respects MCPSHIELD_CACHE_DIR override', () => {
    const customDir = '/tmp/custom-mcpshield-cache';
    const originalEnv = process.env.MCPSHIELD_CACHE_DIR;
    
    process.env.MCPSHIELD_CACHE_DIR = customDir;
    const cacheManager = new CacheManager();
    
    assert.equal(cacheManager.getCacheDir(), customDir);
    console.log(`✓ MCPSHIELD_CACHE_DIR override works: ${customDir}`);
    
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.MCPSHIELD_CACHE_DIR = originalEnv;
    } else {
      delete process.env.MCPSHIELD_CACHE_DIR;
    }
  });

  test('cache - download and cache an artifact', async () => {
    const cacheManager = new CacheManager(testCacheDir);
    const resolver = new NpmResolver();
    
    // Download a small test package
    const result = await resolver.resolve('is-array@1.0.1');
    testArtifactPath = path.join(testCacheDir, 'temp-download.tgz');
    
    testDigest = await resolver.download(result.artifact, testArtifactPath);
    assert.ok(testDigest);
    console.log(`✓ Downloaded test package, digest: ${testDigest}`);
    
    // Store in cache
    const cachedPath = await cacheManager.put(testDigest, testArtifactPath);
    assert.ok(cachedPath);
    assert.ok(cachedPath.includes(testCacheDir));
    
    // Verify it's cached
    const isCached = await cacheManager.has(testDigest);
    assert.equal(isCached, true);
    
    console.log(`✓ Artifact cached at: ${cachedPath}`);
  });

  test('cache - persists across CacheManager instances', async () => {
    // Create a NEW CacheManager instance (simulating a new run)
    const newCacheManager = new CacheManager(testCacheDir);
    
    // Verify the cached artifact still exists
    const isCached = await newCacheManager.has(testDigest);
    assert.equal(isCached, true, 'Cache should persist across CacheManager instances');
    
    // Get the cached path
    const cachedPath = await newCacheManager.get(testDigest);
    assert.ok(cachedPath, 'Should be able to retrieve cached artifact');
    
    // Verify the file exists
    await fs.access(cachedPath);
    
    console.log(`✓ Cache persists across runs: ${cachedPath}`);
  });

  test('cache - gc removes old entries', async () => {
    const cacheManager = new CacheManager(testCacheDir);
    
    // Create some old test files
    const oldFilePath = path.join(testCacheDir, 'ab', 'sha256-old123');
    await fs.mkdir(path.dirname(oldFilePath), { recursive: true });
    await fs.writeFile(oldFilePath, 'old content');
    
    // Set mtime to 35 days ago
    const oldTime = Date.now() - (35 * 24 * 60 * 60 * 1000);
    await fs.utimes(oldFilePath, new Date(oldTime), new Date(oldTime));
    
    // Run gc with 30 day threshold
    const maxAgeDays = 30;
    const removed = await cacheManager.cleanup(maxAgeDays * 24 * 60 * 60 * 1000);
    
    assert.ok(removed >= 1, 'Should remove at least one old file');
    console.log(`✓ Cache gc removed ${removed} old entries`);
    
    // Verify the old file is gone
    try {
      await fs.access(oldFilePath);
      assert.fail('Old file should have been removed');
    } catch (err: any) {
      assert.equal(err.code, 'ENOENT');
    }
    
    // Verify recent cached file still exists
    const recentStillCached = await cacheManager.has(testDigest);
    assert.equal(recentStillCached, true, 'Recent cache entry should not be removed');
  });

  test('cache - purge removes all entries', async () => {
    const cacheManager = new CacheManager(testCacheDir);
    
    // Verify we have cached items
    const hasCached = await cacheManager.has(testDigest);
    assert.equal(hasCached, true, 'Should have cached items before purge');
    
    // Purge the cache
    const removed = await cacheManager.purge();
    assert.ok(removed >= 1, 'Should remove at least one file');
    console.log(`✓ Cache purge removed ${removed} files`);
    
    // Verify cache is empty
    const stillCached = await cacheManager.has(testDigest);
    assert.equal(stillCached, false, 'Cache should be empty after purge');
    
    // Verify cache dir is gone
    try {
      await fs.access(testCacheDir);
      assert.fail('Cache directory should be removed after purge');
    } catch (err: any) {
      assert.equal(err.code, 'ENOENT');
    }
  });

  test('cleanup - remove test cache directory', async () => {
    // Clean up temp download file if it still exists
    try {
      await fs.unlink(testArtifactPath);
    } catch {
      // Ignore if already deleted
    }
    
    // Clean up test cache dir if it still exists
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore if already deleted by purge test
    }
    
    console.log('✓ Test cleanup complete');
  });
});
