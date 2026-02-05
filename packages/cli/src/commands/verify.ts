/**
 * mcp-shield verify
 * 
 * Re-fetch metadata, re-download artifacts, verify digests against lockfile
 */

import { LockfileManager } from '../../../core/src/lockfile';
import { NpmResolver, DigestVerifier, CacheManager } from '../../../core/src/artifact-resolver';
import * as path from 'path';
import * as os from 'os';

export async function verifyCommand(): Promise<number> {
  console.log('🔍 MCPShield Verify\n');
  
  const lockfileManager = new LockfileManager();
  const exists = await lockfileManager.exists();
  
  if (!exists) {
    console.error('❌ No mcp.lock.json found. Run `mcp-shield add` first.');
    return 1;
  }
  
  const lockfile = await lockfileManager.read();
  const validation = lockfileManager.validate(lockfile);
  
  if (!validation.valid) {
    console.error('❌ Lockfile validation failed:');
    validation.errors.forEach(err => console.error(`   • ${err}`));
    return 1;
  }
  
  console.log(`Found ${Object.keys(lockfile.servers).length} server(s) in lockfile\n`);
  
  const resolver = new NpmResolver();
  const cache = new CacheManager();
  let driftDetected = false;
  
  for (const [namespace, entry] of Object.entries(lockfile.servers)) {
    console.log(`Verifying: ${namespace}@${entry.version}`);
    
    try {
      // Skip non-npm artifacts for now
      if (!entry.artifacts || entry.artifacts.length === 0) {
        console.log('  ⚠️  No artifacts to verify (skipped)\n');
        continue;
      }
      
      for (const artifact of entry.artifacts) {
        if (artifact.type !== 'npm') {
          console.log(`  ⚠️  Skipping ${artifact.type} artifact\n`);
          continue;
        }
        
        // Check cache first
        const cached = await cache.get(artifact.digest);
        if (cached) {
          console.log('  ✓ Artifact found in cache');
          
          // Verify cached artifact
          const verification = await DigestVerifier.verify(cached, artifact.digest);
          if (verification.valid) {
            console.log('  ✓ Digest matches lockfile\n');
          } else {
            console.error('  ❌ Cache corruption detected!');
            console.error(`     Expected: ${artifact.digest}`);
            console.error(`     Got: ${verification.actualDigest}\n`);
            driftDetected = true;
          }
        } else {
          // Download and verify
          console.log('  📥 Downloading artifact...');
          
          const tempPath = path.join(os.tmpdir(), `mcpshield-${Date.now()}.tgz`);
          const actualDigest = await resolver.download({ 
            url: artifact.url, 
            type: 'npm' 
          }, tempPath);
          
          if (actualDigest === artifact.digest) {
            console.log('  ✓ Digest matches lockfile');
            // Store in cache
            await cache.put(artifact.digest, tempPath);
            console.log('  ✓ Cached for future use\n');
          } else {
            console.error('  ❌ DRIFT DETECTED!');
            console.error(`     Expected: ${artifact.digest}`);
            console.error(`     Got: ${actualDigest}`);
            console.error(`     URL: ${artifact.url}\n`);
            
            const report = DigestVerifier.generateDriftReport(
              namespace,
              artifact.digest,
              actualDigest,
              artifact.url
            );
            console.error(report + '\n');
            driftDetected = true;
          }
        }
      }
    } catch (err: any) {
      console.error(`  ❌ Verification failed: ${err.message}\n`);
      driftDetected = true;
    }
  }
  
  console.log('─'.repeat(60));
  
  if (driftDetected) {
    console.log('❌ Verification failed - drift detected');
    console.log('\nReview the changes above before updating the lockfile.');
    return 1;
  }
  
  console.log('✅ All artifacts verified successfully!');
  return 0;
}
