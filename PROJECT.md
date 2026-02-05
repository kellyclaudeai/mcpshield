# MCPShield - MCP Registry Security & Trust Layer

## Vision
A trust layer for MCP servers that verifies authenticity/provenance, scans for malicious/unsafe behavior, and enforces least-privilege policies at runtime for tools/* + resources/* calls over MCP's JSON-RPC connections.

## Three Components

### 1. MCPShield CLI (open-core, viral)
- Discovers MCP servers used by a project/machine
- Pulls official metadata from MCP Registry
- Verifies publisher identity / namespace constraints
- Produces lockfile + human-readable permission manifest

**Key Commands:**
- `mcp-shield add <server-name>` → fetch metadata, verify, scan, write lockfile
- `mcp-shield scan` → scan installed servers + dependencies, produce report
- `mcp-shield verify` → verify signatures/digests/attestations against lockfile
- `mcp-shield policy init` → generate least-privilege policy stubs
- `mcp-shield ci` → fails PRs if new/changed MCP servers aren't approved

### 2. MCPShield Cloud (paid, moat)
- Runs heavier scanning (SCA/SAST, behavior heuristics, reputation feeds)
- Maintains intel graph: digest → known bad/suspicious/clean
- Issues/verifies attestations (build provenance, SBOM, scan results)
- Hosts trust UI ("why is this safe?")

### 3. MCPShield Runtime Guard (enforcement)
- Local proxy/daemon between MCP Host and MCP Servers
- Watches JSON-RPC messages and enforces policy decisions
- Enforces tool invocation / resource read policies

## Core Requirements

### A. Authenticity & Provenance
- Resolve server identity from Registry metadata
- Validate namespace ownership model
- Bind server metadata ↔ package metadata
- Signed releases + attestations (enterprise)

### B. Security Scanning
- Dependency risk: known vulns, suspicious deps, typosquats
- Behavior heuristics: unexpected network egress, credential scraping
- Config risk: dangerous defaults, overly broad filesystem roots
- Prompt/tool surface risk: tool names/descriptions that encourage unsafe actions

### C. Least-Privilege Policy Enforcement
1. Server allow/deny (namespace-based)
2. Tool-level rules (allow specific tools, constrain args)
3. Capability boundaries (filesystem roots, network egress, secrets, budgets)

### D. Auditability
- Track who installed what, when, why
- Log all tool calls with args and approval context
- Tamper-evident logs

## Data Model

### mcp.lock
```yaml
servers:
  - serverName: io.github.someone/brave-search
    serverVersion: 1.2.3
    source: registry://...
    artifactDigest: sha256:...
    publisherIdentity: {...}
    approvedTools:
      - name: search
        schemaHash: abc123...
    allowedEgress:
      - brave.com
      - api.brave.com
    requiredEnvVars:
      - BRAVE_API_KEY
```

### policy.yaml
```yaml
rules:
  allowNamespaces:
    - io.github.my-org/*
  denyUnverified: true
  requireApprovalFor:
    - filesystem
    - network
  toolConstraints:
    - tool: "*/search"
      maxCallsPerMinute: 60
      allowedDomains: ["*.brave.com"]
```

### Cloud reputation record
```json
{
  "artifactDigest": "sha256:...",
  "verdict": "clean|suspicious|malicious",
  "evidence": {...},
  "publisherReputation": 0.95
}
```

## MVP Boundaries

**MVP:** CLI + lockfile + baseline scanning + CI integration
- Read from official MCP Registry
- Pin + verify artifacts
- Catch obvious supply-chain issues
- Produce permission manifest

**V1:** Hosted verification + reputation feed
- Known-bad digest updates
- Verified publisher program

**V2:** Runtime guard
- Turn scanner into control plane

## Monetization
- **Free:** CLI + local scanning + lockfile
- **Pro (per seat):** Hosted deep scanning + reputation feed + GitHub App
- **Enterprise:** Policy server, SSO, audit retention, SIEM export, private registry mirroring

## Why This Wins
1. MCP Registry explicitly expects downstream aggregators to add scanning/ratings/curation
2. Incidents like postmark-mcp create ongoing demand for security intel graph
3. Runtime guard creates lock-in via policy + approvals + audit

## References
- MCP Registry spec and supply-chain incident context provided
- Registry uses reverse-DNS naming and publisher verification
- postmark-mcp: canonical exfil example
