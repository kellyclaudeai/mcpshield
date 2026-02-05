/**
 * Policy loading, validation, and evaluation
 * 
 * Enforces security policies from policy.yaml:
 * - Namespace allow/deny lists
 * - Risk score thresholds
 * - Severity blocking
 * - Verification requirements
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as yaml from 'yaml';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { ValidateFunction } from 'ajv';

const Ajv = AjvModule.default || AjvModule;
const addFormats = addFormatsModule.default || addFormatsModule;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { Finding } from './types.js';

/**
 * Policy configuration structure
 */
export interface Policy {
  version: string;
  global?: GlobalPolicy;
  servers?: ServerPolicy[];
}

export interface GlobalPolicy {
  allowNamespaces?: string[];
  denyNamespaces?: string[];
  requireVerification?: boolean;
  denyUnverified?: boolean;
  requireApprovalFor?: string[];
  maxRiskScore?: number;
  blockSeverities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
  rateLimit?: RateLimitPolicy;
  audit?: AuditPolicy;
}

export interface ServerPolicy {
  serverName: string;
  enabled?: boolean;
  tools?: ToolPolicy[];
  resources?: ResourcePolicy[];
  capabilities?: CapabilityPolicy;
  rateLimit?: RateLimitPolicy;
}

export interface ToolPolicy {
  name: string;
  enabled?: boolean;
  requireApproval?: boolean;
  maxCallsPerMinute?: number;
  argumentConstraints?: Array<{
    argument: string;
    allowedValues?: string[];
    deniedValues?: string[];
    pattern?: string;
    maxLength?: number;
  }>;
}

export interface ResourcePolicy {
  uri: string;
  enabled?: boolean;
  requireApproval?: boolean;
  readOnly?: boolean;
}

export interface CapabilityPolicy {
  filesystem?: {
    allowedPaths?: string[];
    deniedPaths?: string[];
    readOnly?: boolean;
  };
  network?: {
    allowedDomains?: string[];
    deniedDomains?: string[];
    allowedPorts?: number[];
    requireTls?: boolean;
  };
  secrets?: {
    allowedEnvVars?: string[];
    denyEnvVarPatterns?: string[];
  };
  execution?: {
    maxMemoryMB?: number;
    maxCpuPercent?: number;
    timeout?: number;
  };
  budget?: {
    maxApiCallsPerDay?: number;
    maxCostPerDay?: number;
  };
}

export interface RateLimitPolicy {
  maxCallsPerMinute?: number;
  maxCallsPerHour?: number;
  maxCallsPerDay?: number;
  burstSize?: number;
}

export interface AuditPolicy {
  enabled?: boolean;
  logLevel?: 'all' | 'tools-only' | 'approvals-only' | 'errors-only';
  logToolCalls?: boolean;
  logArguments?: boolean;
  redactSecrets?: boolean;
  retention?: {
    days?: number;
    maxSizeMB?: number;
  };
  export?: {
    enabled?: boolean;
    format?: 'json' | 'cef' | 'syslog';
    destination?: string;
  };
}

/**
 * Policy evaluation result
 */
export interface PolicyEvaluationResult {
  allowed: boolean;
  reasons: string[];
  requiresApproval?: boolean;
}

/**
 * Load policy from YAML file
 */
export async function loadPolicy(policyPath: string = 'policy.yaml'): Promise<Policy | null> {
  try {
    const exists = await fs.access(policyPath).then(() => true).catch(() => false);
    if (!exists) {
      return null;
    }
    
    const content = await fs.readFile(policyPath, 'utf-8');
    const policy = yaml.parse(content) as Policy;
    
    return policy;
  } catch (err: any) {
    throw new Error(`Failed to load policy: ${err.message}`);
  }
}

/**
 * Validate policy against JSON schema
 */
export async function validatePolicy(policy: Policy): Promise<{ valid: boolean; errors?: string[] }> {
  try {
    // Load schema
    const schemaPath = path.resolve(__dirname, '../schemas/policy.yaml.schema.json');
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    
    // Validate with Ajv
    const ajv = new Ajv({ allErrors: true, verbose: true, strict: false });
    addFormats(ajv);
    const validate: ValidateFunction = ajv.compile(schema);
    
    const valid = validate(policy);
    
    if (!valid && validate.errors) {
      const errors = validate.errors.map(err => {
        const path = err.instancePath || '/';
        return `${path}: ${err.message}`;
      });
      return { valid: false, errors };
    }
    
    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      errors: [`Schema validation error: ${err.message}`],
    };
  }
}

/**
 * Evaluate whether adding a server is allowed by policy
 */
export function evaluateAdd(options: {
  serverName: string;
  verified: boolean;
  verificationMethod?: string;
  riskScore: number;
  findings: Finding[];
  policy: Policy | null;
}): PolicyEvaluationResult {
  const { serverName, verified, riskScore, findings, policy } = options;
  const reasons: string[] = [];
  
  // If no policy, allow by default
  if (!policy || !policy.global) {
    return { allowed: true, reasons: [] };
  }
  
  const global = policy.global;
  
  // Check namespace allow/deny lists
  if (global.denyNamespaces && global.denyNamespaces.length > 0) {
    for (const pattern of global.denyNamespaces) {
      if (matchNamespace(serverName, pattern)) {
        reasons.push(`Server namespace "${serverName}" is explicitly denied by policy`);
        return { allowed: false, reasons };
      }
    }
  }
  
  if (global.allowNamespaces && global.allowNamespaces.length > 0) {
    let matched = false;
    for (const pattern of global.allowNamespaces) {
      if (matchNamespace(serverName, pattern)) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      reasons.push(`Server namespace "${serverName}" is not in allowlist`);
      return { allowed: false, reasons };
    }
  }
  
  // Check verification requirements
  if (global.denyUnverified === true && !verified) {
    reasons.push('Server publisher is not verified, and policy requires verification');
    return { allowed: false, reasons };
  }
  
  // Check risk score
  const maxRiskScore = global.maxRiskScore ?? 100;
  if (riskScore > maxRiskScore) {
    reasons.push(`Risk score ${riskScore} exceeds maximum allowed ${maxRiskScore}`);
    return { allowed: false, reasons };
  }
  
  // Check blocked severities
  if (global.blockSeverities && global.blockSeverities.length > 0) {
    const blockedFindings = findings.filter(f => 
      global.blockSeverities!.includes(f.severity as any)
    );
    
    if (blockedFindings.length > 0) {
      const severities = [...new Set(blockedFindings.map(f => f.severity))].join(', ');
      reasons.push(`Found ${blockedFindings.length} finding(s) with blocked severity levels: ${severities}`);
      return { allowed: false, reasons };
    }
  }
  
  // Check if approval is required
  let requiresApproval = false;
  if (global.requireApprovalFor && global.requireApprovalFor.length > 0) {
    // Check if any findings match approval requirements
    for (const finding of findings) {
      for (const capability of global.requireApprovalFor) {
        if (finding.category.toLowerCase().includes(capability.toLowerCase())) {
          requiresApproval = true;
          break;
        }
      }
      if (requiresApproval) break;
    }
  }
  
  return { 
    allowed: true, 
    reasons: [],
    requiresApproval 
  };
}

/**
 * Evaluate whether scan results violate policy
 */
export function evaluateScan(options: {
  serverName: string;
  riskScore: number;
  findings: Finding[];
  verified: boolean;
  policy: Policy | null;
}): PolicyEvaluationResult {
  const { serverName, riskScore, findings, verified, policy } = options;
  const reasons: string[] = [];
  
  // If no policy, pass by default
  if (!policy || !policy.global) {
    return { allowed: true, reasons: [] };
  }
  
  const global = policy.global;
  
  // Check namespace deny list
  if (global.denyNamespaces && global.denyNamespaces.length > 0) {
    for (const pattern of global.denyNamespaces) {
      if (matchNamespace(serverName, pattern)) {
        reasons.push(`Server "${serverName}" matches denied namespace pattern "${pattern}"`);
        return { allowed: false, reasons };
      }
    }
  }
  
  // Check verification requirements
  if (global.denyUnverified === true && !verified) {
    reasons.push(`Server "${serverName}" is not verified`);
    return { allowed: false, reasons };
  }
  
  // Check risk score threshold
  const maxRiskScore = global.maxRiskScore ?? 100;
  if (riskScore > maxRiskScore) {
    reasons.push(`Risk score ${riskScore} exceeds policy maximum ${maxRiskScore}`);
    return { allowed: false, reasons };
  }
  
  // Check blocked severities
  if (global.blockSeverities && global.blockSeverities.length > 0) {
    const blockedFindings = findings.filter(f => 
      global.blockSeverities!.includes(f.severity as any)
    );
    
    if (blockedFindings.length > 0) {
      for (const finding of blockedFindings) {
        reasons.push(`[${finding.severity}] ${finding.category}: ${finding.message}`);
      }
      return { allowed: false, reasons };
    }
  }
  
  return { allowed: true, reasons: [] };
}

/**
 * Match server name against namespace pattern (supports wildcards)
 */
function matchNamespace(serverName: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(serverName);
}

/**
 * Get default policy
 */
export function getDefaultPolicy(): Policy {
  return {
    version: '1.0',
    global: {
      requireVerification: true,
      denyUnverified: false,
      maxRiskScore: 50,
      blockSeverities: ['critical'],
      requireApprovalFor: ['filesystem', 'network'],
    },
  };
}
