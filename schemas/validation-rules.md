# Schema Validation Rules

Comprehensive validation rules for MCPShield configuration files.

## mcp.lock Validation

### Version Field

**Rule**: Must be exactly `"1.0"`

```javascript
if (lockfile.version !== "1.0") {
  throw new Error("Unsupported lockfile version");
}
```

### Server Name

**Pattern**: `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`

**Rules**:
- Exactly one forward slash separator
- Namespace (left) can contain: letters, numbers, dots, hyphens
- Server name (right) can contain: letters, numbers, dots, underscores, hyphens
- Minimum length: 3 characters
- Maximum length: 200 characters

**Valid Examples**:
```
io.github.username/server
com.example.prod/api-server
ai.anthropic/claude-tools
```

**Invalid Examples**:
```
server                          (no namespace)
io/github/user/server          (multiple slashes)
io.github_user/server          (underscore in namespace)
io.github.user/                (empty server name)
```

### Version String

**Rules**:
- Cannot be `"latest"`
- Cannot contain version range operators: `^`, `~`, `>=`, `<=`, `>`, `<`
- Cannot use wildcards: `*`, `x`
- Recommended: Semantic versioning format `MAJOR.MINOR.PATCH`

**Valid Examples**:
```
1.2.3
1.0.0-alpha
2.1.0-beta.1
0.1.0
```

**Invalid Examples**:
```
^1.2.3        (caret range)
~1.2.3        (tilde range)
>=1.2.3       (comparison)
1.x           (wildcard)
latest        (keyword)
```

### Artifact Digest

**Pattern**: `^(sha256|sha512):[a-f0-9]{64,128}$`

**Rules**:
- Must start with `sha256:` or `sha512:`
- SHA-256: Exactly 64 hexadecimal characters
- SHA-512: Exactly 128 hexadecimal characters
- Case-insensitive (but lowercase recommended)

**Valid Examples**:
```
sha256:fe333e598595000ae021bd27117db32ec69af6987f507ba7a63c90638ff633ce
sha512:abc123...def (128 hex chars total)
```

**Invalid Examples**:
```
abc123                     (no algorithm prefix)
md5:abc123                 (unsupported algorithm)
sha256:xyz                 (not hex)
sha256:abc                 (too short)
```

### Source Type

**Enum**: `"registry"`, `"git"`, `"url"`

**Validation**:
```javascript
if (source.type === "registry" && !source.registry) {
  throw new Error("registry URL required for type=registry");
}
if (source.type === "git" && !source.commit) {
  throw new Error("commit SHA required for type=git");
}
if (source.type === "url" && !source.url) {
  throw new Error("url required for type=url");
}
```

### Git Commit SHA

**Pattern**: `^[a-f0-9]{40}$`

**Rule**: Must be full 40-character SHA-1 hash (no abbreviated SHAs)

**Valid**: `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2`  
**Invalid**: `a1b2c3d` (abbreviated)

### Package Registry Type

**Enum**: `"npm"`, `"pypi"`, `"oci"`, `"nuget"`, `"mcpb"`

**Validation Per Type**:

```javascript
function validatePackage(pkg) {
  switch (pkg.registryType) {
    case "npm":
      // identifier should be npm package name
      if (!pkg.identifier.match(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/)) {
        throw new Error("Invalid npm package name");
      }
      break;
    
    case "oci":
      // identifier should be OCI image reference
      if (!pkg.identifier.includes(":")) {
        throw new Error("OCI identifier must include tag");
      }
      break;
    
    case "mcpb":
      // identifier should be HTTPS URL
      if (!pkg.identifier.startsWith("https://")) {
        throw new Error("MCPB identifier must be HTTPS URL");
      }
      break;
  }
}
```

### Security Verdict

**Enum**: `"clean"`, `"warning"`, `"suspicious"`, `"malicious"`, `"unknown"`

### Security Severity

**Enum**: `"info"`, `"low"`, `"medium"`, `"high"`, `"critical"`

### Security Category

**Enum**:
- `"vulnerability"` - Known CVE
- `"typosquat"` - Similar package names
- `"suspicious-code"` - Malicious patterns
- `"config-risk"` - Dangerous defaults
- `"network-egress"` - Network access
- `"credential-access"` - Secret access

### CVE Format

**Pattern**: `^CVE-\\d{4}-\\d+$`

**Valid Examples**:
```
CVE-2023-12345
CVE-2024-1
```

### Risk Score

**Type**: Number  
**Range**: 0 to 100 (inclusive)

```javascript
if (security.riskScore < 0 || security.riskScore > 100) {
  throw new Error("Risk score must be between 0 and 100");
}
```

## policy.yaml Validation

### Version Field

**Rule**: Must be exactly `"1.0"`

### Namespace Patterns

**Format**: Glob patterns with `*` and `?` wildcards

**Rules**:
- `*` matches any sequence of characters
- `?` matches any single character
- Must still follow reverse-DNS structure

**Valid Examples**:
```yaml
allowNamespaces:
  - "io.github.myorg/*"        # All servers from myorg
  - "io.github.*"              # All GitHub namespaces
  - "com.example.prod.*"       # All prod servers
  - "io.github.user/server-?"  # server-1, server-2, etc.
```

### Severity Levels

**Enum**: `"critical"`, `"high"`, `"medium"`, `"low"`, `"info"`

**Validation**:
```javascript
const validSeverities = ["critical", "high", "medium", "low", "info"];
for (const sev of policy.global.blockSeverities) {
  if (!validSeverities.includes(sev)) {
    throw new Error(`Invalid severity: ${sev}`);
  }
}
```

### Risk Score Threshold

**Type**: Number  
**Range**: 0 to 100

### Capability Names

**Enum**: `"filesystem"`, `"network"`, `"secrets"`, `"database"`, `"system-commands"`

### Tool Name Patterns

**Format**: String with wildcard support

**Rules**:
- `*` at end: `search*` matches `search`, `search_web`, `search_all`
- `*` at start: `*_file` matches `read_file`, `write_file`
- `*` in middle: `get_*_info` matches `get_user_info`, `get_server_info`
- Exact match: `search` matches only `search`

### Regex Patterns (Argument Constraints)

**Format**: YAML string containing regex

**Rules**:
- Use double backslashes for escape sequences: `\\d`, `\\s`, `\\.`
- Must be valid JavaScript/Python regex
- No regex modifiers in YAML (use inline flags if needed)

**Example**:
```yaml
argumentConstraints:
  - argument: "email"
    pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
  - argument: "path"
    pattern: "^/home/[a-zA-Z0-9_-]+/workspace/.*$"
```

### Path Patterns

**Formats**:
- Absolute: `/home/user/workspace`
- Relative: `./project`, `../data`
- Home: `~/workspace`, `~user/data`
- Wildcards: `/home/*/public`, `/var/log/*.log`

**Security Rules**:
```javascript
function validatePath(path) {
  // Deny path traversal attempts
  if (path.includes("/../") || path.endsWith("/..")) {
    throw new Error("Path traversal not allowed");
  }
  
  // Deny absolute paths to sensitive directories
  const dangerousPaths = ["/etc", "/root", "/boot", "/sys", "/proc"];
  if (dangerousPaths.some(p => path.startsWith(p))) {
    throw new Error("Access to system directories not allowed");
  }
}
```

### Domain Patterns

**Format**: Glob patterns

**Valid Examples**:
```yaml
allowedDomains:
  - "api.example.com"           # Exact match
  - "*.example.com"             # All subdomains
  - "api-*.example.com"         # Pattern matching
```

### Port Numbers

**Type**: Integer  
**Range**: 1 to 65535

```javascript
if (port < 1 || port > 65535) {
  throw new Error("Invalid port number");
}
```

### Rate Limit Values

**Type**: Integer  
**Minimum**: 1

```javascript
if (rateLimit.maxCallsPerMinute < 1) {
  throw new Error("Rate limit must be at least 1");
}
```

### Audit Log Level

**Enum**: `"all"`, `"tools-only"`, `"approvals-only"`, `"errors-only"`

### Audit Export Format

**Enum**: `"json"`, `"cef"`, `"syslog"`

### URL Validation

**Format**: Valid URI

**Rules**:
- Must start with `http://` or `https://`
- HTTPS preferred for security
- No credentials in URL (use headers/auth instead)

```javascript
function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only HTTP(S) URLs allowed");
    }
    if (parsed.username || parsed.password) {
      throw new Error("Credentials in URL not allowed");
    }
  } catch (e) {
    throw new Error(`Invalid URL: ${e.message}`);
  }
}
```

## Cross-Field Validation

### mcp.lock

**Server name must match packages**:
```javascript
for (const server of lockfile.servers) {
  // If using npm, verify mcpName would match
  if (server.packages.some(p => p.registryType === "npm")) {
    // Would need to fetch package.json to verify mcpName
  }
}
```

**Package version must match server version**:
```javascript
for (const server of lockfile.servers) {
  for (const pkg of server.packages) {
    if (pkg.version !== server.version) {
      console.warn(`Package version ${pkg.version} doesn't match server version ${server.version}`);
    }
  }
}
```

**Publisher namespace must match server namespace**:
```javascript
if (server.publisherIdentity) {
  const serverNamespace = server.name.split("/")[0];
  if (!server.publisherIdentity.namespace.startsWith(serverNamespace)) {
    throw new Error("Publisher namespace doesn't match server namespace");
  }
}
```

### policy.yaml

**Namespace overlap check**:
```javascript
function checkOverlap(allow, deny) {
  for (const allowed of allow) {
    for (const denied of deny) {
      if (matchesPattern(allowed, denied)) {
        console.warn(`Overlapping rules: ${allowed} vs ${denied}`);
      }
    }
  }
}
```

**Tool name must match server**:
```javascript
// When validating against actual server
for (const policy of policyYaml.servers) {
  const serverMatch = matchServerPattern(policy.serverName, actualServer.name);
  if (serverMatch) {
    for (const tool of policy.tools) {
      if (!serverHasTool(actualServer, tool.name)) {
        console.warn(`Policy references unknown tool: ${tool.name}`);
      }
    }
  }
}
```

## Implementation Examples

### Node.js Validator

```javascript
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

function validateLockfile(lockfile) {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  
  const schema = require("./mcp.lock.schema.json");
  const validate = ajv.compile(schema);
  
  const valid = validate(lockfile);
  if (!valid) {
    return {
      valid: false,
      errors: validate.errors.map(err => ({
        path: err.instancePath,
        message: err.message,
        params: err.params
      }))
    };
  }
  
  // Custom validations
  const customErrors = [];
  
  // Check for duplicate server names
  const names = lockfile.servers.map(s => s.name);
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length > 0) {
    customErrors.push({
      path: "/servers",
      message: `Duplicate server names: ${duplicates.join(", ")}`
    });
  }
  
  // Check digest uniqueness
  const digests = lockfile.servers.flatMap(s => 
    s.packages.map(p => p.artifactDigest)
  );
  const dupDigests = digests.filter((d, i) => digests.indexOf(d) !== i);
  if (dupDigests.length > 0) {
    console.warn(`Duplicate digests found - might be same package in multiple servers`);
  }
  
  if (customErrors.length > 0) {
    return { valid: false, errors: customErrors };
  }
  
  return { valid: true };
}
```

### Python Validator

```python
import json
from jsonschema import validate, ValidationError, Draft7Validator
from pathlib import Path

def validate_lockfile(lockfile_path):
    schema_path = Path(__file__).parent / "mcp.lock.schema.json"
    
    with open(schema_path) as f:
        schema = json.load(f)
    
    with open(lockfile_path) as f:
        lockfile = json.load(f)
    
    # Schema validation
    validator = Draft7Validator(schema)
    errors = list(validator.iter_errors(lockfile))
    
    if errors:
        for error in errors:
            print(f"Validation error at {error.json_path}: {error.message}")
        return False
    
    # Custom validations
    server_names = [s["name"] for s in lockfile["servers"]]
    duplicates = [n for n in set(server_names) if server_names.count(n) > 1]
    
    if duplicates:
        print(f"Duplicate server names: {duplicates}")
        return False
    
    return True
```

## Testing Validation Rules

Create test cases for edge cases:

```javascript
const testCases = [
  // Valid cases
  { name: "io.github.user/server", valid: true },
  { name: "com.example/api", valid: true },
  
  // Invalid cases
  { name: "server", valid: false },
  { name: "io/github/user/server", valid: false },
  { name: "io.github_user/server", valid: false },
  
  // Version tests
  { version: "1.2.3", valid: true },
  { version: "^1.2.3", valid: false },
  { version: "latest", valid: false },
  
  // Digest tests
  { digest: "sha256:" + "a".repeat(64), valid: true },
  { digest: "md5:abc123", valid: false },
  { digest: "sha256:xyz", valid: false }
];

testCases.forEach(tc => {
  const result = validate(tc);
  console.assert(result.valid === tc.valid, 
    `Test failed for ${JSON.stringify(tc)}`);
});
```

## See Also

- [mcp.lock specification](../docs/mcp-lock-spec.md)
- [policy.yaml specification](../docs/policy-yaml-spec.md)
- [Schema README](./README.md)
