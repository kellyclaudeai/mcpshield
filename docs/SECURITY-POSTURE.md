# MCPShield Security Posture

**Last updated:** 2026-02-05  
**Version:** Community Edition v1.0.0 (MVP)

This document provides an honest assessment of MCPShield's security capabilities, threat model, and current limitations. We believe transparency builds trust.

---

## Executive Summary

**What MCPShield protects against:**
- ✅ Typosquatting attacks (similar package names)
- ✅ Known malicious code patterns (eval, exec, obfuscation)
- ✅ Artifact drift (changes after approval)
- ✅ Namespace hijacking (claiming others' identities)
- ⚠️ Dependency confusion (partial — npm only, basic checks)
- ⚠️ Known vulnerabilities (planned via OSV integration in PR-007)

**What MCPShield does NOT protect against:**
- ❌ Zero-day exploits in MCP servers
- ❌ Social engineering attacks
- ❌ Runtime behavior after installation
- ❌ Vulnerabilities in the MCP protocol itself
- ❌ Malicious code that evades static analysis

**Bottom line:** MCPShield is a **supply chain defense layer**, not a silver bullet. It reduces risk significantly but requires defense-in-depth.

---

## Threat Model

### Assumptions

1. **Attacker goal:** Compromise a developer's machine or steal secrets via malicious MCP servers
2. **Attack vectors:** 
   - Publish malicious server to MCP Registry
   - Compromise an existing server's npm/PyPI package
   - Typosquat popular server names
   - Hijack namespaces after ownership transfer
3. **Defender goal:** Prevent installation of malicious MCP servers before they execute

### Threat Scenarios

#### 1. Typosquatting Attack
**Scenario:** Attacker publishes `io.github.filesysem` (typo of `filesystem`)

**MCPShield defense:**
- ✅ Levenshtein distance check flags similar names
- ✅ Warning displayed during `mcp-shield add`
- ✅ User must explicitly approve

**Residual risk:** User ignores warning and installs anyway

**Mitigation:** Improve UX with clear severity indicators (🟢🟡🔴)

---

#### 2. Malicious Code Injection
**Scenario:** Attacker publishes server with `eval(base64_decode(...))` to hide malicious payload

**MCPShield defense:**
- ✅ Pattern matching detects `eval()`, `exec()`, obfuscation
- ✅ Risk score increases with suspicious patterns
- ✅ Verdict: "suspicious" or "malicious" triggers warning

**Residual risk:** Sophisticated obfuscation bypasses pattern matching

**Mitigation:** 
- PR-007: Sandbox code analysis (don't execute, just parse AST)
- Cloud backend: ML-based detection of anomalies

---

#### 3. Supply Chain Compromise
**Scenario:** Popular server `io.github.modelcontextprotocol/filesystem` gets compromised; attacker publishes malicious version 2.0.1

**MCPShield defense:**
- ✅ Lockfile prevents automatic upgrades
- ✅ `mcp-shield verify` detects artifact drift
- ⚠️ User must manually run `verify` (not automatic)

**Residual risk:** User doesn't run `verify` regularly

**Mitigation:**
- CI/CD integration (auto-verify daily)
- Cloud backend: Email alerts for new versions of locked servers

---

#### 4. Namespace Hijacking
**Scenario:** GitHub user `alice` transfers ownership of `io.github.alice/server` to attacker

**MCPShield defense:**
- ✅ Lockfile records verified owner at time of `add`
- ✅ `mcp-shield verify` can detect ownership changes (future feature)
- ❌ Current implementation doesn't re-verify ownership

**Residual risk:** Ownership changes go undetected

**Mitigation:**
- PR-003: Policy rule to block ownership changes
- Cloud backend: Track ownership history

---

#### 5. Dependency Confusion
**Scenario:** Attacker publishes malicious npm package with same name as internal package

**MCPShield defense:**
- ⚠️ Basic checks (compare npm vs. registry metadata)
- ❌ No private registry support yet

**Residual risk:** Organizations with internal MCP servers at risk

**Mitigation:**
- PR-005: Hardened npm resolver with scope awareness
- Future: Private registry support

---

#### 6. Install Script Attack
**Scenario:** npm package with malicious `postinstall` script runs arbitrary code during `npm install`

**MCPShield defense:**
- ✅ Detects lifecycle scripts in `package.json`
- ✅ Warns if scripts contain suspicious commands
- ❌ Doesn't block `npm install` itself (out of scope)

**Residual risk:** User runs `npm install` outside MCPShield

**Mitigation:**
- Document best practice: `npm install --ignore-scripts` for untrusted packages
- Future: Runtime guard that intercepts MCP server execution

---

## Security Boundaries

### What MCPShield Scans

✅ **In scope:**
- npm package tarballs
- PyPI wheels/sdists
- `package.json` metadata
- Code patterns in JavaScript/TypeScript
- Dependency trees (npm only)

❌ **Out of scope:**
- Docker images (planned, not implemented)
- Git repositories (we scan artifacts, not source)
- Binary executables (no support for compiled code)
- Runtime behavior (static analysis only)

### Static Analysis Limitations

**Current implementation:**
- Simple regex-based pattern matching
- No abstract syntax tree (AST) parsing
- No control flow analysis
- No taint tracking

**This means:**
- **We can detect:** `eval(userInput)` directly in code
- **We miss:** Complex obfuscation like `[this[String.fromCharCode(101,118,97,108)]](code)`

**Planned improvements (PR-007):**
- AST parsing with `@babel/parser` (JavaScript) and `ast` module (Python)
- Sandboxed analysis (no execution of untrusted code)
- Heuristic detection of obfuscation techniques

---

## Verification Methods

### GitHub Namespace Verification

**How it works:**
1. Parse namespace: `io.github.owner/repo`
2. Call GitHub API: `GET /repos/owner/repo`
3. Verify repository exists and matches name

**Limitations:**
- ❌ Doesn't verify **who** made the release
- ❌ Doesn't check for compromised GitHub accounts
- ❌ Relies on GitHub API availability

**Threat:** Attacker compromises GitHub account → publishes malicious release → passes verification

**Mitigation:**
- Future: Require GPG-signed commits
- Future: Verified publisher program with 2FA requirement

### npm Package Verification

**How it works:**
1. Fetch package metadata from registry
2. Download tarball
3. Compute SHA-512 digest
4. Compare with npm's integrity hash

**Limitations:**
- ❌ Trusts npm registry (no independent verification)
- ❌ SHA-512 only verifies integrity, not authenticity
- ❌ No support for npm signatures (planned but not spec'd yet)

**Threat:** Compromised npm registry serves malicious package with valid digest

**Mitigation:**
- Lock to specific versions in `mcp.lock.json`
- Monitor npm status and security advisories
- Future: Support Sigstore signatures when npm adopts them

---

## Artifact Integrity

### Digest Algorithms

**Supported:**
- SHA-512 (primary)
- SHA-256 (fallback)

**Format:** Subresource Integrity (SRI) — `sha512-<base64>`

**Verification process:**
1. Download artifact to memory (max 100 MB by default)
2. Stream through hash function
3. Encode as base64
4. Compare with lockfile digest

**Limitations:**
- ❌ No support for artifact signatures (GPG, Sigstore)
- ❌ Assumes digest in lockfile is trustworthy (user must audit initially)
- ❌ Size limit (100 MB) can be bypassed with compression tricks

**Mitigation:**
- PR-002: Atomic lockfile writes prevent corruption
- Future: Support PGP/Sigstore signatures

---

## Scanner Safety

### Current Implementation (MVP)

**Risks:**
- 🔴 **CRITICAL:** Regex patterns can cause ReDoS (Regular Expression Denial of Service)
- 🔴 **CRITICAL:** No timeout on scanning (large files can hang)
- 🟡 Simple pattern matching misses sophisticated attacks

**Why it's not production-ready:**
- Scanning untrusted code is inherently risky
- MVP prioritized functionality over hardening
- PR-007 addresses these issues before public launch

### PR-007: Scanner Safety Hardening

**Planned fixes:**
- ✅ Timeouts on all scan operations (configurable, default 30s)
- ✅ ReDoS-safe regex patterns (tested with `safe-regex`)
- ✅ Sandboxed AST parsing (no `eval`, no execution)
- ✅ Memory limits (prevent zip bombs, decompression attacks)
- ✅ Input validation (reject malformed archives)

**Additional safeguards:**
- Run scanner in separate process (isolate crashes)
- Resource limits via `ulimit` (CPU, memory)
- Optional: Run in Docker container for OS-level isolation

---

## Lockfile Security

### Integrity Protection

**Current (MVP):**
- JSON file written atomically
- No encryption or signatures
- User must manually commit to Git

**Risks:**
- ❌ Attacker with file system access can modify `mcp.lock.json`
- ❌ No way to verify lockfile came from trusted source

**Mitigation:**
- PR-002: Add `lockfileHash` field (hash of previous lockfile)
- PR-002: Detect tampering by comparing hashes
- PR-003: Policy to require GPG-signed commits for lockfile changes

### Recommendations

**Best practices:**
1. Store `mcp.lock.json` in Git (version control)
2. Require code review for lockfile changes (GitHub branch protection)
3. Sign commits with GPG key
4. Run `mcp-shield verify` in CI on every PR

---

## Policy Enforcement

### Current Capabilities (Planned in PR-003)

**policy.yaml** will support:
```yaml
version: 1.0.0
rules:
  maxRiskScore: 50
  requireVerification: true
  allowNamespaces:
    - io.github.modelcontextprotocol/*
  blockPatterns:
    - eval
    - child_process
```

**Enforcement:**
- CLI respects policies during `add` and `verify`
- Exit code 1 if policy violation
- Machine-readable output (JSON/YAML)

**Limitations:**
- ❌ Policies are advisory, not enforced by OS
- ❌ User can edit policy file to bypass
- ❌ No centralized policy management (enterprise)

**Mitigation:**
- CI/CD integration makes bypass harder (policy in Git)
- Future: Runtime guard enforces policies at OS level

---

## Non-Goals

We explicitly **do not aim** to solve these problems (at least not in v1):

### 1. Runtime Monitoring
**Why not:** Out of scope for MVP. Static analysis can't detect runtime behavior.

**Alternative:** Phase 5 roadmap includes "Runtime Guard" (MCP proxy)

### 2. MCP Protocol Security
**Why not:** Protocol design is Anthropic's responsibility.

**Recommendation:** Follow MCP spec's security guidelines

### 3. Social Engineering
**Why not:** Humans are the weakest link. No amount of tooling prevents "install this server, it's totally safe!"

**Recommendation:** Security awareness training for developers

### 4. Perfect Detection
**Why not:** Static analysis has false positives and false negatives. There's no way to catch every attack.

**Philosophy:** Defense-in-depth. MCPShield is one layer, not the only layer.

### 5. Post-Compromise Recovery
**Why not:** If attacker already has code execution, MCPShield can't help.

**Recommendation:** Incident response plan, backups, secrets rotation

---

## Defense-in-Depth Recommendations

MCPShield works best as part of a layered security strategy:

### Layer 1: Pre-Installation (MCPShield)
- ✅ Scan before adding to lockfile
- ✅ Verify digests and ownership
- ✅ Check reputation (Pilot Pro)

### Layer 2: Installation
- 🟡 Use `npm install --ignore-scripts` for untrusted packages
- 🟡 Run servers in containers (Docker, Podman)
- 🟡 Limit filesystem access with mount permissions

### Layer 3: Runtime
- 🟢 Monitor MCP server behavior (logs, network calls)
- 🟢 Use firewall to block unexpected network traffic
- 🟢 Run with least-privilege user (not root!)

### Layer 4: Detection & Response
- 🟢 Security information and event management (SIEM)
- 🟢 Audit logs for all MCP tool calls
- 🟢 Automated alerting for anomalies

### Layer 5: Recovery
- 🟢 Regular backups (offline, immutable)
- 🟢 Incident response playbook
- 🟢 Secrets rotation procedures

---

## Vulnerability Disclosure

If you find a security issue in MCPShield itself:

1. **DO NOT** open a public GitHub issue
2. Email **security@mcpshield.dev** with details
3. Use our PGP key (coming soon) for sensitive reports
4. Expect response within 48 hours

We follow coordinated disclosure:
- 90-day disclosure timeline (sooner if actively exploited)
- Credit to researcher (unless anonymous)
- CVE assignment for confirmed vulnerabilities

See **SECURITY.md** for full policy.

---

## Threat Intelligence

We track threats to the MCP ecosystem:

**Known attacks (as of 2026-02-05):**
- None publicly disclosed yet

**Hypothetical risks:**
- Typosquatting (based on npm/PyPI precedent)
- Supply chain compromise (Log4Shell-style)
- Malicious servers mimicking official ones

**Monitoring:**
- MCP Registry submissions
- GitHub security advisories
- npm/PyPI security feeds
- Community reports (Discord, GitHub Discussions)

---

## Compliance & Certifications

**Current status:**
- ❌ No formal security audit yet
- ❌ No SOC 2 or ISO 27001 certification
- ✅ Open source (community review)

**Planned (Enterprise tier):**
- External security audit (Q3 2026)
- Penetration testing
- SOC 2 Type II certification

---

## Conclusion

MCPShield significantly reduces supply chain risk for MCP servers, but it's not a complete solution. We're honest about limitations because **informed users make better security decisions**.

**Key takeaways:**
1. MCPShield catches known bad patterns — not zero-days
2. Lockfile prevents drift — but only if you use it
3. Verification requires trust in registries (GitHub, npm)
4. Defense-in-depth is essential

**Our commitment:**
- Continuous improvement (see ROADMAP.md)
- Transparency about risks
- Rapid response to vulnerabilities
- Community-driven development

Questions? Open a GitHub Discussion or email support@mcpshield.dev

---

**Threat model version:** 1.0.0  
**Next review:** Q2 2026 (after Pilot Pro launch)
