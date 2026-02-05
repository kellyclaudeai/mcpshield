/**
 * Unit tests for LockfileManager
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { LockfileManager, LockfileData, LockfileEntry } from '../src/lockfile.js';

describe('LockfileManager', () => {
  let tempDir: string;
  let lockfileManager: LockfileManager;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-test-'));
    lockfileManager = new LockfileManager(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('read/write', () => {
    it('should create empty lockfile when none exists', async () => {
      const lockfile = await lockfileManager.read();
      
      assert.strictEqual(lockfile.version, '1.0.0');
      assert.ok(lockfile.generatedAt);
      assert.deepStrictEqual(lockfile.servers, {});
    });

    it('should write and read lockfile', async () => {
      const testLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/server': {
            namespace: 'io.github.test/server',
            version: '1.2.3',
            verified: true,
            verificationMethod: 'github',
            verifiedOwner: 'test',
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      await lockfileManager.write(testLockfile);
      const readLockfile = await lockfileManager.read();

      assert.strictEqual(readLockfile.version, testLockfile.version);
      assert.strictEqual(
        readLockfile.servers['io.github.test/server'].version,
        '1.2.3'
      );
    });

    it('should use atomic writes (no corruption on interruption)', async () => {
      // Write initial lockfile
      const initialLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/server1': {
            namespace: 'io.github.test/server1',
            version: '1.0.0',
            verified: true,
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      await lockfileManager.write(initialLockfile);

      // Simulate write interruption by creating a temp file that won't be renamed
      const lockfilePath = lockfileManager.getPath();
      const tempPath = path.join(tempDir, `.mcp.lock.json.tmp.${process.pid + 1}`);
      
      const corruptedData: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {} // Empty - simulates partial write
      };
      
      await fs.writeFile(tempPath, JSON.stringify(corruptedData, null, 2), 'utf-8');

      // Read should still return the original (uncorrupted) lockfile
      const readLockfile = await lockfileManager.read();
      
      assert.strictEqual(
        Object.keys(readLockfile.servers).length,
        1,
        'Original lockfile should be intact after simulated interruption'
      );
      assert.ok(readLockfile.servers['io.github.test/server1']);

      // Clean up temp file
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore
      }
    });

    it('should handle write failure gracefully', async () => {
      // Create a lockfile manager pointing to a non-existent directory
      const invalidManager = new LockfileManager('/nonexistent/path/that/does/not/exist');
      
      const testLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {}
      };

      await assert.rejects(
        async () => await invalidManager.write(testLockfile),
        /ENOENT/,
        'Should throw error when writing to invalid path'
      );
    });
  });

  describe('validation', () => {
    it('should validate correct lockfile', async () => {
      const validLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/server': {
            namespace: 'io.github.test/server',
            version: '1.2.3',
            verified: true,
            verificationMethod: 'github',
            verifiedOwner: 'test',
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      const result = lockfileManager.validate(validLockfile);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should detect missing required fields', async () => {
      const invalidLockfile: any = {
        // Missing version
        generatedAt: new Date().toISOString(),
        servers: {}
      };

      const result = lockfileManager.validate(invalidLockfile);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('should detect invalid server entries', async () => {
      const invalidLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/server': {
            namespace: 'io.github.test/server',
            // Missing version
            version: undefined as any,
            verified: true,
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      const result = lockfileManager.validate(invalidLockfile);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('should validate artifact digests format', async () => {
      const lockfileWithArtifacts: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/server': {
            namespace: 'io.github.test/server',
            version: '1.0.0',
            verified: true,
            fetchedAt: new Date().toISOString(),
            artifacts: [
              {
                type: 'npm',
                url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
                digest: `sha256-${Buffer.alloc(32, 1).toString('base64')}`,
                size: 12345
              }
            ]
          }
        }
      };

      const result = lockfileManager.validate(lockfileWithArtifacts);
      assert.strictEqual(result.valid, true);
    });
  });

  describe('server operations', () => {
    it('should add server entry', async () => {
      const entry: LockfileEntry = {
        namespace: 'io.github.test/new-server',
        version: '2.0.0',
        verified: false,
        verificationMethod: 'github',
        verifiedOwner: null,
        fetchedAt: new Date().toISOString(),
        artifacts: []
      };

      await lockfileManager.addServer(entry);
      const lockfile = await lockfileManager.read();

      assert.ok(lockfile.servers['io.github.test/new-server']);
      assert.strictEqual(
        lockfile.servers['io.github.test/new-server'].version,
        '2.0.0'
      );
    });

    it('should update existing server entry', async () => {
      // Add initial entry
      const entry1: LockfileEntry = {
        namespace: 'io.github.test/server',
        version: '1.0.0',
        verified: false,
        fetchedAt: new Date().toISOString(),
        artifacts: []
      };
      await lockfileManager.addServer(entry1);

      // Update with new version
      const entry2: LockfileEntry = {
        namespace: 'io.github.test/server',
        version: '2.0.0',
        verified: true,
        verificationMethod: 'github',
        verifiedOwner: 'test',
        fetchedAt: new Date().toISOString(),
        artifacts: []
      };
      await lockfileManager.addServer(entry2);

      const lockfile = await lockfileManager.read();
      assert.strictEqual(
        lockfile.servers['io.github.test/server'].version,
        '2.0.0'
      );
      assert.strictEqual(
        lockfile.servers['io.github.test/server'].verified,
        true
      );
    });

    it('should remove server entry', async () => {
      const entry: LockfileEntry = {
        namespace: 'io.github.test/server',
        version: '1.0.0',
        verified: false,
        fetchedAt: new Date().toISOString(),
        artifacts: []
      };
      await lockfileManager.addServer(entry);

      await lockfileManager.removeServer('io.github.test/server');
      
      const lockfile = await lockfileManager.read();
      assert.strictEqual(
        lockfile.servers['io.github.test/server'],
        undefined
      );
    });

    it('should get specific server entry', async () => {
      const entry: LockfileEntry = {
        namespace: 'io.github.test/server',
        version: '1.0.0',
        verified: true,
        fetchedAt: new Date().toISOString(),
        artifacts: []
      };
      await lockfileManager.addServer(entry);

      const retrieved = await lockfileManager.getServer('io.github.test/server');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.version, '1.0.0');

      const nonexistent = await lockfileManager.getServer('io.github.test/nonexistent');
      assert.strictEqual(nonexistent, null);
    });
  });

  describe('normalization', () => {
    it('should sort servers alphabetically', async () => {
      const lockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/zebra': {
            namespace: 'io.github.test/zebra',
            version: '1.0.0',
            verified: false,
            fetchedAt: new Date().toISOString(),
            artifacts: []
          },
          'io.github.test/alpha': {
            namespace: 'io.github.test/alpha',
            version: '1.0.0',
            verified: false,
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      await lockfileManager.write(lockfile);
      const content = await fs.readFile(lockfileManager.getPath(), 'utf-8');
      const parsed = JSON.parse(content);

      const keys = Object.keys(parsed.servers);
      assert.deepStrictEqual(keys, [
        'io.github.test/alpha',
        'io.github.test/zebra'
      ]);
    });
  });

  describe('diff', () => {
    it('should detect added servers', () => {
      const oldLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {}
      };

      const newLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/new': {
            namespace: 'io.github.test/new',
            version: '1.0.0',
            verified: false,
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      const diff = LockfileManager.diff(oldLockfile, newLockfile);
      assert.deepStrictEqual(diff.added, ['io.github.test/new']);
      assert.deepStrictEqual(diff.removed, []);
      assert.deepStrictEqual(diff.changed, []);
    });

    it('should detect removed servers', () => {
      const oldLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/old': {
            namespace: 'io.github.test/old',
            version: '1.0.0',
            verified: false,
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      const newLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {}
      };

      const diff = LockfileManager.diff(oldLockfile, newLockfile);
      assert.deepStrictEqual(diff.added, []);
      assert.deepStrictEqual(diff.removed, ['io.github.test/old']);
      assert.deepStrictEqual(diff.changed, []);
    });

    it('should detect version changes', () => {
      const oldLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/server': {
            namespace: 'io.github.test/server',
            version: '1.0.0',
            verified: false,
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      const newLockfile: LockfileData = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servers: {
          'io.github.test/server': {
            namespace: 'io.github.test/server',
            version: '2.0.0',
            verified: false,
            fetchedAt: new Date().toISOString(),
            artifacts: []
          }
        }
      };

      const diff = LockfileManager.diff(oldLockfile, newLockfile);
      assert.deepStrictEqual(diff.added, []);
      assert.deepStrictEqual(diff.removed, []);
      assert.strictEqual(diff.changed.length, 1);
      assert.strictEqual(diff.changed[0].namespace, 'io.github.test/server');
      assert.strictEqual(diff.changed[0].oldVersion, '1.0.0');
      assert.strictEqual(diff.changed[0].newVersion, '2.0.0');
    });
  });
});
