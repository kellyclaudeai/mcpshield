# mcp.lock Specification

## Overview

The `mcp.lock` file is a lockfile that pins exact versions of MCP servers, their artifacts, and security metadata. It serves as the source of truth for which servers are approved to run in your environment.

## Purpose

1. **Reproducibility**: Pin exact versions and artifact digests to ensure consistent deployments
2. **Security**: Record security scan results and approval metadata
3. **Auditability**: Track who approved what, when, and why
4. **Verification**: Enable cryptographic verification of server artifacts

## File Location

- **Project-level**: `./mcp.lock` in project root
- **User-level**: `~/.mcp/mcp.lock` for global user configuration
- **System-level**: `/etc/mcp/mcp.lock` for system-wide policies

## Schema Version

Current version: `1.0`

The `version` field is required and must match the schema version. Future schema changes will increment this version.

## Structure

### Root Object

```json
{
  "version": "1.0",
  "generatedAt": "2026-02-04T22:30:00Z",
  "generatedBy": { ... },
  "servers": [ ... ]
}
```

#### Fields

- **version** (required): Schema version string, currently `"1.0"`
- **generatedAt** (optional): ISO 8601 timestamp of when lockfile was generated
- **generatedBy** (optional): Metadata about the tool/user that generated this file
  - `tool`: Tool name and version (e.g., `"mcp-shield@1.0.0"`)
  - `user`: Username or identifier of who approved the servers
- **servers** (required): Array of locked server entries

### Locked Server Entry

Each server entry represents one approved MCP server with its full metadata.

```json
{
  "name": "io.github.user/server-name",
  "version": "1.2.3",
  "description": "Human-readable description",
  "source": { ... },
  "repository": { ... },
  "publisherIdentity": { ... },
  "packages": [ ... ],
  "security": { ... },
  "approvedBy": "alice@example.com",
  "approvedAt": "2026-02-04T22:30:00Z",
  "notes": "Optional notes"
}
```

#### Required Fields

- **name**: Server name in reverse-DNS format (e.g., `io.github.username/server-name`)
  - Must match pattern: `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`
  - Must contain exactly one forward slash
- **version**: Exact semantic version from registry (e.g., `"1.2.3"`)
- **source**: Object describing where the server came from
  - `type`: One of `"registry"`, `"git"`, `"url"`
  - `registry`: Registry URL (for type=registry)
  - `url`: Direct URL (for type=url or git)
  - `commit`: Git commit SHA (for type=git, 40 hex chars)
- **packages**: Array of at least one package artifact (see below)

#### Optional Fields

- **description**: Human-readable description of server functionality
- **repository**: Source code repository metadata
  - `url`: Repository URL (e.g., GitHub URL)
  - `source`: Hosting service (e.g., `"github"`, `"gitlab"`)
  - `id`: Repository ID from hosting service
- **publisherIdentity**: Verified publisher information
  - `namespace`: Verified namespace (e.g., `"io.github.username"`)
  - `verificationMethod`: How identity was verified (`"github"`, `"dns"`, `"http"`)
  - `verifiedAt`: ISO 8601 timestamp of verification
- **security**: Security scan results (see Security Metadata section)
- **approvedBy**: Identifier of who approved this server
- **approvedAt**: ISO 8601 timestamp of approval
- **notes**: Free-form notes about this server

### Package Artifact

Each package represents a distributable artifact for the server (npm, Docker, etc.).

```json
{
  "registryType": "npm",
  "identifier": "@scope/package-name",
  "version": "1.2.3",
  "artifactDigest": "sha256:abc123...",
  "registryBaseUrl": "https://registry.npmjs.org",
  "runtimeHint": "npx",
  "transport": { "type": "stdio" },
  "environmentVariables": [ ... ]
}
```

#### Required Fields

- **registryType**: Package registry type
  - Allowed values: `"npm"`, `"pypi"`, `"oci"`, `"nuget"`, `"mcpb"`
- **identifier**: Package identifier
  - For npm: Package name (e.g., `"@scope/name"`)
  - For PyPI: Package name
  - For OCI: Full image reference (e.g., `"docker.io/user/image:tag"`)
  - For MCPB: URL to `.mcpb` file
- **version**: Exact package version (no ranges)
- **artifactDigest**: Cryptographic hash of the artifact
  - Format: `"sha256:..."` or `"sha512:..."`
  - Must be 64 hex chars for sha256, 128 for sha512
  - Pattern: `^(sha256|sha512):[a-f0-9]{64,128}$`
- **transport**: Transport protocol configuration
  - `type`: One of `"stdio"`, `"sse"`, `"streamable-http"`

#### Optional Fields

- **registryBaseUrl**: Base URL of package registry
- **runtimeHint**: Suggested runtime (`"npx"`, `"uvx"`, `"docker"`, `"dnx"`)
- **environmentVariables**: Array of required environment variables
  - `name`: Variable name
  - `description`: Human-readable description
  - `isRequired`: Boolean, default false
  - `isSecret`: Boolean, default false

### Security Metadata

Security scan results and attestations.

```json
{
  "scanVersion": "1.0.0",
  "scannedAt": "2026-02-04T22:15:00Z",
  "verdict": "clean",
  "riskScore": 15,
  "findings": [ ... ],
  "dependencies": { ... },
  "cloudAttestation": { ... }
}
```

#### Fields

- **scanVersion**: Version of security scanning tool used
- **scannedAt**: ISO 8601 timestamp of when scanning was performed
- **verdict**: Overall security verdict
  - Allowed values: `"clean"`, `"warning"`, `"suspicious"`, `"malicious"`, `"unknown"`
- **riskScore**: Numeric risk score from 0 (safe) to 100 (critical)
- **findings**: Array of security findings
  - `severity`: `"info"`, `"low"`, `"medium"`, `"high"`, `"critical"`
  - `category`: Type of finding
    - `"vulnerability"`: Known CVE or security vulnerability
    - `"typosquat"`: Package name similarity to popular packages
    - `"suspicious-code"`: Code patterns that may indicate malicious behavior
    - `"config-risk"`: Dangerous default configurations
    - `"network-egress"`: Unexpected network access
    - `"credential-access"`: Access to credentials or secrets
  - `message`: Human-readable description
  - `cve`: CVE identifier if applicable (pattern: `^CVE-\\d{4}-\\d+$`)
  - `details`: Additional context (object)
- **dependencies**: Dependency analysis
  - `total`: Total number of dependencies
  - `direct`: Number of direct dependencies
  - `vulnerabilities`: Breakdown by severity
    - `critical`, `high`, `medium`, `low`: Counts
- **cloudAttestation**: Cloud verification (MCPShield Cloud feature)
  - `signature`: Digital signature from MCPShield Cloud
  - `attestedAt`: ISO 8601 timestamp
  - `verificationUrl`: URL to view full attestation

## Validation Rules

### Name Validation

Server names must follow reverse-DNS format:
- Pattern: `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`
- Exactly one forward slash separator
- Namespace on left, server name on right

Valid examples:
- `io.github.username/server-name`
- `com.example/my-server`
- `ai.anthropic.internal/claude-tools`

Invalid examples:
- `my-server` (no namespace)
- `io.github.user/sub/server` (multiple slashes)
- `invalid_namespace/server` (underscore in namespace)

### Version Validation

- Must be a specific version string
- Version ranges are **NOT** allowed:
  - ❌ `^1.2.3`
  - ❌ `~1.2.3`
  - ❌ `>=1.2.3`
  - ❌ `1.x`
  - ❌ `latest`
- Recommended to use semantic versioning (e.g., `1.2.3`)
- Non-semantic versions allowed but may not sort predictably

### Digest Validation

- Must use SHA-256 or SHA-512
- Format: `sha256:` or `sha512:` followed by hex digits
- SHA-256: Exactly 64 hex characters
- SHA-512: Exactly 128 hex characters
- Case-insensitive (but lowercase recommended)

Example valid digests:
```
sha256:fe333e598595000ae021bd27117db32ec69af6987f507ba7a63c90638ff633ce
sha512:abc123...def (128 chars total)
```

## Workflow

### Initial Setup

1. Run `mcp-shield add <server-name>` to add a server
2. MCPShield fetches metadata from registry
3. Verifies publisher identity
4. Downloads and hashes artifacts
5. Runs security scanning
6. Prompts for approval
7. Writes entry to `mcp.lock`

### Verification

1. Run `mcp-shield verify` periodically
2. Re-fetches artifacts for all servers in lockfile
3. Compares digests against lockfile
4. Reports any mismatches (supply chain attack detection)

### Updates

1. Run `mcp-shield update <server-name>` to update a specific server
2. Or `mcp-shield update --all` to check all servers for updates
3. Shows changelog and security scan for new version
4. Requires approval before updating lockfile

## Security Considerations

### Artifact Pinning

The `artifactDigest` field is critical for security:
- Prevents supply chain attacks via registry compromise
- Ensures bit-for-bit reproducibility
- Detects package resurrection attacks

Always verify digests match before execution.

### Publisher Identity

The `publisherIdentity` section provides trust anchoring:
- Verifies namespace ownership (GitHub, DNS, HTTP challenge)
- Detects namespace takeover attacks
- Provides attribution for security incidents

### Git Commits

For Git sources, always pin to commit SHA, never branch name:
- ✅ `commit: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"`
- ❌ `branch: "main"` (mutable, unsafe)

## Example

See [examples/mcp.lock.example.json](../examples/mcp.lock.example.json) for a complete example.

## Migration

From no lockfile to mcp.lock:
```bash
# Scan existing MCP configuration and generate lockfile
mcp-shield scan --generate-lock

# Review and approve
cat mcp.lock

# Commit to version control
git add mcp.lock
git commit -m "Add MCP server lockfile"
```

## Best Practices

1. **Always commit mcp.lock to version control**
2. **Run `mcp-shield verify` in CI** to detect supply chain attacks
3. **Review security findings** before approving new servers
4. **Pin to specific versions**, never use version ranges
5. **Regenerate periodically** to get updated security scans
6. **Use cloud attestations** for high-security environments
7. **Document approval decisions** in the `notes` field
8. **Rotate approvals** - have multiple reviewers for critical servers

## See Also

- [policy.yaml specification](./policy-yaml-spec.md)
- [Security scanning methodology](./security-scanning.md)
- [CLI reference](./cli-reference.md)
