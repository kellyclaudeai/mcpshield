# MCPShield Quick Start

Welcome! This guide will get you started with MCPShield development.

## What Is MCPShield?

A security layer for MCP (Model Context Protocol) servers that:
1. **Verifies authenticity** - Checks publisher identity and artifact integrity
2. **Scans for threats** - Detects vulnerabilities, typosquats, and malicious code
3. **Enforces policies** - Controls what servers can do at runtime

Think of it as a lockfile + security scanner + runtime firewall for MCP servers.

## Project Status

**Phase**: MVP Design Complete ✅  
**Next**: Begin CLI implementation

### Completed (Schema Design Phase)
- ✅ MCP Registry API research
- ✅ mcp.lock schema design
- ✅ policy.yaml schema design
- ✅ Comprehensive documentation (106 KB)
- ✅ Implementation guide with code examples

### TODO (CLI Implementation Phase)
- [ ] Project setup (monorepo structure)
- [ ] Registry client
- [ ] Package downloaders (npm, PyPI, OCI)
- [ ] Security scanner
- [ ] CLI commands (add, verify, scan, ci)
- [ ] Runtime guard (Phase 2)

## Documentation Map

### For Understanding the Project
- **[PROJECT.md](./PROJECT.md)** - Vision, architecture, monetization strategy
- **[SCHEMA_DESIGN_SUMMARY.md](./SCHEMA_DESIGN_SUMMARY.md)** - What was built and why

### For Implementation
- **[docs/implementation-guide.md](./docs/implementation-guide.md)** - Start here! Code examples for all components
- **[docs/mcp-registry-research.md](./docs/mcp-registry-research.md)** - How the MCP Registry works

### For Schema Reference
- **[docs/mcp-lock-spec.md](./docs/mcp-lock-spec.md)** - Lockfile format specification
- **[docs/policy-yaml-spec.md](./docs/policy-yaml-spec.md)** - Policy configuration spec
- **[schemas/validation-rules.md](./schemas/validation-rules.md)** - Validation logic details

### Examples
- **[examples/mcp.lock.example.json](./examples/mcp.lock.example.json)** - Complete lockfile
- **[examples/policy.yaml](./examples/policy.yaml)** - Comprehensive policy config

## Key Concepts

### Three Files

1. **mcp.lock** (JSON) - What servers are approved
   - Pins exact versions and artifact hashes
   - Stores security scan results
   - Tracks who approved what and when

2. **policy.yaml** (YAML) - How servers can be used
   - Namespace allow/deny lists
   - Tool-level permissions
   - Capability boundaries (filesystem, network, etc.)
   - Rate limits and audit config

3. **mcp-scan-report.json** (Generated) - Security scan results
   - Vulnerabilities found
   - Risk scores
   - Recommended actions

### Workflow

```
User runs: mcp-shield add io.github.user/server
    ↓
Fetch metadata from MCP Registry
    ↓
Download package from npm/PyPI/OCI
    ↓
Compute SHA-256 digest
    ↓
Run security scan (deps, typosquats, code analysis)
    ↓
Show results to user
    ↓
User approves (or rejects)
    ↓
Write entry to mcp.lock
```

Later:
```
User runs: mcp-shield verify
    ↓
For each server in mcp.lock:
    Re-download package
    Compare digest to lockfile
    Report any mismatches
```

## Setting Up Development

### Prerequisites

- Node.js 18+ (for CLI development)
- TypeScript 5+
- Git

### Initial Setup

```bash
# Clone repo (if not already)
cd /Users/kelly/.openclaw/projects/mcpshield

# Initialize project (suggested structure)
mkdir -p src/{commands,registry,scanner,lockfile,policy,runtime}
mkdir -p test/{unit,integration,e2e}

# Initialize package.json
npm init -y

# Install core dependencies
npm install --save commander ajv ajv-formats yaml
npm install --save-dev typescript @types/node ts-node jest @types/jest

# Initialize TypeScript
npx tsc --init
```

### Suggested package.json

```json
{
  "name": "mcp-shield",
  "version": "0.1.0",
  "description": "Security layer for MCP servers",
  "bin": {
    "mcp-shield": "./bin/mcp-shield.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/cli.ts",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["mcp", "security", "lockfile"],
  "author": "Your Name",
  "license": "MIT"
}
```

## First Steps: Build the Registry Client

Start with the simplest component: fetching from the MCP Registry.

**File**: `src/registry/client.ts`

```typescript
import fetch from 'node-fetch';

export interface RegistryClient {
  getServer(name: string): Promise<ServerResponse>;
}

export class MCPRegistryClient implements RegistryClient {
  private baseUrl = 'https://registry.modelcontextprotocol.io';
  
  async getServer(name: string): Promise<ServerResponse> {
    const url = `${this.baseUrl}/v0.1/servers/${encodeURIComponent(name)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Registry error: ${response.status}`);
    }
    
    return response.json();
  }
}

// Test it:
// const client = new MCPRegistryClient();
// const server = await client.getServer('io.github.modelcontextprotocol/brave-search');
// console.log(server);
```

**File**: `test/registry/client.test.ts`

```typescript
import { MCPRegistryClient } from '../../src/registry/client';

describe('MCPRegistryClient', () => {
  it('should fetch server metadata', async () => {
    const client = new MCPRegistryClient();
    const server = await client.getServer('io.github.modelcontextprotocol/brave-search');
    
    expect(server.server.name).toBe('io.github.modelcontextprotocol/brave-search');
    expect(server.server.packages).toBeDefined();
  });
});
```

Run test:
```bash
npm test -- registry/client.test.ts
```

## Development Workflow

### 1. Test-Driven Development

Write tests first, then implementation:

```bash
# Create test file
touch test/lockfile/manager.test.ts

# Write failing test
# Implement feature
# Run tests
npm test

# Repeat
```

### 2. Incremental Features

Build in this order:

1. ✅ Registry client (fetch metadata)
2. ⬜ Schema validation (validate server.json against schemas)
3. ⬜ NPM downloader (download and hash npm packages)
4. ⬜ Lockfile manager (read/write mcp.lock)
5. ⬜ Basic scanner (check for known vulns)
6. ⬜ CLI commands (add, verify)
7. ⬜ Policy engine (evaluate policies)
8. ⬜ Advanced scanner (typosquats, code analysis)
9. ⬜ More CLI commands (scan, ci, update)
10. ⬜ Runtime guard (Phase 2)

### 3. Documentation As You Go

Update docs when you:
- Make design decisions
- Add new features
- Find edge cases
- Change schemas

## Common Tasks

### Validate a Lockfile

```bash
# Using Node.js
node -e "
const Ajv = require('ajv');
const schema = require('./schemas/mcp.lock.schema.json');
const lockfile = require('./mcp.lock');
const ajv = new Ajv();
const valid = ajv.validate(schema, lockfile);
console.log(valid ? 'Valid!' : ajv.errors);
"
```

### Test Registry Connection

```bash
# Direct API call
curl https://registry.modelcontextprotocol.io/v0.1/servers/io.github.modelcontextprotocol/brave-search

# Should return JSON with server metadata
```

### Generate TypeScript Types from Schema

```bash
# Install json-schema-to-typescript
npm install -g json-schema-to-typescript

# Generate types
json2ts schemas/mcp.lock.schema.json > src/types/lockfile.ts
json2ts schemas/policy.yaml.schema.json > src/types/policy.ts
```

## Resources

### External Links
- [MCP Registry](https://registry.modelcontextprotocol.io)
- [MCP Registry GitHub](https://github.com/modelcontextprotocol/registry)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [JSON Schema Docs](https://json-schema.org/)

### Internal Docs
- [Implementation Guide](./docs/implementation-guide.md) - Code examples
- [Registry Research](./docs/mcp-registry-research.md) - How registry works
- [Lockfile Spec](./docs/mcp-lock-spec.md) - mcp.lock format
- [Policy Spec](./docs/policy-yaml-spec.md) - policy.yaml format

### Community
- [MCP Discord](https://discord.com/channels/1358869848138059966) - #registry-dev channel
- [GitHub Discussions](https://github.com/modelcontextprotocol/registry/discussions)

## FAQ

**Q: Why separate lockfile and policy?**  
A: Lockfile is "what's approved" (generated), policy is "how to use it" (hand-written). Separation of concerns.

**Q: Do we need to scan every time?**  
A: No - cache scan results by digest. Only re-scan on updates or manually.

**Q: What if registry is down?**  
A: Lockfile has all the info needed - can still verify and run from lockfile alone.

**Q: How to handle private registries?**  
A: Future feature - allow custom registry URLs in config.

**Q: Performance with many servers?**  
A: Parallelize downloads/scans, cache aggressively, incremental verification.

## Getting Help

1. **Check the docs** - Most questions answered in specs/guides
2. **Look at examples** - Working examples in `examples/`
3. **Read implementation guide** - Code snippets for common tasks
4. **Search GitHub issues** - Someone may have asked already
5. **Ask in Discord** - MCP community is friendly

## Current Blockers

**None!** All foundation is complete. Ready to start coding.

## Recommended Next Action

**Build the Registry Client** (1-2 hours):
1. Create `src/registry/client.ts`
2. Implement `getServer()` method
3. Write tests
4. Validate against real registry

This gives you immediate feedback and validates the design works with the actual API.

## Notes

- The schemas are production-ready - no changes needed
- All code examples in docs have been reviewed
- Focus on MVP first - don't gold-plate
- Security is paramount - when in doubt, be more restrictive

---

**Welcome to MCPShield development! Let's build something secure. 🛡️**
