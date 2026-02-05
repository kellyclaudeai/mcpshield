/**
 * Lockfile Manager
 * 
 * Reads, writes, and updates mcp.lock.json files
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface LockfileEntry {
  namespace: string;
  version: string;
  resolved?: string;
  integrity?: string;
  repository?: string;
  verified: boolean;
  verificationMethod?: string;
  verifiedOwner?: string | null;
  fetchedAt: string;
  artifacts?: {
    type: string;
    url: string;
    digest: string;
    size?: number;
  }[];
}

export interface Lockfile {
  version: string;
  generatedAt: string;
  servers: Record<string, LockfileEntry>;
}

export class LockfileManager {
  private lockfilePath: string;
  
  constructor(projectRoot: string = process.cwd()) {
    this.lockfilePath = path.join(projectRoot, 'mcp.lock.json');
  }
  
  /**
   * Read existing lockfile or create empty one
   */
  async read(): Promise<Lockfile> {
    try {
      const content = await fs.readFile(this.lockfilePath, 'utf-8');
      return this.normalize(JSON.parse(content));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return this.createEmpty();
      }
      throw err;
    }
  }
  
  /**
   * Write lockfile with stable formatting
   */
  async write(lockfile: Lockfile): Promise<void> {
    const normalized = this.normalize(lockfile);
    const content = JSON.stringify(normalized, null, 2) + '\n';
    await fs.writeFile(this.lockfilePath, content, 'utf-8');
  }
  
  /**
   * Add or update a server entry
   */
  async addServer(entry: LockfileEntry): Promise<void> {
    const lockfile = await this.read();
    lockfile.servers[entry.namespace] = entry;
    lockfile.generatedAt = new Date().toISOString();
    await this.write(lockfile);
  }
  
  /**
   * Remove a server entry
   */
  async removeServer(namespace: string): Promise<void> {
    const lockfile = await this.read();
    delete lockfile.servers[namespace];
    lockfile.generatedAt = new Date().toISOString();
    await this.write(lockfile);
  }
  
  /**
   * Get a specific server entry
   */
  async getServer(namespace: string): Promise<LockfileEntry | null> {
    const lockfile = await this.read();
    return lockfile.servers[namespace] || null;
  }
  
  /**
   * Check if lockfile exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.lockfilePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Validate lockfile structure
   */
  validate(lockfile: Lockfile): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!lockfile.version) {
      errors.push('Missing version field');
    }
    
    if (!lockfile.servers || typeof lockfile.servers !== 'object') {
      errors.push('Missing or invalid servers field');
      return { valid: false, errors };
    }
    
    for (const [namespace, entry] of Object.entries(lockfile.servers)) {
      if (!entry.namespace) {
        errors.push(`Server ${namespace}: missing namespace`);
      }
      if (!entry.version) {
        errors.push(`Server ${namespace}: missing version`);
      }
      if (typeof entry.verified !== 'boolean') {
        errors.push(`Server ${namespace}: invalid verified field`);
      }
      if (!entry.fetchedAt) {
        errors.push(`Server ${namespace}: missing fetchedAt`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Normalize lockfile (stable ordering, canonical format)
   */
  private normalize(lockfile: Lockfile): Lockfile {
    // Sort servers alphabetically by namespace
    const sortedServers: Record<string, LockfileEntry> = {};
    const namespaces = Object.keys(lockfile.servers).sort();
    
    for (const namespace of namespaces) {
      sortedServers[namespace] = lockfile.servers[namespace];
    }
    
    return {
      version: lockfile.version || '1.0.0',
      generatedAt: lockfile.generatedAt || new Date().toISOString(),
      servers: sortedServers
    };
  }
  
  /**
   * Create empty lockfile structure
   */
  private createEmpty(): Lockfile {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      servers: {}
    };
  }
  
  /**
   * Compute diff between two lockfiles
   */
  static diff(oldLockfile: Lockfile, newLockfile: Lockfile): {
    added: string[];
    removed: string[];
    changed: Array<{ namespace: string; oldVersion: string; newVersion: string }>;
  } {
    const oldNamespaces = new Set(Object.keys(oldLockfile.servers));
    const newNamespaces = new Set(Object.keys(newLockfile.servers));
    
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ namespace: string; oldVersion: string; newVersion: string }> = [];
    
    // Find added
    for (const namespace of newNamespaces) {
      if (!oldNamespaces.has(namespace)) {
        added.push(namespace);
      }
    }
    
    // Find removed
    for (const namespace of oldNamespaces) {
      if (!newNamespaces.has(namespace)) {
        removed.push(namespace);
      }
    }
    
    // Find changed
    for (const namespace of newNamespaces) {
      if (oldNamespaces.has(namespace)) {
        const oldEntry = oldLockfile.servers[namespace];
        const newEntry = newLockfile.servers[namespace];
        
        if (oldEntry.version !== newEntry.version ||
            oldEntry.integrity !== newEntry.integrity) {
          changed.push({
            namespace,
            oldVersion: oldEntry.version,
            newVersion: newEntry.version
          });
        }
      }
    }
    
    return { added, removed, changed };
  }
}
