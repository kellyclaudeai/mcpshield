# @kellyclaude/mcpshield-core

Core functionality for MCPShield, including:

- **RegistryClient**: Fetch server metadata from MCP Registry API
- **Types**: TypeScript interfaces for servers, packages, lockfiles, and security
- **Utilities**: Helper functions for validation and data extraction

## Usage

```typescript
import { RegistryClient, RegistryServerResponse } from '@kellyclaude/mcpshield-core';

const client = new RegistryClient();

// Fetch server metadata
const response = await client.getServer('postmark');
console.log(response.server.description);

// Check verification status
const isVerified = client.isVerified(response);
console.log(`Verified: ${isVerified}`);

// Extract publisher identity
const identity = client.extractPublisherIdentity(response);
console.log(`Status: ${identity.status}`);
```

## API

### RegistryClient

#### `constructor(options?: RegistryClientOptions)`

Create a new registry client.

Options:
- `baseUrl`: Registry base URL (default: `https://registry.modelcontextprotocol.io`)
- `timeout`: Request timeout in ms (default: 30000)
- `retries`: Number of retries on failure (default: 2)
- `headers`: Additional HTTP headers

#### `async getServer(name: string): Promise<RegistryServerResponse>`

Fetch server metadata by name.

Throws:
- `RegistryError` on network errors or invalid responses
- Status code 404: Server not found
- Status code 429: Rate limit exceeded
- Status code 5xx: Registry service unavailable

#### `extractPublisherIdentity(response: RegistryServerResponse)`

Extract publisher identity information from registry metadata.

Returns:
- `status`: 'official' | 'verified' | 'community'
- `github`: { owner, repo } if repository is on GitHub
- `npm`: { package } if server uses npm packages

#### `isVerified(response: RegistryServerResponse): boolean`

Check if server has official or verified status.

#### `getVersion(response: RegistryServerResponse): string`

Get server version (defaults to '1.0.0' if not specified).

#### `validateServerResponse(response: RegistryServerResponse): boolean`

Validate that response has required structure.

## Development

```bash
# Build
npm run build

# Test
npm test

# Clean
npm run clean
```
