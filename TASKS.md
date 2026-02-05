# MCPShield Tasks

## Status Legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked

---

## Phase 1: MVP - CLI + Lockfile + Scanning

### Foundation
- [x] Research MCP Registry API and schema
  - ✅ Comprehensive research doc: `docs/mcp-registry-research.md` (13.5 KB)
  - ✅ Identified registry architecture, authentication, and data model
  - ✅ Documented supply chain attack vectors
  - ✅ Created integration roadmap
- [x] Design `mcp.lock` format
  - ✅ JSON Schema: `schemas/mcp.lock.schema.json` (10.7 KB)
  - ✅ Full specification: `docs/mcp-lock-spec.md` (10.1 KB)
  - ✅ Working example: `examples/mcp.lock.example.json` (7.0 KB)
  - ✅ Validation rules documented
- [x] Design `policy.yaml` format
  - ✅ JSON Schema: `schemas/policy.yaml.schema.json` (12.5 KB)
  - ✅ Full specification: `docs/policy-yaml-spec.md` (11.5 KB)
  - ✅ Comprehensive example: `examples/policy.yaml` (5.2 KB)
  - ✅ Covers namespace rules, tool policies, capability boundaries, audit config
- [ ] Set up project structure (monorepo: CLI + shared libs)
  - 💡 Suggested structure documented in `docs/implementation-guide.md`
- [x] Choose tech stack (likely Node.js/TypeScript for npm ecosystem alignment)
  - ✅ Recommendation: Node.js/TypeScript based on registry ecosystem analysis
  - ✅ Rationale: npm package handling, ecosystem alignment, TypeScript type safety

### CLI Core
- [ ] Implement `mcp-shield init` (scaffold config files)
- [x] Implement registry client (fetch server.json metadata)
  - ✅ Full RegistryClient class with error handling
  - ✅ Simple fetchServerMetadata() convenience function
  - ✅ Network error handling (404, 429, 5xx, timeouts)
  - ✅ Publisher identity extraction
  - ✅ Response validation
- [x] Implement namespace verification logic
  - ✅ Full NamespaceVerifier with reverse-DNS validation
  - ✅ GitHub namespace verification (io.github.*)
  - ✅ Custom domain namespace detection
  - ✅ Publisher identity extraction and matching
  - ✅ Registry official/verified status checking
  - ✅ 22 unit tests, 100% passing
- [ ] Implement artifact resolution (npm/PyPI/OCI)
- [ ] Implement digest verification

### `mcp-shield add` Command
- [x] Fetch server metadata from registry
  - ✅ Full integration with RegistryClient
  - ✅ Error handling for network failures and missing servers
- [x] Verify publisher identity
  - ✅ Namespace format validation
  - ✅ Full integration with NamespaceVerifier
  - ✅ GitHub namespace verification
  - ✅ Publisher status display (official/verified/community)
- [x] CLI command implementation
  - ✅ `packages/cli/src/commands/add.ts` (140 lines)
  - ✅ Commander.js integration in `cli.ts`
  - ✅ Colored output with chalk
  - ✅ Comprehensive server metadata display
- [ ] Download and hash artifact
- [ ] Run local scanning (see below)
- [ ] Generate policy stub
- [ ] Write to mcp.lock
- [ ] Interactive approval flow

### Local Scanning
- [ ] Dependency tree analysis
- [ ] Known vulnerability check (npm audit / safety equivalent)
- [ ] Typosquat detection (Levenshtein distance)
- [ ] Suspicious pattern matching (eval, exec, network calls in unexpected places)
- [ ] Config risk analysis (overly broad permissions)

### `mcp-shield verify` Command
- [ ] Read mcp.lock
- [ ] Re-fetch artifacts
- [ ] Compare digests
- [ ] Verify signatures (if available)
- [ ] Report drift

### `mcp-shield ci` Command
- [ ] Detect lockfile changes
- [ ] Require approval signature for new servers
- [ ] Integrate with CI exit codes
- [ ] Generate human-readable diff report

### `mcp-shield scan` Command
- [ ] Scan all servers in lockfile
- [ ] Generate security report
- [ ] Output formats: JSON, Markdown, SARIF

### Documentation
- [ ] README with quickstart
- [ ] CLI reference
- [ ] mcp.lock spec
- [ ] policy.yaml spec
- [ ] Security scanning methodology

### Testing
- [ ] Unit tests for core logic
- [ ] Integration tests with real registry
- [ ] E2E test: add → verify → scan flow
- [ ] CI setup (GitHub Actions)

### Additional Deliverables (Schema Design Phase)
- [x] Create implementation guide
  - ✅ `docs/implementation-guide.md` (18.2 KB)
  - ✅ TypeScript code examples for all components
  - ✅ CLI command implementations
  - ✅ Testing strategy
- [x] Document validation rules
  - ✅ `schemas/validation-rules.md` (13.0 KB)
  - ✅ Comprehensive edge case handling
  - ✅ Node.js and Python examples
- [x] Create schema documentation
  - ✅ `schemas/README.md` (4.5 KB)
  - ✅ Usage examples and IDE integration
- [x] Generate completion summary
  - ✅ `SCHEMA_DESIGN_SUMMARY.md` (11.7 KB)
  - ✅ Complete deliverables list
  - ✅ Design decisions and rationale

**Total Documentation**: 106 KB across 10 files  
**Schema Status**: Production-ready, fully validated

### Phase 2 Completion Summary (NEW! 🎉)

**Monorepo Structure**: ✅ Complete
- Root package.json with npm workspaces
- TypeScript 5.3 with Node16 module resolution
- Three packages with proper dependency graph
- Build system: `npm run build` builds all packages
- Test system: Node.js built-in test runner with tsx

**@mcpshield/core**: ✅ Functional
- RegistryClient with full MCP Registry API support
- Complete type definitions (Server, Package, Lockfile, SecurityScan, etc.)
- Publisher identity extraction and verification
- Response validation
- **28 unit tests, 100% passing**
- Dependencies: got (HTTP), ajv (JSON validation)

**@mcpshield/cli**: ✅ Working (add command functional!)
- Commander.js-based CLI with proper structure
- **`mcp-shield add` command implemented** (fetch + verify metadata)
  - Validates reverse-DNS namespace format
  - Fetches server metadata from registry
  - Verifies publisher identity/namespace ownership
  - Displays comprehensive server details
  - Beautiful colored output
- Test command to verify registry client works
- Placeholder commands: init, verify, scan
- Dependencies: commander, chalk, ora, prompts

**@mcpshield/scanner**: ✅ Structure Ready
- Types defined (ScanResult, SecurityScanner interface)
- BasicScanner placeholder class
- Ready for implementation of scanning logic
- Dependencies: fast-levenshtein (typosquat detection)

**Files Created**: 22 new files
- 8 TypeScript source files
- 4 test files
- 6 package.json configs
- 4 tsconfig.json configs

**Test Results**:
```
✔ RegistryClient (28 tests, 0 failures)
  ✔ constructor (4 tests)
  ✔ getServer (3 tests)
  ✔ extractPublisherIdentity (6 tests)
  ✔ isVerified (4 tests)
  ✔ getVersion (2 tests)
  ✔ validateServerResponse (8 tests)
```

**Next Steps**: 
1. Implement artifact downloaders (npm, PyPI, Docker)
2. Implement digest verification (SHA-256/512)
3. Build security scanner with dependency analysis
4. Create lockfile manager (read/write mcp.lock)
5. Implement CLI commands (add, verify, scan)

---

## Phase 2: Cloud + Reputation Feed

### Backend
- [ ] Design API schema (REST + webhooks)
- [ ] Set up cloud infrastructure (serverless or K8s)
- [ ] Implement deep scanning pipeline
- [ ] Build reputation graph database
- [ ] Implement attestation issuance
- [ ] Set up monitoring + alerting

### Scanning Pipeline
- [ ] SAST (static analysis for common languages)
- [ ] Dependency SCA (comprehensive vuln DB)
- [ ] Sandbox execution traces
- [ ] Behavior heuristics (ML-based anomaly detection)
- [ ] Prompt injection risk analysis

### Trust UI
- [ ] Web app: search servers
- [ ] Server detail page (reputation, scan results, history)
- [ ] Verified publisher badges
- [ ] Attestation viewer
- [ ] Community reporting

### CLI Integration
- [ ] `mcp-shield login` (API key management)
- [ ] Cloud-enhanced scanning (`--cloud` flag)
- [ ] Push local scan results
- [ ] Fetch reputation updates

### Monetization
- [ ] Free tier rate limits
- [ ] Pro tier subscription (Stripe integration)
- [ ] Usage metering
- [ ] GitHub App for auto-scanning PRs

---

## Phase 3: Runtime Guard

### Guard Daemon
- [ ] Design proxy architecture (stdio/HTTP/WS transport support)
- [ ] Implement JSON-RPC interception
- [ ] Policy decision engine
- [ ] Real-time allowlist/denylist enforcement
- [ ] User approval prompts (GUI + CLI)

### Policy Enforcement
- [ ] Server-level allow/deny
- [ ] Tool-level rules
- [ ] Argument schema validation
- [ ] Network egress control (firewall integration)
- [ ] Filesystem boundary enforcement
- [ ] Secret redaction in logs

### Host Integration
- [ ] SDK for MCP hosts (TypeScript)
- [ ] Config format for hosts
- [ ] Hot-reload policies
- [ ] Performance optimization (low latency)

### Audit Trail
- [ ] Tamper-evident log format (hash-chained)
- [ ] Query interface (`mcp-shield logs`)
- [ ] Export to SIEM (Splunk, Datadog, etc.)
- [ ] Retention policies

### Documentation
- [ ] Runtime guard setup guide
- [ ] Policy authoring guide
- [ ] Host integration guide
- [ ] Security best practices

---

## Ongoing

### Marketing
- [ ] Landing page
- [ ] Blog post: "The MCP Supply Chain Problem"
- [ ] Case study: postmark-mcp incident
- [ ] Community engagement (MCP Discord, etc.)

### Growth
- [ ] Verified publisher program
- [ ] Open source partnerships
- [ ] Enterprise pilot customers
- [ ] Certifications (SOC2, etc.)

---

## Notes

- Priority: Get MVP CLI working ASAP to validate registry integration
- Real MCP Registry is in preview; stay aligned with their schema evolution
- postmark-mcp incident is perfect marketing case study
- Partner with registry maintainers early for visibility
