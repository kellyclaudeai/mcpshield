/**
 * Lockfile Manager
 * 
 * Reads, writes, and updates mcp.lock.json files
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { ValidateFunction } from 'ajv';

import { LockfileEntry, LockfileData } from './types.js';

const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let lockfileSchemaValidator: ValidateFunction | null = null;
let lockfileSchemaLoadFailed = false;
let lockfileSchemaLoadError: string | null = null;

export class LockfileManager {
  private lockfilePath: string;
  
  constructor(projectRoot: string = process.cwd()) {
    this.lockfilePath = path.join(projectRoot, 'mcp.lock.json');
  }
  
  /**
   * Read existing lockfile or create empty one
   */
  async read(): Promise<LockfileData> {
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
   * Write lockfile with stable formatting and atomic writes
   * Uses tmp file + fsync + rename for crash safety
   */
  async write(lockfile: LockfileData): Promise<void> {
    const normalized = this.normalize(lockfile);
    const content = JSON.stringify(normalized, null, 2) + '\n';
    
    // Create temp file in same directory for atomic rename
    const lockfileDir = path.dirname(this.lockfilePath);
    const tmpPath = path.join(lockfileDir, `.mcp.lock.json.tmp.${process.pid}`);
    
    try {
      // Write to temp file
      await fs.writeFile(tmpPath, content, 'utf-8');
      
      // Fsync to ensure data is written to disk
      const fileHandle = await fs.open(tmpPath, 'r+');
      try {
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }
      
      // Atomic rename
      await fs.rename(tmpPath, this.lockfilePath);
      
      // Fsync directory to ensure rename is persisted
      try {
        const dirHandle = await fs.open(lockfileDir, 'r');
        try {
          await dirHandle.sync();
        } finally {
          await dirHandle.close();
        }
      } catch (error) {
        // Directory sync may fail on some platforms, non-fatal
      }
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
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
   * Get the lockfile path
   */
  getPath(): string {
    return this.lockfilePath;
  }
  /**
   * Validate lockfile structure
   */
  validate(lockfile: LockfileData): { valid: boolean; errors: string[] } {
    const schemaValidator = this.getSchemaValidator();
    if (schemaValidator) {
      const valid = schemaValidator(lockfile) as boolean;
      if (!valid && schemaValidator.errors) {
        const errors = schemaValidator.errors.map((err) => {
          const instancePath = err.instancePath || '/';
          return `${instancePath}: ${err.message}`;
        });
        return { valid: false, errors };
      }

      return { valid: true, errors: [] };
    }

    if (lockfileSchemaLoadFailed) {
      return {
        valid: false,
        errors: [lockfileSchemaLoadError || 'Schema validation unavailable'],
      };
    }

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

  private getSchemaValidator(): ValidateFunction | null {
    if (lockfileSchemaLoadFailed) {
      return null;
    }

    if (lockfileSchemaValidator) {
      return lockfileSchemaValidator;
    }

    try {
      const schemaPath = path.resolve(__dirname, '../schemas/mcp.lock.schema.json');
      const schemaContent = fsSync.readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);

      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      lockfileSchemaValidator = ajv.compile(schema) as ValidateFunction;
      return lockfileSchemaValidator;
    } catch (error: any) {
      // Only fall back to legacy checks if schema is missing.
      if (error?.code === 'ENOENT') {
        return null;
      }
      lockfileSchemaLoadFailed = true;
      lockfileSchemaLoadError = `Schema load/compile failed: ${error.message}`;
      return null;
    }
  }
  
  /**
   * Normalize lockfile (stable ordering, canonical format)
   */
  private normalize(lockfile: LockfileData): LockfileData {
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
  private createEmpty(): LockfileData {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      servers: {}
    };
  }
  
  /**
   * Compute diff between two lockfiles
   */
  static diff(oldLockfile: LockfileData, newLockfile: LockfileData): {
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
        
        const canonArtifacts = (artifacts: any[] = []) =>
          artifacts
            .map((a) => `${a.type}|${a.url}|${a.digest}|${a.size ?? ''}`)
            .sort()
            .join(',');

        if (
          oldEntry.version !== newEntry.version ||
          canonArtifacts(oldEntry.artifacts) !== canonArtifacts(newEntry.artifacts)
        ) {
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
// test comment
