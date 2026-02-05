/**
 * Tests for namespace verifier
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidNamespaceFormat,
  extractPublisherIdentity,
  verifyNamespace,
  validateNamespaceOwnership,
  isGitHubNamespace,
  isCustomDomainNamespace,
  extractDomain,
  extractGitHubOwner,
} from '../src/namespace-verifier.js';
import type { RegistryServerResponse } from '../src/types.js';

describe('Namespace Verifier', () => {
  describe('isValidNamespaceFormat', () => {
    it('should accept valid reverse-DNS formats', () => {
      assert.equal(isValidNamespaceFormat('io.github.user/server'), true);
      assert.equal(isValidNamespaceFormat('com.example/server'), true);
      assert.equal(isValidNamespaceFormat('org.company.team/server'), true);
      assert.equal(isValidNamespaceFormat('ai.anthropic.mcp/claude-server'), true);
    });

    it('should reject invalid formats', () => {
      assert.equal(isValidNamespaceFormat('simple-name'), false);
      assert.equal(isValidNamespaceFormat('server/name'), false);
      assert.equal(isValidNamespaceFormat('io.github./incomplete'), false);
      assert.equal(isValidNamespaceFormat(''), false);
      assert.equal(isValidNamespaceFormat('no-namespace'), false);
    });

    it('should handle edge cases', () => {
      // @ts-expect-error Testing invalid input
      assert.equal(isValidNamespaceFormat(null), false);
      // @ts-expect-error Testing invalid input
      assert.equal(isValidNamespaceFormat(undefined), false);
      // @ts-expect-error Testing invalid input
      assert.equal(isValidNamespaceFormat(123), false);
    });
  });

  describe('extractPublisherIdentity', () => {
    it('should extract GitHub identity from repository', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.testuser/test-server',
          description: 'Test server',
          version: '1.0.0',
          repository: {
            url: 'https://github.com/testuser/test-repo',
          },
          packages: [],
        },
      };

      const identity = extractPublisherIdentity(response);
      assert.deepEqual(identity, {
        status: 'community',
        github: {
          owner: 'testuser',
          repo: 'test-repo',
        },
      });
    });

    it('should extract npm package identity', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'com.example/server',
          description: 'Test',
          version: '1.0.0',
          packages: [
            {
              type: 'npm',
              identifier: '@example/mcp-server',
              version: '1.0.0',
            },
          ],
        },
      };

      const identity = extractPublisherIdentity(response);
      assert.deepEqual(identity, {
        status: 'community',
        npm: {
          package: '@example/mcp-server',
        },
      });
    });

    it('should extract official/verified status', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.modelcontextprotocol/server',
          description: 'Official server',
          version: '1.0.0',
          packages: [],
        },
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            status: 'official',
            verifiedAt: '2025-09-01T10:00:00Z',
          },
        },
      };

      const identity = extractPublisherIdentity(response);
      assert.equal(identity?.status, 'official');
    });

    it('should handle git:// repository URLs', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.testuser/test',
          description: 'Test',
          version: '1.0.0',
          repository: {
            url: 'git://github.com/testuser/test-repo.git',
          },
          packages: [],
        },
      };

      const identity = extractPublisherIdentity(response);
      assert.equal(identity?.github?.owner, 'testuser');
      assert.equal(identity?.github?.repo, 'test-repo');
    });
  });

  describe('verifyNamespace', () => {
    it('should verify official servers', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.modelcontextprotocol/official-server',
          description: 'Official',
          version: '1.0.0',
          repository: {
            url: 'https://github.com/modelcontextprotocol/official-server',
          },
          packages: [],
        },
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            status: 'official',
            verifiedAt: '2025-09-01T10:00:00Z',
          },
        },
      };

      const result = verifyNamespace('io.github.modelcontextprotocol/official-server', response);
      assert.equal(result.verified, true);
      assert.equal(result.method, 'registry-official');
      assert.equal(result.status, 'official');
    });

    it('should verify GitHub namespace with matching repository', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.testuser/test-server',
          description: 'Test',
          version: '1.0.0',
          repository: {
            url: 'https://github.com/testuser/test-repo',
          },
          packages: [],
        },
      };

      const result = verifyNamespace('io.github.testuser/test-server', response);
      assert.equal(result.verified, true);
      assert.equal(result.method, 'github');
      assert.equal(result.details?.githubOwner, 'testuser');
    });

    it('should reject GitHub namespace with mismatched repository', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.attacker/stolen-server',
          description: 'Test',
          version: '1.0.0',
          repository: {
            url: 'https://github.com/realowner/test-repo',
          },
          packages: [],
        },
      };

      const result = verifyNamespace('io.github.attacker/stolen-server', response);
      assert.equal(result.verified, false);
      assert.ok(result.details?.reason?.includes('namespace mismatch'));
    });

    it('should reject invalid namespace format', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'invalid-name',
          description: 'Test',
          version: '1.0.0',
          packages: [],
        },
      };

      const result = verifyNamespace('invalid-name', response);
      assert.equal(result.verified, false);
      assert.ok(result.details?.reason?.includes('Invalid namespace format'));
    });

    it('should mark custom domains as unverified (pending implementation)', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'com.example/server',
          description: 'Test',
          version: '1.0.0',
          packages: [],
        },
      };

      const result = verifyNamespace('com.example/server', response);
      assert.equal(result.verified, false);
      assert.ok(result.details?.reason?.includes('Custom domain verification'));
      assert.equal(result.details?.domain, 'example.com');
    });

    it('should handle case-insensitive GitHub username matching', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.TestUser/server',
          description: 'Test',
          version: '1.0.0',
          repository: {
            url: 'https://github.com/testuser/repo',
          },
          packages: [],
        },
      };

      const result = verifyNamespace('io.github.TestUser/server', response);
      assert.equal(result.verified, true);
    });
  });

  describe('validateNamespaceOwnership', () => {
    it('should not throw for verified namespaces', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.testuser/server',
          description: 'Test',
          version: '1.0.0',
          repository: {
            url: 'https://github.com/testuser/repo',
          },
          packages: [],
        },
      };

      assert.doesNotThrow(() => {
        validateNamespaceOwnership('io.github.testuser/server', response);
      });
    });

    it('should throw ValidationError for unverified namespaces', () => {
      const response: RegistryServerResponse = {
        server: {
          name: 'io.github.attacker/server',
          description: 'Test',
          version: '1.0.0',
          repository: {
            url: 'https://github.com/victim/repo',
          },
          packages: [],
        },
      };

      assert.throws(() => {
        validateNamespaceOwnership('io.github.attacker/server', response);
      }, {
        name: 'ValidationError',
      });
    });
  });

  describe('isGitHubNamespace', () => {
    it('should identify GitHub namespaces', () => {
      assert.equal(isGitHubNamespace('io.github.user/server'), true);
      assert.equal(isGitHubNamespace('io.github.org/app'), true);
      assert.equal(isGitHubNamespace('com.example/server'), false);
      assert.equal(isGitHubNamespace('invalid'), false);
    });
  });

  describe('isCustomDomainNamespace', () => {
    it('should identify custom domain namespaces', () => {
      assert.equal(isCustomDomainNamespace('com.example/server'), true);
      assert.equal(isCustomDomainNamespace('org.company/app'), true);
      assert.equal(isCustomDomainNamespace('io.github.user/server'), false);
      assert.equal(isCustomDomainNamespace('invalid'), false);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from custom domain namespaces', () => {
      assert.equal(extractDomain('com.example/server'), 'example.com');
      assert.equal(extractDomain('org.company/app'), 'company.org');
      assert.equal(extractDomain('ai.anthropic.mcp/claude'), 'anthropic.ai');
    });

    it('should return null for GitHub namespaces', () => {
      assert.equal(extractDomain('io.github.user/server'), null);
    });

    it('should return null for invalid namespaces', () => {
      assert.equal(extractDomain('invalid'), null);
    });
  });

  describe('extractGitHubOwner', () => {
    it('should extract GitHub owner from GitHub namespaces', () => {
      assert.equal(extractGitHubOwner('io.github.testuser/server'), 'testuser');
      assert.equal(extractGitHubOwner('io.github.my-org/app'), 'my-org');
    });

    it('should return null for non-GitHub namespaces', () => {
      assert.equal(extractGitHubOwner('com.example/server'), null);
      assert.equal(extractGitHubOwner('invalid'), null);
    });
  });
});
