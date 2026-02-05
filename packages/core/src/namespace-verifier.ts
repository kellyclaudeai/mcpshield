/**
 * Namespace Verifier - Validates MCP server namespace ownership
 * 
 * Ensures server names follow reverse-DNS format and verifies
 * that publishers own the namespaces they claim.
 */

import { PublisherIdentity, RegistryServerResponse, ValidationError } from './types.js';

/**
 * Verification method used to prove namespace ownership
 */
export type VerificationMethod = 'github' | 'dns' | 'http' | 'registry-official';

/**
 * Result of namespace verification
 */
export interface VerificationResult {
  /** Whether the namespace is verified */
  verified: boolean;
  
  /** Verification method used */
  method?: VerificationMethod;
  
  /** Verification status from registry */
  status?: 'official' | 'verified' | 'community';
  
  /** Additional verification details */
  details?: {
    /** GitHub owner/org extracted from namespace */
    githubOwner?: string;
    
    /** GitHub repo name */
    githubRepo?: string;
    
    /** Domain extracted from namespace */
    domain?: string;
    
    /** Verification timestamp */
    verifiedAt?: string;
    
    /** Reason for failure if not verified */
    reason?: string;
  };
}

/**
 * Namespace validation rules
 */
const NAMESPACE_PATTERN = /^[a-zA-Z0-9]+(\.[a-zA-Z0-9-]+)+\/[a-zA-Z0-9._-]+$/;
const GITHUB_NAMESPACE_PATTERN = /^io\.github\.([a-zA-Z0-9-]+)\/(.+)$/;
const DOMAIN_NAMESPACE_PATTERN = /^([a-z]+)\.([a-z0-9-]+)\/(.+)$/i;

/**
 * Validates that a server name follows reverse-DNS format
 * 
 * Valid formats:
 * - io.github.username/server-name
 * - com.example/server-name
 * - org.company.team/server-name
 * 
 * Invalid:
 * - simple-name (no namespace)
 * - server/name (not reverse-DNS)
 * - io.github./incomplete
 * 
 * @param name Server name to validate
 * @returns true if valid format
 */
export function isValidNamespaceFormat(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  return NAMESPACE_PATTERN.test(name);
}

/**
 * Extracts publisher identity from server metadata
 * 
 * Looks at:
 * 1. Registry _meta field (official/verified status)
 * 2. Server repository (GitHub URL)
 * 3. Server name (namespace pattern)
 * 
 * @param response Registry server response
 * @returns PublisherIdentity or null if cannot determine
 */
export function extractPublisherIdentity(response: RegistryServerResponse): PublisherIdentity | null {
  const { server, _meta } = response;
  
  // Check registry official/verified status
  const registryStatus = _meta?.['io.modelcontextprotocol.registry/official']?.status;
  
  const identity: PublisherIdentity = {
    status: registryStatus || 'community',
  };
  
  // Extract GitHub info from repository
  if (server.repository?.url) {
    const githubMatch = server.repository.url.match(/github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/);
    if (githubMatch) {
      identity.github = {
        owner: githubMatch[1],
        repo: githubMatch[2],
      };
    }
  }
  
  // Extract npm package if applicable
  const npmPackage = server.packages.find(pkg => pkg.type === 'npm');
  if (npmPackage) {
    identity.npm = {
      package: npmPackage.identifier,
    };
  }
  
  return identity;
}

/**
 * Verifies namespace ownership for a server
 * 
 * Verification logic:
 * 1. Registry official/verified status → automatically verified
 * 2. GitHub namespace (io.github.user/*) → verify GitHub ownership
 * 3. Custom domain → verify DNS/HTTP ownership (future: actual checks)
 * 4. Otherwise → community (unverified)
 * 
 * @param serverName Server name (e.g., io.github.user/server)
 * @param response Registry server response with metadata
 * @returns VerificationResult
 */
export function verifyNamespace(
  serverName: string,
  response: RegistryServerResponse
): VerificationResult {
  // Validate name format first
  if (!isValidNamespaceFormat(serverName)) {
    return {
      verified: false,
      details: {
        reason: `Invalid namespace format. Expected reverse-DNS format (e.g., io.github.user/server-name), got: ${serverName}`,
      },
    };
  }
  
  const identity = extractPublisherIdentity(response);
  if (!identity) {
    return {
      verified: false,
      details: {
        reason: 'Could not extract publisher identity from server metadata',
      },
    };
  }
  
  // Check registry official/verified status
  const registryMeta = response._meta?.['io.modelcontextprotocol.registry/official'];
  if (registryMeta?.status === 'official' || registryMeta?.status === 'verified') {
    return {
      verified: true,
      method: 'registry-official',
      status: registryMeta.status,
      details: {
        verifiedAt: registryMeta.verifiedAt,
      },
    };
  }
  
  // GitHub namespace verification
  const githubMatch = serverName.match(GITHUB_NAMESPACE_PATTERN);
  if (githubMatch) {
    const [, namespaceOwner, serverNamePart] = githubMatch;
    
    // Verify GitHub identity matches namespace
    if (identity.github?.owner.toLowerCase() === namespaceOwner.toLowerCase()) {
      return {
        verified: true,
        method: 'github',
        status: identity.status,
        details: {
          githubOwner: identity.github.owner,
          githubRepo: identity.github.repo,
        },
      };
    }
    
    return {
      verified: false,
      status: identity.status,
      details: {
        reason: `GitHub namespace mismatch. Namespace claims '${namespaceOwner}' but repository is owned by '${identity.github?.owner || 'unknown'}'`,
        githubOwner: identity.github?.owner,
      },
    };
  }
  
  // Domain namespace verification
  const domainMatch = serverName.match(DOMAIN_NAMESPACE_PATTERN);
  if (domainMatch) {
    const [, tld, domain] = domainMatch;
    const fullDomain = `${domain}.${tld}`;
    
    // TODO: Implement actual DNS/HTTP verification
    // For now, we return unverified for custom domains
    // Future: DNS TXT record check or HTTP .well-known challenge
    
    return {
      verified: false,
      status: identity.status,
      details: {
        domain: fullDomain,
        reason: `Custom domain verification not yet implemented. Domain '${fullDomain}' requires DNS or HTTP challenge verification.`,
      },
    };
  }
  
  // Fallback: unverified community server
  return {
    verified: false,
    status: 'community',
    details: {
      reason: 'Unable to verify namespace ownership. Not a recognized GitHub namespace or verified custom domain.',
    },
  };
}

/**
 * Validates that a server's namespace matches its claimed identity
 * 
 * This is a strict check that throws ValidationError on mismatch.
 * Use this when you need to enforce namespace ownership (e.g., during `mcp-shield add`).
 * 
 * @param serverName Server name
 * @param response Registry response
 * @throws ValidationError if namespace cannot be verified
 */
export function validateNamespaceOwnership(
  serverName: string,
  response: RegistryServerResponse
): void {
  const result = verifyNamespace(serverName, response);
  
  if (!result.verified) {
    throw new ValidationError(
      `Namespace verification failed for '${serverName}': ${result.details?.reason || 'Unknown error'}`,
      [result]
    );
  }
}

/**
 * Checks if a server name is a GitHub namespace
 * 
 * @param serverName Server name
 * @returns true if follows io.github.* pattern
 */
export function isGitHubNamespace(serverName: string): boolean {
  return GITHUB_NAMESPACE_PATTERN.test(serverName);
}

/**
 * Checks if a server name is a custom domain namespace
 * 
 * @param serverName Server name
 * @returns true if follows domain.tld/name pattern (but not io.github.*)
 */
export function isCustomDomainNamespace(serverName: string): boolean {
  return !isGitHubNamespace(serverName) && DOMAIN_NAMESPACE_PATTERN.test(serverName);
}

/**
 * Extracts the domain from a custom domain namespace
 * 
 * Reverse-DNS format converts domains like:
 * - example.com → com.example
 * - anthropic.ai → ai.anthropic
 * 
 * This function extracts the first two components (TLD.domain)
 * and reverses them back to domain.TLD format.
 * 
 * @param serverName Server name
 * @returns Domain (e.g., 'example.com') or null if not a domain namespace
 */
export function extractDomain(serverName: string): string | null {
  if (isGitHubNamespace(serverName)) {
    return null;
  }
  
  // Extract first two components before the slash
  const match = serverName.match(/^([a-z]+)\.([a-z0-9-]+)(?:\.[^/]*)?\/(.+)$/i);
  if (!match) {
    return null;
  }
  
  const [, tld, domain] = match;
  return `${domain}.${tld}`;
}

/**
 * Extracts the GitHub owner from a GitHub namespace
 * 
 * @param serverName Server name
 * @returns GitHub owner/org name or null if not a GitHub namespace
 */
export function extractGitHubOwner(serverName: string): string | null {
  const match = serverName.match(GITHUB_NAMESPACE_PATTERN);
  return match ? match[1] : null;
}
