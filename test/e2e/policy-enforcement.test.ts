/**
 * Policy enforcement E2E tests (deterministic)
 *
 * These tests intentionally avoid relying on built `dist/` artifacts or live
 * network calls. They focus on validating that the repo's default `init`
 * output produces a policy.yaml that matches the canonical schema.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { initCommand } from '../../packages/cli/src/commands/init.js';
import { scanCommand } from '../../packages/cli/src/commands/scan.js';
import { setGlobalOptions } from '../../packages/cli/src/output.js';
import { loadPolicy, validatePolicy } from '../../packages/core/src/policy.js';
import { CacheManager, DigestVerifier } from '@kellyclaude/mcpshield-core';
import * as tar from 'tar';

describe('Policy Enforcement E2E', () => {
  test('init generates a policy.yaml that validates against schema', async () => {
    const originalCwd = process.cwd();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-policy-e2e-'));

    try {
      process.chdir(tempDir);

      await initCommand();

      const policyPath = path.join(tempDir, 'policy.yaml');
      await fs.access(policyPath);

      const policy = await loadPolicy(policyPath);
      assert.ok(policy, 'policy.yaml should parse');

      const validation = await validatePolicy(policy!);
      assert.equal(validation.valid, true, validation.errors?.join('\n') ?? 'Policy should be valid');
    } finally {
      process.chdir(originalCwd);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('scan enforces maxRiskScore in --ci mode (offline, deterministic)', async () => {
    const originalCwd = process.cwd();
    const originalCacheDir = process.env.MCPSHIELD_CACHE_DIR;

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-policy-e2e-'));
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-cache-e2e-'));
    process.env.MCPSHIELD_CACHE_DIR = cacheDir;

    try {
      // Create a tarball that will deterministically trigger a non-zero risk score.
      const pkgRoot = path.join(tempDir, 'pkg');
      const packageDir = path.join(pkgRoot, 'package');
      await fs.mkdir(packageDir, { recursive: true });
      await fs.writeFile(
        path.join(packageDir, 'package.json'),
        JSON.stringify({ name: 'risk-package', version: '1.0.0' }, null, 2)
      );
      await fs.writeFile(path.join(packageDir, 'index.js'), 'eval("1+1")\n');

      const tarballPath = path.join(tempDir, 'risk.tgz');
      await tar.create({ gzip: true, file: tarballPath, cwd: pkgRoot }, ['package']);

      const digest = await DigestVerifier.computeDigest(tarballPath, 'sha256');
      const cache = new CacheManager(cacheDir);
      await cache.put(digest, tarballPath);

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
                url: 'https://registry.npmjs.org/risk-package/-/risk-package-1.0.0.tgz',
                digest,
                size: (await fs.stat(tarballPath)).size,
              },
            ],
          },
        },
      };
      await fs.writeFile(path.join(tempDir, 'mcp.lock.json'), JSON.stringify(lockfile, null, 2));

      // Enforce a strict policy: riskScore must be 0.
      await fs.writeFile(
        path.join(tempDir, 'policy.yaml'),
        [
          'version: "1.0"',
          'global:',
          '  maxRiskScore: 0',
          '  blockSeverities:',
          '    - critical',
          'servers: []',
          '',
        ].join('\n')
      );

      process.chdir(tempDir);
      setGlobalOptions({ quiet: true, color: false });

      const exitCode = await scanCommand({ ci: true, offline: true });
      assert.equal(exitCode, 1);
    } finally {
      process.chdir(originalCwd);
      if (originalCacheDir !== undefined) process.env.MCPSHIELD_CACHE_DIR = originalCacheDir;
      else delete process.env.MCPSHIELD_CACHE_DIR;

      await fs.rm(cacheDir, { recursive: true, force: true });
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
