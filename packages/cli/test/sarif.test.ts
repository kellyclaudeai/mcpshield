import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSarifReport } from '../src/sarif.js';

describe('SARIF', () => {
  it('should generate a SARIF v2.1.0 report', () => {
    const report = generateSarifReport({
      toolVersion: '0.1.0',
      generatedAt: '2026-02-05T00:00:00.000Z',
      artifacts: [
        {
          namespace: 'io.github.example/server',
          version: '1.2.3',
          findings: [
            { ruleId: 'CODE_EVAL', severity: 'high', category: 'code-pattern', message: 'Use of eval() detected' },
            { ruleId: 'DEP_UNRESOLVED_SPEC', severity: 'medium', category: 'dependencies', message: 'Unresolved spec' },
          ],
        },
      ],
      lockfileUri: 'mcp.lock.json',
    });

    assert.equal(report.version, '2.1.0');
    assert.ok(typeof report.$schema === 'string');
    assert.equal(report.runs.length, 1);

    const run = report.runs[0];
    assert.equal(run.tool.driver.name, 'MCPShield');
    assert.equal(run.tool.driver.version, '0.1.0');
    assert.ok(run.automationDetails?.id);

    assert.equal(run.results.length, 2);
    assert.equal(run.results[0].locations[0].physicalLocation.artifactLocation.uri, 'mcp.lock.json');

    // Severity mapping
    const levels = run.results.map((r: any) => r.level).sort();
    assert.deepEqual(levels, ['error', 'warning']);
  });
});

