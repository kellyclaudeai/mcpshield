/**
 * Scanner rule definitions and severities
 * 
 * Centralized registry of all security finding categories and their base severities.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ScanRule {
  id: string;
  category: string;
  severity: Severity;
  description: string;
}

/**
 * All scanner rules with their IDs and default severities
 */
export const SCAN_RULES: Record<string, ScanRule> = {
  // Extraction security
  EXTRACT_PATH_TRAVERSAL: {
    id: 'EXTRACT_PATH_TRAVERSAL',
    category: 'extraction',
    severity: 'critical',
    description: 'Attempted path traversal during package extraction',
  },
  EXTRACT_ABSOLUTE_PATH: {
    id: 'EXTRACT_ABSOLUTE_PATH',
    category: 'extraction',
    severity: 'critical',
    description: 'Absolute path detected in package archive',
  },
  EXTRACT_SYMLINK_ESCAPE: {
    id: 'EXTRACT_SYMLINK_ESCAPE',
    category: 'extraction',
    severity: 'critical',
    description: 'Symlink or hardlink attempting to escape extraction root',
  },

  // Code patterns
  CODE_EVAL: {
    id: 'CODE_EVAL',
    category: 'code-pattern',
    severity: 'high',
    description: 'Use of eval() detected',
  },
  CODE_FUNCTION_CONSTRUCTOR: {
    id: 'CODE_FUNCTION_CONSTRUCTOR',
    category: 'code-pattern',
    severity: 'high',
    description: 'Dynamic Function() construction',
  },
  CODE_EXEC: {
    id: 'CODE_EXEC',
    category: 'code-pattern',
    severity: 'medium',
    description: 'Shell command execution',
  },
  CODE_SPAWN: {
    id: 'CODE_SPAWN',
    category: 'code-pattern',
    severity: 'medium',
    description: 'Process spawning detected',
  },
  CODE_CHILD_PROCESS: {
    id: 'CODE_CHILD_PROCESS',
    category: 'code-pattern',
    severity: 'medium',
    description: 'Child process usage',
  },
  CODE_DOWNLOAD: {
    id: 'CODE_DOWNLOAD',
    category: 'code-pattern',
    severity: 'medium',
    description: 'File download detected',
  },
  CODE_HARDCODED_URL: {
    id: 'CODE_HARDCODED_URL',
    category: 'code-pattern',
    severity: 'low',
    description: 'Hardcoded URL found',
  },
  CODE_BASE64: {
    id: 'CODE_BASE64',
    category: 'code-pattern',
    severity: 'low',
    description: 'Base64 decoding detected',
  },
  CODE_ENV_ACCESS: {
    id: 'CODE_ENV_ACCESS',
    category: 'code-pattern',
    severity: 'info',
    description: 'Environment variable access',
  },

  // Typosquatting
  TYPOSQUAT_EXACT_MATCH: {
    id: 'TYPOSQUAT_EXACT_MATCH',
    category: 'typosquat',
    severity: 'high',
    description: 'Package name exactly matches popular package (possible hijack)',
  },
  TYPOSQUAT_CLOSE_MATCH: {
    id: 'TYPOSQUAT_CLOSE_MATCH',
    category: 'typosquat',
    severity: 'high',
    description: 'Package name very similar to popular package (edit distance 1)',
  },
  TYPOSQUAT_SIMILAR: {
    id: 'TYPOSQUAT_SIMILAR',
    category: 'typosquat',
    severity: 'medium',
    description: 'Package name similar to popular package (edit distance 2)',
  },

  // Dependencies
  DEP_GIT_URL: {
    id: 'DEP_GIT_URL',
    category: 'dependencies',
    severity: 'high',
    description: 'Dependency uses git URL instead of registry',
  },
  DEP_HTTP_URL: {
    id: 'DEP_HTTP_URL',
    category: 'dependencies',
    severity: 'critical',
    description: 'Dependency uses insecure HTTP URL',
  },
  DEP_HIGH_COUNT: {
    id: 'DEP_HIGH_COUNT',
    category: 'dependencies',
    severity: 'medium',
    description: 'Large number of dependencies increases attack surface',
  },

  // Install scripts
  INSTALL_SCRIPT_NETWORK: {
    id: 'INSTALL_SCRIPT_NETWORK',
    category: 'install-script',
    severity: 'high',
    description: 'Install script contains network activity',
  },
  INSTALL_SCRIPT_EVAL: {
    id: 'INSTALL_SCRIPT_EVAL',
    category: 'install-script',
    severity: 'critical',
    description: 'Install script uses eval or exec',
  },

  // Vulnerabilities (OSV)
  VULN_CRITICAL: {
    id: 'VULN_CRITICAL',
    category: 'vulnerability',
    severity: 'critical',
    description: 'Critical severity vulnerability detected',
  },
  VULN_HIGH: {
    id: 'VULN_HIGH',
    category: 'vulnerability',
    severity: 'high',
    description: 'High severity vulnerability detected',
  },
  VULN_MEDIUM: {
    id: 'VULN_MEDIUM',
    category: 'vulnerability',
    severity: 'medium',
    description: 'Medium severity vulnerability detected',
  },
  VULN_LOW: {
    id: 'VULN_LOW',
    category: 'vulnerability',
    severity: 'low',
    description: 'Low severity vulnerability detected',
  },

  // Metadata issues
  METADATA_MISSING: {
    id: 'METADATA_MISSING',
    category: 'metadata',
    severity: 'medium',
    description: 'Could not read or parse package metadata',
  },

  // Scan errors
  SCAN_ERROR: {
    id: 'SCAN_ERROR',
    category: 'scan-error',
    severity: 'critical',
    description: 'Failed to scan package',
  },
  SCAN_UNSUPPORTED: {
    id: 'SCAN_UNSUPPORTED',
    category: 'unsupported',
    severity: 'info',
    description: 'Scanning not yet implemented for this package type',
  },
};

/**
 * Get rule by ID
 */
export function getRule(id: string): ScanRule | undefined {
  return SCAN_RULES[id];
}

/**
 * Get all rules for a category
 */
export function getRulesByCategory(category: string): ScanRule[] {
  return Object.values(SCAN_RULES).filter(rule => rule.category === category);
}

/**
 * Get all rules with a specific severity
 */
export function getRulesBySeverity(severity: Severity): ScanRule[] {
  return Object.values(SCAN_RULES).filter(rule => rule.severity === severity);
}
