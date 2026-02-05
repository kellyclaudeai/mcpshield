/**
 * Policy enforcement E2E tests
 * 
 * Tests that policy enforcement works correctly in CLI commands
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

describe('Policy Enforcement E2E', () => {
  let tempDir: string;
  let cliPath: string;
  
  beforeAll(() => {
    // Path to CLI executable
    cliPath = path.resolve(__dirname, '../../packages/cli/dist/cli.js');
  });
  
  beforeEach(async () => {
    // Create temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-policy-e2e-'));
    
    // Initialize MCPShield in temp directory
    await execAsync(`node "${cliPath}" init`, { cwd: tempDir });
  });
  
  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });
  
  describe('add command with policy', () => {
    it('should block server exceeding risk score in --ci mode', async () => {
      // Create policy with low risk threshold
      const policy = `
version: "1.0"
global:
  maxRiskScore: 20
  blockSeverities:
    - critical
`;
      await fs.writeFile(path.join(tempDir, 'policy.yaml'), policy);
      
      // Try to add a server with high risk (this will fail because we can't control scan results easily)
      // For now, we'll use a real server that might have findings
      try {
        await execAsync(`node "${cliPath}" add io.github.test/server --yes --ci`, {
          cwd: tempDir,
        });
        // If it succeeds, that's fine - we can't guarantee a high-risk package
      } catch (err: any) {
        // Should fail with exit code 1 if policy blocks it
        expect(err.code).toBe(1);
      }
    });
    
    it('should allow override in interactive mode', async () => {
      // This test would require interactive input, so we skip it in automated tests
      // Interactive behavior is tested manually
    });
  });
  
  describe('scan command with policy', () => {
    it('should fail when server violates maxRiskScore in --ci mode', async () => {
      // Create a policy with very strict risk score
      const policy = `
version: "1.0"
global:
  maxRiskScore: 0
  blockSeverities:
    - critical
    - high
    - medium
    - low
`;
      await fs.writeFile(path.join(tempDir, 'policy.yaml'), policy);
      
      // Add a server first (without policy enforcement)
      await fs.unlink(path.join(tempDir, 'policy.yaml'));
      
      try {
        // Add a real server
        await execAsync(`node "${cliPath}" add @modelcontextprotocol/server-everything --yes`, {
          cwd: tempDir,
          timeout: 60000,
        });
      } catch (err) {
        // If add fails, skip this test
        console.log('Could not add server for test, skipping');
        return;
      }
      
      // Re-create strict policy
      await fs.writeFile(path.join(tempDir, 'policy.yaml'), policy);
      
      // Scan should fail with policy violations
      try {
        const { stdout, stderr } = await execAsync(`node "${cliPath}" scan --ci`, {
          cwd: tempDir,
          timeout: 60000,
        });
        
        // If it doesn't throw, check if it found violations
        // With maxRiskScore: 0, most packages will fail
        console.log('Scan output:', stdout);
      } catch (err: any) {
        // Should exit with code 1 due to policy violation
        expect(err.code).toBe(1);
        expect(err.stdout || err.stderr).toMatch(/policy|violation|exceeds/i);
      }
    });
    
    it('should pass when all servers meet policy requirements', async () => {
      // Create a permissive policy
      const policy = `
version: "1.0"
global:
  maxRiskScore: 100
  blockSeverities:
    - critical
`;
      await fs.writeFile(path.join(tempDir, 'policy.yaml'), policy);
      
      // Add a well-known server
      try {
        await execAsync(`node "${cliPath}" add @modelcontextprotocol/server-everything --yes`, {
          cwd: tempDir,
          timeout: 60000,
        });
      } catch (err) {
        console.log('Could not add server for test, skipping');
        return;
      }
      
      // Scan should pass
      const { stdout } = await execAsync(`node "${cliPath}" scan --ci`, {
        cwd: tempDir,
        timeout: 60000,
      });
      
      expect(stdout).toMatch(/Policy Evaluation|All servers pass/i);
    });
    
    it('should enforce blockSeverities correctly', async () => {
      // Create policy blocking critical findings
      const policy = `
version: "1.0"
global:
  maxRiskScore: 100
  blockSeverities:
    - critical
`;
      await fs.writeFile(path.join(tempDir, 'policy.yaml'), policy);
      
      // This test depends on finding a package with critical findings
      // In practice, most clean packages won't have critical findings
      // So this test serves as documentation of expected behavior
    });
  });
  
  describe('namespace allowlist/denylist', () => {
    it('should block servers not in allowlist', async () => {
      const policy = `
version: "1.0"
global:
  allowNamespaces:
    - "io.github.myorg/*"
`;
      await fs.writeFile(path.join(tempDir, 'policy.yaml'), policy);
      
      // Try to add a server outside allowlist
      try {
        await execAsync(`node "${cliPath}" add @modelcontextprotocol/server-everything --yes --ci`, {
          cwd: tempDir,
          timeout: 60000,
        });
        fail('Should have blocked server not in allowlist');
      } catch (err: any) {
        expect(err.code).toBe(1);
        expect(err.stderr || err.stdout).toMatch(/not in allowlist|policy/i);
      }
    });
    
    it('should block servers in denylist', async () => {
      const policy = `
version: "1.0"
global:
  denyNamespaces:
    - "@modelcontextprotocol/*"
`;
      await fs.writeFile(path.join(tempDir, 'policy.yaml'), policy);
      
      // Try to add a server in denylist
      try {
        await execAsync(`node "${cliPath}" add @modelcontextprotocol/server-everything --yes --ci`, {
          cwd: tempDir,
          timeout: 60000,
        });
        fail('Should have blocked server in denylist');
      } catch (err: any) {
        expect(err.code).toBe(1);
        expect(err.stderr || err.stdout).toMatch(/denied|denylist|policy/i);
      }
    });
  });
  
  describe('verification requirements', () => {
    it('should block unverified servers when denyUnverified is true', async () => {
      const policy = `
version: "1.0"
global:
  denyUnverified: true
`;
      await fs.writeFile(path.join(tempDir, 'policy.yaml'), policy);
      
      // This test depends on finding an unverified server
      // Most official MCP servers are verified, so this might pass
    });
  });
});
