/**
 * Registry client for fetching server metadata from MCP Registry
 */

import got, { HTTPError } from 'got';
import { RegistryListResponse, RegistryServerResponse, RegistryError, Server } from './types.js';

export interface RegistryClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const DEFAULT_REGISTRY_URL = 'https://registry.modelcontextprotocol.io';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 2;
const DEFAULT_VERSION = 'latest';
const DEFAULT_LIST_LIMIT = 30;

function normalizeRegistryType(value: unknown): Server['packages'][number]['type'] | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();

  if (lower === 'npm') return 'npm';
  if (lower === 'pypi') return 'pypi';
  if (lower === 'nuget') return 'nuget';
  if (lower === 'mcpb') return 'mcpb';
  if (lower === 'oci') return 'docker';
  if (lower === 'docker') return 'docker';

  return null;
}

export class RegistryClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private headers: Record<string, string>;

  constructor(options: RegistryClientOptions = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_REGISTRY_URL;
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.retries = options.retries || DEFAULT_RETRIES;
    this.headers = {
      'User-Agent': 'MCPShield/0.1.0',
      'Accept': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Fetch server metadata from the registry
   * @param name - Server name (e.g., "postmark", "@modelcontextprotocol/server-everything")
   * @returns Server metadata with registry annotations
   */
  async getServer(name: string): Promise<RegistryServerResponse> {
    if (!name || typeof name !== 'string') {
      throw new RegistryError('Server name is required and must be a string');
    }

    const encodedName = encodeURIComponent(name);
    const url = `${this.baseUrl}/v0/servers/${encodedName}/versions/${DEFAULT_VERSION}`;

    try {
      const response = await got(url, {
        headers: this.headers,
        timeout: { request: this.timeout },
        retry: { limit: this.retries },
        responseType: 'json',
      });

      const data = response.body as any;

      // Validate response structure
      if (!data.server || !data.server.name) {
        throw new RegistryError(
          'Invalid response from registry: missing server data',
          response.statusCode,
          data
        );
      }

      // Normalize registry schema differences into MCPShield's internal types.
      const normalized: RegistryServerResponse = {
        ...data,
        server: {
          ...data.server,
          packages: Array.isArray(data.server.packages)
            ? data.server.packages
                .map((pkg: any) => {
                  const type =
                    normalizeRegistryType(pkg?.type) ??
                    normalizeRegistryType(pkg?.registryType) ??
                    (typeof pkg?.type === 'string' ? (pkg.type as any) : null);

                  if (!type) {
                    return null;
                  }

                  return {
                    ...pkg,
                    type,
                    identifier: pkg.identifier,
                    version: pkg.version,
                    digest: pkg.digest,
                  };
                })
                .filter(Boolean)
            : [],
        },
      };

      return normalized;
    } catch (error: any) {
      if (error instanceof HTTPError) {
        const statusCode = error.response.statusCode;
        let message = `Failed to fetch server '${name}' from registry`;

        if (statusCode === 404) {
          message = `Server '${name}' not found in registry`;
        } else if (statusCode === 429) {
          message = 'Rate limit exceeded. Please try again later.';
        } else if (statusCode >= 500) {
          message = 'Registry service is currently unavailable';
        }

        throw new RegistryError(message, statusCode, error.response.body);
      }

      if (error instanceof Error) {
        throw new RegistryError(
          `Network error while fetching server: ${error.message}`
        );
      }

      throw error;
    }
  }

  /**
   * Search/list servers in the MCP registry.
   *
   * Uses the v0.1 list endpoint which returns a mixed set of deployment types
   * (packages + remotes). Callers can filter by package type if desired.
   */
  async searchServers(options: { search: string; cursor?: string; limit?: number }): Promise<RegistryListResponse> {
    const search = options.search?.trim();
    if (!search) {
      throw new RegistryError('Search term is required');
    }

    const params = new URLSearchParams();
    params.set('search', search);
    if (options.cursor) params.set('cursor', options.cursor);

    const url = `${this.baseUrl}/v0.1/servers?${params.toString()}`;

    try {
      const response = await got(url, {
        headers: this.headers,
        timeout: { request: this.timeout },
        retry: { limit: this.retries },
        responseType: 'json',
      });

      const data = response.body as any;
      if (!data || !Array.isArray(data.servers)) {
        throw new RegistryError('Invalid response from registry: missing servers list', response.statusCode, data);
      }

      const normalizedServers = data.servers
        .map((item: any) => {
          const server = item?.server;
          if (
            !server?.name ||
            typeof server.name !== 'string' ||
            typeof server.description !== 'string' ||
            typeof server.version !== 'string'
          ) {
            return null;
          }

          const packages = Array.isArray(server.packages)
            ? server.packages
                .map((pkg: any) => {
                  const type =
                    normalizeRegistryType(pkg?.type) ??
                    normalizeRegistryType(pkg?.registryType) ??
                    (typeof pkg?.type === 'string' ? (pkg.type as any) : null);

                  if (!type) return null;

                  return {
                    ...pkg,
                    type,
                    identifier: pkg.identifier,
                    version: pkg.version,
                    digest: pkg.digest,
                  };
                })
                .filter(Boolean)
            : undefined;

          return {
            ...item,
            server: {
              ...server,
              packages,
            },
          };
        })
        .filter(Boolean);

      const limit = options.limit ?? DEFAULT_LIST_LIMIT;
      const servers = normalizedServers.slice(0, Math.max(0, limit));

      return {
        servers,
        metadata: data.metadata,
      } as RegistryListResponse;
    } catch (error: any) {
      if (error instanceof HTTPError) {
        const statusCode = error.response.statusCode;
        let message = 'Failed to search servers in registry';

        if (statusCode === 429) {
          message = 'Rate limit exceeded. Please try again later.';
        } else if (statusCode >= 500) {
          message = 'Registry service is currently unavailable';
        }

        throw new RegistryError(message, statusCode, error.response.body);
      }

      if (error instanceof Error) {
        throw new RegistryError(`Network error while searching registry: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Extract publisher identity from registry response metadata
   * @param response - Registry server response
   * @returns Publisher identity information
   */
  extractPublisherIdentity(response: RegistryServerResponse) {
    const officialMeta = response._meta?.['io.modelcontextprotocol.registry/official'];
    const server = response.server;

    const npmPackage = server.packages.find((p: any) => p.type === 'npm' || p.registryType === 'npm');
    const statusRaw = officialMeta?.status;
    const status = statusRaw === 'official' || statusRaw === 'verified' ? statusRaw : 'community';

    return {
      status,
      github: server.repository?.url?.includes('github.com')
        ? this.parseGitHubUrl(server.repository.url)
        : undefined,
      npm: npmPackage
        ? { package: npmPackage.identifier }
        : undefined,
    };
  }

  /**
   * Parse GitHub URL to extract owner and repo
   */
  private parseGitHubUrl(url: string): { owner: string; repo: string } | undefined {
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
      };
    }
    return undefined;
  }

  /**
   * Check if a server is verified (official or verified status)
   */
  isVerified(response: RegistryServerResponse): boolean {
    const status = response._meta?.['io.modelcontextprotocol.registry/official']?.status;
    return status === 'official' || status === 'verified';
  }

  /**
   * Get server version from response
   */
  getVersion(response: RegistryServerResponse): string {
    return response.server.version || '1.0.0';
  }

  /**
   * Validate server response structure
   */
  validateServerResponse(response: RegistryServerResponse): boolean {
    if (!response.server) return false;
    if (!response.server.name) return false;
    if (!response.server.description) return false;
    if (!Array.isArray(response.server.packages)) return false;
    if (response.server.packages.length === 0) return false;

    // Validate each package
    for (const pkg of response.server.packages) {
      const pkgType = (pkg as any).type ?? (pkg as any).registryType;
      if (!pkgType || !pkg.identifier || !pkg.version) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Simple convenience function to fetch server metadata
 * Uses default registry client configuration
 * @param serverName - Server name (e.g., "postmark", "@modelcontextprotocol/server-everything")
 * @returns Server metadata from the registry
 */
export async function fetchServerMetadata(serverName: string): Promise<RegistryServerResponse> {
  const client = new RegistryClient();
  return client.getServer(serverName);
}
