/**
 * mcp-shield add
 *
 * Add an MCP server to the project lockfile:
 * - Fetch server metadata from the registry
 * - Verify namespace ownership (best-effort)
 * - Resolve + download npm artifacts, verify digest
 * - Scan artifacts for security risks
 * - Evaluate policy and (optionally) require approval/override
 * - Write pinned artifact digests to mcp.lock.json
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import prompts from 'prompts';
import { createRequire } from 'module';
import {
  CacheManager,
  Finding,
  LockfileEntry,
  LockfileManager,
  NpmResolver,
  RegistryClient,
  RegistryError,
  evaluateAdd,
  isValidNamespaceFormat,
  loadPolicy,
  validatePolicy,
  verifyNamespace,
} from '@mcpshield/core';
import { BasicScanner } from '@mcpshield/scanner';
import {
  EXIT_GENERAL_FAILURE,
  EXIT_SUCCESS,
  debugLog,
  getGlobalOptions,
  logError,
  logInfo,
  logWarn,
  writeJson,
  UserError,
} from '../output.js';

const require = createRequire(import.meta.url);
const toolVersion: string = require('../../package.json').version;

interface ErrorItem {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

interface PolicyReason {
  code: string;
  message: string;
}

interface AddJsonOutput {
  tool: 'mcpshield';
  toolVersion: string;
  command: 'add';
  generatedAt: string;
  input: { namespace: string; yes: boolean; ci: boolean };
  result: {
    added: boolean;
    entryWritten: boolean;
    policy: { blocked: boolean; reasons: PolicyReason[] };
  };
  errors: ErrorItem[];
}

export interface AddCommandOptions {
  yes?: boolean;
  ci?: boolean;
}

function toPolicyReasons(reasons: string[]): PolicyReason[] {
  return reasons.map((reason) => {
    if (/^Risk score \\d+ exceeds/.test(reason)) {
      return { code: 'MAX_RISK_SCORE', message: reason };
    }
    if (/not verified/i.test(reason)) {
      return { code: 'DENY_UNVERIFIED', message: reason };
    }
    if (/allowlist/i.test(reason)) {
      return { code: 'ALLOWLIST', message: reason };
    }
    if (/den(y|ied)/i.test(reason)) {
      return { code: 'DENYLIST', message: reason };
    }
    if (/blocked severity/i.test(reason)) {
      return { code: 'BLOCK_SEVERITY', message: reason };
    }
    return { code: 'POLICY', message: reason };
  });
}

function summarizeFindings(findings: Finding[]): { critical: number; high: number; medium: number; low: number; info: number } {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

function renderVerification(verification: ReturnType<typeof verifyNamespace>): string {
  if (verification.verified) {
    const method = verification.method ? ` (${verification.method})` : '';
    return chalk.green(`verified${method}`);
  }
  const reason = verification.details?.reason ? `: ${verification.details.reason}` : '';
  return chalk.yellow(`unverified${reason ? reason : ''}`);
}

export async function addCommand(serverName: string, options: AddCommandOptions = {}): Promise<number> {
  const startTime = Date.now();
  const opts = getGlobalOptions();
  const isNonInteractive = Boolean(opts.ci || options.ci || options.yes);

  if (opts.json && !isNonInteractive) {
    throw new UserError('Refusing to prompt in --json mode. Re-run with --yes or --ci.');
  }

  const errors: ErrorItem[] = [];
  let policyBlocked = false;
  let policyReasons: PolicyReason[] = [];

  const jsonOutputBase: Omit<AddJsonOutput, 'result'> = {
    tool: 'mcpshield',
    toolVersion,
    command: 'add',
    generatedAt: new Date().toISOString(),
    input: { namespace: serverName, yes: Boolean(options.yes), ci: Boolean(options.ci || opts.ci) },
    errors,
  };

  if (!isValidNamespaceFormat(serverName)) {
    throw new UserError(
      `Invalid namespace format: ${serverName}\nExpected reverse-DNS format like io.github.user/server-name`
    );
  }

  if (!opts.json) {
    logInfo(chalk.blue(`Adding MCP server: ${serverName}`));
  }

  const client = new RegistryClient();
  let response;
  try {
    response = await client.getServer(serverName);
  } catch (error: any) {
    if (error instanceof RegistryError && error.statusCode === 404) {
      throw new UserError(error.message);
    }
    throw error;
  }

  const server = response.server;
  const verification = verifyNamespace(serverName, response);

  if (!opts.json) {
    logInfo(`Registry: ${chalk.bold(server.name)} @ ${server.version}`);
    logInfo(`Namespace: ${renderVerification(verification)}`);
    logInfo(chalk.dim(`Packages: ${server.packages.length}`));
  }

  const cache = new CacheManager();
  const resolver = new NpmResolver();
  const scanner = new BasicScanner();
  const lockArtifacts: NonNullable<LockfileEntry['artifacts']> = [];

  const allFindings: Finding[] = [];
  let maxRiskScore = 0;

  for (const pkg of server.packages) {
    if (pkg.type !== 'npm') {
      if (!opts.json) {
        logWarn(chalk.dim(`Skipping unsupported package type for Pilot: ${pkg.type} (${pkg.identifier}@${pkg.version})`));
      }
      continue;
    }

    const id = `${pkg.identifier}@${pkg.version}`;
    if (!opts.json) logInfo(chalk.dim(`Resolving ${id}…`));

    const resolved = await resolver.resolve(id);
    const tempPath = path.join(os.tmpdir(), `mcpshield-add-${process.pid}-${Date.now()}.tgz`);

    try {
      const digest = await resolver.download(resolved.artifact, tempPath);
      await cache.put(digest, tempPath);

      const buffer = await fs.readFile(tempPath);
      const scanResult = await scanner.scanPackage(pkg, buffer);

      maxRiskScore = Math.max(maxRiskScore, scanResult.riskScore);
      allFindings.push(...scanResult.findings);

      lockArtifacts.push({
        type: 'npm',
        url: resolved.artifact.url,
        digest,
        size: resolved.artifact.size,
      });

      if (!opts.json) {
        const counts = summarizeFindings(scanResult.findings);
        const verdictColor =
          scanResult.verdict === 'clean'
            ? chalk.green
            : scanResult.verdict === 'warning'
              ? chalk.yellow
              : chalk.red;
        logInfo(
          `${verdictColor(scanResult.verdict.toUpperCase())} risk=${scanResult.riskScore}/100 findings=${counts.critical + counts.high + counts.medium + counts.low + counts.info}`
        );
      }
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  if (lockArtifacts.length === 0) {
    throw new UserError('No supported artifacts found for this server (Pilot supports npm only).');
  }

  // Policy evaluation
  const policy = await loadPolicy();
  if (policy) {
    const policyValidation = await validatePolicy(policy);
    if (!policyValidation.valid) {
      throw new UserError(`Invalid policy configuration:\n- ${policyValidation.errors?.join('\n- ')}`);
    }

    const decision = evaluateAdd({
      serverName,
      verified: verification.verified,
      verificationMethod: verification.method,
      riskScore: maxRiskScore,
      findings: allFindings,
      policy,
    });

    if (!decision.allowed) {
      policyBlocked = true;
      policyReasons = toPolicyReasons(decision.reasons);
    } else if (decision.requiresApproval && !opts.json) {
      logWarn(chalk.yellow('Policy: manual approval recommended for this server.'));
    }
  } else if ((options.ci || opts.ci) && !opts.json) {
    logWarn(chalk.yellow('No policy.yaml found; continuing without policy enforcement.'));
  }

  if (policyBlocked) {
    if (isNonInteractive) {
      const output: AddJsonOutput = {
        ...jsonOutputBase,
        result: { added: false, entryWritten: false, policy: { blocked: true, reasons: policyReasons } },
      };
      if (opts.json) {
        writeJson(output);
      } else {
        logError('Policy check failed:');
        for (const reason of policyReasons) {
          logError(`- ${reason.message}`);
        }
      }
      return EXIT_GENERAL_FAILURE;
    }

    if (!opts.json) {
      logError('Policy check failed:');
      for (const reason of policyReasons) {
        logError(`- ${reason.message}`);
      }
    }

    const { override } = await prompts({
      type: 'confirm',
      name: 'override',
      message: 'Override policy and add anyway?',
      initial: false,
    });

    if (!override) {
      if (opts.json) {
        writeJson({
          ...jsonOutputBase,
          result: { added: false, entryWritten: false, policy: { blocked: true, reasons: policyReasons } },
        } satisfies AddJsonOutput);
      }
      return EXIT_GENERAL_FAILURE;
    }
  }

  // Confirmation prompt (interactive only)
  if (!isNonInteractive) {
    const { approve } = await prompts({
      type: 'confirm',
      name: 'approve',
      message: 'Write this server to mcp.lock.json?',
      initial: true,
    });

    if (!approve) {
      if (opts.json) {
        writeJson({
          ...jsonOutputBase,
          result: { added: false, entryWritten: false, policy: { blocked: false, reasons: [] } },
        } satisfies AddJsonOutput);
      }
      return EXIT_SUCCESS;
    }
  }

  const lockfileManager = new LockfileManager();
  const currentLockfile = await lockfileManager.read();
  const lockfileValidation = lockfileManager.validate(currentLockfile);
  if (!lockfileValidation.valid) {
    throw new UserError(`Lockfile validation failed:\n- ${lockfileValidation.errors.join('\n- ')}`);
  }
  const entry: LockfileEntry = {
    namespace: serverName,
    version: server.version,
    resolved: server.repository?.url ?? null,
    repository: server.repository?.url ?? null,
    verified: verification.verified,
    verificationMethod: verification.method ?? null,
    verifiedOwner: verification.details?.githubOwner ?? null,
    fetchedAt: new Date().toISOString(),
    artifacts: lockArtifacts.sort((a, b) => {
      const typeCmp = a.type.localeCompare(b.type);
      if (typeCmp !== 0) return typeCmp;
      return a.url.localeCompare(b.url);
    }),
    ...(policyBlocked
      ? {
          approvedAt: new Date().toISOString(),
          approvedBy: process.env.MCPSHIELD_APPROVER || os.userInfo().username,
        }
      : {}),
  };

  await lockfileManager.addServer(entry);

  if (!opts.json) {
    logInfo(chalk.green('✓ Added to mcp.lock.json'));
  }

  const output: AddJsonOutput = {
    ...jsonOutputBase,
    result: {
      added: true,
      entryWritten: true,
      policy: { blocked: false, reasons: [] },
    },
  };

  if (opts.json) writeJson(output);

  debugLog(`add completed in ${Date.now() - startTime}ms`);
  return EXIT_SUCCESS;
}
