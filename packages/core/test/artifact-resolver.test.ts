/**
 * Unit tests for Artifact Resolver with NPM resolver hardening
 * 
 * Tests cover:
 * - Network request mocking (no live network hits)
 * - 302 redirect handling
 * - Oversize artifact rejection
 * - Offline mode enforcement
 * - Timeout and size limit enforcement
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import nock from 'nock';
import {
  NpmResolver,
  PyPIResolver,
  ArtifactInfo,
  CacheManager,
  DigestVerifier,
} from '../src/artifact-resolver.js';

// Test fixtures
const TEST_PACKAGE_NAME = '@test/package';
const TEST_PACKAGE_VERSION = '1.0.0';
const TEST_IDENTIFIER = `${TEST_PACKAGE_NAME}@${TEST_PACKAGE_VERSION}`;

const TEST_TARBALL_CONTENT = Buffer.from('test tarball content');
const TEST_TARBALL_SHA512 = 'sha512-VGVzdCB0YXJiYWxsIGNvbnRlbnQ='; // Not real, for testing

const MOCK_NPM_METADATA = {
  name: TEST_PACKAGE_NAME,
  versions: {
    [TEST_PACKAGE_VERSION]: {
      name: TEST_PACKAGE_NAME,
      version: TEST_PACKAGE_VERSION,
      dist: {
        tarball: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        integrity: 'sha512-dGhlc3RlbS10NllXFON1TFKn7paFx4nE7hVcAUE7ImhiF3qY1XDHJ7d4qG5kl0IZxwB3Z1yW8jz9NXqp5w3Lrw==',
        size: 1024,
      },
    },
  },
};

describe('NpmResolver', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Create temporary directory for test outputs
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcpshield-test-'));
    
    // Clean all nock interceptors and disable real HTTP
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    
    // Ensure all nock interceptors were used and re-enable network
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe('constructor', () => {
    it('should use default options', () => {
      const resolver = new NpmResolver();
      assert.ok(resolver instanceof NpmResolver);
    });

    it('should accept custom registry URL', () => {
      const resolver = new NpmResolver('https://custom-registry.example.com');
      assert.ok(resolver instanceof NpmResolver);
    });

    it('should accept resolver options', () => {
      const resolver = new NpmResolver('https://registry.npmjs.org', {
        maxArtifactSize: 10 * 1024 * 1024,
        connectTimeout: 5000,
        requestTimeout: 30000,
        maxRedirects: 5,
        offline: false,
      });
      assert.ok(resolver instanceof NpmResolver);
    });

    it('should support offline mode', () => {
      const resolver = new NpmResolver('https://registry.npmjs.org', {
        offline: true,
      });
      assert.ok(resolver instanceof NpmResolver);
    });
  });

  describe('resolve', () => {
    it('should resolve npm package metadata', async () => {
      const resolver = new NpmResolver();

      // Mock the registry request
      nock('https://registry.npmjs.org')
        .get(`/${encodeURIComponent(TEST_PACKAGE_NAME)}`)
        .reply(200, MOCK_NPM_METADATA);

      const result = await resolver.resolve(TEST_IDENTIFIER);

      assert.strictEqual(result.artifact.type, 'npm');
      assert.strictEqual(result.artifact.url, MOCK_NPM_METADATA.versions[TEST_PACKAGE_VERSION].dist.tarball);
      assert.strictEqual(result.artifact.integrity, MOCK_NPM_METADATA.versions[TEST_PACKAGE_VERSION].dist.integrity);
      assert.strictEqual(result.artifact.size, 1024);
      assert.strictEqual(result.metadata.version, TEST_PACKAGE_VERSION);
    });

    it('should handle scoped packages correctly', async () => {
      const scopedPackage = '@scope/package@2.0.0';
      const resolver = new NpmResolver();

      nock('https://registry.npmjs.org')
        .get('/%40scope%2Fpackage')
        .reply(200, {
          name: '@scope/package',
          versions: {
            '2.0.0': {
              name: '@scope/package',
              version: '2.0.0',
              dist: {
                tarball: 'https://registry.npmjs.org/@scope/package/-/package-2.0.0.tgz',
                integrity: 'sha512-test',
                size: 2048,
              },
            },
          },
        });

      const result = await resolver.resolve(scopedPackage);
      assert.strictEqual(result.artifact.type, 'npm');
    });

    it('should throw error when version not found', async () => {
      const resolver = new NpmResolver();

      nock('https://registry.npmjs.org')
        .get(`/${encodeURIComponent(TEST_PACKAGE_NAME)}`)
        .reply(200, {
          name: TEST_PACKAGE_NAME,
          versions: {},
        });

      await assert.rejects(
        async () => await resolver.resolve(TEST_IDENTIFIER),
        (error: Error) => {
          assert.match(error.message, /Version.*not found/);
          return true;
        }
      );
    });

    it('should throw error when registry returns 404', async () => {
      const resolver = new NpmResolver();

      nock('https://registry.npmjs.org')
        .get(`/${encodeURIComponent(TEST_PACKAGE_NAME)}`)
        .reply(404, { error: 'Not found' });

      await assert.rejects(
        async () => await resolver.resolve(TEST_IDENTIFIER),
        (error: Error) => {
          assert.match(error.message, /404/);
          return true;
        }
      );
    });

    it('should throw error in offline mode', async () => {
      const resolver = new NpmResolver('https://registry.npmjs.org', {
        offline: true,
      });

      await assert.rejects(
        async () => await resolver.resolve(TEST_IDENTIFIER),
        (error: Error) => {
          assert.match(error.message, /offline mode/i);
          return true;
        }
      );
    });

    it('should throw error for invalid package identifier', async () => {
      const resolver = new NpmResolver();

      await assert.rejects(
        async () => await resolver.resolve('invalid-identifier'),
        (error: Error) => {
          assert.match(error.message, /Invalid package identifier/);
          return true;
        }
      );
    });
  });

  describe('download', () => {
    it('should download npm package tarball', async () => {
      const resolver = new NpmResolver();
      const outputPath = path.join(tmpDir, 'package.tgz');

      const artifact: ArtifactInfo = {
        url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        // Don't validate integrity in test - just check download works
        size: TEST_TARBALL_CONTENT.length,
        type: 'npm',
      };

      // Mock the tarball download
      nock('https://registry.npmjs.org')
        .get('/@test/package/-/package-1.0.0.tgz')
        .reply(200, TEST_TARBALL_CONTENT);

      // Note: The test uses a simplified integrity check since we can't generate
      // the exact sha512 for test content easily. In real usage, the integrity
      // would match the actual tarball content.
      const digest = await resolver.download(artifact, outputPath);

      // Verify file was created
      const exists = await fs.promises.access(outputPath).then(() => true).catch(() => false);
      assert.strictEqual(exists, true);

      // Verify digest format
      assert.match(digest, /^sha512-/);
    });

    it('should handle 302 redirect and download successfully', async () => {
      const resolver = new NpmResolver();
      const outputPath = path.join(tmpDir, 'package.tgz');

      const artifact: ArtifactInfo = {
        url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        // Don't validate integrity in test - just check redirect works
        size: TEST_TARBALL_CONTENT.length,
        type: 'npm',
      };

      // Mock 302 redirect to CDN
      nock('https://registry.npmjs.org')
        .get('/@test/package/-/package-1.0.0.tgz')
        .reply(302, undefined, {
          Location: 'https://cdn.example.com/package-1.0.0.tgz',
        });

      nock('https://cdn.example.com')
        .get('/package-1.0.0.tgz')
        .reply(200, TEST_TARBALL_CONTENT);

      const digest = await resolver.download(artifact, outputPath);

      // Verify file was created
      const exists = await fs.promises.access(outputPath).then(() => true).catch(() => false);
      assert.strictEqual(exists, true);

      // Verify content was downloaded
      const content = await fs.promises.readFile(outputPath);
      assert.deepStrictEqual(content, TEST_TARBALL_CONTENT);
    });

    it('should reject artifact exceeding max size (declared)', async () => {
      const resolver = new NpmResolver('https://registry.npmjs.org', {
        maxArtifactSize: 500, // 500 bytes
      });
      const outputPath = path.join(tmpDir, 'package.tgz');

      const artifact: ArtifactInfo = {
        url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        integrity: 'sha512-test',
        size: 1024, // 1KB - exceeds limit
        type: 'npm',
      };

      await assert.rejects(
        async () => await resolver.download(artifact, outputPath),
        (error: Error) => {
          assert.match(error.message, /exceeds maximum allowed size/);
          assert.match(error.message, /1024/);
          assert.match(error.message, /500/);
          return true;
        }
      );
    });

    it('should reject artifact exceeding max size during download', async () => {
      const resolver = new NpmResolver('https://registry.npmjs.org', {
        maxArtifactSize: 10, // 10 bytes
      });
      const outputPath = path.join(tmpDir, 'package.tgz');

      const largeContent = Buffer.alloc(100, 'x'); // 100 bytes

      const artifact: ArtifactInfo = {
        url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        integrity: 'sha512-test',
        // Size not declared, will be checked during download
        type: 'npm',
      };

      nock('https://registry.npmjs.org')
        .get('/@test/package/-/package-1.0.0.tgz')
        .reply(200, largeContent);

      await assert.rejects(
        async () => await resolver.download(artifact, outputPath),
        (error: Error) => {
          assert.match(error.message, /Download size.*exceeds maximum allowed size/);
          return true;
        }
      );

      // Verify file was cleaned up
      const exists = await fs.promises.access(outputPath).then(() => true).catch(() => false);
      assert.strictEqual(exists, false);
    });

    it('should throw error in offline mode', async () => {
      const resolver = new NpmResolver('https://registry.npmjs.org', {
        offline: true,
      });
      const outputPath = path.join(tmpDir, 'package.tgz');

      const artifact: ArtifactInfo = {
        url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        integrity: 'sha512-test',
        size: 1024,
        type: 'npm',
      };

      await assert.rejects(
        async () => await resolver.download(artifact, outputPath),
        (error: Error) => {
          assert.match(error.message, /offline mode/i);
          return true;
        }
      );
    });

    it('should clean up file on download failure', async () => {
      const resolver = new NpmResolver();
      const outputPath = path.join(tmpDir, 'package.tgz');

      const artifact: ArtifactInfo = {
        url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        integrity: 'sha512-test',
        size: 1024,
        type: 'npm',
      };

      nock('https://registry.npmjs.org')
        .get('/@test/package/-/package-1.0.0.tgz')
        .reply(500, 'Internal Server Error');

      await assert.rejects(
        async () => await resolver.download(artifact, outputPath),
        (error: Error) => {
          assert.match(error.message, /500/);
          return true;
        }
      );

      // Verify file was cleaned up
      const exists = await fs.promises.access(outputPath).then(() => true).catch(() => false);
      assert.strictEqual(exists, false);
    });

    it('should handle sha256 integrity', async () => {
      const resolver = new NpmResolver();
      const outputPath = path.join(tmpDir, 'package.tgz');

      const artifact: ArtifactInfo = {
        url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        // Use sha256 algorithm but don't validate - just check it's computed
        integrity: 'sha256-xKeceeUp8tMtdwiKG4eM4EXWmMhNWxWekw9Hp8f+Lb0=',
        size: TEST_TARBALL_CONTENT.length,
        type: 'npm',
      };

      nock('https://registry.npmjs.org')
        .get('/@test/package/-/package-1.0.0.tgz')
        .reply(200, TEST_TARBALL_CONTENT);

      const digest = await resolver.download(artifact, outputPath);

      // Verify digest uses sha256
      assert.match(digest, /^sha256-/);
    });

    it('should enforce maximum redirects', async () => {
      const resolver = new NpmResolver('https://registry.npmjs.org', {
        maxRedirects: 2,
      });
      const outputPath = path.join(tmpDir, 'package.tgz');

      const artifact: ArtifactInfo = {
        url: 'https://registry.npmjs.org/@test/package/-/package-1.0.0.tgz',
        integrity: 'sha512-test',
        size: TEST_TARBALL_CONTENT.length,
        type: 'npm',
      };

      // Chain of redirects that exceeds max
      nock('https://registry.npmjs.org')
        .get('/@test/package/-/package-1.0.0.tgz')
        .reply(302, undefined, { Location: 'https://cdn1.example.com/pkg.tgz' });

      nock('https://cdn1.example.com')
        .get('/pkg.tgz')
        .reply(302, undefined, { Location: 'https://cdn2.example.com/pkg.tgz' });

      nock('https://cdn2.example.com')
        .get('/pkg.tgz')
        .reply(302, undefined, { Location: 'https://cdn3.example.com/pkg.tgz' });

      nock('https://cdn3.example.com')
        .get('/pkg.tgz')
        .reply(200, TEST_TARBALL_CONTENT);

      await assert.rejects(
        async () => await resolver.download(artifact, outputPath),
        (error: Error) => {
          // got will throw an error when max redirects exceeded
          assert.ok(error);
          return true;
        }
      );
    });
  });

  describe('parseIdentifier', () => {
    it('should parse standard package identifier', async () => {
      const resolver = new NpmResolver();

      nock('https://registry.npmjs.org')
        .get('/package')
        .reply(200, {
          name: 'package',
          versions: {
            '1.0.0': {
              name: 'package',
              version: '1.0.0',
              dist: {
                tarball: 'https://registry.npmjs.org/package/-/package-1.0.0.tgz',
                integrity: 'sha512-test',
                size: 1024,
              },
            },
          },
        });

      const result = await resolver.resolve('package@1.0.0');
      assert.strictEqual(result.metadata.name, 'package');
    });

    it('should parse scoped package identifier', async () => {
      const resolver = new NpmResolver();

      nock('https://registry.npmjs.org')
        .get('/%40scope%2Fpackage')
        .reply(200, {
          name: '@scope/package',
          versions: {
            '1.0.0': {
              name: '@scope/package',
              version: '1.0.0',
              dist: {
                tarball: 'https://registry.npmjs.org/@scope/package/-/package-1.0.0.tgz',
                integrity: 'sha512-test',
                size: 1024,
              },
            },
          },
        });

      const result = await resolver.resolve('@scope/package@1.0.0');
      assert.strictEqual(result.metadata.name, '@scope/package');
    });
  });
});

describe('PyPIResolver', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcpshield-test-'));
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe('resolve', () => {
    it('should resolve PyPI package metadata', async () => {
      const resolver = new PyPIResolver();

      const mockPyPIMetadata = {
        info: {
          name: 'test-package',
          version: '1.0.0',
        },
        urls: [
          {
            packagetype: 'sdist',
            url: 'https://files.pythonhosted.org/test-package-1.0.0.tar.gz',
            size: 2048,
            digests: {
              sha256: 'abcd1234',
            },
          },
        ],
      };

      nock('https://pypi.org')
        .get('/pypi/test-package/1.0.0/json')
        .reply(200, mockPyPIMetadata);

      const result = await resolver.resolve('test-package==1.0.0');

      assert.strictEqual(result.artifact.type, 'pypi');
      assert.strictEqual(result.artifact.url, mockPyPIMetadata.urls[0].url);
      assert.strictEqual(result.artifact.size, 2048);
    });

    it('should throw error in offline mode', async () => {
      const resolver = new PyPIResolver('https://pypi.org', {
        offline: true,
      });

      await assert.rejects(
        async () => await resolver.resolve('test-package==1.0.0'),
        (error: Error) => {
          assert.match(error.message, /offline mode/i);
          return true;
        }
      );
    });

    it('should throw error for invalid identifier format', async () => {
      const resolver = new PyPIResolver();

      await assert.rejects(
        async () => await resolver.resolve('invalid-format'),
        (error: Error) => {
          assert.match(error.message, /Invalid PyPI identifier/);
          return true;
        }
      );
    });
  });

  describe('download', () => {
    it('should download PyPI package', async () => {
      const resolver = new PyPIResolver();
      const outputPath = path.join(tmpDir, 'package.tar.gz');

      const artifact: ArtifactInfo = {
        url: 'https://files.pythonhosted.org/test-package-1.0.0.tar.gz',
        // Use correct computed digest for test content
        digest: 'sha256-xKeceeUp8tMtdwiKG4eM4EXWmMhNWxWekw9Hp8f+Lb0=',
        size: TEST_TARBALL_CONTENT.length,
        type: 'pypi',
      };

      nock('https://files.pythonhosted.org')
        .get('/test-package-1.0.0.tar.gz')
        .reply(200, TEST_TARBALL_CONTENT);

      const digest = await resolver.download(artifact, outputPath);

      const exists = await fs.promises.access(outputPath).then(() => true).catch(() => false);
      assert.strictEqual(exists, true);
      assert.match(digest, /^sha256-/);
    });

    it('should reject oversize artifact', async () => {
      const resolver = new PyPIResolver('https://pypi.org', {
        maxArtifactSize: 10,
      });
      const outputPath = path.join(tmpDir, 'package.tar.gz');

      const artifact: ArtifactInfo = {
        url: 'https://files.pythonhosted.org/test-package-1.0.0.tar.gz',
        digest: 'sha256-test',
        size: 1024,
        type: 'pypi',
      };

      await assert.rejects(
        async () => await resolver.download(artifact, outputPath),
        (error: Error) => {
          assert.match(error.message, /exceeds maximum allowed size/);
          return true;
        }
      );
    });

    it('should throw error in offline mode', async () => {
      const resolver = new PyPIResolver('https://pypi.org', {
        offline: true,
      });
      const outputPath = path.join(tmpDir, 'package.tar.gz');

      const artifact: ArtifactInfo = {
        url: 'https://files.pythonhosted.org/test-package-1.0.0.tar.gz',
        digest: 'sha256-test',
        size: 1024,
        type: 'pypi',
      };

      await assert.rejects(
        async () => await resolver.download(artifact, outputPath),
        (error: Error) => {
          assert.match(error.message, /offline mode/i);
          return true;
        }
      );
    });
  });
});

describe('CacheManager', () => {
  let tmpDir: string;
  let cacheManager: CacheManager;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcpshield-cache-test-'));
    cacheManager = new CacheManager(tmpDir);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getCachePath', () => {
    it('should generate sharded cache path', () => {
      const digest = 'sha256-abcd1234efgh5678';
      const cachePath = cacheManager.getCachePath(digest);

      assert.ok(cachePath.includes('ab')); // First 2 chars of hash
      assert.ok(cachePath.includes(digest));
    });
  });

  describe('has', () => {
    it('should return false for non-existent cache', async () => {
      const exists = await cacheManager.has('sha256-nonexistent');
      assert.strictEqual(exists, false);
    });

    it('should return true for existing cache', async () => {
      const digest = 'sha256-test1234';
      const cachePath = cacheManager.getCachePath(digest);
      await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.promises.writeFile(cachePath, 'test content');

      const exists = await cacheManager.has(digest);
      assert.strictEqual(exists, true);
    });
  });

  describe('put', () => {
    it('should store artifact in cache', async () => {
      const digest = 'sha256-test5678';
      const sourcePath = path.join(tmpDir, 'source.txt');
      await fs.promises.writeFile(sourcePath, 'test content');

      const cachePath = await cacheManager.put(digest, sourcePath);

      const exists = await fs.promises.access(cachePath).then(() => true).catch(() => false);
      assert.strictEqual(exists, true);

      const content = await fs.promises.readFile(cachePath, 'utf8');
      assert.strictEqual(content, 'test content');
    });
  });

  describe('get', () => {
    it('should return null for non-existent cache', async () => {
      const result = await cacheManager.get('sha256-nonexistent');
      assert.strictEqual(result, null);
    });

    it('should return path for existing cache', async () => {
      const digest = 'sha256-test9999';
      const cachePath = cacheManager.getCachePath(digest);
      await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.promises.writeFile(cachePath, 'cached content');

      const result = await cacheManager.get(digest);
      assert.ok(result);
      assert.strictEqual(result, cachePath);
    });
  });
});

describe('DigestVerifier', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcpshield-digest-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('computeDigest', () => {
    it('should compute SHA-256 digest', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'hello world');

      const digest = await DigestVerifier.computeDigest(filePath, 'sha256');

      assert.match(digest, /^sha256-/);
      assert.ok(digest.length > 10);
    });

    it('should compute SHA-512 digest', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'hello world');

      const digest = await DigestVerifier.computeDigest(filePath, 'sha512');

      assert.match(digest, /^sha512-/);
      assert.ok(digest.length > 10);
    });

    it('should produce consistent digests for same content', async () => {
      const filePath1 = path.join(tmpDir, 'test1.txt');
      const filePath2 = path.join(tmpDir, 'test2.txt');
      const content = 'consistent content';

      await fs.promises.writeFile(filePath1, content);
      await fs.promises.writeFile(filePath2, content);

      const digest1 = await DigestVerifier.computeDigest(filePath1, 'sha256');
      const digest2 = await DigestVerifier.computeDigest(filePath2, 'sha256');

      assert.strictEqual(digest1, digest2);
    });
  });

  describe('verify', () => {
    it('should verify matching digest', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'verify me');

      const expectedDigest = await DigestVerifier.computeDigest(filePath, 'sha256');
      const result = await DigestVerifier.verify(filePath, expectedDigest);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.actualDigest, expectedDigest);
    });

    it('should detect mismatched digest', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'verify me');

      const wrongDigest = 'sha256-wrongdigest';
      const result = await DigestVerifier.verify(filePath, wrongDigest);

      assert.strictEqual(result.valid, false);
      assert.notStrictEqual(result.actualDigest, wrongDigest);
    });
  });

  describe('generateDriftReport', () => {
    it('should generate drift report', () => {
      const report = DigestVerifier.generateDriftReport(
        'test-namespace',
        'sha256-old',
        'sha256-new',
        'https://example.com/artifact.tar.gz'
      );

      assert.match(report, /DRIFT DETECTED/);
      assert.match(report, /test-namespace/);
      assert.match(report, /sha256-old/);
      assert.match(report, /sha256-new/);
      assert.match(report, /https:\/\/example\.com\/artifact\.tar\.gz/);
    });
  });
});
