/**
 * Core types for MCPShield based on MCP Registry API
 */

export interface Package {
  type: 'npm' | 'pypi' | 'docker' | 'nuget' | 'mcpb';
  identifier: string;
  version: string;
  digest?: string;
}

export interface Server {
  name: string;
  description: string;
  version: string;
  repository?: {
    url: string;
    commit?: string;
  };
  packages: Package[];
  license?: string;
  homepage?: string;
  tags?: string[];
}

export interface PublisherIdentity {
  status?: 'official' | 'verified' | 'community';
  github?: {
    owner: string;
    repo: string;
  };
  npm?: {
    package: string;
  };
}

export interface RegistryServerResponse {
  server: Server;
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status: 'official' | 'verified';
      verifiedAt?: string;
    };
  };
}

export interface LockedPackage extends Package {
  artifactDigest: string;
}

export interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DependencyAnalysis {
  total: number;
  direct: number;
  transitive: number;
  vulnerabilities?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface SecurityScan {
  scanVersion: string;
  scannedAt: string;
  verdict: 'clean' | 'warning' | 'suspicious' | 'malicious' | 'unknown';
  riskScore: number;
  findings: Finding[];
  dependencies?: DependencyAnalysis;
}

export interface LockedServer {
  name: string;
  version: string;
  description: string;
  source: {
    type: 'registry' | 'git' | 'local';
    registry?: string;
    url?: string;
    commit?: string;
  };
  repository?: {
    url: string;
    commit?: string;
  };
  publisherIdentity?: PublisherIdentity;
  packages: LockedPackage[];
  security?: SecurityScan;
  approvedAt: string;
  approvedBy?: string;
}

export interface Lockfile {
  version: string;
  servers: LockedServer[];
  metadata?: {
    generatedAt: string;
    generatedBy?: string;
  };
}

export class RegistryError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public errors?: unknown[]) {
    super(message);
    this.name = 'ValidationError';
  }
}
