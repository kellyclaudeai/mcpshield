# MCPShield

**Supply chain security tool for Model Context Protocol (MCP) servers**

MCPShield provides security scanning, verification, and policy enforcement for MCP servers, protecting against supply chain attacks and ensuring safe integration of third-party servers.

## 🚧 Status: Early Development (Phase 2 Complete)

- ✅ Phase 1: Schema design (mcp.lock, policy.yaml)
- ✅ **Phase 2: TypeScript monorepo + Registry client**
- ⏳ Phase 3: Artifact verification & scanning
- ⏳ Phase 4: Full CLI implementation
- ⏳ Phase 5: Runtime guard & policy enforcement

## Project Structure

```
mcpshield/
├── packages/
│   ├── core/           # Registry client, types, lockfile management
│   ├── cli/            # Command-line interface
│   └── scanner/        # Security scanning engine
├── schemas/            # JSON schemas for validation
├── docs/              # Documentation and specs
└── examples/          # Example configs and lockfiles
```

## Packages

### @mcpshield/core

Core functionality including:
- **RegistryClient**: Fetch server metadata from MCP Registry API
- **Types**: TypeScript interfaces for all data structures
- **Lockfile management**: Read/write mcp.lock files
- **Verification**: Digest computation and validation

### @mcpshield/cli

Command-line interface with commands:
- `mcp-shield add <server>` - Add server to lockfile
- `mcp-shield verify` - Verify artifact integrity
- `mcp-shield scan` - Run security scans
- `mcp-shield ci` - CI/CD integration

### @mcpshield/scanner

Security scanning engine:
- Dependency vulnerability analysis
- Typosquat detection
- Suspicious code pattern detection
- Risk scoring

## Development

### Prerequisites

- Node.js >= 18
- npm >= 9

### Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Testing Registry Client

```bash
# Try fetching a server from registry (test command)
node packages/cli/dist/cli.js test-registry <server-name>
```

### Project Layout

```
packages/
├── core/
│   ├── src/
│   │   ├── types.ts              # Core type definitions
│   │   ├── registry-client.ts    # MCP Registry API client
│   │   └── index.ts              # Public exports
│   ├── test/
│   │   └── registry-client.test.ts  # Unit tests (28 tests, all passing)
│   └── package.json
├── cli/
│   ├── src/
│   │   ├── cli.ts                # CLI entry point
│   │   ├── commands/             # Command implementations
│   │   └── index.ts
│   └── package.json
└── scanner/
    ├── src/
    │   ├── types.ts              # Scanner types
    │   ├── scanner.ts            # Scanner implementation
    │   └── index.ts
    └── package.json
```

## Documentation

- [Implementation Guide](docs/implementation-guide.md) - Comprehensive implementation reference
- [mcp.lock Specification](docs/mcp-lock-spec.md) - Lockfile format
- [policy.yaml Specification](docs/policy-yaml-spec.md) - Policy configuration
- [MCP Registry Research](docs/mcp-registry-research.md) - Registry API analysis
- [Validation Rules](schemas/validation-rules.md) - Schema validation examples

## Completed Milestones

### Phase 1: Schema Design ✅

- Complete JSON schemas for mcp.lock and policy.yaml
- Comprehensive validation rules with examples
- Full specifications with edge case handling
- Working examples for all schemas

### Phase 2: TypeScript Monorepo + Registry Client ✅

- **Monorepo structure**: TypeScript workspaces with proper module resolution
- **@mcpshield/core**: Registry client with full test coverage (28 passing tests)
- **Types**: Complete type definitions for all MCP Registry structures
- **CLI skeleton**: Commander.js-based CLI with test command
- **Build system**: TypeScript project references with composite builds
- **Testing infrastructure**: Node.js built-in test runner with tsx

**Test Coverage**:
- RegistryClient constructor options
- Server fetching with error handling
- Publisher identity extraction (GitHub, npm)
- Verification status checking
- Response validation
- URL encoding and edge cases

## Next Steps

1. **Artifact downloaders** - npm, PyPI, Docker, NuGet, MCPB
2. **Digest verification** - SHA-256/512 computation and validation
3. **Security scanner** - Dependency analysis, typosquat detection, pattern matching
4. **Lockfile manager** - Read/write/update mcp.lock operations
5. **CLI commands** - Implement add, verify, scan, ci commands

## License

MIT (to be confirmed)

## Contributing

This is an early-stage project. Contribution guidelines coming soon.

## Security

For security concerns, please see SECURITY.md (coming soon).
