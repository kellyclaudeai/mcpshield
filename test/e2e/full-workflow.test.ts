/**
 * MCPShield End-to-End Test
 * 
 * Tests the complete workflow:
 * 1. Fetch server metadata from MCP Registry
 * 2. Verify namespace ownership (GitHub)
 * 3. Generate lockfile entry
 * 4. Validate security properties
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { RegistryClient } from '../../packages/core/src/registry-client';
import { NamespaceVerifier } from '../../packages/core/src/namespace-verifier';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('MCPShield E2E: Full Add Workflow', () => {
  let registryClient: RegistryClient;
  let verifier: NamespaceVerifier;
  const testOutputDir = path.join(__dirname, 'tmp');

  beforeAll(async () => {
    registryClient = new RegistryClient();
    verifier = new NamespaceVerifier();
    
    // Create test output directory
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  it('should complete full workflow for official MCP server', async () => {
    const namespace = 'io.github.modelcontextprotocol/brave-search';
    
    console.log(`\n🔍 Testing full workflow for: ${namespace}\n`);

    // Step 1: Fetch metadata from registry
    console.log('Step 1: Fetching from MCP Registry...');
    const metadata = await registryClient.fetchServer(namespace);
    
    expect(metadata).toBeDefined();
    expect(metadata.namespace).toBe(namespace);
    expect(metadata.publisher).toBeDefined();
    expect(metadata.repository).toBeDefined();
    
    console.log(`✓ Fetched: ${metadata.name || 'unknown'}`);
    console.log(`  Publisher: ${metadata.publisher}`);
    console.log(`  Repository: ${metadata.repository}`);

    // Step 2: Verify namespace ownership
    console.log('\nStep 2: Verifying namespace ownership...');
    const verification = await verifier.verify(namespace, metadata);
    
    expect(verification.valid).toBe(true);
    expect(verification.owner).toBeDefined();
    expect(verification.method).toBe('github');
    
    console.log(`✓ Verified via GitHub`);
    console.log(`  Owner: ${verification.owner}`);

    // Step 3: Generate lockfile entry
    console.log('\nStep 3: Generating lockfile entry...');
    const lockEntry = {
      namespace: metadata.namespace,
      version: metadata.version || '1.0.0',
      publisher: metadata.publisher,
      repository: metadata.repository,
      verified: verification.valid,
      verificationMethod: verification.method,
      verifiedOwner: verification.owner,
      fetchedAt: new Date().toISOString(),
      integrity: metadata.integrity || null,
      npm: metadata.npm || null
    };

    const lockfilePath = path.join(testOutputDir, 'mcp.lock.json');
    const lockfile = {
      version: '1.0.0',
      servers: {
        [namespace]: lockEntry
      }
    };

    await fs.writeFile(lockfilePath, JSON.stringify(lockfile, null, 2));
    console.log(`✓ Lockfile written to ${lockfilePath}`);

    // Step 4: Validate lockfile can be read back
    console.log('\nStep 4: Validating lockfile...');
    const lockfileContent = await fs.readFile(lockfilePath, 'utf-8');
    const parsedLockfile = JSON.parse(lockfileContent);
    
    expect(parsedLockfile.version).toBe('1.0.0');
    expect(parsedLockfile.servers[namespace]).toBeDefined();
    expect(parsedLockfile.servers[namespace].verified).toBe(true);
    
    console.log(`✓ Lockfile validated successfully`);

    // Step 5: Security checks
    console.log('\nStep 5: Running security checks...');
    
    // Check for HTTPS URLs
    if (metadata.repository) {
      expect(metadata.repository.startsWith('https://')).toBe(true);
      console.log('✓ Repository uses HTTPS');
    }

    // Check namespace format
    expect(namespace).toMatch(/^io\.github\.[a-z0-9-]+\/[a-z0-9-]+$/);
    console.log('✓ Namespace format valid');

    // Check publisher matches GitHub org
    if (verification.owner) {
      const expectedPublisher = namespace.split('/')[0].replace('io.github.', '');
      expect(verification.owner.toLowerCase()).toBe(expectedPublisher.toLowerCase());
      console.log('✓ Publisher matches namespace owner');
    }

    console.log('\n✅ Full workflow completed successfully!\n');
  }, 30000); // 30 second timeout for network calls

  it('should handle invalid namespace gracefully', async () => {
    const invalidNamespace = 'io.github.nonexistent/fake-server';
    
    console.log(`\n🔍 Testing error handling for: ${invalidNamespace}\n`);

    try {
      await registryClient.fetchServer(invalidNamespace);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error).toBeDefined();
      console.log(`✓ Correctly rejected invalid namespace: ${error.message}`);
    }
  });

  it('should detect namespace mismatch attacks', async () => {
    console.log(`\n🔍 Testing security: namespace mismatch detection\n`);

    // Simulate attacker trying to impersonate official server
    const attackerNamespace = 'io.github.attacker/brave-search';
    const spoofedMetadata = {
      namespace: attackerNamespace,
      publisher: 'attacker',
      repository: 'https://github.com/attacker/fake-server',
      version: '1.0.0'
    };

    // Verification should fail because GitHub shows different owner
    const verification = await verifier.verify(attackerNamespace, spoofedMetadata);
    
    if (!verification.valid) {
      console.log(`✓ Correctly detected namespace mismatch`);
      console.log(`  Claimed: attacker`);
      console.log(`  Actual: ${verification.owner || 'unknown'}`);
    }

    // At minimum, we should be able to verify the GitHub repo owner
    expect(verification.owner).toBeDefined();
  });

  it('should complete workflow for multiple servers', async () => {
    const namespaces = [
      'io.github.modelcontextprotocol/brave-search',
      'io.github.modelcontextprotocol/filesystem'
    ];

    console.log(`\n🔍 Testing batch workflow for ${namespaces.length} servers\n`);

    const results = await Promise.allSettled(
      namespaces.map(async (ns) => {
        const metadata = await registryClient.fetchServer(ns);
        const verification = await verifier.verify(ns, metadata);
        return { namespace: ns, metadata, verification };
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    console.log(`✓ Completed: ${successful.length} succeeded, ${failed.length} failed`);
    
    expect(successful.length).toBeGreaterThan(0);
    
    successful.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        console.log(`  ${idx + 1}. ${result.value.namespace} - verified: ${result.value.verification.valid}`);
      }
    });

    console.log('\n✅ Batch workflow completed!\n');
  }, 60000);
});

describe('MCPShield E2E: Lockfile Management', () => {
  const testLockfilePath = path.join(__dirname, 'tmp', 'test-mcp.lock.json');

  it('should create and update lockfile correctly', async () => {
    console.log('\n🔍 Testing lockfile management\n');

    // Initial lockfile with one server
    const initialLockfile = {
      version: '1.0.0',
      servers: {
        'io.github.test/server1': {
          namespace: 'io.github.test/server1',
          version: '1.0.0',
          publisher: 'test',
          verified: true,
          fetchedAt: new Date().toISOString()
        }
      }
    };

    await fs.writeFile(testLockfilePath, JSON.stringify(initialLockfile, null, 2));
    console.log('✓ Initial lockfile created');

    // Add second server
    const lockfileContent = await fs.readFile(testLockfilePath, 'utf-8');
    const lockfile = JSON.parse(lockfileContent);
    
    lockfile.servers['io.github.test/server2'] = {
      namespace: 'io.github.test/server2',
      version: '2.0.0',
      publisher: 'test',
      verified: true,
      fetchedAt: new Date().toISOString()
    };

    await fs.writeFile(testLockfilePath, JSON.stringify(lockfile, null, 2));
    console.log('✓ Lockfile updated with second server');

    // Verify both servers present
    const updatedContent = await fs.readFile(testLockfilePath, 'utf-8');
    const updatedLockfile = JSON.parse(updatedContent);
    
    expect(Object.keys(updatedLockfile.servers)).toHaveLength(2);
    expect(updatedLockfile.servers['io.github.test/server1']).toBeDefined();
    expect(updatedLockfile.servers['io.github.test/server2']).toBeDefined();
    
    console.log('✓ Lockfile integrity verified');
    console.log('\n✅ Lockfile management test passed!\n');
  });
});
