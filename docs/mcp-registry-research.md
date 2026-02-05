# MCP Registry API Research Summary

**Date**: February 4, 2026  
**Researcher**: Subagent (mcpshield-dev)  
**Sources**: 
- https://registry.modelcontextprotocol.io
- https://github.com/modelcontextprotocol/registry
- Official MCP documentation

## Overview

The MCP Registry is a centralized metadata repository for Model Context Protocol (MCP) servers. It provides discovery, publishing, and verification capabilities for the MCP ecosystem.

## Current Status

- **Version**: v0.1 (API freeze as of October 2025)
- **Status**: Preview (launched September 2025)
- **Stability**: API frozen for v0.1, no breaking changes during validation period
- **Future**: v1 planned for general availability after integration feedback

## Registry Architecture

### Core Functionality

1. **Metadata Hosting**: Registry hosts server metadata, **NOT** artifacts
2. **Artifact Sources**: Packages hosted on:
   - npm (JavaScript/TypeScript)
   - PyPI (Python)
   - NuGet (.NET)
   - OCI registries (Docker)
   - MCPB (MCP Binary format)
   - Direct URLs

3. **Authentication**: Multiple methods supported
   - GitHub OAuth (for io.github.* namespaces)
   - GitHub OIDC (for GitHub Actions)
   - DNS verification (for custom domains)
   - HTTP verification (for custom domains)

### Namespace Ownership

The registry enforces namespace ownership:

- **GitHub namespaces**: `io.github.username/server-name`
  - Must authenticate via GitHub as that user
  - Or run in GitHub Actions on user's repo
  
- **Custom domains**: `com.example/server-name`
  - Must prove ownership of `example.com` via DNS or HTTP challenge
  
- **Reverse DNS format**: Required pattern `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`

## API Endpoints

### Base URL
```
https://registry.modelcontextprotocol.io
```

### Key Endpoints

**GET /v0.1/servers**
- List/search servers
- Query parameters:
  - `search`: Search term
  - `cursor`: Pagination cursor
- Returns: `ServerListResponse`

**GET /v0.1/servers/{name}**
- Get specific server by name
- Returns: `ServerResponse`

**POST /v0.1/servers**
- Publish new server or version
- Requires authentication
- Body: `ServerJSON` from `server.json`

**Documentation**: https://registry.modelcontextprotocol.io/docs

## Data Model

### server.json Schema

The core metadata format for MCP servers:

**Schema URL**: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`

**Required Fields**:
- `name`: Server name in reverse-DNS format
- `description`: Human-readable functionality description (1-100 chars)
- `version`: Semantic version string
- `packages` or `remotes`: At least one deployment method

**Optional Fields**:
- `title`: Display name
- `repository`: Source code repository info
  - `url`: Git clone URL
  - `source`: Hosting service (e.g., "github")
  - `id`: Repository ID from hosting service
- `websiteUrl`: Homepage/docs URL
- `icons`: Array of icon resources
- `_meta`: Extension metadata (reverse-DNS namespaced)

### Package Configuration

Each package defines how to install and run the server:

```json
{
  "registryType": "npm",
  "identifier": "@scope/package-name",
  "version": "1.2.3",
  "runtimeHint": "npx",
  "fileSha256": "fe333e598595000ae021bd27117db32ec69af6987f507ba7a63c90638ff633ce",
  "transport": {
    "type": "stdio"
  },
  "environmentVariables": [
    {
      "name": "API_KEY",
      "description": "Your API key",
      "isRequired": true,
      "isSecret": true
    }
  ],
  "packageArguments": [...],
  "runtimeArguments": [...]
}
```

**Key Fields**:
- `registryType`: `"npm"`, `"pypi"`, `"oci"`, `"nuget"`, `"mcpb"`
- `identifier`: Package name or URL
- `version`: Exact version (no ranges allowed)
- `fileSha256`: SHA-256 hash for integrity verification (required for MCPB, optional for others)
- `transport`: Protocol configuration
  - `stdio`: Standard input/output
  - `sse`: Server-Sent Events
  - `streamable-http`: HTTP streaming
- `runtimeHint`: Suggested runtime command (`npx`, `uvx`, `docker`, `dnx`)

### Transport Types

**stdio** (most common):
```json
{
  "type": "stdio"
}
```

**sse**:
```json
{
  "type": "sse",
  "url": "https://api.example.com/sse",
  "headers": [
    {
      "name": "Authorization",
      "value": "Bearer {API_TOKEN}"
    }
  ]
}
```

**streamable-http**:
```json
{
  "type": "streamable-http",
  "url": "https://api.example.com/mcp",
  "headers": [...]
}
```

### Environment Variables

```json
{
  "name": "VARIABLE_NAME",
  "description": "Human-readable description",
  "isRequired": true,
  "isSecret": true,
  "format": "string",  // or "number", "boolean", "filepath"
  "default": "default-value",
  "placeholder": "example-value",
  "choices": ["option1", "option2"]
}
```

### Arguments

Two types of command-line arguments:

**Positional**:
```json
{
  "type": "positional",
  "valueHint": "file_path",
  "value": "/path/to/file"
}
```

**Named**:
```json
{
  "type": "named",
  "name": "--port",
  "value": "8080",
  "isRepeated": false
}
```

⚠️ **Security Warning**: Arguments construct command-line parameters that may contain user-provided input. This creates command injection risks. Clients should use non-shell execution methods (e.g., `posix_spawn`) when possible.

## Registry Extensions

The registry adds metadata to responses via `_meta` field:

```json
{
  "server": { /* ServerJSON */ },
  "_meta": {
    "io.modelcontextprotocol.registry/official": {
      "status": "active",  // or "deprecated", "deleted"
      "publishedAt": "2025-09-01T10:00:00Z",
      "updatedAt": "2026-01-15T14:30:00Z",
      "isLatest": true
    }
  }
}
```

## Publishing Workflow

### Using mcp-publisher CLI

1. **Install CLI**:
   ```bash
   # macOS/Linux
   curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
   
   # Or via Homebrew
   brew install mcp-publisher
   ```

2. **Add verification to package.json**:
   ```json
   {
     "name": "@username/package-name",
     "version": "1.0.0",
     "mcpName": "io.github.username/server-name"
   }
   ```

3. **Publish package** (e.g., to npm):
   ```bash
   npm publish --access public
   ```

4. **Create server.json**:
   ```bash
   mcp-publisher init
   # Edit generated server.json
   ```

5. **Authenticate**:
   ```bash
   mcp-publisher login github
   ```

6. **Publish to registry**:
   ```bash
   mcp-publisher publish
   ```

### Verification Requirements

**For npm packages**: Must include `mcpName` in `package.json` matching the registry name.

**For GitHub namespaces**: User must authenticate via GitHub and own the repository.

**For custom domains**: Must complete DNS or HTTP challenge to prove domain ownership.

## Key Insights for MCPShield

### 1. Registry is Metadata-Only

**Implication**: MCPShield must:
- Fetch metadata from registry
- Download actual artifacts from npm/PyPI/OCI/etc.
- Verify artifact integrity independently
- Cannot rely on registry for artifact storage

### 2. No Built-in Security Scanning

**Opportunity**: Registry explicitly expects downstream aggregators to add:
- Security scanning
- Reputation ratings
- Curation/vetting

This is MCPShield's core value proposition.

### 3. Publisher Verification Exists

**Good news**: Registry provides publisher identity verification via:
- GitHub authentication
- DNS verification
- HTTP challenges

**MCPShield integration**:
- Leverage existing verification from registry
- Store verification metadata in mcp.lock
- Detect namespace takeover attacks

### 4. SHA-256 Hashing Available

**For MCPB**: Required field `fileSha256`  
**For others**: Optional but supported

**MCPShield strategy**:
- Always compute and store artifact digests
- Use for supply chain attack detection
- Store in mcp.lock for verification

### 5. Version Pinning Required

Registry rejects version ranges:
- ❌ `^1.2.3`, `~1.2.3`, `latest`
- ✅ `1.2.3` (exact versions only)

**Good for MCPShield**: Aligns with lockfile philosophy

### 6. Multiple Package Formats

A single server can have multiple packages:
- npm package
- Docker image
- MCPB binary
- PyPI package

**MCPShield must**:
- Support scanning all package types
- Store digests for each package variant
- Allow users to choose preferred format

### 7. Transport Flexibility

Servers support multiple transports:
- stdio (local execution)
- SSE (remote servers)
- streamable-http (remote servers)

**MCPShield Runtime Guard must**:
- Intercept all transport types
- Apply policies consistently
- Handle remote servers (not just local)

## Supply Chain Attack Surface

Based on registry architecture, potential attack vectors:

### 1. Registry Compromise
- Attacker modifies server.json metadata
- **Mitigation**: Pin artifact digests in mcp.lock

### 2. Package Registry Compromise
- Attacker publishes malicious package to npm/PyPI
- **Mitigation**: Verify digests, scan packages

### 3. Namespace Takeover
- Publisher loses control of GitHub account
- Attacker publishes under same namespace
- **Mitigation**: Track repository ID, detect ID changes

### 4. Package Resurrection
- Package deleted from npm, then recreated
- **Mitigation**: Pin commit SHAs, verify continuity

### 5. Typosquatting
- Similar package names (e.g., `braveesearch` vs `brave-search`)
- **Mitigation**: Levenshtein distance checking

### 6. Dependency Confusion
- Private namespace vs public namespace
- **Mitigation**: Namespace allowlist/denylist

### 7. Malicious Updates
- Legitimate publisher account compromised
- Malicious version published
- **Mitigation**: Review update changelogs, re-scan on update

## Registry API Limitations

### No Vulnerability Data
- Registry doesn't provide CVE information
- **MCPShield must**: Integrate with vulnerability databases

### No Reputation Scoring
- No trust/reputation metrics
- **MCPShield must**: Build reputation graph

### No Historical Data
- Limited version history
- **MCPShield must**: Track versions over time

### No Dependency Graph
- Registry doesn't show package dependencies
- **MCPShield must**: Analyze package.json/requirements.txt

## Integration Points for MCPShield

### CLI Integration

**mcp-shield add <server-name>**:
1. Query registry: `GET /v0.1/servers/{name}`
2. Parse `server.json` response
3. Download packages from respective registries
4. Compute artifact digests
5. Run security scanning
6. Prompt for approval
7. Write to mcp.lock

**mcp-shield verify**:
1. Read mcp.lock
2. For each server, re-fetch from registry
3. Download artifacts
4. Compare digests
5. Report drift

**mcp-shield scan**:
1. Read mcp.lock
2. Check for updated security data
3. Re-scan packages
4. Update security metadata

### Cloud Integration

**MCPShield Cloud** can:
1. Index entire registry periodically
2. Run deep scans on all packages
3. Build reputation graph
4. Issue attestations for clean packages
5. Provide API for instant reputation lookup

### Runtime Guard Integration

**Policy decisions**:
1. Check server name against policy.yaml namespace rules
2. Verify server is in mcp.lock
3. Check risk score vs. maxRiskScore
4. Apply capability boundaries
5. Intercept JSON-RPC messages
6. Enforce tool/resource policies

## Recommended Tech Stack

Based on registry ecosystem:

**CLI**: Node.js/TypeScript
- Aligns with npm ecosystem
- Easy npm package handling
- TypeScript for type safety

**Registry Client**: Use official Go client or implement REST calls
- Registry has Go reference implementation
- OpenAPI spec available

**Package Handling**:
- npm: Use `npm` CLI or `@npmcli/arborist`
- PyPI: Use `pip` or parse metadata directly
- OCI: Use `docker` CLI or containerd libraries
- MCPB: Direct download via HTTPS

**Integrity Verification**: Node.js `crypto` module
- `crypto.createHash('sha256')`

**Dependency Scanning**:
- npm: `npm audit`, `npm ls`
- PyPI: `safety`, `pip-audit`
- Docker: Anchore, Trivy, Snyk

## Open Questions

1. **Rate limiting**: Does registry have rate limits? (Not documented)
2. **Webhooks**: Can we subscribe to updates? (No webhook support visible)
3. **Bulk export**: Can we download entire registry? (Seed data available)
4. **Historical versions**: Are old versions retained? (Unclear)
5. **Deletion policy**: What happens when server is deleted? (Status="deleted")

## Next Steps for MCPShield

1. ✅ Design mcp.lock schema
2. ✅ Design policy.yaml schema
3. ⬜ Implement registry client
4. ⬜ Implement package downloaders (npm, PyPI, OCI)
5. ⬜ Implement digest verification
6. ⬜ Implement basic security scanning
7. ⬜ Build CLI commands (add, verify, scan)

## References

- **Registry GitHub**: https://github.com/modelcontextprotocol/registry
- **Registry API**: https://registry.modelcontextprotocol.io/docs
- **Server Schema**: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
- **Publisher Guide**: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx
- **Ecosystem Vision**: https://github.com/modelcontextprotocol/registry/blob/main/docs/design/ecosystem-vision.md
- **API Types**: https://github.com/modelcontextprotocol/registry/blob/main/pkg/api/v0/types.go

---

**Research completed**: February 4, 2026  
**Schemas created**:
- `schemas/mcp.lock.schema.json`
- `schemas/policy.yaml.schema.json`
- `examples/mcp.lock.example.json`
- `examples/policy.yaml`
- `docs/mcp-lock-spec.md`
- `docs/policy-yaml-spec.md`
