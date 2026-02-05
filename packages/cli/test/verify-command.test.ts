import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { CacheManager } from '@kellyclaude/mcpshield-core';
import { verifyCommand } from '../src/commands/verify.js';
import { EXIT_GENERAL_FAILURE, setGlobalOptions } from '../src/output.js';

let stdoutBuffer: string[] = [];
let originalStdoutWrite: any;

function captureStdout() {
  stdoutBuffer = [];
  originalStdoutWrite = process.stdout.write;
  process.stdout.write = ((chunk: any) => {
    stdoutBuffer.push(chunk.toString());
    return true;
  }) as any;
}

function restoreStdout() {
  process.stdout.write = originalStdoutWrite;
}

describe('verifyCommand', () => {
  let tempDir: string;
  let cacheDir: string;
  let originalCwd: string;
  let originalCacheDir: string | undefined;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalCacheDir = process.env.MCPSHIELD_CACHE_DIR;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-verify-test-'));
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-cache-test-'));
    process.env.MCPSHIELD_CACHE_DIR = cacheDir;

    captureStdout();
    setGlobalOptions({ json: true, quiet: true, color: false });
  });

  afterEach(async () => {
    restoreStdout();
    setGlobalOptions({ color: true });

    process.chdir(originalCwd);
    if (originalCacheDir !== undefined) process.env.MCPSHIELD_CACHE_DIR = originalCacheDir;
    else delete process.env.MCPSHIELD_CACHE_DIR;

    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should return exit 1 on digest drift (and output JSON)', async () => {
    const expectedDigest = 'sha256-abc123';

    // Write a valid lockfile that references an artifact digest.
    const lockfile = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      servers: {
        'io.github.example/server': {
          namespace: 'io.github.example/server',
          version: '1.0.0',
          verified: true,
          fetchedAt: new Date().toISOString(),
          artifacts: [
            {
              type: 'npm',
              url: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
              digest: expectedDigest,
              size: 1,
            },
          ],
        },
      },
    };

    await fs.writeFile(path.join(tempDir, 'mcp.lock.json'), JSON.stringify(lockfile, null, 2));

    // Put content in cache under the expected digest key, but with different content.
    const sourcePath = path.join(tempDir, 'artifact.tgz');
    await fs.writeFile(sourcePath, 'not the expected content');
    const cache = new CacheManager(cacheDir);
    await cache.put(expectedDigest, sourcePath);

    process.chdir(tempDir);
    const exitCode = await verifyCommand();
    assert.equal(exitCode, EXIT_GENERAL_FAILURE);

    const jsonText = stdoutBuffer.join('');
    const parsed = JSON.parse(jsonText);
    assert.equal(parsed.command, 'verify');
    assert.equal(parsed.summary.drift, 1);
  });
});
