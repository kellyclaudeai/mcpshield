# MCPShield Implementation Guide

Quick reference for implementing MCPShield based on MCP Registry research and schema design.

## Core Concepts

### Three-Layer Security Model

1. **mcp.lock** (What) - Which servers are approved
2. **policy.yaml** (How) - How servers can be used
3. **Runtime Guard** (When) - Enforce policies during execution

### Trust Model

```
Registry → MCPShield CLI → mcp.lock → Runtime Guard → MCP Server
   ↓           ↓             ↓            ↓
Metadata   Scanning      Approval     Enforcement
```

## Quick Start Implementation

### 1. Registry Client

**Endpoint**: `https://registry.modelcontextprotocol.io/v0.1/servers/{name}`

```typescript
interface RegistryClient {
  getServer(name: string): Promise<ServerResponse>;
  searchServers(query: string): Promise<ServerListResponse>;
}

async function getServer(name: string): Promise<ServerResponse> {
  const response = await fetch(
    `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(name)}`
  );
  
  if (!response.ok) {
    throw new Error(`Registry error: ${response.status}`);
  }
  
  return response.json();
}
```

### 2. Artifact Downloader

**Support**: npm, PyPI, OCI, NuGet, MCPB

```typescript
interface ArtifactDownloader {
  download(pkg: Package): Promise<Buffer>;
  verify(artifact: Buffer, expectedDigest: string): boolean;
}

async function downloadNpmPackage(identifier: string, version: string): Promise<Buffer> {
  // Use npm pack or fetch from registry
  const tarballUrl = await getNpmTarballUrl(identifier, version);
  const response = await fetch(tarballUrl);
  return Buffer.from(await response.arrayBuffer());
}

function computeDigest(artifact: Buffer, algorithm: 'sha256' | 'sha512'): string {
  const hash = crypto.createHash(algorithm);
  hash.update(artifact);
  return `${algorithm}:${hash.digest('hex')}`;
}

function verifyDigest(artifact: Buffer, expected: string): boolean {
  const [algorithm, expectedHash] = expected.split(':');
  const actualDigest = computeDigest(artifact, algorithm as any);
  return actualDigest === expected;
}
```

### 3. Security Scanner

**Scan Layers**:
1. Dependency vulnerabilities (npm audit, safety)
2. Typosquat detection (Levenshtein distance)
3. Suspicious code patterns (regex, AST analysis)
4. Config risk (default credentials, overly broad permissions)

```typescript
interface SecurityScanner {
  scanPackage(pkg: Package, artifact: Buffer): Promise<ScanResult>;
}

interface ScanResult {
  verdict: 'clean' | 'warning' | 'suspicious' | 'malicious' | 'unknown';
  riskScore: number; // 0-100
  findings: Finding[];
  dependencies: DependencyAnalysis;
}

async function scanNpmPackage(artifact: Buffer): Promise<ScanResult> {
  // Extract to temp dir
  const tempDir = await extractTarball(artifact);
  
  // Run npm audit
  const auditResult = await runNpmAudit(tempDir);
  
  // Check for typosquats
  const typosquatCheck = await checkTyposquat(packageName);
  
  // Scan code for suspicious patterns
  const codeAnalysis = await analyzeCode(tempDir);
  
  // Compute risk score
  const riskScore = computeRiskScore([auditResult, typosquatCheck, codeAnalysis]);
  
  return {
    verdict: determineVerdict(riskScore),
    riskScore,
    findings: [...auditResult.findings, ...typosquatCheck.findings, ...codeAnalysis.findings],
    dependencies: auditResult.dependencies
  };
}
```

### 4. Lockfile Manager

**Operations**: read, write, update, verify

```typescript
interface LockfileManager {
  read(): Promise<Lockfile>;
  write(lockfile: Lockfile): Promise<void>;
  addServer(server: LockedServer): Promise<void>;
  removeServer(name: string): Promise<void>;
  verify(): Promise<VerificationReport>;
}

async function addServerToLockfile(
  serverName: string,
  registryClient: RegistryClient,
  scanner: SecurityScanner
): Promise<void> {
  // Fetch from registry
  const serverResponse = await registryClient.getServer(serverName);
  const server = serverResponse.server;
  
  // Download and verify packages
  const lockedPackages: LockedPackage[] = [];
  for (const pkg of server.packages) {
    const artifact = await downloadPackage(pkg);
    const digest = computeDigest(artifact, 'sha256');
    
    // Scan
    const scanResult = await scanner.scanPackage(pkg, artifact);
    
    lockedPackages.push({
      ...pkg,
      artifactDigest: digest
    });
  }
  
  // Build locked server entry
  const lockedServer: LockedServer = {
    name: server.name,
    version: server.version,
    description: server.description,
    source: {
      type: 'registry',
      registry: 'https://registry.modelcontextprotocol.io'
    },
    repository: server.repository,
    publisherIdentity: extractPublisherIdentity(serverResponse),
    packages: lockedPackages,
    security: {
      scanVersion: SCANNER_VERSION,
      scannedAt: new Date().toISOString(),
      verdict: scanResult.verdict,
      riskScore: scanResult.riskScore,
      findings: scanResult.findings,
      dependencies: scanResult.dependencies
    },
    approvedAt: new Date().toISOString()
  };
  
  // Prompt user for approval
  if (!await promptApproval(lockedServer)) {
    throw new Error('Server not approved');
  }
  
  // Add to lockfile
  const lockfile = await this.read();
  lockfile.servers.push(lockedServer);
  await this.write(lockfile);
}
```

### 5. Policy Engine

**Evaluates**: namespace, risk score, capabilities

```typescript
interface PolicyEngine {
  evaluate(server: LockedServer, policy: Policy): PolicyDecision;
  evaluateToolCall(toolName: string, args: any, policy: ServerPolicy): boolean;
}

function evaluateServerPolicy(server: LockedServer, policy: Policy): PolicyDecision {
  // Check namespace allow/deny
  if (!isNamespaceAllowed(server.name, policy.global.allowNamespaces, policy.global.denyNamespaces)) {
    return { allowed: false, reason: 'Namespace not allowed' };
  }
  
  // Check verification requirement
  if (policy.global.requireVerification && !server.publisherIdentity) {
    return { allowed: false, reason: 'Publisher not verified' };
  }
  
  // Check risk score
  if (server.security?.riskScore > policy.global.maxRiskScore) {
    return { allowed: false, reason: `Risk score too high: ${server.security.riskScore}` };
  }
  
  // Check blocked severities
  const blockedFindings = server.security?.findings.filter(f => 
    policy.global.blockSeverities.includes(f.severity)
  );
  if (blockedFindings && blockedFindings.length > 0) {
    return { 
      allowed: false, 
      reason: `Blocked findings: ${blockedFindings.map(f => f.message).join(', ')}` 
    };
  }
  
  return { allowed: true };
}

function isNamespaceAllowed(
  serverName: string, 
  allowList: string[], 
  denyList: string[]
): boolean {
  // Deny list takes precedence
  if (denyList.some(pattern => matchGlob(serverName, pattern))) {
    return false;
  }
  
  // If allow list is empty, allow all (unless denied)
  if (allowList.length === 0) {
    return true;
  }
  
  // Check allow list
  return allowList.some(pattern => matchGlob(serverName, pattern));
}
```

### 6. Runtime Guard (Proxy)

**Intercepts**: JSON-RPC messages between host and server

```typescript
interface RuntimeGuard {
  start(server: LockedServer, policy: ServerPolicy): Promise<void>;
  intercept(message: JsonRpcMessage): Promise<JsonRpcMessage | null>;
}

class StdioRuntimeGuard implements RuntimeGuard {
  private serverProcess: ChildProcess;
  private policy: ServerPolicy;
  
  async intercept(message: JsonRpcMessage): Promise<JsonRpcMessage | null> {
    if (message.method === 'tools/call') {
      const toolName = message.params.name;
      const toolArgs = message.params.arguments;
      
      // Find tool policy
      const toolPolicy = this.policy.tools.find(t => 
        matchGlob(toolName, t.name)
      );
      
      if (!toolPolicy || !toolPolicy.enabled) {
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Tool '${toolName}' is disabled by policy`
          }
        };
      }
      
      // Check if approval required
      if (toolPolicy.requireApproval) {
        const approved = await promptUser(`Allow ${toolName} call?`, toolArgs);
        if (!approved) {
          return {
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32000, message: 'User denied approval' }
          };
        }
      }
      
      // Validate arguments
      if (toolPolicy.argumentConstraints) {
        for (const constraint of toolPolicy.argumentConstraints) {
          const value = toolArgs[constraint.argument];
          if (!validateArgument(value, constraint)) {
            return {
              jsonrpc: '2.0',
              id: message.id,
              error: {
                code: -32602,
                message: `Argument '${constraint.argument}' violates policy`
              }
            };
          }
        }
      }
      
      // Apply rate limiting
      if (toolPolicy.maxCallsPerMinute) {
        if (!this.rateLimiter.allow(toolName, toolPolicy.maxCallsPerMinute)) {
          return {
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32000, message: 'Rate limit exceeded' }
          };
        }
      }
      
      // Log call
      await this.auditLogger.logToolCall(toolName, toolArgs);
    }
    
    // Forward to server
    return null; // null = forward unchanged
  }
}
```

## CLI Commands Implementation

### `mcp-shield add <server-name>`

```typescript
async function cmdAdd(serverName: string) {
  console.log(`Adding ${serverName}...`);
  
  // 1. Fetch from registry
  const server = await registryClient.getServer(serverName);
  console.log(`✓ Found ${server.server.description}`);
  
  // 2. Verify publisher
  const verified = await verifyPublisher(server);
  if (!verified && policy.global.denyUnverified) {
    throw new Error('Publisher not verified and denyUnverified is true');
  }
  console.log(`✓ Publisher verified: ${server._meta?.io.modelcontextprotocol.registry/official?.status}`);
  
  // 3. Download packages
  for (const pkg of server.server.packages) {
    console.log(`  Downloading ${pkg.identifier}@${pkg.version}...`);
    const artifact = await downloader.download(pkg);
    
    // 4. Scan
    console.log(`  Scanning...`);
    const scanResult = await scanner.scanPackage(pkg, artifact);
    console.log(`  Risk score: ${scanResult.riskScore}/100 (${scanResult.verdict})`);
    
    if (scanResult.findings.length > 0) {
      console.log(`  Findings:`);
      for (const finding of scanResult.findings) {
        console.log(`    [${finding.severity}] ${finding.message}`);
      }
    }
  }
  
  // 5. Prompt for approval
  const approved = await promptApproval(server, scanResult);
  if (!approved) {
    console.log('❌ Not approved');
    return;
  }
  
  // 6. Add to lockfile
  await lockfileManager.addServer(buildLockedServer(server, scanResult));
  console.log(`✓ Added to mcp.lock`);
}
```

### `mcp-shield verify`

```typescript
async function cmdVerify() {
  const lockfile = await lockfileManager.read();
  
  console.log(`Verifying ${lockfile.servers.length} servers...`);
  
  const results: VerificationResult[] = [];
  
  for (const server of lockfile.servers) {
    console.log(`\nChecking ${server.name}@${server.version}...`);
    
    for (const pkg of server.packages) {
      // Re-download
      const artifact = await downloader.download(pkg);
      const actualDigest = computeDigest(artifact, 'sha256');
      
      // Compare
      if (actualDigest !== pkg.artifactDigest) {
        console.log(`  ❌ Digest mismatch!`);
        console.log(`    Expected: ${pkg.artifactDigest}`);
        console.log(`    Actual:   ${actualDigest}`);
        results.push({ server: server.name, package: pkg.identifier, status: 'mismatch' });
      } else {
        console.log(`  ✓ Verified`);
        results.push({ server: server.name, package: pkg.identifier, status: 'ok' });
      }
    }
  }
  
  // Summary
  const failures = results.filter(r => r.status !== 'ok');
  if (failures.length > 0) {
    console.log(`\n❌ Verification failed for ${failures.length} packages`);
    process.exit(1);
  } else {
    console.log(`\n✓ All ${results.length} packages verified`);
  }
}
```

### `mcp-shield scan`

```typescript
async function cmdScan() {
  const lockfile = await lockfileManager.read();
  
  console.log(`Scanning ${lockfile.servers.length} servers...\n`);
  
  const report: ScanReport = {
    scannedAt: new Date().toISOString(),
    servers: []
  };
  
  for (const server of lockfile.servers) {
    console.log(`${server.name}@${server.version}`);
    
    // Re-scan each package
    for (const pkg of server.packages) {
      const artifact = await downloader.download(pkg);
      const scanResult = await scanner.scanPackage(pkg, artifact);
      
      console.log(`  Risk: ${scanResult.riskScore}/100 (${scanResult.verdict})`);
      console.log(`  Findings: ${scanResult.findings.length}`);
      
      report.servers.push({
        name: server.name,
        version: server.version,
        scanResult
      });
    }
  }
  
  // Generate report
  await fs.writeFile('mcp-scan-report.json', JSON.stringify(report, null, 2));
  console.log(`\n✓ Report saved to mcp-scan-report.json`);
}
```

### `mcp-shield ci`

```typescript
async function cmdCI() {
  // Check if lockfile changed
  const lockfileChanged = await gitDiff('mcp.lock');
  
  if (!lockfileChanged) {
    console.log('✓ No changes to mcp.lock');
    return;
  }
  
  console.log('⚠️  mcp.lock has changed');
  
  // Get added/modified servers
  const oldLockfile = await getFileAtCommit('mcp.lock', 'HEAD~1');
  const newLockfile = await lockfileManager.read();
  
  const added = findAddedServers(oldLockfile, newLockfile);
  const modified = findModifiedServers(oldLockfile, newLockfile);
  
  if (added.length === 0 && modified.length === 0) {
    console.log('✓ Only metadata changes');
    return;
  }
  
  // Report changes
  console.log(`\nAdded servers: ${added.length}`);
  for (const server of added) {
    console.log(`  + ${server.name}@${server.version}`);
    if (!server.approvedBy) {
      console.log(`    ❌ Not approved by anyone`);
      process.exit(1);
    }
  }
  
  console.log(`\nModified servers: ${modified.length}`);
  for (const server of modified) {
    console.log(`  ~ ${server.name}@${server.version}`);
  }
  
  // Verify all changed servers
  const allChanges = [...added, ...modified];
  for (const server of allChanges) {
    const policyDecision = policyEngine.evaluate(server, policy);
    if (!policyDecision.allowed) {
      console.log(`\n❌ ${server.name}: ${policyDecision.reason}`);
      process.exit(1);
    }
  }
  
  console.log('\n✓ All changes approved and pass policy checks');
}
```

## Testing Strategy

### Unit Tests

- Schema validation (valid/invalid cases)
- Digest computation and verification
- Namespace pattern matching
- Policy evaluation logic

### Integration Tests

- Registry client (mock responses)
- Package downloaders (fixture artifacts)
- Security scanner (known test cases)
- Lockfile operations

### E2E Tests

- Full workflow: add → verify → scan
- CI detection of changes
- Policy enforcement scenarios

### Security Tests

- Supply chain attack scenarios
- Malicious package detection
- Path traversal prevention
- Command injection prevention

## Performance Considerations

### Caching

```typescript
class CachedRegistryClient implements RegistryClient {
  private cache = new Map<string, { data: ServerResponse; expiresAt: number }>();
  
  async getServer(name: string): Promise<ServerResponse> {
    const cached = this.cache.get(name);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    
    const data = await this.realClient.getServer(name);
    this.cache.set(name, {
      data,
      expiresAt: Date.now() + 3600000 // 1 hour
    });
    
    return data;
  }
}
```

### Parallel Processing

```typescript
async function verifyAll(servers: LockedServer[]): Promise<void> {
  // Verify in parallel with concurrency limit
  const results = await pMap(
    servers,
    async (server) => await verifyServer(server),
    { concurrency: 5 }
  );
}
```

### Incremental Scanning

- Only re-scan if package version changed
- Cache scan results keyed by digest
- Store scan results in separate file (`.mcp-scan-cache.json`)

## Security Best Practices

1. **Always verify digests** before execution
2. **Never use version ranges** in lockfile
3. **Pin git commits**, never branches
4. **Validate all user input** (paths, URLs, patterns)
5. **Use non-shell execution** when running servers
6. **Redact secrets** from logs
7. **Require HTTPS** for all network operations
8. **Audit all tool calls** with timestamps and arguments

## Deployment

### NPM Package Structure

```
mcp-shield/
├── bin/
│   └── mcp-shield.js       # CLI entry point
├── src/
│   ├── commands/           # CLI commands
│   ├── registry/           # Registry client
│   ├── scanner/            # Security scanning
│   ├── lockfile/           # Lockfile management
│   ├── policy/             # Policy engine
│   └── runtime/            # Runtime guard
├── schemas/                # JSON schemas
├── examples/               # Example files
└── package.json
```

### Configuration

User config in `~/.mcp-shield/config.yaml`:

```yaml
registry:
  url: https://registry.modelcontextprotocol.io
  cacheDir: ~/.mcp-shield/cache

scanning:
  enabled: true
  cloudApiKey: null  # Optional MCPShield Cloud key

audit:
  enabled: true
  logDir: ~/.mcp-shield/logs
```

## Next Steps

1. ✅ Schemas designed
2. ⬜ Implement registry client
3. ⬜ Implement package downloaders
4. ⬜ Implement basic scanner
5. ⬜ Implement lockfile manager
6. ⬜ Implement policy engine
7. ⬜ Build CLI
8. ⬜ Build runtime guard
9. ⬜ Create test suite
10. ⬜ Write documentation
11. ⬜ Launch MVP

## Resources

- [MCP Registry](https://registry.modelcontextprotocol.io)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [mcp.lock spec](./mcp-lock-spec.md)
- [policy.yaml spec](./policy-yaml-spec.md)
- [Registry research](./mcp-registry-research.md)
