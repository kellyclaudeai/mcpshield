/**
 * Artifact Resolver
 * 
 * Resolves package artifacts from various registries (npm, PyPI, etc.)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

export interface ArtifactInfo {
  url: string;
  integrity?: string;
  digest?: string;
  size?: number;
  type: 'npm' | 'pypi' | 'docker' | 'github' | 'mcpb';
}

export interface ResolverResult {
  artifact: ArtifactInfo;
  metadata: any;
}

export abstract class ArtifactResolver {
  abstract resolve(identifier: string): Promise<ResolverResult>;
  abstract download(artifact: ArtifactInfo, outputPath: string): Promise<string>;
}

/**
 * NPM Package Resolver
 */
export class NpmResolver extends ArtifactResolver {
  private registryUrl: string;
  
  constructor(registryUrl: string = 'https://registry.npmjs.org') {
    super();
    this.registryUrl = registryUrl;
  }
  
  /**
   * Resolve npm package metadata
   * @param identifier - package@version or @scope/package@version
   */
  async resolve(identifier: string): Promise<ResolverResult> {
    const { name, version } = this.parseIdentifier(identifier);
    const url = `${this.registryUrl}/${encodeURIComponent(name)}`;
    
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`NPM registry returned ${res.statusCode}`));
          }
          
          try {
            const metadata = JSON.parse(data);
            const versionData = metadata.versions[version];
            
            if (!versionData) {
              return reject(new Error(`Version ${version} not found for ${name}`));
            }
            
            const artifact: ArtifactInfo = {
              url: versionData.dist.tarball,
              integrity: versionData.dist.integrity,
              size: versionData.dist.size,
              type: 'npm'
            };
            
            resolve({ artifact, metadata: versionData });
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }
  
  /**
   * Download npm package tarball
   */
  async download(artifact: ArtifactInfo, outputPath: string): Promise<string> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      const hash = crypto.createHash('sha256');
      
      https.get(artifact.url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: ${res.statusCode}`));
        }
        
        res.on('data', (chunk) => {
          hash.update(chunk);
          file.write(chunk);
        });
        
        res.on('end', () => {
          file.end();
          const digest = `sha256-${hash.digest('base64')}`;
          
          // Verify integrity if provided
          if (artifact.integrity && artifact.integrity !== digest) {
            fs.unlinkSync(outputPath);
            return reject(new Error(`Integrity mismatch: expected ${artifact.integrity}, got ${digest}`));
          }
          
          resolve(digest);
        });
      }).on('error', (err) => {
        fs.unlinkSync(outputPath);
        reject(err);
      });
    });
  }
  
  private parseIdentifier(identifier: string): { name: string; version: string } {
    // Handle @scope/package@version
    const atIndex = identifier.lastIndexOf('@');
    if (atIndex <= 0) {
      throw new Error(`Invalid package identifier: ${identifier}`);
    }
    
    const name = identifier.substring(0, atIndex);
    const version = identifier.substring(atIndex + 1);
    
    if (!name || !version) {
      throw new Error(`Invalid package identifier: ${identifier}`);
    }
    
    return { name, version };
  }
}

/**
 * Digest Verifier
 * 
 * Computes and verifies cryptographic digests
 */
export class DigestVerifier {
  /**
   * Compute SHA-256 digest of a file
   */
  static async computeDigest(filePath: string, algorithm: 'sha256' | 'sha512' = 'sha256'): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => {
        const digest = `${algorithm}-${hash.digest('base64')}`;
        resolve(digest);
      });
      stream.on('error', reject);
    });
  }
  
  /**
   * Verify file against expected digest
   */
  static async verify(filePath: string, expectedDigest: string): Promise<{ valid: boolean; actualDigest: string }> {
    const algorithm = expectedDigest.split('-')[0] as 'sha256' | 'sha512';
    const actualDigest = await this.computeDigest(filePath, algorithm);
    
    return {
      valid: actualDigest === expectedDigest,
      actualDigest
    };
  }
  
  /**
   * Generate drift report
   */
  static generateDriftReport(
    namespace: string,
    oldDigest: string,
    newDigest: string,
    artifactUrl: string
  ): string {
    return `
DRIFT DETECTED: ${namespace}

Artifact: ${artifactUrl}
Old digest: ${oldDigest}
New digest: ${newDigest}
Timestamp: ${new Date().toISOString()}

This indicates the artifact content has changed since the lockfile was generated.
Review the changes before updating the lockfile.
`.trim();
  }
}

/**
 * Cache Manager
 * 
 * Content-addressed cache for downloaded artifacts
 */
export class CacheManager {
  private cacheDir: string;
  
  constructor(cacheDir: string = path.join(process.cwd(), '.mcpshield', 'cache')) {
    this.cacheDir = cacheDir;
  }
  
  /**
   * Get cache path for a digest
   */
  getCachePath(digest: string): string {
    // Use first 2 chars of digest for sharding
    const hash = digest.replace(/^(sha256|sha512)-/, '');
    const shard = hash.substring(0, 2);
    return path.join(this.cacheDir, shard, digest);
  }
  
  /**
   * Check if artifact is cached
   */
  async has(digest: string): Promise<boolean> {
    const cachePath = this.getCachePath(digest);
    try {
      await fs.promises.access(cachePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get cached artifact path
   */
  async get(digest: string): Promise<string | null> {
    const cachePath = this.getCachePath(digest);
    const exists = await this.has(digest);
    return exists ? cachePath : null;
  }
  
  /**
   * Store artifact in cache
   */
  async put(digest: string, sourcePath: string): Promise<string> {
    const cachePath = this.getCachePath(digest);
    await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.promises.copyFile(sourcePath, cachePath);
    return cachePath;
  }
  
  /**
   * Clean up old cache entries
   */
  async cleanup(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    let removed = 0;
    const now = Date.now();
    
    async function walkDir(dir: string) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else {
          const stats = await fs.promises.stat(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.promises.unlink(fullPath);
            removed++;
          }
        }
      }
    }
    
    try {
      await walkDir(this.cacheDir);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
    
    return removed;
  }
}
