# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

MCPShield is a security tool, and we take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

Send vulnerability reports to: **security@kellyclaudeai.com**

Include in your report:

- **Description** - Clear explanation of the vulnerability
- **Impact** - What an attacker could do with this vulnerability
- **Steps to Reproduce** - Detailed reproduction steps
- **Affected Versions** - Which versions are vulnerable
- **Suggested Fix** - If you have ideas (optional)
- **Your Contact Info** - So we can follow up

### What to Expect

1. **Acknowledgment** - We'll confirm receipt within 48 hours
2. **Assessment** - We'll investigate and determine severity
3. **Fix Development** - We'll work on a patch
4. **Coordinated Disclosure** - We'll coordinate the release with you
5. **Credit** - We'll credit you in the release notes (unless you prefer anonymity)

### Scope

Security issues in MCPShield that we consider in scope:

- **Authentication bypass** - Bypassing namespace verification
- **Digest validation bypass** - Artifact integrity checks being defeated
- **Injection vulnerabilities** - Command injection, path traversal
- **Denial of service** - Resource exhaustion, infinite loops
- **Information disclosure** - Leaking sensitive data
- **Supply chain attacks** - Issues in dependencies or build process

Out of scope:

- Social engineering attacks
- Physical attacks
- Issues in third-party MCP servers (report to them directly)
- Theoretical attacks without proof of concept

### Security Best Practices

When using MCPShield:

1. **Keep it updated** - Always use the latest version
2. **Review lockfiles** - Check changes to `mcp.lock.json` in code review
3. **Use `--yes` carefully** - Don't bypass security prompts automatically
4. **Audit regularly** - Run `mcp-shield verify` and `mcp-shield scan` regularly
5. **Report suspicious servers** - If you find a malicious MCP server, let us know

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

We support the latest minor version with security updates. Please upgrade to receive fixes.

## Security Architecture

MCPShield's security model:

- **Lockfile integrity** - `mcp.lock.json` is the source of truth
- **Artifact verification** - All downloads are verified with cryptographic digests
- **Namespace verification** - GitHub/npm ownership is validated
- **Static analysis** - Code patterns are scanned before execution
- **Isolation** - Scanning happens in isolated environments (future: sandboxing)

### Known Limitations

Current security limitations to be aware of:

- **No runtime enforcement** - MCPShield verifies at install time, not runtime
- **Scanner bypass** - Sophisticated obfuscation may evade pattern matching
- **Dependency depth** - Deep transitive dependencies are not fully analyzed
- **Zero-day protection** - Unknown vulnerabilities may not be detected

Future improvements (roadmap):

- Runtime MCP protocol proxy
- Deep scanning with sandboxed execution
- Machine learning-based malware detection
- Community reputation system

## Hall of Fame

Security researchers who have responsibly disclosed vulnerabilities:

_None yet - be the first!_

---

Thank you for helping keep MCPShield and the MCP community safe! 🛡️
