import crypto from 'crypto';

export type McpshieldSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SarifFindingInput {
  ruleId: string;
  severity: McpshieldSeverity;
  category: string;
  message: string;
}

export interface SarifArtifactInput {
  namespace: string;
  version: string;
  findings: SarifFindingInput[];
}

function severityToSarifLevel(severity: McpshieldSeverity): 'error' | 'warning' | 'note' {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

function stableHash(value: unknown): string {
  const json = JSON.stringify(value);
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 8);
}

function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function generateSarifReport(options: {
  toolVersion: string;
  artifacts: SarifArtifactInput[];
  lockfileUri?: string;
  informationUri?: string;
  generatedAt?: string;
}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const lockfileUri = options.lockfileUri ?? 'mcp.lock.json';
  const informationUri = options.informationUri ?? 'https://github.com/kellyclaudeai/mcpshield';

  const packageList = options.artifacts
    .map((a) => `${a.namespace}@${a.version}`)
    .sort();

  const timestampForId = generatedAt.replace(/[:.]/g, '-');
  const automationHash = stableHash(packageList);
  const automationId = `mcpshield/scan/${timestampForId}-${automationHash}`;

  const rulesById = new Map<string, any>();
  const results: any[] = [];

  for (const artifact of options.artifacts) {
    for (const finding of artifact.findings) {
      if (!rulesById.has(finding.ruleId)) {
        rulesById.set(finding.ruleId, {
          id: finding.ruleId,
          name: finding.ruleId,
          shortDescription: { text: finding.category },
          fullDescription: { text: `${finding.ruleId}: ${finding.category}` },
          help: { text: finding.message },
        });
      }

      results.push({
        ruleId: finding.ruleId,
        level: severityToSarifLevel(finding.severity),
        message: {
          text: `[${artifact.namespace}@${artifact.version}] ${finding.message}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: lockfileUri },
              region: { startLine: 1 },
            },
          },
        ],
        fingerprints: {
          'mcpshield/v1': fingerprint(
            `${artifact.namespace}@${artifact.version}|${finding.ruleId}|${finding.message}`
          ),
        },
        properties: {
          namespace: artifact.namespace,
          version: artifact.version,
          category: finding.category,
          severity: finding.severity,
        },
      });
    }
  }

  const sarifArtifacts = [
    { location: { uri: lockfileUri } },
    ...packageList.map((pkg) => ({ location: { uri: `mcpshield://artifact/${pkg}` } })),
  ];

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'MCPShield',
            version: options.toolVersion,
            informationUri,
            rules: Array.from(rulesById.values()).sort((a, b) => a.id.localeCompare(b.id)),
          },
        },
        automationDetails: { id: automationId },
        artifacts: sarifArtifacts,
        results,
      },
    ],
  };
}
