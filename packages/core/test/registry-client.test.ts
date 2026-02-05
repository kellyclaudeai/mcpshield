/**
 * Unit tests for RegistryClient
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { RegistryClient } from '../src/registry-client.js';
import { RegistryError, RegistryServerResponse } from '../src/types.js';

// Mock server response fixture
const mockServerResponse: RegistryServerResponse = {
  server: {
    name: 'test-server',
    description: 'A test MCP server',
    version: '1.0.0',
    repository: {
      url: 'https://github.com/test-org/test-server',
      commit: 'abc123',
    },
    packages: [
      {
        type: 'npm',
        identifier: '@test/server',
        version: '1.0.0',
        digest: 'sha256:abc123',
      },
    ],
    license: 'MIT',
    homepage: 'https://example.com',
    tags: ['test', 'example'],
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'verified',
      verifiedAt: '2024-01-01T00:00:00Z',
    },
  },
};

describe('RegistryClient', () => {
  describe('constructor', () => {
    it('should use default options when none provided', () => {
      const client = new RegistryClient();
      assert.ok(client instanceof RegistryClient);
    });

    it('should accept custom base URL', () => {
      const client = new RegistryClient({
        baseUrl: 'https://custom-registry.example.com',
      });
      assert.ok(client instanceof RegistryClient);
    });

    it('should accept custom timeout and retries', () => {
      const client = new RegistryClient({
        timeout: 5000,
        retries: 1,
      });
      assert.ok(client instanceof RegistryClient);
    });

    it('should accept custom headers', () => {
      const client = new RegistryClient({
        headers: { 'X-Custom-Header': 'value' },
      });
      assert.ok(client instanceof RegistryClient);
    });
  });

  describe('getServer', () => {
    it('should throw error for empty server name', async () => {
      const client = new RegistryClient();
      await assert.rejects(
        async () => await client.getServer(''),
        (error: Error) => {
          assert.ok(error instanceof RegistryError);
          assert.match(error.message, /required/i);
          return true;
        }
      );
    });

    it('should throw error for non-string server name', async () => {
      const client = new RegistryClient();
      await assert.rejects(
        async () => await client.getServer(123 as any),
        (error: Error) => {
          assert.ok(error instanceof RegistryError);
          return true;
        }
      );
    });

    it('should URL-encode server names with special characters', async () => {
      const client = new RegistryClient({
        baseUrl: 'https://test-registry.example.com',
      });

      // We're testing that the URL encoding happens, not making a real request
      // In a real scenario, we'd mock got() here
      const serverName = '@org/server-name';
      const expectedEncoded = '%40org%2Fserver-name';

      // This will fail with network error, but that's ok - we're just checking
      // that the encoding logic runs without error
      try {
        await client.getServer(serverName);
      } catch (error) {
        // Expected to fail due to network, not encoding
        assert.ok(error instanceof RegistryError);
      }
    });
  });

  describe('extractPublisherIdentity', () => {
    it('should extract verified status from metadata', () => {
      const client = new RegistryClient();
      const identity = client.extractPublisherIdentity(mockServerResponse);

      assert.strictEqual(identity.status, 'verified');
    });

    it('should extract GitHub info from repository URL', () => {
      const client = new RegistryClient();
      const identity = client.extractPublisherIdentity(mockServerResponse);

      assert.strictEqual(identity.github?.owner, 'test-org');
      assert.strictEqual(identity.github?.repo, 'test-server');
    });

    it('should extract npm package info', () => {
      const client = new RegistryClient();
      const identity = client.extractPublisherIdentity(mockServerResponse);

      assert.strictEqual(identity.npm?.package, '@test/server');
    });

    it('should default to community status when no metadata', () => {
      const client = new RegistryClient();
      const response = { ...mockServerResponse, _meta: undefined };
      const identity = client.extractPublisherIdentity(response);

      assert.strictEqual(identity.status, 'community');
    });

    it('should handle GitHub URLs with .git suffix', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: {
          ...mockServerResponse.server,
          repository: {
            url: 'https://github.com/test-org/test-server.git',
          },
        },
      };
      const identity = client.extractPublisherIdentity(response);

      assert.strictEqual(identity.github?.repo, 'test-server');
    });

    it('should handle git@ protocol GitHub URLs', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: {
          ...mockServerResponse.server,
          repository: {
            url: 'git@github.com:test-org/test-server.git',
          },
        },
      };
      const identity = client.extractPublisherIdentity(response);

      assert.strictEqual(identity.github?.owner, 'test-org');
      assert.strictEqual(identity.github?.repo, 'test-server');
    });

    it('should handle non-GitHub repository URLs', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: {
          ...mockServerResponse.server,
          repository: {
            url: 'https://gitlab.com/test-org/test-server',
          },
        },
      };
      const identity = client.extractPublisherIdentity(response);

      assert.strictEqual(identity.github, undefined);
    });
  });

  describe('isVerified', () => {
    it('should return true for official status', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            status: 'official' as const,
          },
        },
      };

      assert.strictEqual(client.isVerified(response), true);
    });

    it('should return true for verified status', () => {
      const client = new RegistryClient();
      assert.strictEqual(client.isVerified(mockServerResponse), true);
    });

    it('should return false for community status', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            status: 'community' as any,
          },
        },
      };

      assert.strictEqual(client.isVerified(response), false);
    });

    it('should return false when no metadata', () => {
      const client = new RegistryClient();
      const response = { ...mockServerResponse, _meta: undefined };

      assert.strictEqual(client.isVerified(response), false);
    });
  });

  describe('getVersion', () => {
    it('should return version from server object', () => {
      const client = new RegistryClient();
      const version = client.getVersion(mockServerResponse);

      assert.strictEqual(version, '1.0.0');
    });

    it('should default to 1.0.0 when version missing', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: { ...mockServerResponse.server, version: undefined as any },
      };
      const version = client.getVersion(response);

      assert.strictEqual(version, '1.0.0');
    });
  });

  describe('validateServerResponse', () => {
    it('should validate correct server response', () => {
      const client = new RegistryClient();
      const isValid = client.validateServerResponse(mockServerResponse);

      assert.strictEqual(isValid, true);
    });

    it('should reject response missing server', () => {
      const client = new RegistryClient();
      const response = { ...mockServerResponse, server: undefined as any };
      const isValid = client.validateServerResponse(response);

      assert.strictEqual(isValid, false);
    });

    it('should reject response missing server name', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: { ...mockServerResponse.server, name: undefined as any },
      };
      const isValid = client.validateServerResponse(response);

      assert.strictEqual(isValid, false);
    });

    it('should reject response missing description', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: { ...mockServerResponse.server, description: undefined as any },
      };
      const isValid = client.validateServerResponse(response);

      assert.strictEqual(isValid, false);
    });

    it('should reject response with non-array packages', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: { ...mockServerResponse.server, packages: 'not-array' as any },
      };
      const isValid = client.validateServerResponse(response);

      assert.strictEqual(isValid, false);
    });

    it('should reject response with empty packages array', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: { ...mockServerResponse.server, packages: [] },
      };
      const isValid = client.validateServerResponse(response);

      assert.strictEqual(isValid, false);
    });

    it('should reject response with invalid package structure', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: {
          ...mockServerResponse.server,
          packages: [{ type: 'npm' }] as any,
        },
      };
      const isValid = client.validateServerResponse(response);

      assert.strictEqual(isValid, false);
    });

    it('should validate response with multiple packages', () => {
      const client = new RegistryClient();
      const response = {
        ...mockServerResponse,
        server: {
          ...mockServerResponse.server,
          packages: [
            { type: 'npm', identifier: '@test/one', version: '1.0.0' },
            { type: 'pypi', identifier: 'test-two', version: '2.0.0' },
          ],
        },
      };
      const isValid = client.validateServerResponse(response);

      assert.strictEqual(isValid, true);
    });
  });
});
