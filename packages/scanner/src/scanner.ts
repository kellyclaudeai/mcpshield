/**
 * Security scanner implementation
 * 
 * Analyzes packages for security risks including:
 * - Dependency vulnerabilities
 * - Typosquatting attempts
 * - Suspicious code patterns
 * - Risk scoring
 */

import { Package, Finding, DependencyAnalysis } from '@mcpshield/core';
import { SecurityScanner, ScanResult } from './types.js';
import * as tar from 'tar';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import levenshtein from 'fast-levenshtein';

/**
 * Suspicious code patterns to detect
 */
const SUSPICIOUS_PATTERNS = [
  { pattern: /eval\s*\(/gi, severity: 'high' as const, message: 'Use of eval() detected' },
  { pattern: /Function\s*\(/gi, severity: 'high' as const, message: 'Dynamic Function() construction' },
  { pattern: /exec\s*\(/gi, severity: 'medium' as const, message: 'Shell command execution (exec)' },
  { pattern: /spawn\s*\(/gi, severity: 'medium' as const, message: 'Process spawning detected' },
  { pattern: /child_process/gi, severity: 'medium' as const, message: 'Child process usage' },
  { pattern: /\.downloadFile/gi, severity: 'medium' as const, message: 'File download detected' },
  { pattern: /https?:\/\/[^\s'"]+/gi, severity: 'low' as const, message: 'Hardcoded URL' },
  { pattern: /Buffer\.from\([^)]*,\s*['"]base64['"]\)/gi, severity: 'low' as const, message: 'Base64 decoding' },
  { pattern: /atob\(/gi, severity: 'low' as const, message: 'Base64 decoding (atob)' },
  { pattern: /process\.env/gi, severity: 'info' as const, message: 'Environment variable access' },
];

/**
 * Popular package names to check for typosquatting
 */
const POPULAR_PACKAGES = [
  'express', 'react', 'lodash', 'axios', 'webpack', 'typescript', 'eslint',
  'prettier', 'jest', 'mocha', 'chai', 'commander', 'chalk', 'inquirer',
  'moment', 'request', 'async', 'vue', 'angular', 'jquery', 'bootstrap'
];

export class BasicScanner implements SecurityScanner {
  /**
   * Scan a package for security issues
   */
  async scanPackage(pkg: Package, artifact: Buffer): Promise<ScanResult> {
    const findings: Finding[] = [];
    let riskScore = 0;
    
    try {
      // Extract and analyze based on package type
      if (pkg.type === 'npm') {
        const analysis = await this.scanNpmPackage(pkg, artifact);
        findings.push(...analysis.findings);
        riskScore = analysis.riskScore;
      } else if (pkg.type === 'pypi') {
        const analysis = await this.scanPyPIPackage(pkg, artifact);
        findings.push(...analysis.findings);
        riskScore = analysis.riskScore;
      } else {
        findings.push({
          severity: 'info',
          category: 'unsupported',
          message: `Scanning not yet implemented for ${pkg.type} packages`,
        });
      }
      
      // Calculate overall verdict
      const verdict = this.calculateVerdict(findings, riskScore);
      
      return {
        verdict,
        riskScore,
        findings,
      };
    } catch (err: any) {
      return {
        verdict: 'unknown',
        riskScore: 0,
        findings: [{
          severity: 'critical',
          category: 'scan-error',
          message: `Failed to scan package: ${err.message}`,
        }],
      };
    }
  }
  
  /**
   * Scan NPM package
   */
  private async scanNpmPackage(pkg: Package, artifact: Buffer): Promise<{ findings: Finding[]; riskScore: number }> {
    const findings: Finding[] = [];
    let riskScore = 0;
    
    // Check for typosquatting
    const typoResult = this.checkTyposquat(pkg.identifier);
    if (typoResult) {
      findings.push(typoResult.finding);
      riskScore += typoResult.riskScore;
    }
    
    // Extract tarball and scan contents
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-scan-'));
    const tarballPath = path.join(tempDir, 'package.tgz');
    
    try {
      await fs.writeFile(tarballPath, artifact);
      
      // Extract tarball
      await tar.extract({
        file: tarballPath,
        cwd: tempDir,
      });
      
      // Read package.json
      const packageJsonPath = path.join(tempDir, 'package', 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        
        // Analyze dependencies
        const depAnalysis = this.analyzeDependencies(packageJson);
        findings.push(...depAnalysis.findings);
        riskScore += depAnalysis.riskScore;
        
        // Check for suspicious scripts
        const scriptAnalysis = this.analyzeScripts(packageJson);
        findings.push(...scriptAnalysis.findings);
        riskScore += scriptAnalysis.riskScore;
      } catch (err) {
        findings.push({
          severity: 'medium',
          category: 'metadata',
          message: 'Could not read or parse package.json',
        });
        riskScore += 10;
      }
      
      // Scan all JavaScript files for suspicious patterns
      const codeAnalysis = await this.scanDirectory(tempDir);
      findings.push(...codeAnalysis.findings);
      riskScore += codeAnalysis.riskScore;
      
    } finally {
      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    
    return { findings, riskScore: Math.min(100, riskScore) };
  }
  
  /**
   * Scan PyPI package (simplified)
   */
  private async scanPyPIPackage(pkg: Package, artifact: Buffer): Promise<{ findings: Finding[]; riskScore: number }> {
    const findings: Finding[] = [];
    let riskScore = 0;
    
    // Basic typosquatting check
    const typoResult = this.checkTyposquat(pkg.identifier);
    if (typoResult) {
      findings.push(typoResult.finding);
      riskScore += typoResult.riskScore;
    }
    
    // Note: Full PyPI scanning would require unpacking wheels/sdists and analyzing Python code
    findings.push({
      severity: 'info',
      category: 'scan-coverage',
      message: 'PyPI package scanning is limited - full implementation requires Python AST analysis',
    });
    
    return { findings, riskScore };
  }
  
  /**
   * Check for typosquatting attempts
   */
  private checkTyposquat(identifier: string): { finding: Finding; riskScore: number } | null {
    // Extract package name (strip scope and version)
    const name = identifier.split('/').pop()?.split('@')[0] || identifier;
    
    for (const popular of POPULAR_PACKAGES) {
      const distance = levenshtein.get(name.toLowerCase(), popular.toLowerCase());
      
      // If edit distance is 1-2, it might be typosquatting
      if (distance > 0 && distance <= 2) {
        return {
          finding: {
            severity: distance === 1 ? 'high' : 'medium',
            category: 'typosquat',
            message: `Package name "${name}" is similar to popular package "${popular}" (edit distance: ${distance})`,
            details: {
              suspectedPackage: popular,
              editDistance: distance,
            },
          },
          riskScore: distance === 1 ? 30 : 15,
        };
      }
    }
    
    return null;
  }
  
  /**
   * Analyze package.json dependencies
   */
  private analyzeDependencies(packageJson: any): { findings: Finding[]; riskScore: number } {
    const findings: Finding[] = [];
    let riskScore = 0;
    
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };
    
    const depCount = Object.keys(allDeps).length;
    
    // High dependency count is a risk factor
    if (depCount > 50) {
      findings.push({
        severity: 'medium',
        category: 'dependencies',
        message: `Large number of dependencies (${depCount}) increases attack surface`,
        details: { count: depCount },
      });
      riskScore += 10;
    }
    
    // Check for suspicious dependency patterns
    for (const [name, version] of Object.entries(allDeps)) {
      if (typeof version === 'string') {
        // Check for git URLs (can bypass registry security)
        if (version.includes('git://') || version.includes('git+')) {
          findings.push({
            severity: 'high',
            category: 'dependencies',
            message: `Dependency "${name}" uses git URL instead of registry`,
            details: { dependency: name, version },
          });
          riskScore += 15;
        }
        
        // Check for HTTP URLs (insecure)
        if (version.startsWith('http://')) {
          findings.push({
            severity: 'critical',
            category: 'dependencies',
            message: `Dependency "${name}" uses insecure HTTP URL`,
            details: { dependency: name, version },
          });
          riskScore += 25;
        }
      }
    }
    
    return { findings, riskScore };
  }
  
  /**
   * Analyze npm scripts for suspicious commands
   */
  private analyzeScripts(packageJson: any): { findings: Finding[]; riskScore: number } {
    const findings: Finding[] = [];
    let riskScore = 0;
    
    if (!packageJson.scripts) {
      return { findings, riskScore };
    }
    
    const scripts = packageJson.scripts;
    
    // Check for suspicious lifecycle scripts
    const lifecycleScripts = ['preinstall', 'install', 'postinstall', 'preuninstall', 'uninstall', 'postuninstall'];
    
    for (const hook of lifecycleScripts) {
      if (scripts[hook]) {
        const script = scripts[hook];
        
        // Check for network activity in install scripts
        if (script.includes('curl') || script.includes('wget') || script.includes('fetch')) {
          findings.push({
            severity: 'high',
            category: 'install-script',
            message: `${hook} script contains network activity: ${script}`,
            details: { hook, script },
          });
          riskScore += 20;
        }
        
        // Check for eval in install scripts
        if (script.includes('eval') || script.includes('exec')) {
          findings.push({
            severity: 'critical',
            category: 'install-script',
            message: `${hook} script uses eval/exec: ${script}`,
            details: { hook, script },
          });
          riskScore += 30;
        }
      }
    }
    
    return { findings, riskScore };
  }
  
  /**
   * Scan directory for suspicious code patterns
   */
  private async scanDirectory(dir: string): Promise<{ findings: Finding[]; riskScore: number }> {
    const findings: Finding[] = [];
    let riskScore = 0;
    
    const scanFile = async (filePath: string) => {
      // Only scan JavaScript/TypeScript files
      if (!/\.(js|ts|mjs|cjs)$/i.test(filePath)) {
        return;
      }
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(dir, filePath);
        
        for (const { pattern, severity, message } of SUSPICIOUS_PATTERNS) {
          const matches = content.match(pattern);
          if (matches) {
            findings.push({
              severity,
              category: 'code-pattern',
              message: `${message} in ${relativePath}`,
              details: {
                file: relativePath,
                occurrences: matches.length,
              },
            });
            
            // Add to risk score based on severity
            const severityScore = {
              critical: 25,
              high: 15,
              medium: 8,
              low: 3,
              info: 1,
            };
            riskScore += severityScore[severity];
          }
        }
      } catch (err) {
        // Skip files that can't be read
      }
    };
    
    const walkDir = async (currentPath: string) => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else {
          await scanFile(fullPath);
        }
      }
    };
    
    await walkDir(dir);
    
    return { findings, riskScore };
  }
  
  /**
   * Calculate verdict based on findings and risk score
   */
  private calculateVerdict(findings: Finding[], riskScore: number): 'clean' | 'warning' | 'suspicious' | 'malicious' | 'unknown' {
    // Check for critical findings
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    if (criticalCount > 0) {
      return 'malicious';
    }
    
    // Check for high severity findings
    const highCount = findings.filter(f => f.severity === 'high').length;
    if (highCount > 2 || riskScore > 60) {
      return 'suspicious';
    }
    
    if (highCount > 0 || riskScore > 30) {
      return 'warning';
    }
    
    if (findings.length === 0 && riskScore === 0) {
      return 'clean';
    }
    
    return findings.filter(f => f.severity !== 'info').length > 0 ? 'warning' : 'clean';
  }
}
