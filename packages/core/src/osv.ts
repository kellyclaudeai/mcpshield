/**
 * OSV (Open Source Vulnerabilities) API client
 * 
 * Integrates with OSV.dev to check for known vulnerabilities in dependencies.
 * Supports batch queries and detailed vulnerability information.
 */

import got from 'got';
import * as semver from 'semver';

export interface OSVQueryPackage {
  name: string;
  ecosystem: string;
}

export interface OSVQueryBatchRequest {
  queries: {
    package?: OSVQueryPackage;
    version?: string;
  }[];
}

export interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected?: Array<{
    package: {
      name: string;
      ecosystem: string;
    };
    ranges?: Array<{
      type: string;
      events: Array<{
        introduced?: string;
        fixed?: string;
        last_affected?: string;
      }>;
    }>;
    versions?: string[];
    database_specific?: {
      severity?: string;
    };
    ecosystem_specific?: any;
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
  database_specific?: {
    severity?: string;
    cwe_ids?: string[];
  };
}

export interface OSVBatchResult {
  results: Array<{
    vulns?: OSVVulnerability[];
  }>;
}

export interface OSVAnalysisResult {
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  vulnerabilityIds: string[];
  details: OSVVulnerability[];
}

/**
 * OSV API Client
 */
export class OSVClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(baseUrl: string = 'https://api.osv.dev', timeout: number = 30000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Query vulnerabilities for multiple packages in batch
   */
  async queryBatch(queries: OSVQueryBatchRequest): Promise<OSVBatchResult> {
    try {
      const response = await got.post<OSVBatchResult>(`${this.baseUrl}/v1/querybatch`, {
        json: queries,
        responseType: 'json',
        timeout: { request: this.timeout },
      });
      return response.body;
    } catch (error: any) {
      throw new Error(`OSV batch query failed: ${error.message}`);
    }
  }

  /**
   * Get detailed vulnerability information by ID
   */
  async getVulnerability(id: string): Promise<OSVVulnerability> {
    try {
      const response = await got.get<OSVVulnerability>(`${this.baseUrl}/v1/vulns/${id}`, {
        responseType: 'json',
        timeout: { request: this.timeout },
      });
      return response.body;
    } catch (error: any) {
      throw new Error(`OSV vulnerability lookup failed for ${id}: ${error.message}`);
    }
  }

  /**
   * Analyze dependencies for vulnerabilities
   */
  async analyzeDependencies(
    dependencies: Array<{ name: string; version: string; ecosystem: string }>
  ): Promise<OSVAnalysisResult> {
    // Build batch query
    const queries = dependencies.map(dep => ({
      package: {
        name: dep.name,
        ecosystem: dep.ecosystem,
      },
      version: dep.version,
    }));

    const batchResult = await this.queryBatch({ queries });

    const vulnerabilities = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    const vulnerabilityIdSet = new Set<string>();
    const detailsById = new Map<string, OSVVulnerability>();

    // Process results
    for (let i = 0; i < batchResult.results.length; i++) {
      const result = batchResult.results[i];
      if (!result.vulns || result.vulns.length === 0) {
        continue;
      }

      const dep = dependencies[i];

      for (const vuln of result.vulns) {
        // Check if vulnerability affects this specific version
        // (OSV API should filter, but we verify for safety)
        if (!this.isVersionAffected(dep.version, vuln)) {
          continue;
        }

        if (vulnerabilityIdSet.has(vuln.id)) {
          continue;
        }

        vulnerabilityIdSet.add(vuln.id);
        detailsById.set(vuln.id, vuln);

        // Categorize severity
        const severity = this.getSeverityLevel(vuln);
        vulnerabilities[severity]++;
      }
    }

    const vulnerabilityIds = Array.from(vulnerabilityIdSet).sort();
    const details = vulnerabilityIds.map((id) => detailsById.get(id)!);

    return {
      vulnerabilities,
      vulnerabilityIds,
      details,
    };
  }

  /**
   * Check if a version is affected by a vulnerability
   */
  private isVersionAffected(version: string, vuln: OSVVulnerability): boolean {
    if (!vuln.affected || vuln.affected.length === 0) {
      // If no affected field, assume vulnerability affects all versions (safer)
      return true;
    }

    for (const affected of vuln.affected) {
      // Check explicit version list
      if (affected.versions && affected.versions.includes(version)) {
        return true;
      }

      // Check version ranges
      if (affected.ranges && affected.ranges.length > 0) {
        for (const range of affected.ranges) {
          if (range.type === 'SEMVER' || range.type === 'ECOSYSTEM') {
            if (this.isVersionInRange(version, range.events || [])) {
              return true;
            }
          }
        }
      } else if (!affected.versions) {
        // If no ranges and no versions specified, assume affected
        return true;
      }
    }

    return false;
  }

  /**
   * Check if version is within a vulnerability range
   */
  private isVersionInRange(version: string, events: any[]): boolean {
    if (!events || events.length === 0) {
      return true; // No range specified, assume affected
    }

    let introduced: string | null = null;
    let fixed: string | null = null;

    for (const event of events) {
      if (event.introduced !== undefined) {
        introduced = event.introduced === '0' ? '0.0.0' : event.introduced;
      }
      if (event.fixed !== undefined) {
        fixed = event.fixed;
      }
    }

    try {
      // Parse version
      const ver = semver.coerce(version);
      if (!ver) {
        // Can't parse version, assume affected for safety
        return true;
      }

      // If we have an introduced version, check if current version is >= introduced
      if (introduced !== null) {
        const intro = semver.coerce(introduced);
        if (intro && semver.lt(ver, intro)) {
          // Version is before introduced, so not affected
          return false;
        }
      }

      // If we have a fixed version, check if current version is < fixed
      if (fixed !== null) {
        const fix = semver.coerce(fixed);
        if (fix && semver.gte(ver, fix)) {
          // Version is >= fixed, so not affected
          return false;
        }
      }

      // Version is within the affected range
      return true;
    } catch (err) {
      // If semver parsing fails, assume affected to be safe
      return true;
    }
  }

  /**
   * Get severity level from OSV vulnerability
   */
  private getSeverityLevel(vuln: OSVVulnerability): 'critical' | 'high' | 'medium' | 'low' {
    // Check CVSS scores
    if (vuln.severity && vuln.severity.length > 0) {
      for (const sev of vuln.severity) {
        if (sev.type === 'CVSS_V3' && sev.score) {
          const score = this.parseCvssV3Score(sev.score);
          if (score === null) {
            continue;
          }
          if (score >= 9.0) return 'critical';
          if (score >= 7.0) return 'high';
          if (score >= 4.0) return 'medium';
          return 'low';
        }
      }
    }

    // Check database-specific severity
    if (vuln.database_specific?.severity) {
      const sev = vuln.database_specific.severity.toLowerCase();
      if (sev === 'critical') return 'critical';
      if (sev === 'high') return 'high';
      if (sev === 'moderate' || sev === 'medium') return 'medium';
      return 'low';
    }

    // Check affected package severity
    if (vuln.affected) {
      for (const affected of vuln.affected) {
        if (affected.database_specific?.severity) {
          const sev = affected.database_specific.severity.toLowerCase();
          if (sev === 'critical') return 'critical';
          if (sev === 'high') return 'high';
          if (sev === 'moderate' || sev === 'medium') return 'medium';
          return 'low';
        }
      }
    }

    // Default to medium if no severity information available
    return 'medium';
  }

  private parseCvssV3Score(value: string): number | null {
    // Common OSV format: "CVSS:3.1/AV:N/AC:L/.../7.2" (base score is final segment)
    const vectorMatch = value.match(/\/(\d+(?:\.\d+)?)$/);
    if (vectorMatch) {
      const parsed = Number(vectorMatch[1]);
      return Number.isFinite(parsed) ? parsed : null;
    }

    // Fallback: accept plain numeric score strings
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
}
