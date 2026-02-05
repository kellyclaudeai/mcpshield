/**
 * mcp-shield scan
 * 
 * Scan all servers in the lockfile for security issues
 */

import chalk from 'chalk';
import {
  LockfileManager,
  LockfileEntry,
  NpmResolver,
  CacheManager,
} from '@mcpshield/core';
import { BasicScanner } from '@mcpshield/scanner';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export async function scanCommand(): Promise<void> {
  console.log(chalk.blue('\n🔍 MCPShield Security Scan\n'));
  
  const lockfileManager = new LockfileManager();
  const exists = await lockfileManager.exists();
  
  if (!exists) {
    console.error(chalk.red('❌ No mcp.lock.json found. Run `mcp-shield init` first.'));
    process.exit(1);
  }
  
  const lockfile = await lockfileManager.read();
  const serverCount = Object.keys(lockfile.servers).length;
  
  if (serverCount === 0) {
    console.log(chalk.yellow('⚠ No servers in lockfile. Run `mcp-shield add <server>` to add servers.'));
    return;
  }
  
  console.log(chalk.dim(`Found ${serverCount} server(s) in lockfile\n`));
  
  const scanner = new BasicScanner();
  const cache = new CacheManager();
  const results: Array<{ namespace: string; result: any }> = [];
  
  for (const [namespace, entry] of Object.entries(lockfile.servers)) {
    const typedEntry = entry as LockfileEntry;
    console.log(chalk.bold(`\nScanning: ${namespace}@${typedEntry.version}`));
    
    if (!typedEntry.artifacts || typedEntry.artifacts.length === 0) {
      console.log(chalk.yellow('  ⚠ No artifacts to scan\n'));
      continue;
    }
    
    for (const artifact of typedEntry.artifacts) {
      if (artifact.type !== 'npm') {
        console.log(chalk.dim(`  → Skipping ${artifact.type} artifact`));
        continue;
      }
      
      try {
        // Get artifact from cache or download
        let artifactPath = await cache.get(artifact.digest);
        
        if (!artifactPath) {
          console.log(chalk.dim('  → Downloading artifact...'));
          const resolver = new NpmResolver();
          const tempPath = path.join(os.tmpdir(), `mcpshield-scan-${Date.now()}.tgz`);
          await resolver.download({ url: artifact.url, type: 'npm' }, tempPath);
          await cache.put(artifact.digest, tempPath);
          artifactPath = await cache.get(artifact.digest);
        }
        
        if (!artifactPath) {
          throw new Error('Failed to get artifact from cache');
        }
        
        // Read artifact and scan
        console.log(chalk.dim('  → Scanning artifact...'));
        const buffer = await fs.readFile(artifactPath);
        
        const scanResult = await scanner.scanPackage(
          { type: 'npm', identifier: namespace, version: typedEntry.version },
          buffer
        );
        
        results.push({ namespace, result: scanResult });
        
        // Display results
        console.log(`  ${formatVerdict(scanResult.verdict)} Risk Score: ${scanResult.riskScore}/100`);
        
        if (scanResult.findings.length > 0) {
          console.log(chalk.dim(`  → ${scanResult.findings.length} finding(s):`));
          
          for (const finding of scanResult.findings.slice(0, 5)) {
            const icon = getSeverityIcon(finding.severity);
            console.log(`     ${icon} ${chalk.dim(finding.category)}: ${finding.message}`);
          }
          
          if (scanResult.findings.length > 5) {
            console.log(chalk.dim(`     ... and ${scanResult.findings.length - 5} more`));
          }
        } else {
          console.log(chalk.green('  ✓ No issues found'));
        }
        
      } catch (err: any) {
        console.error(chalk.red(`  ✗ Scan failed: ${err.message}`));
      }
    }
  }
  
  // Summary
  console.log(chalk.bold('\n' + '─'.repeat(60)));
  console.log(chalk.bold('\n📊 Scan Summary\n'));
  
  const clean = results.filter(r => r.result.verdict === 'clean').length;
  const warning = results.filter(r => r.result.verdict === 'warning').length;
  const suspicious = results.filter(r => r.result.verdict === 'suspicious').length;
  const malicious = results.filter(r => r.result.verdict === 'malicious').length;
  
  console.log(`  ${chalk.green('✓')} Clean: ${clean}`);
  console.log(`  ${chalk.yellow('⚠')} Warning: ${warning}`);
  console.log(`  ${chalk.red('⚠')} Suspicious: ${suspicious}`);
  console.log(`  ${chalk.red('✗')} Malicious: ${malicious}`);
  
  if (malicious > 0) {
    console.log(chalk.red('\n❌ MALICIOUS PACKAGES DETECTED!'));
    console.log(chalk.red('   Review the findings above and remove these packages immediately.'));
  } else if (suspicious > 0) {
    console.log(chalk.yellow('\n⚠ Suspicious packages detected. Review carefully before use.'));
  } else if (warning > 0) {
    console.log(chalk.yellow('\n⚠ Some packages have warnings. Review recommended.'));
  } else {
    console.log(chalk.green('\n✅ All packages are clean!'));
  }
  
  console.log();
}

function formatVerdict(verdict: string): string {
  switch (verdict) {
    case 'clean':
      return chalk.green('✓ Clean');
    case 'warning':
      return chalk.yellow('⚠ Warning');
    case 'suspicious':
      return chalk.red('⚠ Suspicious');
    case 'malicious':
      return chalk.red('✗ Malicious');
    default:
      return chalk.gray('? Unknown');
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return chalk.red('●');
    case 'high':
      return chalk.red('●');
    case 'medium':
      return chalk.yellow('●');
    case 'low':
      return chalk.blue('●');
    default:
      return chalk.gray('●');
  }
}
