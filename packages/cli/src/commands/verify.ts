/**
 * mcp-shield verify
 *
 * Re-compute artifact digests and compare against the lockfile.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  CacheManager,
  DigestVerifier,
  LockfileEntry,
  LockfileManager,
  NpmResolver,
} from '@kellyclaude/mcpshield-core';
import { createRequire } from 'module';
import {
  EXIT_GENERAL_FAILURE,
  EXIT_SUCCESS,
  EXIT_USER_ERROR,
  debugLog,
  getGlobalOptions,
  logError,
  logInfo,
  writeJson,
  UserError,
} from '../output.js';

const require = createRequire(import.meta.url);
const toolVersion: string = require('../../package.json').version;

type VerifyArtifactStatus = 'ok' | 'drift' | 'error' | 'skipped';
type VerifyArtifactSource = 'cache' | 'download' | 'skipped';

interface ErrorItem {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

interface VerifyArtifactResult {
  type: string;
  url: string;
  expectedDigest: string;
  actualDigest: string | null;
  status: VerifyArtifactStatus;
  source: VerifyArtifactSource;
  error: ErrorItem | null;
}

interface VerifyServerResult {
  namespace: string;
  version: string;
  verified: boolean;
  artifacts: VerifyArtifactResult[];
  errors: ErrorItem[];
}

export interface VerifyJsonOutput {
  tool: 'mcpshield';
  toolVersion: string;
  command: 'verify';
  generatedAt: string;
  summary: {
    servers: number;
    artifacts: number;
    ok: number;
    drift: number;
    errors: number;
    skipped: number;
  };
  results: VerifyServerResult[];
  errors: ErrorItem[];
}

export interface VerifyCommandOptions {
  offline?: boolean;
}

export async function verifyCommand(options: VerifyCommandOptions = {}): Promise<number> {
  const startTime = Date.now();
  const opts = getGlobalOptions();
  const lockfileManager = new LockfileManager();

  if (!(await lockfileManager.exists())) {
    throw new UserError('No mcp.lock.json found. Run `mcp-shield init` and `mcp-shield add` first.');
  }

  let lockfile;
  try {
    lockfile = await lockfileManager.read();
  } catch (error: any) {
    throw new UserError(`Failed to read mcp.lock.json: ${error.message}`);
  }

  const validation = lockfileManager.validate(lockfile);
  if (!validation.valid) {
    throw new UserError(`Lockfile validation failed:\n- ${validation.errors.join('\n- ')}`);
  }

  const cache = new CacheManager();
  const resolver = new NpmResolver();

  const results: VerifyServerResult[] = [];
  const topErrors: ErrorItem[] = [];

  let ok = 0;
  let drift = 0;
  let errors = 0;
  let skipped = 0;
  let offlineCacheMiss = false;

  for (const namespace of Object.keys(lockfile.servers).sort()) {
    const entry = lockfile.servers[namespace] as LockfileEntry;

    const serverResult: VerifyServerResult = {
      namespace,
      version: entry.version,
      verified: entry.verified,
      artifacts: [],
      errors: [],
    };

    const artifacts = entry.artifacts || [];
    for (const artifact of artifacts) {
      if (artifact.type !== 'npm') {
        serverResult.artifacts.push({
          type: artifact.type,
          url: artifact.url,
          expectedDigest: artifact.digest,
          actualDigest: null,
          status: 'skipped',
          source: 'skipped',
          error: null,
        });
        skipped += 1;
        continue;
      }

      const expectedDigest = artifact.digest;

      if (options.offline) {
        const cachedPath = await cache.get(expectedDigest);
        if (!cachedPath) {
          offlineCacheMiss = true;
          serverResult.artifacts.push({
            type: artifact.type,
            url: artifact.url,
            expectedDigest,
            actualDigest: null,
            status: 'error',
            source: 'cache',
            error: {
              code: 'OFFLINE_CACHE_MISS',
              message: 'Artifact not in cache and --offline is enabled. Re-run without --offline to allow downloads.',
              details: { digest: expectedDigest },
            },
          });
          errors += 1;
          continue;
        }

        const verification = await DigestVerifier.verify(cachedPath, expectedDigest);
        const status: VerifyArtifactStatus = verification.valid ? 'ok' : 'drift';

        serverResult.artifacts.push({
          type: artifact.type,
          url: artifact.url,
          expectedDigest,
          actualDigest: verification.actualDigest,
          status,
          source: 'cache',
          error: null,
        });

        if (verification.valid) ok += 1;
        else drift += 1;
        continue;
      }

      const cachedPath = await cache.get(expectedDigest);
      if (cachedPath) {
        const verification = await DigestVerifier.verify(cachedPath, expectedDigest);
        const status: VerifyArtifactStatus = verification.valid ? 'ok' : 'drift';

        serverResult.artifacts.push({
          type: artifact.type,
          url: artifact.url,
          expectedDigest,
          actualDigest: verification.actualDigest,
          status,
          source: 'cache',
          error: null,
        });

        if (verification.valid) ok += 1;
        else drift += 1;
        continue;
      }

      // Download + compute digest
      const tempPath = path.join(os.tmpdir(), `mcpshield-verify-${process.pid}-${Date.now()}.tgz`);
      try {
        const actualDigest = await resolver.download(
          { url: artifact.url, type: 'npm', size: artifact.size },
          tempPath
        );

        const status: VerifyArtifactStatus = actualDigest === expectedDigest ? 'ok' : 'drift';

        serverResult.artifacts.push({
          type: artifact.type,
          url: artifact.url,
          expectedDigest,
          actualDigest,
          status,
          source: 'download',
          error: null,
        });

        if (status === 'ok') {
          ok += 1;
          await cache.put(expectedDigest, tempPath);
        } else {
          drift += 1;
        }
      } catch (error: any) {
        serverResult.artifacts.push({
          type: artifact.type,
          url: artifact.url,
          expectedDigest,
          actualDigest: null,
          status: 'error',
          source: 'download',
          error: {
            code: 'DOWNLOAD_FAILED',
            message: error.message,
            details: null,
          },
        });
        errors += 1;
      } finally {
        await fs.unlink(tempPath).catch(() => {});
      }
    }

    serverResult.artifacts.sort((a, b) => {
      const typeCmp = a.type.localeCompare(b.type);
      if (typeCmp !== 0) return typeCmp;
      return a.url.localeCompare(b.url);
    });

    results.push(serverResult);
  }

  const output: VerifyJsonOutput = {
    tool: 'mcpshield',
    toolVersion,
    command: 'verify',
    generatedAt: new Date().toISOString(),
    summary: {
      servers: results.length,
      artifacts: results.reduce((sum, r) => sum + r.artifacts.length, 0),
      ok,
      drift,
      errors,
      skipped,
    },
    results,
    errors: topErrors,
  };

  if (opts.json) {
    writeJson(output);
  } else {
    logInfo('MCPShield Verify');
    logInfo(`Servers: ${output.summary.servers}`);
    logInfo(`Artifacts: ${output.summary.artifacts}`);
    if (drift > 0) logError(`Drift: ${drift}`);
    if (errors > 0) logError(`Errors: ${errors}`);
    if (ok > 0) logInfo(`OK: ${ok}`);
    if (skipped > 0) logInfo(`Skipped: ${skipped}`);
  }

  debugLog(`verify completed in ${Date.now() - startTime}ms`);

  if (offlineCacheMiss) return EXIT_USER_ERROR;
  if (drift > 0 || errors > 0) return EXIT_GENERAL_FAILURE;
  return EXIT_SUCCESS;
}
