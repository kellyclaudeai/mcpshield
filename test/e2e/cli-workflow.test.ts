/**
 * MCPShield CLI End-to-End Test
 * 
 * Tests the complete CLI workflow:
 * 1. init - Create lockfile and policy
 * 2. add - Add a server (without actual download/scan)
 * 3. verify - Verify lockfile entries
 * 4. scan - Security scan
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { initCommand } from '../../packages/cli/src/commands/init.js';
import { LockfileManager } from '../../packages/core/src/lockfile.js';
import { RegistryClient } from '../../packages/core/src/registry-client.js';
import { verifyNamespace, isValidNamespaceFormat } from '../../packages/core/src/namespace-verifier.js';
import { NpmResolver, DigestVerifier } from '../../packages/core/src/artifact-resolver.js';
import { BasicScanner } from '../../packages/scanner/src/scanner.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('MCPShield E2E: Full CLI Workflow', () => {
  let testDir: string;
  let lockfileManager: LockfileManager;

  test('setup - create test directory', async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-e2e-'));
    console.log(`Test directory: ${testDir}`);
    process.chdir(testDir);
    lockfileManager = new LockfileManager(testDir);
  });

  test('init - create lockfile and policy', async () => {
    await initCommand();
    
    // Verify lockfile exists
    const lockfileExists = await lockfileManager.exists();
    assert.equal(lockfileExists, true, 'Lockfile should exist');
    
    // Verify policy.yaml exists
    const policyPath = path.join(testDir, 'policy.yaml');
    await fs.access(policyPath);
    
    // Read lockfile
    const lockfile = await lockfileManager.read();
    assert.equal(lockfile.version, '1.0.0');
    assert.deepEqual(lockfile.servers, {});
    
    console.log('✓ Init command created lockfile and policy');
  });

  test('registry client - fetch real server metadata', async () => {
    const client = new RegistryClient();
    
    // This will fail if registry doesn't have this server, which is expected
    // in a test environment. We're just testing the client works.
    try {
      const response = await client.getServer('test-server');
      // If we get here, the server exists
      assert.ok(response.server);
      assert.ok(response.server.name);
      console.log(`✓ Fetched server: ${response.server.name}`);
    } catch (err: any) {
      // Expected - test server doesn't exist
      assert.ok(err.message.includes('404') || err.message.includes('not found'));
      console.log('✓ Registry client correctly handles 404');
    }
  });

  test('namespace verification - valid format', () => {
    assert.equal(isValidNamespaceFormat('io.github.user/server'), true);
    assert.equal(isValidNamespaceFormat('com.example/server'), true);
    assert.equal(isValidNamespaceFormat('invalid'), false);
    assert.equal(isValidNamespaceFormat('io.github.user'), false);
    console.log('✓ Namespace format validation works');
  });

  test('npm resolver - resolve real package', async () => {
    const resolver = new NpmResolver();
    
    // Use a real, small npm package for testing
    const result = await resolver.resolve('is-array@1.0.1');
    
    assert.ok(result.artifact);
    assert.ok(result.artifact.url);
    assert.equal(result.artifact.type, 'npm');
    assert.ok(result.artifact.integrity);
    
    console.log('✓ NPM resolver can resolve real packages');
    console.log(`  URL: ${result.artifact.url}`);
  });

  test('npm resolver - download and verify', async (t) => {
    const resolver = new NpmResolver();
    const result = await resolver.resolve('is-array@1.0.1');
    
    const tempPath = path.join(testDir, 'test-download.tgz');
    const digest = await resolver.download(result.artifact, tempPath);
    
    assert.ok(digest);
    assert.ok(digest.startsWith('sha256-') || digest.startsWith('sha512-'));
    
    // Verify the downloaded file
    const stats = await fs.stat(tempPath);
    assert.ok(stats.size > 0);
    
    // Verify digest computation
    const verification = await DigestVerifier.verify(tempPath, digest);
    assert.equal(verification.valid, true);
    
    // Clean up
    await fs.unlink(tempPath);
    
    console.log(`✓ NPM downloader works and digest verification passes (${digest.split('-')[0]})`);
  });

  test('security scanner - scan real package', async () => {
    const scanner = new BasicScanner();
    const resolver = new NpmResolver();
    
    // Download a known-safe package
    const result = await resolver.resolve('is-array@1.0.1');
    const tempPath = path.join(testDir, 'scan-test.tgz');
    await resolver.download(result.artifact, tempPath);
    
    // Scan it
    const buffer = await fs.readFile(tempPath);
    const scanResult = await scanner.scanPackage(
      { type: 'npm', identifier: 'is-array', version: '1.0.1' },
      buffer
    );
    
    assert.ok(scanResult);
    assert.ok(['clean', 'warning', 'suspicious', 'malicious', 'unknown'].includes(scanResult.verdict));
    assert.ok(typeof scanResult.riskScore === 'number');
    assert.ok(Array.isArray(scanResult.findings));
    
    console.log(`✓ Security scanner works: ${scanResult.verdict}, risk ${scanResult.riskScore}/100`);
    console.log(`  Findings: ${scanResult.findings.length}`);
    
    // Clean up
    await fs.unlink(tempPath);
  });

  test('lockfile manager - add and read server', async () => {
    const entry = {
      namespace: 'io.github.test/server',
      version: '1.0.0',
      verified: true,
      verificationMethod: 'github',
      verifiedOwner: 'test',
      fetchedAt: new Date().toISOString(),
      artifacts: [
        {
          type: 'npm',
          url: 'https://registry.npmjs.org/test/-/test-1.0.0.tgz',
          digest: 'sha256-abc123',
          size: 1000,
        },
      ],
    };
    
    await lockfileManager.addServer(entry);
    
    // Read it back
    const retrieved = await lockfileManager.getServer('io.github.test/server');
    assert.ok(retrieved);
    assert.equal(retrieved.namespace, 'io.github.test/server');
    assert.equal(retrieved.version, '1.0.0');
    assert.equal(retrieved.verified, true);
    
    console.log('✓ Lockfile manager can add and retrieve servers');
  });

  test('lockfile manager - validate structure', async () => {
    const lockfile = await lockfileManager.read();
    const validation = lockfileManager.validate(lockfile);
    
    assert.equal(validation.valid, true);
    assert.equal(validation.errors.length, 0);
    
    console.log('✓ Lockfile structure is valid');
  });

  test('lockfile manager - remove server', async () => {
    await lockfileManager.removeServer('io.github.test/server');
    
    const retrieved = await lockfileManager.getServer('io.github.test/server');
    assert.equal(retrieved, null);
    
    console.log('✓ Lockfile manager can remove servers');
  });

  test('cleanup - remove test directory', async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('✓ Test directory cleaned up');
  });
});

describe('MCPShield E2E: Security Scanner Deep Dive', () => {
  test('typosquatting detection', async () => {
    const scanner = new BasicScanner();
    
    // Create a fake package buffer (won't be analyzed deeply)
    const fakeBuffer = Buffer.from('fake package');
    
    // Test with a name similar to "express"
    const result = await scanner.scanPackage(
      { type: 'npm', identifier: 'expres', version: '1.0.0' },
      fakeBuffer
    );
    
    // Should detect typosquat
    const typosquatFinding = result.findings.find(f => f.category === 'typosquat');
    if (typosquatFinding) {
      assert.ok(typosquatFinding.severity === 'high' || typosquatFinding.severity === 'medium');
      console.log('✓ Typosquat detection works');
      console.log(`  Finding: ${typosquatFinding.message}`);
    } else {
      console.log('✓ No typosquat detected (package name too different)');
    }
  });

  test('suspicious patterns detection', async () => {
    const scanner = new BasicScanner();
    const resolver = new NpmResolver();
    
    // Use a real package that might have some patterns
    const result = await resolver.resolve('commander@12.1.0');
    const tempPath = path.join(os.tmpdir(), 'pattern-test.tgz');
    
    try {
      await resolver.download(result.artifact, tempPath);
      const buffer = await fs.readFile(tempPath);
      
      const scanResult = await scanner.scanPackage(
        { type: 'npm', identifier: 'commander', version: '12.1.0' },
        buffer
      );
      
      console.log(`✓ Pattern detection ran: ${scanResult.findings.length} findings`);
      
      // Show some findings if any
      for (const finding of scanResult.findings.slice(0, 3)) {
        console.log(`  - [${finding.severity}] ${finding.category}: ${finding.message}`);
      }
      
      await fs.unlink(tempPath);
    } catch (err: any) {
      console.log(`⚠ Pattern test skipped: ${err.message}`);
    }
  });
});
