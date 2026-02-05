# @mcpshield/cli

Command-line interface for MCPShield - Supply chain security for MCP servers.

## Installation

```bash
npm install -g @mcpshield/cli
```

## Commands

### `mcp-shield add <server-name>`

Add an MCP server to your project. Fetches metadata from the MCP Registry, verifies publisher identity, and displays comprehensive server information.

**Usage:**

```bash
# Add a server with reverse-DNS namespace format
mcp-shield add io.github.username/server-name

# Example with a verified server
mcp-shield add io.github.modelcontextprotocol/server-everything
```

**What it does:**

1. ✅ Validates namespace format (reverse-DNS: `io.github.user/name`)
2. 🔍 Fetches metadata from MCP Registry
3. 🔐 Verifies namespace ownership (GitHub matching)
4. 📋 Displays server details:
   - Name, version, description
   - Publisher status (official/verified/community)
   - GitHub repository
   - Package information
   - Verification status

**Output Example:**

```
📦 Adding MCP server: io.github.user/awesome-server

→ Validating namespace format...
✓ Valid namespace format

→ Fetching metadata from registry...
✓ Server found in registry

→ Verifying namespace ownership...
✓ Namespace verified (github)

📋 Server Details:

  Name: io.github.user/awesome-server
  Version: 1.2.3
  Description: An awesome MCP server for doing cool things
  Repository: https://github.com/user/awesome-server

  Publisher Status: ✓ Verified
  GitHub: user/awesome-server

  Verification:
    Method: github
    GitHub Owner: user
    GitHub Repo: awesome-server

  Packages: 1
    • npm: @user/awesome-server@1.2.3

→ Next: Download, scan, and add to lockfile
⚠ Download/scan/lockfile features coming soon!
```

**Coming Soon:**

- Artifact download and verification
- Security scanning
- Lockfile (`mcp.lock`) management
- Interactive approval flow

### `mcp-shield init`

Initialize MCPShield in your project (creates config files).

*Coming soon!*

### `mcp-shield verify`

Verify all servers in your lockfile against their declared digests.

*Coming soon!*

### `mcp-shield scan`

Scan all servers for security issues and generate a report.

*Coming soon!*

### `mcp-shield test-registry <server-name>`

[DEV] Quick test of the registry client with any server name (doesn't require reverse-DNS format).

```bash
mcp-shield test-registry postmark
```

## Requirements

- Node.js 18+ (uses ES modules)
- Internet connection (for registry access)

## Development

```bash
# Build
npm run build

# Test
npm test

# Run locally
node dist/cli.js add io.github.user/server
```

## Package Structure

```
packages/cli/
├── src/
│   ├── cli.ts           # Main CLI entry point
│   ├── commands/
│   │   ├── add.ts       # mcp-shield add command
│   │   └── index.ts     # Command exports
│   └── index.ts         # Package exports
├── dist/                # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## Dependencies

- **@mcpshield/core** - Registry client and namespace verification
- **commander** - CLI framework
- **chalk** - Terminal colors
- **ora** - Spinners
- **prompts** - Interactive prompts

## Project Status

The `add` command is functional and demonstrates the full fetch + verify flow. Download, scanning, and lockfile features are planned for the next phase.

See `TASKS.md` in the project root for the full roadmap.
