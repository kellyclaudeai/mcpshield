/**
 * Validates CLI JSON outputs against stable JSON schemas using AJV.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';

const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadSchema(relPathFromRepoRoot: string): Promise<any> {
  const repoRoot = path.resolve(__dirname, '../../..');
  const schemaPath = path.join(repoRoot, relPathFromRepoRoot);
  const raw = await fs.readFile(schemaPath, 'utf-8');
  return JSON.parse(raw);
}

describe('CLI JSON Schemas', () => {
  it('verify output validates', async () => {
    const schema = await loadSchema('schemas/cli/verify-output.schema.json');
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const digest = `sha512-${Buffer.from('hello').toString('base64')}`;

    const sample = {
      tool: 'mcpshield',
      toolVersion: '0.1.0',
      command: 'verify',
      generatedAt: new Date().toISOString(),
      summary: { servers: 1, artifacts: 1, ok: 1, fixed: 0, drift: 0, errors: 0, skipped: 0 },
      results: [
        {
          namespace: 'io.github.example/server',
          version: '1.2.3',
          publisherVerified: true,
          integrityOk: true,
          artifacts: [
            {
              type: 'npm',
              url: 'https://registry.npmjs.org/example/-/example-1.2.3.tgz',
              expectedDigest: digest,
              actualDigest: digest,
              status: 'ok',
              source: 'cache',
              error: null,
            },
          ],
          errors: [],
        },
      ],
      errors: [],
    };

    const ok = validate(sample);
    assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
  });

  it('scan output validates', async () => {
    const schema = await loadSchema('schemas/cli/scan-output.schema.json');
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const digest = `sha512-${Buffer.from('hello').toString('base64')}`;

    const sample = {
      tool: 'mcpshield',
      toolVersion: '0.1.0',
      command: 'scan',
      generatedAt: new Date().toISOString(),
      summary: {
        servers: 1,
        artifacts: 1,
        verdicts: { clean: 1, warning: 0, suspicious: 0, malicious: 0, unknown: 0 },
        policy: { enforced: true, blocked: false, reasons: [] },
      },
      results: [
        {
          namespace: 'io.github.example/server',
          version: '1.2.3',
          artifacts: [
            {
              type: 'npm',
              digest,
              verdict: 'clean',
              riskScore: 0,
              findings: [],
              vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
            },
          ],
          policy: { blocked: false, reasons: [] },
          errors: [],
        },
      ],
      errors: [],
    };

    const ok = validate(sample);
    assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
  });

  it('add output validates', async () => {
    const schema = await loadSchema('schemas/cli/add-output.schema.json');
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const sample = {
      tool: 'mcpshield',
      toolVersion: '0.1.0',
      command: 'add',
      generatedAt: new Date().toISOString(),
      input: { namespace: 'io.github.example/server', yes: true, ci: true },
      result: {
        added: false,
        entryWritten: false,
        policy: {
          blocked: true,
          reasons: [{ code: 'MAX_RISK_SCORE', message: 'Risk score 99 exceeds maximum allowed 50' }],
        },
      },
      errors: [],
    };

    const ok = validate(sample);
    assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
  });

  it('doctor output validates', async () => {
    const schema = await loadSchema('schemas/cli/doctor-output.schema.json');
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const sample = {
      version: '0.1.0',
      node: 'v22.0.0',
      platform: { type: 'darwin', release: '23.0.0', arch: 'arm64' },
      paths: {
        cwd: '~/project',
        cacheDir: '~/Library/Caches/mcpshield',
        lockfile: '~/project/mcp.lock.json',
        policyFile: '~/project/policy.yaml',
      },
      files: { lockfileExists: true, policyExists: true },
      registry: { url: 'https://registry.modelcontextprotocol.io', dnsResolved: true, httpsReachable: true },
      timestamp: new Date().toISOString(),
    };

    const ok = validate(sample);
    assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
  });

  it('search output validates', async () => {
    const schema = await loadSchema('schemas/cli/search-output.schema.json');
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const sample = {
      tool: 'mcpshield',
      toolVersion: '0.1.0',
      command: 'search',
      generatedAt: new Date().toISOString(),
      input: { query: 'context7', type: 'npm', limit: 20, cursor: null, allVersions: false },
      summary: { returned: 1, total: 4, nextCursor: null },
      results: [
        {
          name: 'io.github.upstash/context7',
          version: '1.0.31',
          description: 'Context7 MCP server',
          repository: 'https://github.com/upstash/context7',
          packages: [{ type: 'npm', identifier: '@upstash/context7', version: '1.0.31', runtimeHint: 'npx' }],
          remotes: [],
          meta: { status: 'active', isLatest: true, publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        },
      ],
      errors: [],
    };

    const ok = validate(sample);
    assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
  });
});
