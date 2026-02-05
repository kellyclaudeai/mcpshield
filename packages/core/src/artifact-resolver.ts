/**
 * Artifact Resolver
 * 
 * Resolves package artifacts from various registries (npm, PyPI, etc.)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import got from 'got';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

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

export interface ResolverOptions {
  /** Maximum artifact size in bytes (default: 50 MiB) */
  maxArtifactSize?: number;
  /** Connect timeout in milliseconds (default: 15000) */
  connectTimeout?: number;
  /** Request timeout in milliseconds (default: 60000) */
  requestTimeout?: number;
  /** Maximum number of redirects (default: 3) */
  maxRedirects?: number;
  /** Offline mode - refuse network and only use cache (default: false) */
  offline?: boolean;
}

const DEFAULT_MAX_ARTIFACT_SIZE = 50 * 1024 * 1024; // 50 MiB
const DEFAULT_CONNECT_TIMEOUT = 15000; // 15 seconds
const DEFAULT_REQUEST_TIMEOUT = 60000; // 60 seconds
const DEFAULT_MAX_REDIRECTS = 3;

function parseEnvNumber(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export abstract class ArtifactResolver {
  protected options: Required<ResolverOptions>;

  constructor(options: ResolverOptions = {}) {
    const envConnectTimeout = parseEnvNumber('MCPSHIELD_CONNECT_TIMEOUT_MS');
    const envRequestTimeout = parseEnvNumber('MCPSHIELD_REQUEST_TIMEOUT_MS');

    this.options = {
      maxArtifactSize: options.maxArtifactSize ?? DEFAULT_MAX_ARTIFACT_SIZE,
      connectTimeout: options.connectTimeout ?? envConnectTimeout ?? DEFAULT_CONNECT_TIMEOUT,
      requestTimeout: options.requestTimeout ?? envRequestTimeout ?? DEFAULT_REQUEST_TIMEOUT,
      maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
      offline: options.offline ?? false,
    };
  }

  abstract resolve(identifier: string): Promise<ResolverResult>;
  abstract download(artifact: ArtifactInfo, outputPath: string): Promise<string>;

  protected getGotOptions() {
    return {
      timeout: {
        connect: this.options.connectTimeout,
        request: this.options.requestTimeout,
      },
      followRedirect: true,
      maxRedirects: this.options.maxRedirects,
      throwHttpErrors: true,
      retry: {
        limit: 0, // Disable automatic retries - let caller handle
      },
    };
  }

  protected assertOnline(): void {
    if (this.options.offline) {
      throw new Error('Network access denied in offline mode');
    }
  }
}

/**
 * NPM Package Resolver
 */
export class NpmResolver extends ArtifactResolver {
  private registryUrl: string;
  
  constructor(registryUrl: string = 'https://registry.npmjs.org', options?: ResolverOptions) {
    super(options);
    this.registryUrl = registryUrl;
  }
  
  /**
   * Resolve npm package metadata
   * @param identifier - package@version or @scope/package@version
   */
  async resolve(identifier: string): Promise<ResolverResult> {
    this.assertOnline();

    const { name, version } = this.parseIdentifier(identifier);
    const url = `${this.registryUrl}/${encodeURIComponent(name)}`;
    
    try {
      const response = await got(url, {
        ...this.getGotOptions(),
        responseType: 'json',
      });

      const metadata = response.body as any;
      let resolvedVersion = version;
      let versionData = metadata.versions?.[resolvedVersion];

      // Support dist-tags like "latest" and "next"
      if (!versionData && metadata?.['dist-tags'] && typeof metadata['dist-tags'] === 'object') {
        const taggedVersion = metadata['dist-tags']?.[version];
        if (typeof taggedVersion === 'string') {
          resolvedVersion = taggedVersion;
          versionData = metadata.versions?.[resolvedVersion];
        }
      }
      
      if (!versionData) {
        throw new Error(`Version ${version} not found for ${name}`);
      }
      
      const artifact: ArtifactInfo = {
        url: versionData.dist.tarball,
        integrity: versionData.dist.integrity,
        size: versionData.dist.size,
        type: 'npm'
      };
      
      return { artifact, metadata: versionData };
    } catch (error: any) {
      if (error.response) {
        throw new Error(`NPM registry returned ${error.response.statusCode}: ${error.message}`);
      }
      throw new Error(`Failed to resolve npm package: ${error.message}`);
    }
  }
  
  /**
   * Download npm package tarball
   */
  async download(artifact: ArtifactInfo, outputPath: string): Promise<string> {
    this.assertOnline();

    // Enforce max artifact size
    if (artifact.size && artifact.size > this.options.maxArtifactSize) {
      throw new Error(
        `Artifact size ${artifact.size} bytes exceeds maximum allowed size ${this.options.maxArtifactSize} bytes`
      );
    }

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    
    // Determine hash algorithm from integrity string
    let algorithm = 'sha512'; // npm default
    if (artifact.integrity) {
      if (artifact.integrity.startsWith('sha256-')) {
        algorithm = 'sha256';
      } else if (artifact.integrity.startsWith('sha512-')) {
        algorithm = 'sha512';
      }
    }

    const hash = crypto.createHash(algorithm);
    let downloadedBytes = 0;
    const maxSize = this.options.maxArtifactSize;

    try {
      const downloadStream = got.stream(artifact.url, this.getGotOptions());

      // Track downloaded size and enforce limit
      const sizeTracker = new Transform({
        transform(chunk, _encoding, callback) {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxSize) {
            callback(new Error(
              `Download size ${downloadedBytes} bytes exceeds maximum allowed size ${maxSize} bytes`
            ));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });

      await pipeline(
        downloadStream,
        sizeTracker,
        fs.createWriteStream(outputPath)
      );

      const digest = `${algorithm}-${hash.digest('base64')}`;

      if (artifact.integrity && artifact.integrity !== digest) {
        await fs.promises.unlink(outputPath).catch(() => {});
        throw new Error(`Integrity mismatch: expected ${artifact.integrity}, got ${digest}`);
      }

      return digest;
    } catch (error: any) {
      await fs.promises.unlink(outputPath).catch(() => {});
      if (error.response) {
        throw new Error(`Download failed with status ${error.response.statusCode}: ${error.message}`);
      }
      throw error;
    }
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
 * PyPI Package Resolver
 */
export class PyPIResolver extends ArtifactResolver {
  private registryUrl: string;
  
  constructor(registryUrl: string = 'https://pypi.org', options?: ResolverOptions) {
    super(options);
    this.registryUrl = registryUrl;
  }
  
  /**
   * Resolve PyPI package metadata
   * @param identifier - package==version
   */
  async resolve(identifier: string): Promise<ResolverResult> {
    this.assertOnline();

    const { name, version } = this.parseIdentifier(identifier);
    const url = `${this.registryUrl}/pypi/${name}/${version}/json`;
    
    try {
      const response = await got(url, {
        ...this.getGotOptions(),
        responseType: 'json',
      });

      const metadata = response.body as any;
      const urls = metadata.urls;
      
      // Find the source distribution or wheel
      const sdist = urls.find((u: any) => u.packagetype === 'sdist');
      const wheel = urls.find((u: any) => u.packagetype === 'bdist_wheel');
      const artifact_data = sdist || wheel || urls[0];
      
      if (!artifact_data) {
        throw new Error(`No downloadable artifacts found for ${name}==${version}`);
      }
      
      const artifact: ArtifactInfo = {
        url: artifact_data.url,
        digest: artifact_data.digests?.sha256 ? `sha256-${Buffer.from(artifact_data.digests.sha256, 'hex').toString('base64')}` : undefined,
        size: artifact_data.size,
        type: 'pypi'
      };
      
      return { artifact, metadata };
    } catch (error: any) {
      if (error.response) {
        throw new Error(`PyPI registry returned ${error.response.statusCode}: ${error.message}`);
      }
      throw new Error(`Failed to resolve PyPI package: ${error.message}`);
    }
  }
  
  /**
   * Download PyPI package
   */
  async download(artifact: ArtifactInfo, outputPath: string): Promise<string> {
    this.assertOnline();

    // Enforce max artifact size
    if (artifact.size && artifact.size > this.options.maxArtifactSize) {
      throw new Error(
        `Artifact size ${artifact.size} bytes exceeds maximum allowed size ${this.options.maxArtifactSize} bytes`
      );
    }

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    
    const hash = crypto.createHash('sha256');
    let downloadedBytes = 0;
    const maxSize = this.options.maxArtifactSize;

    try {
      const downloadStream = got.stream(artifact.url, this.getGotOptions());

      // Track downloaded size and enforce limit
      const sizeTracker = new Transform({
        transform(chunk, _encoding, callback) {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxSize) {
            callback(new Error(
              `Download size ${downloadedBytes} bytes exceeds maximum allowed size ${maxSize} bytes`
            ));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });

      await pipeline(
        downloadStream,
        sizeTracker,
        fs.createWriteStream(outputPath)
      );

      const digest = `sha256-${hash.digest('base64')}`;

      if (artifact.digest && artifact.digest !== digest) {
        await fs.promises.unlink(outputPath).catch(() => {});
        throw new Error(`Digest mismatch: expected ${artifact.digest}, got ${digest}`);
      }

      return digest;
    } catch (error: any) {
      await fs.promises.unlink(outputPath).catch(() => {});
      if (error.response) {
        throw new Error(`Download failed with status ${error.response.statusCode}: ${error.message}`);
      }
      throw error;
    }
  }
  
  private parseIdentifier(identifier: string): { name: string; version: string } {
    const parts = identifier.split('==');
    if (parts.length !== 2) {
      throw new Error(`Invalid PyPI identifier: ${identifier}. Expected format: package==version`);
    }
    
    return { name: parts[0], version: parts[1] };
  }
}

/**
 * Docker Image Resolver
 * 
 * Note: This is a simplified implementation. Real Docker image pulling requires
 * Docker Registry API v2 and proper authentication handling.
 */
export class DockerResolver extends ArtifactResolver {
  private registryUrl: string;
  
  constructor(registryUrl: string = 'https://registry-1.docker.io', options?: ResolverOptions) {
    super(options);
    this.registryUrl = registryUrl;
  }
  
  /**
   * Resolve Docker image manifest
   * @param identifier - image:tag or registry/image:tag
   */
  async resolve(identifier: string): Promise<ResolverResult> {
    this.assertOnline();

    // Parse identifier (simplified - real implementation needs more robust parsing)
    const parts = identifier.split(':');
    const image = parts[0] || 'library/unknown';
    const tag = parts[1] || 'latest';
    
    // This is a placeholder - real implementation would:
    // 1. Authenticate with Docker registry
    // 2. Fetch manifest v2 schema 2
    // 3. Extract config digest and layer digests
    // 4. Return proper artifact info
    
    return Promise.resolve({
      artifact: {
        url: `${this.registryUrl}/v2/${image}/manifests/${tag}`,
        type: 'docker',
        digest: undefined // Would be computed from manifest
      },
      metadata: {
        image,
        tag,
        note: 'Docker resolver is a placeholder - requires full Docker Registry API v2 implementation'
      }
    });
  }
  
  /**
   * Download Docker image (placeholder)
   */
  async download(_artifact: ArtifactInfo, _outputPath: string): Promise<string> {
    this.assertOnline();

    // Real implementation would:
    // 1. Download all layers
    // 2. Verify each layer digest
    // 3. Combine into OCI image layout or Docker save format
    // 4. Return overall digest
    
    throw new Error('Docker image downloading not yet implemented - requires full Docker Registry API v2');
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
  
  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || this.getDefaultCacheDir();
  }
  
  /**
   * Get OS-specific default cache directory
   */
  private getDefaultCacheDir(): string {
    // Allow override via environment variable
    if (process.env.MCPSHIELD_CACHE_DIR) {
      return process.env.MCPSHIELD_CACHE_DIR;
    }
    
    const home = process.env.HOME || process.env.USERPROFILE || '';
    
    // XDG_CACHE_HOME takes precedence on all platforms
    if (process.env.XDG_CACHE_HOME) {
      return path.join(process.env.XDG_CACHE_HOME, 'mcpshield');
    }
    
    // macOS
    if (process.platform === 'darwin') {
      return path.join(home, 'Library', 'Caches', 'mcpshield');
    }
    
    // Linux/Unix/other (fallback to ~/.cache)
    return path.join(home, '.cache', 'mcpshield');
  }
  
  /**
   * Get cache path for a digest
   */
  getCachePath(digest: string): string {
    return this.getSafeCachePath(digest);
  }

  private getSafeCachePath(digest: string): string {
    const match = digest.match(/^(sha256|sha512)-(.+)$/);
    const algorithm = match?.[1] ?? 'sha256';
    const hashPart = match?.[2] ?? digest;

    // Convert to a filesystem-safe, deterministic key (base64url, no padding).
    const safeHash = hashPart.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const shard = safeHash.substring(0, 2) || '00';
    const fileName = `${algorithm}-${safeHash}`;

    return path.join(this.cacheDir, shard, fileName);
  }

  private getLegacyCachePath(digest: string): string {
    const hash = digest.replace(/^(sha256|sha512)-/, '');
    const shard = hash.substring(0, 2);
    return path.join(this.cacheDir, shard, digest);
  }
  
  /**
   * Check if artifact is cached
   */
  async has(digest: string): Promise<boolean> {
    try {
      await fs.promises.access(this.getSafeCachePath(digest));
      return true;
    } catch {
      try {
        await fs.promises.access(this.getLegacyCachePath(digest));
        return true;
      } catch {
        return false;
      }
    }
  }
  
  /**
   * Get cached artifact path
   */
  async get(digest: string): Promise<string | null> {
    const safePath = this.getSafeCachePath(digest);
    try {
      await fs.promises.access(safePath);
      return safePath;
    } catch {
      // fallthrough
    }

    const legacyPath = this.getLegacyCachePath(digest);
    try {
      await fs.promises.access(legacyPath);
      return legacyPath;
    } catch {
      return null;
    }
  }
  
  /**
   * Store artifact in cache
   */
  async put(digest: string, sourcePath: string): Promise<string> {
    const cachePath = this.getSafeCachePath(digest);
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
  
  /**
   * Purge entire cache
   */
  async purge(): Promise<number> {
    let removed = 0;
    
    async function walkDir(dir: string): Promise<void> {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await walkDir(fullPath);
          await fs.promises.rmdir(fullPath);
        } else {
          await fs.promises.unlink(fullPath);
          removed++;
        }
      }
    }
    
    try {
      await walkDir(this.cacheDir);
      await fs.promises.rmdir(this.cacheDir);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
    
    return removed;
  }
  
  /**
   * Get the cache directory path
   */
  getCacheDir(): string {
    return this.cacheDir;
  }
}
