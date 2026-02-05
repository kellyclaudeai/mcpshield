# Support

## Getting Help

### Free Community Support

For general questions, bug reports, and feature requests:

- **GitHub Issues** - [Report bugs or request features](https://github.com/kellyclaudeai/mcpshield/issues)
- **GitHub Discussions** - [Ask questions and share ideas](https://github.com/kellyclaudeai/mcpshield/discussions)
- **Documentation** - Check the [README](README.md) and [docs/](docs/) folder

**Response time:** Best effort, typically within a few days.

### Paid Support & Consulting

For enterprises and teams that need:

- **Priority support** - Guaranteed response times
- **Custom integrations** - Integrate MCPShield into your workflow
- **Security consulting** - MCP supply chain security advice
- **Feature development** - Custom features for your use case
- **Training & workshops** - Team training on MCP security
- **Compliance support** - Help with security audits and compliance

**Contact:** support@kellyclaudeai.com

Include in your inquiry:

- Company name and size
- Use case / what you need help with
- Timeline and budget (if applicable)
- Contact information

We'll respond within 1 business day with pricing and options.

## Frequently Asked Questions

### Installation & Setup

**Q: How do I install MCPShield?**

A: Two options:

```bash
# Option 1: Run directly with npx (recommended)
npx @kellyclaude/mcpshield init

# Option 2: Clone and build from source
git clone https://github.com/kellyclaudeai/mcpshield.git
cd mcpshield
npm install && npm run build
npm link packages/cli
```

**Q: Do I need to commit `mcp.lock.json` to version control?**

A: Yes! The lockfile should be committed so your team has a consistent, verified set of MCP servers.

**Q: What Node.js version do I need?**

A: Node.js >= 22.0.0

### Usage

**Q: How do I add a server from the MCP Registry?**

A:
```bash
mcp-shield add io.github.owner/server-name
```

**Q: Can I use servers not in the registry?**

A: Currently MCPShield focuses on registry servers. Support for arbitrary npm/PyPI packages is planned.

**Q: How often should I run `mcp-shield verify`?**

A: Run it in CI, before deployments, and periodically (daily/weekly) to detect drift.

**Q: What does "drift detected" mean?**

A: The artifact on the registry changed since you verified it. This could be benign (new version) or malicious (compromise).

### Security

**Q: Does MCPShield prevent all supply chain attacks?**

A: No tool provides 100% protection. MCPShield significantly reduces risk by verifying artifacts and scanning for known patterns, but sophisticated attacks may still succeed. Use defense in depth.

**Q: Can I trust a server with a "clean" verdict?**

A: A clean verdict means no known suspicious patterns were found. You should still review the server's code and permissions before use.

**Q: What happens if a vulnerability is found in an approved server?**

A: We'll update the scanner rules. Run `mcp-shield scan` again to re-check your servers.

### Contributing

**Q: How can I contribute?**

A: See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

**Q: Can I add new security rules?**

A: Yes! The scanner is extensible. Submit a PR with new rules in `packages/scanner/src/scanner.ts`.

## Reporting Issues

When reporting bugs, please include:

1. **MCPShield version** - Run `mcp-shield --version`
2. **Node.js version** - Run `node --version`
3. **Operating system** - macOS, Linux, Windows
4. **Command you ran** - Exact command that failed
5. **Error message** - Full error output
6. **Expected vs actual** - What you expected to happen

Example:

```
MCPShield version: 0.1.0
Node version: v18.17.0
OS: macOS 14.2
Command: mcp-shield add io.github.user/server
Error: TypeError: Cannot read property 'version' of undefined
Expected: Should add server to lockfile
Actual: Crashed with error
```

## Feature Requests

We welcome feature ideas! Before opening an issue:

1. Check if it's already been requested
2. Describe the use case (not just the solution)
3. Explain the problem you're trying to solve

## Sponsorship

Want to support MCPShield development?

- **GitHub Sponsors** - Coming soon
- **Enterprise support** - Contact support@kellyclaudeai.com

---

**Need help right now?** Open a [GitHub issue](https://github.com/kellyclaudeai/mcpshield/issues) or reach out to support@kellyclaudeai.com for paid support.
