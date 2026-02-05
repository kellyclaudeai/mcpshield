# MCPShield Roadmap

**Target:** Production-ready with monetization by **Q2 2026**

This roadmap outlines the next 90 days of development, focusing on features that make MCPShield enterprise-ready and position Pilot Pro as a compelling upgrade from the Community Edition.

---

## Timeline Overview

### Phase 1: Production Hardening (Weeks 1-4)
**Goal:** Make Community Edition rock-solid for open source launch

### Phase 2: Cloud Backend MVP (Weeks 5-8)
**Goal:** Ship Pilot Pro with first cloud-enhanced features

### Phase 3: CI/CD Integration (Weeks 9-12)
**Goal:** Make MCPShield a standard part of development workflows

---

## Week 1-4: Production Hardening
*Target: End of February 2026*

### Core Stability

- [x] **PR-001: Repository/legal baseline** ✅
  - MIT license, SECURITY.md, SUPPORT.md, CONTRIBUTING.md
  
- [ ] **PR-002: Lockfile schema + atomic writes**
  - JSON Schema validation for `mcp.lock.json`
  - Atomic file writes (temp + rename pattern)
  - Migration path for v1 → v2 schema
  
- [ ] **PR-003: Policy schema + enforcement**
  - YAML schema for `policy.yaml`
  - Policy validation and error messages
  - Default policy template
  
- [ ] **PR-004: CLI contract plumbing**
  - Structured output formats (JSON, YAML)
  - Exit codes contract (0=success, 1=policy violation, 2=error)
  - Machine-readable error messages
  
- [ ] **PR-005: NPM resolver hardening**
  - Retry logic with exponential backoff
  - Better error messages for registry failures
  - Offline mode (use cached artifacts only)
  
- [ ] **PR-006: Cache improvements**
  - XDG cache directory support
  - Cache size limits and LRU eviction
  - `mcp-shield cache clean` command

### Security Features

- [ ] **PR-007: Scanner safety + OSV integration** 🔴 CRITICAL
  - Sandboxed code analysis (no direct `eval` of untrusted code)
  - OSV database integration for known vulnerabilities
  - CVE lookup for npm/PyPI packages
  
- [ ] **PR-008: SARIF output**
  - GitHub Code Scanning format
  - Severity levels (error, warning, note)
  - Source locations for findings

### Infrastructure

- [ ] **PR-009: Release automation**
  - GitHub Actions for npm publish
  - Automated changelog generation
  - Version bumping workflow
  
- [ ] **PR-011: CI hardening**
  - Pre-commit hooks (lint, format, type-check)
  - GitHub Actions for PR validation
  - Test coverage reports
  
- [ ] **PR-012: Support tooling**
  - `mcp-shield doctor` command for debugging
  - `mcp-shield report` to generate support bundles
  - Better logging and diagnostics

**Milestone:** Community Edition v1.0.0 release 🎉

---

## Week 5-8: Cloud Backend MVP
*Target: End of March 2026*

### Cloud Infrastructure

- [ ] **Backend service scaffolding**
  - REST API with authentication (JWT)
  - PostgreSQL database for reputation data
  - S3-compatible storage for scan results
  - Deploy to Fly.io or Railway
  
- [ ] **Deep scanning pipeline**
  - Asynchronous job queue (BullMQ or similar)
  - Extract and analyze artifacts in isolated containers
  - Store findings and risk scores in database
  
- [ ] **Reputation database**
  - Schema: servers, versions, scans, reports, votes
  - API endpoints: `GET /servers/:namespace/reputation`
  - Community voting system (thumbs up/down)

### CLI Integration

- [ ] **Cloud authentication**
  - `mcp-shield login` command
  - API key management
  - Token refresh flow
  
- [ ] **Cloud-enhanced scanning**
  - Upload artifacts to backend for deep scan
  - Fetch reputation data during `add` workflow
  - Display community risk scores
  
- [ ] **`mcp-shield report` command**
  - Submit false positives
  - Report malicious servers
  - View server history

### Pilot Pro Features

- [ ] **Dashboard MVP** (web)
  - Sign up / login flow
  - Repository management
  - Scan history viewer
  - Billing integration (Stripe)
  
- [ ] **Email notifications**
  - New vulnerability alerts for locked servers
  - Weekly security digest
  - Policy violation alerts

**Milestone:** Pilot Pro beta launch 🚀

---

## Week 9-12: CI/CD Integration
*Target: End of April 2026*

### GitHub Actions

- [ ] **`mcpshield-action` repository**
  - Composite action for scanning
  - Auto-generate SARIF and upload to Code Scanning
  - PR comments with scan results
  
- [ ] **Workflow templates**
  - `.github/workflows/mcpshield.yml` examples
  - Integration with dependabot
  - Scheduled daily scans

### GitLab CI

- [ ] **`.gitlab-ci.yml` template**
  - Security scanning job
  - Artifact upload to GitLab Security Dashboard
  - Merge request integration

### Jenkins & CircleCI

- [ ] **Plugin or documentation**
  - Jenkins pipeline steps
  - CircleCI orb (if demand exists)
  - Generic CI/CD integration guide

### Developer Experience

- [ ] **VS Code extension** (stretch goal)
  - Inline lockfile viewer
  - Quick actions (add, verify, scan)
  - Security warnings in editor
  
- [ ] **Pre-commit hooks**
  - `mcp-shield verify` before commits
  - Block commits if policy violations detected
  - Configuration via `.mcpshield/hooks.yaml`

**Milestone:** CI/CD integrations production-ready ✅

---

## Pro Feature Candidates

These are features we're considering for **Pilot Pro** based on customer demand. They may shift in priority.

### High Priority (Q1 2026)

1. **Cloud-enhanced scanning** 🔥
   - Deep static analysis (more patterns, ML-based detection)
   - Behavioral analysis (detect obfuscation, crypto mining)
   - Historical vulnerability tracking

2. **Reputation database** 🔥
   - Community scores and reports
   - Verified publisher badges
   - Trust scores (0-100) for each server

3. **OSV integration** 🔥
   - Real-time CVE alerts
   - Email notifications for new vulnerabilities
   - Severity filtering (only alert for HIGH/CRITICAL)

4. **SARIF + GitHub Code Scanning** 🔥
   - Native integration with GitHub's security tab
   - PR blocking based on security findings
   - Trend analysis over time

### Medium Priority (Q2 2026)

5. **Advanced policy engine**
   - Custom rules (e.g., "block all servers with risk > 50")
   - Allowlist/denylist by namespace patterns
   - Conditional policies (dev vs prod environments)

6. **Runtime guard (MCP proxy)**
   - Intercept MCP tool calls
   - Enforce policies at runtime (e.g., block file writes to `/etc`)
   - Audit logging of all MCP interactions

7. **Dependency graph visualization**
   - Visual tree of MCP server dependencies
   - Highlight transitive dependencies
   - Interactive exploration in web dashboard

8. **Team collaboration**
   - Shared lockfiles across teams
   - Approval workflows (e.g., require 2 approvals before `add`)
   - Role-based access control (admin, developer, viewer)

### Lower Priority (Q3 2026+)

9. **SSO/SAML integration**
   - Okta, Auth0, Google Workspace
   - Enterprise user management
   - Centralized billing

10. **On-premise deployment**
    - Docker Compose for self-hosting backend
    - Air-gapped environments
    - Custom S3-compatible storage

11. **Compliance reports**
    - SOC 2, ISO 27001, GDPR support
    - Audit trail exports
    - Automated compliance checks

12. **Custom scanners**
    - Plugin API for custom security checks
    - Language-specific analyzers (Rust, Go, Python)
    - Integration with external SAST tools

---

## Beyond 90 Days (Q3 2026+)

### Runtime Security

- **MCP proxy with policy enforcement**
  - Block dangerous tool calls in real-time
  - Rate limiting per server
  - Request/response logging

- **Sandboxing and isolation**
  - Run MCP servers in containers
  - Resource limits (CPU, memory, network)
  - Firewall rules per server

### Ecosystem Growth

- **Verified publisher program**
  - Verified badges for trusted authors
  - Requirement: 2FA, signed commits, security audit
  - Incentives for high-quality servers

- **Public vulnerability database**
  - CVE-style identifiers for MCP server vulns
  - Disclosure process
  - Bug bounty program

- **MCP Registry integration**
  - Official partnership with registry.modelcontextprotocol.io
  - Display MCPShield scores on registry
  - Auto-scan new submissions

---

## How to Influence the Roadmap

We're building MCPShield for the community. Your feedback matters!

**Ways to contribute:**

1. **Vote on features** — Star GitHub issues to vote
2. **Request features** — Open discussions in GitHub Discussions
3. **Beta testing** — Join the Pilot Pro beta
4. **Pull requests** — Contribute code (see CONTRIBUTING.md)

**Priority is determined by:**
- Customer demand (Pilot Pro subscribers get more weight)
- Security impact (vulnerabilities = top priority)
- Ease of implementation (quick wins vs. long-term projects)
- Strategic value (features that differentiate MCPShield)

---

## Release Cadence

- **Community Edition:** Monthly releases (first Wednesday)
- **Pilot Pro backend:** Continuous deployment (multiple times per week)
- **Critical security fixes:** As needed (same-day patches)

---

## Success Metrics

We're tracking these KPIs to measure progress:

### Community Edition
- Weekly active users
- Servers scanned per week
- GitHub stars & forks
- Community contributions (PRs, issues)

### Pilot Pro
- Paying customers (target: 50 by end of Q2)
- Monthly recurring revenue (target: $5K MRR by Q2)
- Churn rate (target: <5% monthly)
- Net Promoter Score (target: >50)

### Security Impact
- Malicious servers detected and reported
- CVEs prevented via early warnings
- Supply chain attacks blocked

---

**Last updated:** 2026-02-05  
**Roadmap subject to change based on customer feedback and security priorities**
