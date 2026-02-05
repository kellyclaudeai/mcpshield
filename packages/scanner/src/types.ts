/**
 * Types for security scanning
 */

import { Finding, DependencyAnalysis, Package } from '@mcpshield/core';

export interface ScanResult {
  verdict: 'clean' | 'warning' | 'suspicious' | 'malicious' | 'unknown';
  riskScore: number; // 0-100
  findings: Finding[];
  dependencies?: DependencyAnalysis;
}

export interface SecurityScanner {
  scanPackage(pkg: Package, artifact: Buffer): Promise<ScanResult>;
}
