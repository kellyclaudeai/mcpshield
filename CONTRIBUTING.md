# Contributing to MCPShield

Thank you for your interest in contributing to MCPShield! This document explains how to set up your development environment, run tests, and submit contributions.

## Code of Conduct

Be respectful, constructive, and professional. We're all here to build something useful for the MCP community.

## Getting Started

### Prerequisites

- **Node.js** >= 22.0.0
- **pnpm** >= 10.0.0
- **Git**

### Setup

1. **Fork the repository** on GitHub

2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcpshield.git
   cd mcpshield
   ```

3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/kellyclaudeai/mcpshield.git
   ```

4. **Install dependencies:**
   ```bash
   pnpm install
   ```

5. **Build the project:**
   ```bash
   pnpm run build
   ```

6. **Run the CLI locally (optional):**
   ```bash
   node packages/cli/dist/cli.js --help
   ```

## Development Workflow

### Project Structure

MCPShield is a monorepo with pnpm workspaces:

```
mcpshield/
├── packages/
│   ├── core/          # Core types, registry client, lockfile
│   ├── cli/           # Command-line interface
│   └── scanner/       # Security scanning engine
├── test/e2e/         # End-to-end integration tests
├── scripts/          # Build and test scripts
└── docs/             # Documentation
```

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** in the appropriate package

3. **Build:**
   ```bash
   pnpm run build
   ```

4. **Test your changes:**
   ```bash
   pnpm test
   ```

### Running Tests

MCPShield has two test suites:

**Unit tests** (in each package):
```bash
pnpm run test:unit
```

**E2E tests** (integration tests):
```bash
pnpm run test:e2e
```

**Run all tests:**
```bash
pnpm test
```

**Watch mode** (for development):
```bash
pnpm run test:watch
```

### Testing Your Changes Manually

Create a test directory and try your changes:

```bash
# In a separate directory
mkdir /tmp/mcpshield-test
cd /tmp/mcpshield-test

# Initialize MCPShield
mcp-shield init

# Add a server
mcp-shield add io.github.modelcontextprotocol/filesystem

# Verify
mcp-shield verify

# Scan
mcp-shield scan
```

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use interfaces for public APIs
- Document complex functions with JSDoc
- Follow existing code style

### Formatting

We use Prettier for consistent formatting:

```bash
pnpm run format  # Coming soon
```

### Linting

```bash
pnpm run lint
```

Fix issues automatically where possible:

```bash
pnpm run lint -- --fix
```

## Pull Request Process

### Before Submitting

1. **Run tests** - Ensure `pnpm test` passes
2. **Update documentation** - Update README or docs if needed
3. **Add tests** - Include tests for new features
4. **Commit messages** - Write clear, descriptive commit messages

### Pre-Push Checks

This repo uses Husky to block `git push` if local validation fails. The `pre-push` hook runs:

- Workflow sanity checks (`pnpm run validate:workflows`)
- Lint (`pnpm run lint`)
- Build (`pnpm run build`)
- Unit tests (`pnpm run test:unit`)

If you need to bypass hooks in an emergency, set `HUSKY=0` for that command (not recommended):

```bash
HUSKY=0 git push
```

### Commit Message Format

Use conventional commits:

```
<type>: <description>

[optional body]

[optional footer]
```

Types:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring
- `chore:` - Build process, dependencies

Examples:
```
feat: add PyPI package verification support

fix: handle network timeout in registry client

docs: update CONTRIBUTING.md with test instructions
```

### Submitting a Pull Request

1. **Push your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub

3. **Fill out the PR template:**
   - Describe what you changed and why
   - Link related issues (e.g., "Fixes #123")
   - Note any breaking changes
   - Include test results

4. **Wait for review** - Maintainers will review your PR

5. **Address feedback** - Make requested changes

6. **Merge** - Once approved, a maintainer will merge

### PR Checklist

Before submitting, verify:

- [ ] Tests pass (`pnpm test`)
- [ ] Code follows existing style
- [ ] Documentation is updated
- [ ] Commit messages are clear
- [ ] No merge conflicts with main
- [ ] PR description explains the change

## Areas to Contribute

### High-Priority

- **PyPI support** - Full Python package scanning
- **Docker support** - OCI image verification
- **Security rules** - Add more malware detection patterns
- **Performance** - Optimize scanning and artifact resolution
- **Error handling** - Better error messages and recovery

### Documentation

- Tutorials and guides
- Example configurations
- Video walkthroughs
- API documentation

### Testing

- Add more E2E test cases
- Increase code coverage
- Test edge cases
- Performance benchmarks

### Features

Check the [GitHub Issues](https://github.com/kellyclaudeai/mcpshield/issues) for requested features. Look for issues labeled `good first issue` or `help wanted`.

## Development Tips

### Debugging

Use Node's inspector:

```bash
node --inspect-brk packages/cli/dist/cli.js add io.github.user/server
```

### Testing with Real Servers

Test against real MCP servers from the registry:

```bash
# Known good servers
mcp-shield add io.github.modelcontextprotocol/filesystem
mcp-shield add io.github.modelcontextprotocol/fetch

# Check the registry: https://registry.modelcontextprotocol.io/
```

### Package Dependencies

When adding dependencies:

- Add to the specific package (`packages/core`, `packages/cli`, etc.)
- Use `pnpm --filter @kellyclaude/mcpshield-core add <package>` syntax
- Use `pnpm --filter @kellyclaude/mcpshield-core add <package>` syntax
- Keep root-level dependencies minimal (dev tools only)

## Questions?

- **GitHub Discussions** - [Ask questions](https://github.com/kellyclaudeai/mcpshield/discussions)
- **GitHub Issues** - [Report bugs](https://github.com/kellyclaudeai/mcpshield/issues)
- **Email** - support@kellyclaudeai.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to MCPShield! 🛡️ Together we're making the MCP ecosystem safer.
