/**
 * @kellyclaude/mcpshield-core - Core functionality for MCPShield
 */

export * from './types.js';
export * from './registry-client.js';
export * from './namespace-verifier.js';
export { LockfileManager } from './lockfile.js';
export {
  ArtifactResolver,
  NpmResolver,
  PyPIResolver,
  DockerResolver,
  DigestVerifier,
  CacheManager,
  ArtifactInfo,
  ResolverResult,
} from './artifact-resolver.js';
export {
  OSVClient,
  OSVAnalysisResult,
  OSVNpmDependencyAnalysis,
  OSVUnresolvedDependency,
} from './osv.js';
export {
  Policy,
  GlobalPolicy,
  ServerPolicy,
  PolicyEvaluationResult,
  loadPolicy,
  validatePolicy,
  evaluateAdd,
  evaluateScan,
  getDefaultPolicy,
} from './policy.js';
