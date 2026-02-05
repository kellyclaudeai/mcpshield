# MCPShield Testing

## Test Structure

```
test/
├── e2e/                    # End-to-end tests
│   └── full-workflow.test.ts   # Complete add workflow
└── README.md
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### E2E Tests Only
```bash
npm run test:e2e
```

### Watch Mode
```bash
npm run test:watch
```

## E2E Test Coverage

The E2E test suite (`e2e/full-workflow.test.ts`) validates:

1. **Complete Add Workflow**
   - Fetch server metadata from MCP Registry
   - Verify namespace ownership via GitHub
   - Generate lockfile entry
   - Validate security properties

2. **Error Handling**
   - Invalid namespace rejection
   - Network failures
   - Malformed responses

3. **Security Validation**
   - Namespace mismatch detection
   - HTTPS requirement
   - Publisher verification
   - Typosquatting prevention

4. **Lockfile Management**
   - Create new lockfile
   - Update existing lockfile
   - Version tracking
   - Integrity checks

5. **Batch Operations**
   - Multiple server fetching
   - Concurrent operations
   - Error aggregation

## Test Requirements

- Node.js 18+
- Internet connection (for registry API calls)
- GitHub API access (for verification)

## Configuration

Tests use environment variables:

```bash
# Optional: GitHub token for higher rate limits
export GITHUB_TOKEN=ghp_your_token_here

# Optional: Custom registry URL
export MCP_REGISTRY_URL=https://registry.mcp.io
```

## CI/CD Integration

Tests are designed to run in CI environments:

```yaml
# .github/workflows/test.yml
- name: Run E2E Tests
  run: npm run test:e2e
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Test Data

E2E tests create temporary files in `test/e2e/tmp/`:
- Lockfiles
- Reports
- Temporary configurations

These are automatically cleaned up after tests complete.

## Debugging

Run tests with debug output:

```bash
DEBUG=mcp:* npm run test:e2e
```

## Known Issues

- Tests require network access
- GitHub API has rate limits (use token)
- Some tests may be slow due to network calls
