/**
 * Security scanner implementation
 * 
 * Analyzes packages for security risks including:
 * - Dependency vulnerabilities
 * - Typosquatting attempts
 * - Suspicious code patterns
 * - Risk scoring
 */

import { Package, Finding, DependencyAnalysis, OSVClient } from '@mcpshield/core';
import { SecurityScanner, ScanResult } from './types.js';
import { SCAN_RULES } from './rules.js';
import * as tar from 'tar';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import levenshtein from 'fast-levenshtein';

/**
 * Suspicious code patterns to detect
 */
const SUSPICIOUS_PATTERNS: Array<{ ruleId: string; pattern: RegExp; message: string }> = [
  { ruleId: 'CODE_EVAL', pattern: /eval\s*\(/gi, message: 'Use of eval() detected' },
  { ruleId: 'CODE_FUNCTION_CONSTRUCTOR', pattern: /Function\s*\(/gi, message: 'Dynamic Function() construction' },
  { ruleId: 'CODE_EXEC', pattern: /exec\s*\(/gi, message: 'Shell command execution (exec)' },
  { ruleId: 'CODE_SPAWN', pattern: /spawn\s*\(/gi, message: 'Process spawning detected' },
  { ruleId: 'CODE_CHILD_PROCESS', pattern: /child_process/gi, message: 'Child process usage' },
  { ruleId: 'CODE_DOWNLOAD', pattern: /\.downloadFile/gi, message: 'File download detected' },
  { ruleId: 'CODE_HARDCODED_URL', pattern: /https?:\/\/[^\s'"]+/gi, message: 'Hardcoded URL' },
  { ruleId: 'CODE_BASE64', pattern: /Buffer\.from\([^)]*,\s*['"]base64['"]\)/gi, message: 'Base64 decoding' },
  { ruleId: 'CODE_BASE64', pattern: /atob\(/gi, message: 'Base64 decoding (atob)' },
  { ruleId: 'CODE_ENV_ACCESS', pattern: /process\.env/gi, message: 'Environment variable access' },
];

function createFinding(
  ruleId: string,
  message: string,
  details: Record<string, unknown> = {}
): Finding {
  const rule = SCAN_RULES[ruleId];
  return {
    severity: rule?.severity ?? 'info',
    category: rule?.category ?? 'unknown',
    message,
    details: { ruleId, ...details },
  };
}

class ExtractSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractSecurityError';
  }
}

function hasDotDotSegment(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return normalized.split('/').includes('..');
}

/**
 * Popular package names to check for typosquatting
 */
const POPULAR_PACKAGES = [
  'express', 'react', 'lodash', 'axios', 'webpack', 'typescript', 'eslint',
  'prettier', 'jest', 'mocha', 'chai', 'commander', 'chalk', 'inquirer',
  'moment', 'request', 'async', 'vue', 'angular', 'jquery', 'bootstrap'
];

export class BasicScanner implements SecurityScanner {
  private readonly osvClient: OSVClient;

  constructor(private readonly options: { enableOsv?: boolean } = {}) {
    this.osvClient = new OSVClient();
  }

  /**
   * Scan a package for security issues
   */
  async scanPackage(pkg: Package, artifact: Buffer): Promise<ScanResult> {
    const findings: Finding[] = [];
    let riskScore = 0;
    let dependencies: DependencyAnalysis | undefined;
    
    try {
      // Extract and analyze based on package type
      if (pkg.type === 'npm') {
        const analysis = await this.scanNpmPackage(pkg, artifact);
        findings.push(...analysis.findings);
        riskScore = analysis.riskScore;
        dependencies = analysis.dependencies;
      } else if (pkg.type === 'pypi') {
        const analysis = await this.scanPyPIPackage(pkg, artifact);
        findings.push(...analysis.findings);
        riskScore = analysis.riskScore;
        dependencies = analysis.dependencies;
      } else {
        findings.push(
          createFinding(
            'SCAN_UNSUPPORTED',
            `Scanning not yet implemented for ${pkg.type} packages`,
            { packageType: pkg.type }
          )
        );
      }
      
      // Calculate overall verdict
      const verdict = this.calculateVerdict(findings, riskScore);
      
      return {
        verdict,
        riskScore,
        findings,
        dependencies,
      };
    } catch (err: any) {
      return {
        verdict: 'unknown',
        riskScore: 0,
        findings: [
          createFinding('SCAN_ERROR', `Failed to scan package: ${err.message}`, {
            error: err?.message,
          }),
        ],
      };
    }
  }
  
  /**
   * Scan NPM package
   */
  private async scanNpmPackage(
    pkg: Package,
    artifact: Buffer
  ): Promise<{ findings: Finding[]; riskScore: number; dependencies?: DependencyAnalysis }> {
    const findings: Finding[] = [];
    let riskScore = 0;
    let dependencies: DependencyAnalysis | undefined;
    
    // Check for typosquatting
    const typoResult = this.checkTyposquat(pkg.identifier);
    if (typoResult) {
      findings.push(typoResult.finding);
      riskScore += typoResult.riskScore;
    }
    
    // Extract tarball and scan contents
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-scan-'));
    const tarballPath = path.join(tempDir, 'package.tgz');
    const extractDir = path.join(tempDir, 'extract');
    
    try {
      await fs.writeFile(tarballPath, artifact);
      
      // Secure extraction (reject path traversal, unsafe links, etc.)
      await fs.mkdir(extractDir, { recursive: true });
      try {
        const extractionWarnings = await this.secureExtractTarball(tarballPath, extractDir);
        findings.push(...extractionWarnings);
      } catch (error: any) {
        if (error instanceof ExtractSecurityError) {
          findings.push(
            createFinding('EXTRACT_PATH_TRAVERSAL', `EXTRACT_PATH_TRAVERSAL: ${error.message}`, {
              error: error?.message,
            })
          );
          return { findings, riskScore: 100, dependencies };
        }

        findings.push(
          createFinding('SCAN_ERROR', `Failed to extract package: ${error.message}`, {
            stage: 'extract',
            error: error?.message,
          })
        );
        return { findings, riskScore: 100, dependencies };
      }
      
      // Read package.json
      const packageRoot = path.join(extractDir, 'package');
      const packageJsonPath = path.join(packageRoot, 'package.json');
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        
        // Analyze dependencies
        const depAnalysis = await this.analyzeDependencies(packageJson);
        findings.push(...depAnalysis.findings);
        riskScore += depAnalysis.riskScore;
        dependencies = depAnalysis.dependencies;
        
        // Check for suspicious scripts
        const scriptAnalysis = this.analyzeScripts(packageJson);
        findings.push(...scriptAnalysis.findings);
        riskScore += scriptAnalysis.riskScore;
      } catch (err) {
        findings.push(createFinding('METADATA_MISSING', 'Could not read or parse package.json'));
        riskScore += 10;
      }
      
      // Scan all JavaScript files for suspicious patterns
      const codeAnalysis = await this.scanDirectory(packageRoot);
      findings.push(...codeAnalysis.findings);
      riskScore += codeAnalysis.riskScore;
      
    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; do not fail scan due to temp dir removal issues
      }
    }
    
    return { findings, riskScore: Math.min(100, riskScore), dependencies };
  }
  
  /**
   * Scan PyPI package (simplified)
   */
  private async scanPyPIPackage(
    pkg: Package,
    _artifact: Buffer
  ): Promise<{ findings: Finding[]; riskScore: number; dependencies?: DependencyAnalysis }> {
    const findings: Finding[] = [];
    let riskScore = 0;
    
    // Basic typosquatting check
    const typoResult = this.checkTyposquat(pkg.identifier);
    if (typoResult) {
      findings.push(typoResult.finding);
      riskScore += typoResult.riskScore;
    }
    
    // Note: Full PyPI scanning would require unpacking wheels/sdists and analyzing Python code
    findings.push(
      createFinding(
        'SCAN_LIMITED_COVERAGE',
        'PyPI package scanning is limited - full implementation requires Python AST analysis',
        { packageType: 'pypi' }
      )
    );
    
    return { findings, riskScore };
  }

  private async secureExtractTarball(tarballPath: string, extractDir: string): Promise<Finding[]> {
    const warnings: Finding[] = [];
    const extractRoot = path.resolve(extractDir);
    let rejected: ExtractSecurityError | null = null;

    const onwarn = (code: string, message: string) => {
      warnings.push(
        createFinding('EXTRACT_WARNING', `tar warning [${code}]: ${message}`, { code, message })
      );
    };

    const filter = (entryPath: string, entry: any) => {
      if (rejected) {
        return false;
      }

      const rawEntryPath = typeof entry?.path === 'string' ? entry.path : entryPath;
      if (!rawEntryPath) {
        return true;
      }

      // Reject unsafe paths
      if (
        rawEntryPath.startsWith('/') ||
        /^[a-zA-Z]:/.test(rawEntryPath) ||
        (process.platform !== 'win32' && rawEntryPath.includes('\\')) ||
        hasDotDotSegment(rawEntryPath)
      ) {
        rejected = new ExtractSecurityError(`rejected entry path: ${rawEntryPath}`);
        return false;
      }

      // Reject unsafe links (symlink/hardlink)
      if (entry?.linkpath) {
        const linkpath = String(entry.linkpath);
        if (path.isAbsolute(linkpath) || /^[a-zA-Z]:/.test(linkpath)) {
          rejected = new ExtractSecurityError(`rejected link target: ${rawEntryPath} -> ${linkpath}`);
          return false;
        }

        const linkDir = path.resolve(extractRoot, path.posix.dirname(rawEntryPath));
        const resolvedTarget = path.resolve(linkDir, linkpath);

        if (!(resolvedTarget === extractRoot || resolvedTarget.startsWith(extractRoot + path.sep))) {
          rejected = new ExtractSecurityError(
            `link target escapes extraction root: ${rawEntryPath} -> ${linkpath}`
          );
          return false;
        }
      }

      return true;
    };

    await tar.x({
      cwd: extractDir,
      file: tarballPath,
      preservePaths: false,
      strict: true,
      unlink: true,
      onwarn,
      filter,
    });

    if (rejected) {
      throw rejected;
    }

    return warnings;
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
        const ruleId = distance === 1 ? 'TYPOSQUAT_CLOSE_MATCH' : 'TYPOSQUAT_SIMILAR';
        return {
          finding: createFinding(
            ruleId,
            `Package name "${name}" is similar to popular package "${popular}" (edit distance: ${distance})`,
            {
              suspectedPackage: popular,
              editDistance: distance,
            }
          ),
          riskScore: distance === 1 ? 30 : 15,
        };
      }
    }
    
    return null;
  }
  
  /**
   * Analyze package.json dependencies
   */
  private async analyzeDependencies(
    packageJson: any
  ): Promise<{ findings: Finding[]; riskScore: number; dependencies?: DependencyAnalysis }> {
    const findings: Finding[] = [];
    let riskScore = 0;

    const directDeps: Record<string, string> = packageJson.dependencies || {};
    
    const allDeps = {
      ...directDeps,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
    };
    
    const depCount = Object.keys(allDeps).length;
    const directCount = Object.keys(directDeps).length;

    const dependencyAnalysis: DependencyAnalysis = {
      total: directCount,
      direct: directCount,
      transitive: 0,
    };
    
    // High dependency count is a risk factor
    if (depCount > 50) {
      findings.push(
        createFinding(
          'DEP_HIGH_COUNT',
          `Large number of dependencies (${depCount}) increases attack surface`,
          { count: depCount }
        )
      );
      riskScore += 10;
    }
    
    // Check for suspicious dependency patterns
    for (const [name, version] of Object.entries(allDeps)) {
      if (typeof version === 'string') {
        // Check for git URLs (can bypass registry security)
        if (version.includes('git://') || version.includes('git+')) {
          findings.push(
            createFinding('DEP_GIT_URL', `Dependency "${name}" uses git URL instead of registry`, {
              dependency: name,
              spec: version,
            })
          );
          riskScore += 15;
        }
        
        // Check for HTTP URLs (insecure)
        if (version.startsWith('http://')) {
          findings.push(
            createFinding('DEP_HTTP_URL', `Dependency "${name}" uses insecure HTTP URL`, {
              dependency: name,
              spec: version,
            })
          );
          riskScore += 25;
        }
      }
    }

    // OSV vulnerability analysis (direct dependencies only, Pilot)
    if (this.options.enableOsv !== false && directCount > 0) {
      const osvResult = await this.osvClient.analyzeNpmDependencySpecs(directDeps);

      dependencyAnalysis.vulnerabilities = osvResult.analysis.vulnerabilities;

      for (const unresolved of osvResult.unresolved) {
        findings.push(
          createFinding(
            'DEP_UNRESOLVED_SPEC',
            `Dependency "${unresolved.name}" uses an unresolved spec "${unresolved.spec}"`,
            { dependency: unresolved.name, spec: unresolved.spec, reason: unresolved.reason }
          )
        );
        riskScore += 5;
      }
    }
    
    return { findings, riskScore, dependencies: dependencyAnalysis };
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
          findings.push(
            createFinding('INSTALL_SCRIPT_NETWORK', `${hook} script contains network activity: ${script}`, {
              hook,
              script,
            })
          );
          riskScore += 20;
        }
        
        // Check for eval in install scripts
        if (script.includes('eval') || script.includes('exec')) {
          findings.push(
            createFinding('INSTALL_SCRIPT_EVAL', `${hook} script uses eval/exec: ${script}`, {
              hook,
              script,
            })
          );
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
        
        for (const { ruleId, pattern, message } of SUSPICIOUS_PATTERNS) {
          const matches = content.match(pattern);
          if (matches) {
            const finding = createFinding(ruleId, `${message} in ${relativePath}`, {
              file: relativePath,
              occurrences: matches.length,
            });
            findings.push(finding);
            
            // Add to risk score based on severity
            const severityScore = {
              critical: 25,
              high: 15,
              medium: 8,
              low: 3,
              info: 1,
            };
            riskScore += severityScore[finding.severity];
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
