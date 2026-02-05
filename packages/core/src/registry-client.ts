/**
 * Registry client for fetching server metadata from MCP Registry
 */

import got, { HTTPError } from 'got';
import { RegistryServerResponse, RegistryError, Server } from './types.js';

export interface RegistryClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const DEFAULT_REGISTRY_URL = 'https://registry.modelcontextprotocol.io';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 2;

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
    const url = `${this.baseUrl}/v0.1/servers/${encodedName}`;

    try {
      const response = await got(url, {
        headers: this.headers,
        timeout: { request: this.timeout },
        retry: { limit: this.retries },
        responseType: 'json',
      });

      const data = response.body as RegistryServerResponse;

      // Validate response structure
      if (!data.server || !data.server.name) {
        throw new RegistryError(
          'Invalid response from registry: missing server data',
          response.statusCode,
          data
        );
      }

      return data;
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
   * Extract publisher identity from registry response metadata
   * @param response - Registry server response
   * @returns Publisher identity information
   */
  extractPublisherIdentity(response: RegistryServerResponse) {
    const officialMeta = response._meta?.['io.modelcontextprotocol.registry/official'];
    const server = response.server;

    return {
      status: officialMeta?.status || 'community',
      github: server.repository?.url?.includes('github.com')
        ? this.parseGitHubUrl(server.repository.url)
        : undefined,
      npm: server.packages.find(p => p.type === 'npm')
        ? { package: server.packages.find(p => p.type === 'npm')!.identifier }
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
      if (!pkg.type || !pkg.identifier || !pkg.version) {
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
