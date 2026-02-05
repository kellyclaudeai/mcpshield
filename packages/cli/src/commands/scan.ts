/**
 * mcp-shield scan
 *
 * Scan all servers in the lockfile for security issues.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import {
  CacheManager,
  Finding,
  LockfileEntry,
  LockfileManager,
  NpmResolver,
  evaluateScan,
  getDefaultPolicy,
  loadPolicy,
  validatePolicy,
} from '@mcpshield/core';
import { BasicScanner } from '@mcpshield/scanner';
import chalk from 'chalk';
import { generateSarifReport } from '../sarif.js';
import {
  EXIT_GENERAL_FAILURE,
  EXIT_SUCCESS,
  EXIT_USER_ERROR,
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

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

const severityOrder: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

interface ErrorItem {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

interface PolicyReason {
  code: string;
  message: string;
}

interface ScanFindingOutput {
  ruleId: string;
  severity: Severity;
  category: string;
  message: string;
  details: Record<string, unknown> | null;
}

interface ScanArtifactResult {
  type: string;
  digest: string;
  verdict: 'clean' | 'warning' | 'suspicious' | 'malicious' | 'unknown';
  riskScore: number;
  findings: ScanFindingOutput[];
  vulnerabilities: { critical: number; high: number; medium: number; low: number };
}

interface ScanServerResult {
  namespace: string;
  version: string;
  artifacts: ScanArtifactResult[];
  policy: { blocked: boolean; reasons: PolicyReason[] };
  errors: ErrorItem[];
}

export interface ScanJsonOutput {
  tool: 'mcpshield';
  toolVersion: string;
  command: 'scan';
  generatedAt: string;
  summary: {
    servers: number;
    artifacts: number;
    verdicts: {
      clean: number;
      warning: number;
      suspicious: number;
      malicious: number;
      unknown: number;
    };
    policy: { enforced: boolean; blocked: boolean; reasons: PolicyReason[] };
  };
  results: ScanServerResult[];
  errors: ErrorItem[];
}

export interface ScanCommandOptions {
  ci?: boolean;
  enforce?: boolean;
  sarif?: boolean;
  offline?: boolean;
}

function toRuleId(finding: Finding): string {
  const ruleId = (finding.details as any)?.ruleId;
  return typeof ruleId === 'string' && ruleId.length > 0 ? ruleId : 'UNKNOWN_RULE';
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

function toFindingOutput(finding: Finding): ScanFindingOutput {
  return {
    ruleId: toRuleId(finding),
    severity: finding.severity,
    category: finding.category,
    message: finding.message,
    details: (finding.details as any) ?? null,
  };
}

function sortFindings(findings: ScanFindingOutput[]): void {
  findings.sort((a, b) => {
    const sevCmp = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevCmp !== 0) return sevCmp;

    const ruleCmp = a.ruleId.localeCompare(b.ruleId);
    if (ruleCmp !== 0) return ruleCmp;

    return a.message.localeCompare(b.message);
  });
}

export async function scanCommand(options: ScanCommandOptions = {}): Promise<number> {
  const startTime = Date.now();
  const opts = getGlobalOptions();
  const shouldEnforce = Boolean(options.ci || options.enforce);
  const machineMode = Boolean(opts.json || options.sarif);

  if (opts.json && options.sarif) {
    throw new UserError('Use either --json or --sarif (not both).');
  }

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

  const namespaces = Object.keys(lockfile.servers).sort();
  if (namespaces.length === 0) {
    const emptyOutput: ScanJsonOutput = {
      tool: 'mcpshield',
      toolVersion,
      command: 'scan',
      generatedAt: new Date().toISOString(),
      summary: {
        servers: 0,
        artifacts: 0,
        verdicts: { clean: 0, warning: 0, suspicious: 0, malicious: 0, unknown: 0 },
        policy: { enforced: shouldEnforce, blocked: false, reasons: [] },
      },
      results: [],
      errors: [],
    };

    if (opts.json) writeJson(emptyOutput);
    else logInfo(chalk.yellow('No servers in lockfile. Run `mcp-shield add <server>` to add servers.'));
    return EXIT_SUCCESS;
  }

  let policy = await loadPolicy();
  const usedDefaultPolicy = shouldEnforce && !policy;
  if (usedDefaultPolicy) {
    policy = getDefaultPolicy();
  }
  if (policy) {
    const policyValidation = await validatePolicy(policy);
    if (!policyValidation.valid) {
      throw new UserError(`Invalid policy configuration:\n- ${policyValidation.errors?.join('\n- ')}`);
    }
    if (usedDefaultPolicy) {
      logWarn(chalk.yellow('No policy.yaml found; using default policy for enforcement.'));
    }
  }

  const cache = new CacheManager();
  const resolver = new NpmResolver('https://registry.npmjs.org', { offline: Boolean(options.offline) });
  const scanner = new BasicScanner({ enableOsv: !options.offline });

  const results: ScanServerResult[] = [];
  const topErrors: ErrorItem[] = [];

  let offlineCacheMiss = false;
  let downloadErrors = 0;

  const verdictCounts = { clean: 0, warning: 0, suspicious: 0, malicious: 0, unknown: 0 };

  for (const namespace of namespaces) {
    const entry = lockfile.servers[namespace] as LockfileEntry;
    const serverErrors: ErrorItem[] = [];
    const artifacts: ScanArtifactResult[] = [];

    let aggregatedRiskScore = 0;
    const aggregatedFindings: Finding[] = [];

    const entryArtifacts = entry.artifacts || [];
    for (const artifact of entryArtifacts) {
      if (artifact.type !== 'npm') {
        const finding: ScanFindingOutput = {
          ruleId: 'SCAN_UNSUPPORTED',
          severity: 'info',
          category: 'unsupported',
          message: `Skipping unsupported artifact type: ${artifact.type}`,
          details: { type: artifact.type },
        };

        artifacts.push({
          type: artifact.type,
          digest: artifact.digest,
          verdict: 'unknown',
          riskScore: 0,
          findings: [finding],
          vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
        });
        verdictCounts.unknown += 1;
        continue;
      }

      let artifactPath = await cache.get(artifact.digest);
      if (!artifactPath) {
        if (options.offline) {
          offlineCacheMiss = true;
          serverErrors.push({
            code: 'OFFLINE_CACHE_MISS',
            message:
              'Artifact not in cache and --offline is enabled. Re-run without --offline to allow downloads.',
            details: { digest: artifact.digest, url: artifact.url },
          });

          artifacts.push({
            type: artifact.type,
            digest: artifact.digest,
            verdict: 'unknown',
            riskScore: 0,
            findings: [],
            vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
          });
          verdictCounts.unknown += 1;
          continue;
        }

        const tempPath = path.join(os.tmpdir(), `mcpshield-scan-${process.pid}-${Date.now()}.tgz`);
        try {
          await resolver.download({ url: artifact.url, type: 'npm', size: artifact.size }, tempPath);
          await cache.put(artifact.digest, tempPath);
          artifactPath = await cache.get(artifact.digest);
        } catch (error: any) {
          downloadErrors += 1;
          serverErrors.push({
            code: 'DOWNLOAD_FAILED',
            message: error.message,
            details: { url: artifact.url },
          });

          artifacts.push({
            type: artifact.type,
            digest: artifact.digest,
            verdict: 'unknown',
            riskScore: 0,
            findings: [],
            vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
          });
          verdictCounts.unknown += 1;
          continue;
        } finally {
          await fs.unlink(tempPath).catch(() => {});
        }
      }

      if (!artifactPath) {
        downloadErrors += 1;
        serverErrors.push({
          code: 'CACHE_ERROR',
          message: 'Failed to obtain artifact from cache after download.',
          details: { digest: artifact.digest },
        });

        artifacts.push({
          type: artifact.type,
          digest: artifact.digest,
          verdict: 'unknown',
          riskScore: 0,
          findings: [],
          vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
        });
        verdictCounts.unknown += 1;
        continue;
      }

      try {
        const buffer = await fs.readFile(artifactPath);
        const scanResult = await scanner.scanPackage(
          { type: 'npm', identifier: namespace, version: entry.version },
          buffer
        );

        aggregatedRiskScore = Math.max(aggregatedRiskScore, scanResult.riskScore);
        aggregatedFindings.push(...scanResult.findings);

        const findingsOut = scanResult.findings.map(toFindingOutput);
        sortFindings(findingsOut);

        const vulnerabilities = scanResult.dependencies?.vulnerabilities ?? {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        };

        artifacts.push({
          type: artifact.type,
          digest: artifact.digest,
          verdict: scanResult.verdict,
          riskScore: scanResult.riskScore,
          findings: findingsOut,
          vulnerabilities,
        });

        verdictCounts[scanResult.verdict] += 1;
      } catch (error: any) {
        downloadErrors += 1;
        serverErrors.push({
          code: 'SCAN_FAILED',
          message: error.message,
          details: { digest: artifact.digest },
        });

        artifacts.push({
          type: artifact.type,
          digest: artifact.digest,
          verdict: 'unknown',
          riskScore: 0,
          findings: [],
          vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
        });
        verdictCounts.unknown += 1;
      }
    }

    artifacts.sort((a, b) => {
      const typeCmp = a.type.localeCompare(b.type);
      if (typeCmp !== 0) return typeCmp;
      return a.digest.localeCompare(b.digest);
    });

    let policyBlocked = false;
    let policyReasons: PolicyReason[] = [];

    if (policy) {
      const decision = evaluateScan({
        serverName: namespace,
        riskScore: aggregatedRiskScore,
        findings: aggregatedFindings,
        verified: entry.verified,
        policy,
      });

      if (!decision.allowed) {
        policyBlocked = true;
        policyReasons = toPolicyReasons(decision.reasons);
      }
    }

    results.push({
      namespace,
      version: entry.version,
      artifacts,
      policy: { blocked: policyBlocked, reasons: policyReasons },
      errors: serverErrors,
    });
  }

  // Stable ordering for JSON output (also useful for human output)
  results.sort((a, b) => a.namespace.localeCompare(b.namespace));

  const blockedServers = results.filter((r) => r.policy.blocked);
  const output: ScanJsonOutput = {
    tool: 'mcpshield',
    toolVersion,
    command: 'scan',
    generatedAt: new Date().toISOString(),
    summary: {
      servers: results.length,
      artifacts: results.reduce((sum, r) => sum + r.artifacts.length, 0),
      verdicts: verdictCounts,
      policy: {
        enforced: shouldEnforce,
        blocked: blockedServers.length > 0,
        reasons: blockedServers.flatMap((r) => r.policy.reasons),
      },
    },
    results,
    errors: topErrors,
  };

  if (options.sarif) {
    const sarifArtifacts = results.map((r) => ({
      namespace: r.namespace,
      version: r.version,
      findings: r.artifacts.flatMap((artifact) =>
        artifact.findings.map((finding) => ({
          ruleId: finding.ruleId,
          severity: finding.severity,
          category: finding.category,
          message: finding.message,
        }))
      ),
    }));

    const sarif = generateSarifReport({
      toolVersion,
      artifacts: sarifArtifacts,
      lockfileUri: 'mcp.lock.json',
      generatedAt: output.generatedAt,
    });

    // SARIF is always machine output to stdout.
    console.log(JSON.stringify(sarif, null, 2));
  } else if (opts.json) {
    writeJson(output);
  } else if (!machineMode) {
    logInfo(chalk.blue('MCPShield Scan'));
    logInfo(`Servers: ${output.summary.servers}`);
    logInfo(`Artifacts: ${output.summary.artifacts}`);
    logInfo(
      `Verdicts: clean=${verdictCounts.clean} warning=${verdictCounts.warning} suspicious=${verdictCounts.suspicious} malicious=${verdictCounts.malicious} unknown=${verdictCounts.unknown}`
    );

    if (shouldEnforce) {
      if (blockedServers.length > 0) {
        logError(`Policy blocked ${blockedServers.length} server(s).`);
        for (const blocked of blockedServers) {
          logError(`- ${blocked.namespace}`);
          for (const reason of blocked.policy.reasons) {
            logError(`  • ${reason.message}`);
          }
        }
      } else {
        logInfo('Policy: OK');
      }
    } else if (policy) {
      logWarn('Policy loaded but not enforced (run with --enforce or --ci to gate).');
    }
  }

  debugLog(`scan completed in ${Date.now() - startTime}ms`);

  if (offlineCacheMiss) return EXIT_USER_ERROR;
  if (shouldEnforce && blockedServers.length > 0) return EXIT_GENERAL_FAILURE;
  if (downloadErrors > 0) return EXIT_GENERAL_FAILURE;
  return EXIT_SUCCESS;
}
