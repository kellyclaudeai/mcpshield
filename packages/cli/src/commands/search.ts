/**
 * mcp-shield search
 *
 * Search the MCP registry for servers and optionally filter by package type.
 */

import chalk from 'chalk';
import { createRequire } from 'module';
import { RegistryClient } from '@kellyclaude/mcpshield-core';
import type { RegistryListItem } from '@kellyclaude/mcpshield-core';
import {
  EXIT_SUCCESS,
  getGlobalOptions,
  logInfo,
  writeJson,
  UserError,
} from '../output.js';

const require = createRequire(import.meta.url);
const toolVersion: string = require('../../package.json').version;

type PackageType = 'npm' | 'pypi' | 'docker' | 'nuget' | 'mcpb';

interface ErrorItem {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

interface SearchResultItem {
  name: string;
  version: string;
  description: string;
  repository: string | null;
  packages: Array<{ type: string; identifier: string; version: string; runtimeHint: string | null }>;
  remotes: Array<{ type: string; url: string | null }>;
  meta: {
    status: string | null;
    isLatest: boolean | null;
    publishedAt: string | null;
    updatedAt: string | null;
  };
}

interface SearchJsonOutput {
  tool: 'mcpshield';
  toolVersion: string;
  command: 'search';
  generatedAt: string;
  input: {
    query: string;
    type: PackageType | null;
    limit: number;
    cursor: string | null;
    allVersions: boolean;
  };
  summary: {
    returned: number;
    total: number | null;
    nextCursor: string | null;
  };
  results: SearchResultItem[];
  errors: ErrorItem[];
}

export interface SearchCommandOptions {
  type?: string;
  limit?: number;
  cursor?: string;
  allVersions?: boolean;
}

function parseTypeFilter(typeRaw: string | undefined): PackageType | null {
  if (!typeRaw) return null;
  const value = typeRaw.toLowerCase();
  if (value === 'npm') return 'npm';
  if (value === 'pypi') return 'pypi';
  if (value === 'docker' || value === 'oci') return 'docker';
  if (value === 'nuget') return 'nuget';
  if (value === 'mcpb') return 'mcpb';
  throw new UserError(`Invalid --type value: ${typeRaw} (expected npm|pypi|docker|nuget|mcpb)`);
}

function isLatest(item: RegistryListItem): boolean | null {
  const meta = (item as any)?._meta?.['io.modelcontextprotocol.registry/official'];
  return typeof meta?.isLatest === 'boolean' ? meta.isLatest : null;
}

function getMeta(item: RegistryListItem): SearchResultItem['meta'] {
  const meta = (item as any)?._meta?.['io.modelcontextprotocol.registry/official'];
  return {
    status: typeof meta?.status === 'string' ? meta.status : null,
    isLatest: typeof meta?.isLatest === 'boolean' ? meta.isLatest : null,
    publishedAt: typeof meta?.publishedAt === 'string' ? meta.publishedAt : null,
    updatedAt: typeof meta?.updatedAt === 'string' ? meta.updatedAt : null,
  };
}

function toResultItem(item: RegistryListItem): SearchResultItem {
  const server = item.server as any;
  const packages = Array.isArray(server.packages) ? server.packages : [];
  const remotes = Array.isArray(server.remotes) ? server.remotes : [];

  return {
    name: server.name,
    version: server.version,
    description: server.description,
    repository: server.repository?.url ?? null,
    packages: packages
      .map((pkg: any) => ({
        type: String(pkg.type ?? pkg.registryType ?? 'unknown'),
        identifier: String(pkg.identifier ?? ''),
        version: String(pkg.version ?? ''),
        runtimeHint: typeof pkg.runtimeHint === 'string' ? pkg.runtimeHint : null,
      }))
      .filter((pkg: any) => pkg.identifier.length > 0 && pkg.version.length > 0),
    remotes: remotes.map((remote: any) => ({
      type: String(remote.type ?? 'unknown'),
      url: typeof remote.url === 'string' ? remote.url : null,
    })),
    meta: getMeta(item),
  };
}

export async function searchCommand(query: string, options: SearchCommandOptions = {}): Promise<number> {
  const opts = getGlobalOptions();

  const search = query?.trim();
  if (!search) {
    throw new UserError('Search query is required.');
  }

  const typeFilter = parseTypeFilter(options.type);
  const limit = Number.isFinite(options.limit) && (options.limit as number) > 0 ? Math.floor(options.limit as number) : 20;
  const allVersions = Boolean(options.allVersions);

  const client = new RegistryClient();
  const errors: ErrorItem[] = [];

  let cursor: string | undefined = options.cursor;
  let total: number | null = null;
  let nextCursor: string | null = null;

  const collected: RegistryListItem[] = [];

  while (collected.length < limit) {
    const page = await client.searchServers({ search, cursor });
    if (typeof (page as any)?.metadata?.count === 'number') {
      total = (page as any).metadata.count;
    }
    nextCursor = typeof (page as any)?.metadata?.nextCursor === 'string' ? (page as any).metadata.nextCursor : null;

    collected.push(...(page.servers as any));

    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  let items = collected;
  if (!allVersions) {
    items = items.filter((item) => isLatest(item) !== false);
  }
  if (typeFilter) {
    items = items.filter((item) => {
      const packages = Array.isArray((item.server as any)?.packages) ? (item.server as any).packages : [];
      return packages.some((pkg: any) => String(pkg.type ?? pkg.registryType).toLowerCase() === typeFilter);
    });
  }

  items.sort((a, b) => {
    const nameCmp = a.server.name.localeCompare(b.server.name);
    if (nameCmp !== 0) return nameCmp;
    return a.server.version.localeCompare(b.server.version);
  });

  const results = items.slice(0, limit).map(toResultItem);

  const output: SearchJsonOutput = {
    tool: 'mcpshield',
    toolVersion,
    command: 'search',
    generatedAt: new Date().toISOString(),
    input: {
      query: search,
      type: typeFilter,
      limit,
      cursor: options.cursor ?? null,
      allVersions,
    },
    summary: {
      returned: results.length,
      total,
      nextCursor,
    },
    results,
    errors,
  };

  if (opts.json) {
    writeJson(output);
    return EXIT_SUCCESS;
  }

  if (results.length === 0) {
    logInfo(chalk.yellow('No servers found.'));
    return EXIT_SUCCESS;
  }

  logInfo(chalk.blue('MCPShield Registry Search'));
  for (const item of results) {
    const types = item.packages.length > 0 ? Array.from(new Set(item.packages.map((p) => p.type))).sort() : [];
    const typeLabel =
      types.length > 0
        ? chalk.dim(`[${types.join(', ')}]`)
        : item.remotes.length > 0
          ? chalk.dim('[remote]')
          : chalk.dim('[no packages]');

    const latest = item.meta.isLatest === true ? chalk.green('latest') : item.meta.isLatest === false ? chalk.dim('old') : chalk.dim('unknown');

    logInfo(`${chalk.bold(item.name)}@${item.version} ${typeLabel} ${chalk.dim('(' + latest + ')')}`);
    logInfo(chalk.dim(`  ${item.description}`));
  }

  return EXIT_SUCCESS;
}
