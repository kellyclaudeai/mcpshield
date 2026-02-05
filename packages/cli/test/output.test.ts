/**
 * Unit tests for output module
 * Tests JSON output, stable ordering, exit codes, and error handling
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  setGlobalOptions,
  getGlobalOptions,
  writeJson,
  logInfo,
  logWarn,
  logError,
  UserError,
  UnexpectedError,
  EXIT_SUCCESS,
  EXIT_USER_ERROR,
  EXIT_UNEXPECTED,
} from '../src/output.js';

// Capture console output for testing
let stdoutBuffer: string[] = [];
let stderrBuffer: string[] = [];
let originalStdoutWrite: any;
let originalStderrWrite: any;

function captureOutput() {
  stdoutBuffer = [];
  stderrBuffer = [];
  
  originalStdoutWrite = process.stdout.write;
  originalStderrWrite = process.stderr.write;
  
  process.stdout.write = ((chunk: any) => {
    stdoutBuffer.push(chunk.toString());
    return true;
  }) as any;
  
  process.stderr.write = ((chunk: any) => {
    stderrBuffer.push(chunk.toString());
    return true;
  }) as any;
}

function restoreOutput() {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
}

describe('output module', () => {
  beforeEach(() => {
    // Reset to default options
    setGlobalOptions({ color: true });
    captureOutput();
  });
  
  afterEach(() => {
    restoreOutput();
  });

  describe('setGlobalOptions', () => {
    it('should set and retrieve global options', () => {
      setGlobalOptions({ json: true, ci: true, quiet: true, color: false });
      const opts = getGlobalOptions();
      
      assert.strictEqual(opts.json, true);
      assert.strictEqual(opts.ci, true);
      assert.strictEqual(opts.quiet, true);
      assert.strictEqual(opts.color, false);
    });
  });

  describe('writeJson', () => {
    it('should output JSON in --json mode', () => {
      setGlobalOptions({ json: true });
      
      const data = { name: 'test', version: '1.0.0' };
      writeJson(data);
      
      const output = stdoutBuffer.join('');
      assert.ok(output.includes('"name": "test"'));
      assert.ok(output.includes('"version": "1.0.0"'));
    });

    it('should not output JSON in normal mode', () => {
      setGlobalOptions({ json: false });
      
      writeJson({ name: 'test' });
      
      const output = stdoutBuffer.join('');
      assert.strictEqual(output, '');
    });

    it('should produce stable key ordering', () => {
      setGlobalOptions({ json: true });
      
      // Keys intentionally out of order
      const data = {
        zebra: 1,
        apple: 2,
        middle: 3,
        banana: 4,
      };
      
      writeJson(data);
      
      const output = stdoutBuffer.join('');
      const parsed = JSON.parse(output);
      const keys = Object.keys(parsed);
      
      // Should be alphabetically sorted
      assert.deepStrictEqual(keys, ['apple', 'banana', 'middle', 'zebra']);
    });

    it('should sort nested object keys', () => {
      setGlobalOptions({ json: true });
      
      const data = {
        outer: {
          zebra: 1,
          apple: 2,
        },
        inner: {
          delta: 3,
          charlie: 4,
        },
      };
      
      writeJson(data);
      
      const output = stdoutBuffer.join('');
      const parsed = JSON.parse(output);
      
      assert.deepStrictEqual(Object.keys(parsed), ['inner', 'outer']);
      assert.deepStrictEqual(Object.keys(parsed.inner), ['charlie', 'delta']);
      assert.deepStrictEqual(Object.keys(parsed.outer), ['apple', 'zebra']);
    });

    it('should preserve array order', () => {
      setGlobalOptions({ json: true });
      
      const data = {
        items: [3, 1, 2],
      };
      
      writeJson(data);
      
      const output = stdoutBuffer.join('');
      const parsed = JSON.parse(output);
      
      assert.deepStrictEqual(parsed.items, [3, 1, 2]);
    });

    it('should handle null and undefined values', () => {
      setGlobalOptions({ json: true });
      
      const data = {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: 'test',
      };
      
      writeJson(data);
      
      const output = stdoutBuffer.join('');
      const parsed = JSON.parse(output);
      
      assert.strictEqual(parsed.nullValue, null);
      assert.strictEqual(parsed.undefinedValue, undefined);
      assert.strictEqual(parsed.normalValue, 'test');
    });

    it('should handle complex nested structures', () => {
      setGlobalOptions({ json: true });
      
      const data = {
        servers: [
          {
            name: 'server-b',
            packages: ['pkg-2', 'pkg-1'],
            metadata: { verified: true, status: 'ok' },
          },
          {
            name: 'server-a',
            packages: ['pkg-1'],
            metadata: { verified: false, status: 'pending' },
          },
        ],
        count: 2,
      };
      
      writeJson(data);
      
      const output = stdoutBuffer.join('');
      const parsed = JSON.parse(output);
      
      // Root keys sorted
      assert.deepStrictEqual(Object.keys(parsed), ['count', 'servers']);
      
      // Array order preserved
      assert.strictEqual(parsed.servers[0].name, 'server-b');
      assert.strictEqual(parsed.servers[1].name, 'server-a');
      
      // Nested object keys sorted
      assert.deepStrictEqual(Object.keys(parsed.servers[0]), ['metadata', 'name', 'packages']);
      assert.deepStrictEqual(Object.keys(parsed.servers[0].metadata), ['status', 'verified']);
    });
  });

  describe('logInfo', () => {
    it('should output in normal mode', () => {
      setGlobalOptions({ json: false, quiet: false });
      
      logInfo('test message');
      
      const output = stdoutBuffer.join('');
      assert.ok(output.includes('test message'));
    });

    it('should suppress output in --json mode', () => {
      setGlobalOptions({ json: true });
      
      logInfo('test message');
      
      const output = stdoutBuffer.join('');
      assert.strictEqual(output, '');
    });

    it('should suppress output in --quiet mode', () => {
      setGlobalOptions({ quiet: true });
      
      logInfo('test message');
      
      const output = stdoutBuffer.join('');
      assert.strictEqual(output, '');
    });
  });

  describe('logWarn', () => {
    it('should output in normal mode', () => {
      setGlobalOptions({ json: false });
      
      logWarn('warning message');
      
      const output = stderrBuffer.join('');
      assert.ok(output.includes('warning message'));
    });

    it('should suppress output in --json mode', () => {
      setGlobalOptions({ json: true });
      
      logWarn('warning message');
      
      const output = stderrBuffer.join('');
      assert.strictEqual(output, '');
    });

    it('should suppress output in --quiet mode', () => {
      setGlobalOptions({ quiet: true });
      
      logWarn('warning message');
      
      const output = stderrBuffer.join('');
      assert.strictEqual(output, '');
    });
  });

  describe('logError', () => {
    it('should output in normal mode', () => {
      setGlobalOptions({ json: false });
      
      logError('error message');
      
      const output = stderrBuffer.join('');
      assert.ok(output.includes('error message'));
    });

    it('should output in --json mode (errors always shown)', () => {
      setGlobalOptions({ json: true });
      
      logError('error message');
      
      const output = stderrBuffer.join('');
      assert.ok(output.includes('error message'));
    });

    it('should output in --quiet mode (errors always shown)', () => {
      setGlobalOptions({ quiet: true });
      
      logError('error message');
      
      const output = stderrBuffer.join('');
      assert.ok(output.includes('error message'));
    });
  });

  describe('Error classes', () => {
    it('should create UserError with correct name', () => {
      const error = new UserError('user mistake');
      
      assert.strictEqual(error.name, 'UserError');
      assert.strictEqual(error.message, 'user mistake');
    });

    it('should create UnexpectedError with correct name', () => {
      const error = new UnexpectedError('something broke');
      
      assert.strictEqual(error.name, 'UnexpectedError');
      assert.strictEqual(error.message, 'something broke');
    });

    it('should store cause in UnexpectedError', () => {
      const cause = new Error('root cause');
      const error = new UnexpectedError('wrapped error', cause);
      
      assert.strictEqual(error.cause, cause);
    });
  });

  describe('Exit codes', () => {
    it('should define correct exit code constants', () => {
      assert.strictEqual(EXIT_SUCCESS, 0);
      assert.strictEqual(EXIT_USER_ERROR, 2);
      assert.strictEqual(EXIT_UNEXPECTED, 3);
    });
  });

  describe('JSON snapshot - add command result', () => {
    it('should produce stable JSON output for add command result', () => {
      setGlobalOptions({ json: true });
      
      const result = {
        command: 'add',
        success: true,
        server: {
          namespace: 'io.github.example/test-server',
          version: '1.0.0',
          verified: true,
          verificationMethod: 'github-namespace',
          verifiedOwner: 'example',
          artifacts: [
            {
              type: 'npm',
              url: 'https://registry.npmjs.org/@example/server/-/server-1.0.0.tgz',
              digest: 'sha256:abc123def456',
              size: 12345,
            },
          ],
          riskScore: 15,
          verdict: 'clean',
        },
      };
      
      writeJson(result);
      
      const output = stdoutBuffer.join('');
      const parsed = JSON.parse(output);
      
      // Verify structure and ordering
      const rootKeys = Object.keys(parsed);
      assert.deepStrictEqual(rootKeys, ['command', 'server', 'success']);
      
      const serverKeys = Object.keys(parsed.server);
      assert.deepStrictEqual(serverKeys, [
        'artifacts',
        'namespace',
        'riskScore',
        'verdict',
        'verificationMethod',
        'verified',
        'verifiedOwner',
        'version',
      ]);
    });
  });

  describe('JSON snapshot - verify command result', () => {
    it('should produce stable JSON output for verify command result', () => {
      setGlobalOptions({ json: true });
      
      const result = {
        command: 'verify',
        success: true,
        verified: 2,
        failed: 0,
        total: 2,
        servers: [
          {
            namespace: 'io.github.example/server-b',
            version: '2.0.0',
            status: 'ok',
            verified: true,
          },
          {
            namespace: 'io.github.example/server-a',
            version: '1.0.0',
            status: 'ok',
            verified: true,
          },
        ],
      };
      
      writeJson(result);
      
      const output = stdoutBuffer.join('');
      const parsed = JSON.parse(output);
      
      // Verify root keys are sorted
      const rootKeys = Object.keys(parsed);
      assert.deepStrictEqual(rootKeys, ['command', 'failed', 'servers', 'success', 'total', 'verified']);
      
      // Verify servers array order is preserved (not sorted)
      assert.strictEqual(parsed.servers[0].namespace, 'io.github.example/server-b');
      assert.strictEqual(parsed.servers[1].namespace, 'io.github.example/server-a');
      
      // Verify nested object keys are sorted
      const serverKeys = Object.keys(parsed.servers[0]);
      assert.deepStrictEqual(serverKeys, ['namespace', 'status', 'verified', 'version']);
    });
  });

  describe('JSON snapshot - scan command result', () => {
    it('should produce stable JSON output for scan command result', () => {
      setGlobalOptions({ json: true });
      
      const result = {
        command: 'scan',
        success: true,
        scanned: 2,
        findings: [
          {
            namespace: 'io.github.example/server-a',
            verdict: 'clean',
            riskScore: 10,
            findings: [],
          },
          {
            namespace: 'io.github.example/server-b',
            verdict: 'warning',
            riskScore: 45,
            findings: [
              {
                category: 'network-access',
                severity: 'medium',
                message: 'Package makes network requests',
              },
              {
                category: 'file-access',
                severity: 'low',
                message: 'Accesses filesystem',
              },
            ],
          },
        ],
      };
      
      writeJson(result);
      
      const output = stdoutBuffer.join('');
      const parsed = JSON.parse(output);
      
      // Verify root keys are sorted
      assert.deepStrictEqual(Object.keys(parsed), ['command', 'findings', 'scanned', 'success']);
      
      // Verify findings array order preserved
      assert.strictEqual(parsed.findings[0].namespace, 'io.github.example/server-a');
      assert.strictEqual(parsed.findings[1].namespace, 'io.github.example/server-b');
      
      // Verify nested finding keys are sorted
      const findingKeys = Object.keys(parsed.findings[1].findings[0]);
      assert.deepStrictEqual(findingKeys, ['category', 'message', 'severity']);
    });
  });
});
