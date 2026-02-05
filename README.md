# MCPShield

**Supply chain security tool for Model Context Protocol (MCP) servers**

MCPShield provides security scanning, verification, and policy enforcement for MCP servers, protecting against supply chain attacks and ensuring safe integration of third-party servers.

## ✅ Status: MVP Complete!

The MVP is fully functional with all core features implemented:

- ✅ **Lockfile Management** - Track verified servers in `mcp.lock.json`
- ✅ **Artifact Verification** - Download and verify npm/PyPI packages
- ✅ **Security Scanning** - Detect typosquats, suspicious code, and vulnerabilities
- ✅ **CLI Commands** - init, add, verify, scan
- ✅ **Registry Integration** - Fetch and verify servers from MCP Registry
- ✅ **Test Coverage** - E2E + unit tests passing

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/kellyclaudeai/mcpshield.git
cd mcpshield

# Install dependencies
npm install

# Build the project
npm run build

# Link CLI globally (optional)
npm link packages/cli
```

**Requirements:** Node.js >= 22

### Usage

```bash
# 1. Initialize in your project
mcp-shield init

# 2. Add an MCP server
mcp-shield add io.github.user/server-name

# 3. Verify all servers
mcp-shield verify

# 4. Run security scan
mcp-shield scan
```

Once published to npm, you’ll be able to run without cloning:
```bash
npx @mcpshield/cli --help
```

## Features

### 🔒 Lockfile Management

Track all your MCP servers in `mcp.lock.json`:

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-02-05T14:30:00.000Z",
  "servers": {
    "io.github.user/server-name": {
      "namespace": "io.github.user/server-name",
      "version": "1.0.0",
      "verified": true,
      "verificationMethod": "github",
      "verifiedOwner": "user",
      "fetchedAt": "2026-02-05T14:30:00.000Z",
      "artifacts": [
        {
          "type": "npm",
          "url": "https://registry.npmjs.org/package/-/package-1.0.0.tgz",
          "digest": "sha512-...",
          "size": 12345
        }
      ]
    }
  }
}
```

### 📦 Artifact Verification

- **npm packages** - Download and verify with SHA-512 digests
- **PyPI packages** - Download Python packages (basic support)
- **Docker images** - Placeholder for future implementation
- **Digest computation** - SHA-256 and SHA-512 support
- **Drift detection** - Detect when artifacts change

### 🔍 Security Scanning

Comprehensive security analysis:

- **Typosquat Detection** - Levenshtein distance against popular packages
- **Dependency Analysis** - Check for suspicious dependencies
- **Code Pattern Matching** - Detect `eval()`, `exec()`, network calls
- **Install Script Analysis** - Flag suspicious lifecycle hooks
- **Risk Scoring** - 0-100 risk score with verdict (clean/warning/suspicious/malicious)

### 📋 CLI Commands

#### `mcp-shield init`

Initialize MCPShield in your project:

```bash
mcp-shield init
```

Creates:
- `mcp.lock.json` - Empty lockfile
- `policy.yaml` - Policy configuration template

#### `mcp-shield add <server-name>`

Add an MCP server with full verification:

```bash
mcp-shield add io.github.modelcontextprotocol/filesystem
```

Workflow:
1. Validates namespace format
2. Fetches metadata from registry
3. Verifies namespace ownership
4. Downloads artifacts
5. Computes and verifies digests
6. Runs security scan
7. Prompts for approval
8. Adds to `mcp.lock.json`

Options:
- `-y, --yes` - Skip confirmation prompts

#### `mcp-shield verify`

Re-verify all servers in lockfile:

```bash
mcp-shield verify
```

- Downloads artifacts from cache or registry
- Verifies digests match lockfile
- Reports any drift detected

#### `mcp-shield scan`

Security scan for all servers:

```bash
mcp-shield scan
```

Outputs:
- Risk scores
- Security findings
- Verdict for each server
- Summary report

## Project Structure

```
mcpshield/
├── packages/
│   ├── core/           # Core functionality
│   │   ├── src/
│   │   │   ├── types.ts              # TypeScript types
│   │   │   ├── registry-client.ts    # MCP Registry client
│   │   │   ├── namespace-verifier.ts # Namespace verification
│   │   │   ├── lockfile.ts           # Lockfile management
│   │   │   └── artifact-resolver.ts  # Download/verify artifacts
│   │   └── test/                     # Unit tests
│   ├── cli/            # Command-line interface
│   │   ├── src/
│   │   │   ├── cli.ts        # CLI entry point
│   │   │   └── commands/     # Command implementations
│   │   └── package.json
│   └── scanner/        # Security scanning
│       ├── src/
│       │   ├── scanner.ts    # Security scanner implementation
│       │   └── types.ts      # Scanner types
│       └── package.json
├── test/e2e/          # Integration tests
├── schemas/           # JSON schemas
├── docs/             # Documentation
└── examples/         # Example configs
```

## Development

### Prerequisites

- Node.js >= 22
- npm >= 9

### Build

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Watch mode (rebuild on changes)
npm run build -- --watch
```

### Testing

```bash
# Run all tests
npm test

# Run E2E tests only
npm run test:e2e

# Run unit tests only
npm run test:unit
```

### Testing Individual Components

```bash
# Test registry client
node packages/cli/dist/cli.js test-registry <server-name>

# Test in a clean directory
mkdir /tmp/mcpshield-test
cd /tmp/mcpshield-test
mcp-shield init
mcp-shield add <server-name>
```

## Architecture

### Monorepo Structure

MCPShield uses npm workspaces for monorepo management:

- **@mcpshield/core** - Shared types, registry client, artifact resolution
- **@mcpshield/cli** - User-facing command-line tool
- **@mcpshield/scanner** - Security analysis engine

Dependencies flow: `cli → scanner → core`

### Type System

Strong TypeScript types throughout:

```typescript
interface LockedServer {
  namespace: string;
  version: string;
  verified: boolean;
  verificationMethod?: string;
  verifiedOwner?: string | null;
  fetchedAt: string;
  artifacts?: Artifact[];
}

interface ScanResult {
  verdict: 'clean' | 'warning' | 'suspicious' | 'malicious' | 'unknown';
  riskScore: number;  // 0-100
  findings: Finding[];
}
```

## Security

### Verification Methods

1. **GitHub Namespace Verification**
   - Format: `io.github.owner/repo`
   - Verifies repository ownership via GitHub API

2. **npm Package Verification**
   - Checks npm registry for package metadata
   - Verifies integrity hashes

3. **Digest Verification**
   - SHA-512 (npm packages)
   - SHA-256 (fallback/custom)
   - Base64-encoded subresource integrity format

### Threat Model

MCPShield protects against:

- **Typosquatting** - Similar package names
- **Namespace hijacking** - Claiming others' namespaces
- **Artifact drift** - Changes after approval
- **Malicious code** - Suspicious patterns
- **Dependency confusion** - Malicious dependencies
- **Supply chain attacks** - Compromised packages

## Roadmap

### Phase 4: Cloud Backend (Future)
- Deep scanning pipeline
- Reputation database
- Community reporting
- Verified publisher program

### Phase 5: Runtime Guard (Future)
- Proxy MCP communication
- Policy enforcement at runtime
- Tool-level permissions
- Audit logging

## Contributing

Contributions welcome! Areas to help:

- **PyPI Support** - Full Python package scanning
- **Docker Support** - OCI image verification
- **More Scanners** - SAST, dependency checks
- **CI Integration** - GitHub Actions, GitLab CI
- **Documentation** - Examples, tutorials, guides

## License

MIT License - See LICENSE file for details

## References

- [MCP Registry](https://registry.modelcontextprotocol.io/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [npm Registry API](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md)
- [PyPI JSON API](https://warehouse.pypa.io/api-reference/json.html)

---

**Built with ❤️ for the MCP community**

Protecting the supply chain, one server at a time.
