/**
 * Policy tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  Policy,
  loadPolicy,
  validatePolicy,
  evaluateAdd,
  evaluateScan,
  getDefaultPolicy,
} from '../src/policy.js';
import { Finding } from '../src/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Policy', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-policy-test-'));
  });
  
  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });
  
  describe('loadPolicy', () => {
    it('should load valid policy from YAML', async () => {
      const policyYaml = `
version: "1.0"
global:
  maxRiskScore: 30
  blockSeverities:
    - critical
    - high
`;
      const policyPath = path.join(tempDir, 'policy.yaml');
      await fs.writeFile(policyPath, policyYaml);
      
      const policy = await loadPolicy(policyPath);
      
      assert.ok(policy);
      assert.strictEqual(policy?.version, '1.0');
      assert.strictEqual(policy?.global?.maxRiskScore, 30);
      assert.deepStrictEqual(policy?.global?.blockSeverities, ['critical', 'high']);
    });
    
    it('should return null if policy file does not exist', async () => {
      const policy = await loadPolicy(path.join(tempDir, 'nonexistent.yaml'));
      assert.strictEqual(policy, null);
    });
    
    it('should throw on invalid YAML', async () => {
      const policyPath = path.join(tempDir, 'invalid.yaml');
      await fs.writeFile(policyPath, 'invalid: yaml: content: [[[');
      
      await assert.rejects(loadPolicy(policyPath));
    });
  });
  
  describe('validatePolicy', () => {
    it('should validate correct policy', async () => {
      const policy: Policy = {
        version: '1.0',
        global: {
          maxRiskScore: 50,
          blockSeverities: ['critical'],
        },
      };
      
      const result = await validatePolicy(policy);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors, undefined);
    });
    
    it('should reject policy with invalid version', async () => {
      const policy: any = {
        version: '2.0',
        global: {},
      };
      
      const result = await validatePolicy(policy);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors);
    });
  });
  
  describe('evaluateAdd', () => {
    it('should allow server when no policy exists', () => {
      const result = evaluateAdd({
        serverName: 'io.github.user/server',
        verified: false,
        riskScore: 80,
        findings: [],
        policy: null,
      });
      
      assert.strictEqual(result.allowed, true);
      assert.strictEqual(result.reasons.length, 0);
    });
    
    it('should block server exceeding risk score threshold', () => {
      const policy: Policy = {
        version: '1.0',
        global: {
          maxRiskScore: 30,
        },
      };
      
      const result = evaluateAdd({
        serverName: 'io.github.user/server',
        verified: true,
        riskScore: 50,
        findings: [],
        policy,
      });
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reasons.some(r => r.includes('Risk score 50 exceeds maximum allowed 30')));
    });
    
    it('should block unverified server when denyUnverified is true', () => {
      const policy: Policy = {
        version: '1.0',
        global: {
          denyUnverified: true,
        },
      };
      
      const result = evaluateAdd({
        serverName: 'io.github.user/server',
        verified: false,
        riskScore: 10,
        findings: [],
        policy,
      });
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reasons.length > 0);
    });
    
    it('should block server with critical findings when configured', () => {
      const policy: Policy = {
        version: '1.0',
        global: {
          blockSeverities: ['critical', 'high'],
        },
      };
      
      const findings: Finding[] = [
        {
          severity: 'critical',
          category: 'malware',
          message: 'Detected malicious code',
        },
      ];
      
      const result = evaluateAdd({
        serverName: 'io.github.user/server',
        verified: true,
        riskScore: 20,
        findings,
        policy,
      });
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reasons.length > 0);
    });
    
    it('should allow server in allowlist', () => {
      const policy: Policy = {
        version: '1.0',
        global: {
          allowNamespaces: ['io.github.myorg/*'],
        },
      };
      
      const result = evaluateAdd({
        serverName: 'io.github.myorg/server',
        verified: true,
        riskScore: 20,
        findings: [],
        policy,
      });
      
      assert.strictEqual(result.allowed, true);
    });
    
    it('should block server not in allowlist', () => {
      const policy: Policy = {
        version: '1.0',
        global: {
          allowNamespaces: ['io.github.myorg/*'],
        },
      };
      
      const result = evaluateAdd({
        serverName: 'io.github.other/server',
        verified: true,
        riskScore: 20,
        findings: [],
        policy,
      });
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reasons.length > 0);
    });
  });
  
  describe('evaluateScan', () => {
    it('should allow scan results when no policy exists', () => {
      const result = evaluateScan({
        serverName: 'io.github.user/server',
        riskScore: 80,
        findings: [],
        verified: false,
        policy: null,
      });
      
      assert.strictEqual(result.allowed, true);
    });
    
    it('should block scan results exceeding risk score', () => {
      const policy: Policy = {
        version: '1.0',
        global: {
          maxRiskScore: 50,
        },
      };
      
      const result = evaluateScan({
        serverName: 'io.github.user/server',
        riskScore: 99,
        findings: [],
        verified: true,
        policy,
      });
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reasons.some(r => r.includes('Risk score 99 exceeds policy maximum 50')));
    });
    
    it('should block scan with blocked severity findings', () => {
      const policy: Policy = {
        version: '1.0',
        global: {
          blockSeverities: ['critical'],
        },
      };
      
      const findings: Finding[] = [
        {
          severity: 'critical',
          category: 'security',
          message: 'Critical security issue',
        },
      ];
      
      const result = evaluateScan({
        serverName: 'io.github.user/server',
        riskScore: 30,
        findings,
        verified: true,
        policy,
      });
      
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reasons.length > 0);
    });
  });
  
  describe('getDefaultPolicy', () => {
    it('should return valid default policy', async () => {
      const policy = getDefaultPolicy();
      
      assert.strictEqual(policy.version, '1.0');
      assert.strictEqual(policy.global?.maxRiskScore, 50);
      assert.ok(policy.global?.blockSeverities?.includes('critical'));
      
      // Validate against schema
      const validation = await validatePolicy(policy);
      assert.strictEqual(validation.valid, true);
    });
  });
});
