# policy.yaml Specification

## Overview

The `policy.yaml` file defines security policies and access controls for MCP servers. It complements `mcp.lock` by specifying _how_ approved servers can be used, not just _which_ servers are allowed.

## Purpose

1. **Least Privilege**: Restrict servers to minimum necessary capabilities
2. **Defense in Depth**: Enforce boundaries even for approved servers
3. **Compliance**: Meet organizational security requirements
4. **Auditability**: Define and track security policies

## File Location

- **Project-level**: `./policy.yaml` in project root
- **User-level**: `~/.mcp/policy.yaml` for global user configuration
- **System-level**: `/etc/mcp/policy.yaml` for system-wide policies

Policy inheritance: System → User → Project (most specific wins)

## Schema Version

Current version: `1.0`

## Structure

### Root Object

```yaml
version: "1.0"
global:
  # Global policies applying to all servers
servers:
  # Server-specific policy overrides
```

### Global Policies

Global policies apply to all MCP servers unless overridden.

```yaml
global:
  allowNamespaces:
    - "io.github.trusted-org/*"
  denyNamespaces:
    - "io.github.banned-user/*"
  requireVerification: true
  denyUnverified: true
  requireApprovalFor:
    - filesystem
    - network
  maxRiskScore: 50
  blockSeverities:
    - critical
    - high
  rateLimit:
    maxCallsPerMinute: 100
  audit:
    enabled: true
```

#### Namespace Control

**allowNamespaces** (array of strings):
- Whitelist of allowed server namespaces
- Supports glob patterns (`*` and `?`)
- If specified, only servers matching these patterns are allowed
- Examples:
  - `io.github.myorg/*` - All servers from myorg
  - `io.github.*` - All GitHub-verified servers
  - `com.example.prod.*` - Production servers only

**denyNamespaces** (array of strings):
- Blacklist of explicitly denied namespaces
- Takes precedence over `allowNamespaces`
- Use for blocking known-bad actors

#### Verification Control

**requireVerification** (boolean, default: true):
- Require publisher identity verification
- Servers without verified publishers are blocked

**denyUnverified** (boolean, default: true):
- Block servers that lack publisher verification
- Stricter than `requireVerification`

#### Approval Control

**requireApprovalFor** (array of strings):
- Capabilities that require manual user approval
- Valid values:
  - `filesystem` - File system access
  - `network` - Network requests
  - `secrets` - Access to credentials
  - `database` - Database connections
  - `system-commands` - Shell command execution

#### Risk Control

**maxRiskScore** (number, 0-100, default: 50):
- Maximum acceptable risk score from security scanning
- Servers above this threshold are blocked
- Scale: 0 = completely safe, 100 = critical risk

**blockSeverities** (array of strings):
- Security finding severities that block execution
- Valid values: `critical`, `high`, `medium`, `low`, `info`
- Default: `["critical"]`
- Example: `["critical", "high"]` blocks critical and high findings

#### Rate Limiting

```yaml
rateLimit:
  maxCallsPerMinute: 100
  maxCallsPerHour: 1000
  maxCallsPerDay: 10000
  burstSize: 20
```

- **maxCallsPerMinute/Hour/Day**: Rate limits for different time windows
- **burstSize**: Maximum burst of requests allowed

#### Audit Configuration

```yaml
audit:
  enabled: true
  logLevel: all  # all | tools-only | approvals-only | errors-only
  logToolCalls: true
  logArguments: true
  redactSecrets: true
  retention:
    days: 90
    maxSizeMB: 1024
  export:
    enabled: false
    format: json  # json | cef | syslog
    destination: "https://siem.example.com/logs"
```

### Server-Specific Policies

Override global policies for specific servers.

```yaml
servers:
  - serverName: "io.github.user/server-name"
    enabled: true
    tools: [...]
    resources: [...]
    capabilities: {...}
    rateLimit: {...}
```

#### Server Name Pattern

**serverName** (string, required):
- Server name in reverse-DNS format
- Supports wildcards:
  - `io.github.user/*` - All servers from user
  - `io.github.*/filesystem` - Any filesystem server
  - `*` - Match all (use cautiously)

#### Tool-Level Policies

Control individual tools within a server.

```yaml
tools:
  - name: "search"
    enabled: true
    requireApproval: false
    maxCallsPerMinute: 30
    argumentConstraints:
      - argument: "query"
        maxLength: 500
        pattern: "^[a-zA-Z0-9 ]+$"
```

**Tool Policy Fields:**
- **name** (required): Tool name, supports wildcards (`search*`, `*`)
- **enabled** (boolean, default: true): Allow this tool
- **requireApproval** (boolean, default: false): Prompt user before each call
- **maxCallsPerMinute** (integer): Rate limit for this specific tool
- **argumentConstraints** (array): Validation rules for tool arguments
  - `argument`: Argument name
  - `allowedValues`: Whitelist of allowed values
  - `deniedValues`: Blacklist of denied values
  - `pattern`: Regex pattern that values must match
  - `maxLength`: Maximum string length

#### Resource-Level Policies

Control access to MCP resources.

```yaml
resources:
  - uri: "file:///*"
    enabled: true
    requireApproval: false
    readOnly: true
```

**Resource Policy Fields:**
- **uri** (required): Resource URI pattern (supports wildcards)
  - `file:///*` - All file resources
  - `https://*.example.com/*` - HTTP resources
- **enabled** (boolean): Allow access to this resource
- **requireApproval** (boolean): Prompt before access
- **readOnly** (boolean): Restrict to read-only access

#### Capability Boundaries

Fine-grained capability controls.

##### Filesystem

```yaml
capabilities:
  filesystem:
    allowedPaths:
      - "/home/user/workspace"
      - "./project"
    deniedPaths:
      - "/etc"
      - "~/.ssh"
    readOnly: false
```

- **allowedPaths**: Whitelist of allowed filesystem paths
- **deniedPaths**: Blacklist of denied paths (takes precedence)
- **readOnly**: Restrict to read-only access

##### Network

```yaml
capabilities:
  network:
    allowedDomains:
      - "*.brave.com"
      - "api.openai.com"
    deniedDomains:
      - "malicious.com"
    allowedPorts:
      - 443
      - 80
    requireTls: true
```

- **allowedDomains**: Whitelist of domains (glob patterns supported)
- **deniedDomains**: Blacklist of domains
- **allowedPorts**: Whitelist of port numbers (1-65535)
- **requireTls**: Require TLS/HTTPS for all connections

##### Secrets

```yaml
capabilities:
  secrets:
    allowedEnvVars:
      - "BRAVE_API_KEY"
      - "OPENAI_API_KEY"
    denyEnvVarPatterns:
      - "AWS_*"
      - "SSH_*"
```

- **allowedEnvVars**: Environment variables the server can access
- **denyEnvVarPatterns**: Patterns of env vars to block

##### Execution

```yaml
capabilities:
  execution:
    maxMemoryMB: 512
    maxCpuPercent: 50
    timeout: 30
```

- **maxMemoryMB**: Maximum memory usage in megabytes
- **maxCpuPercent**: Maximum CPU usage (1-100)
- **timeout**: Maximum execution time in seconds

##### Budget

```yaml
capabilities:
  budget:
    maxApiCallsPerDay: 1000
    maxCostPerDay: 5.0
```

- **maxApiCallsPerDay**: Daily API call limit
- **maxCostPerDay**: Maximum daily cost in USD

## Validation Rules

### Namespace Patterns

Namespace patterns support:
- `*` - Match any sequence of characters
- `?` - Match any single character
- Literal strings

Examples:
- `io.github.user/*` - Matches `io.github.user/server1`, `io.github.user/server2`
- `io.github.*/filesystem` - Matches `io.github.alice/filesystem`, `io.github.bob/filesystem`
- `com.example.prod.*` - Matches anything under `com.example.prod.`

### Regex Patterns

Argument constraints can use regex patterns:
```yaml
argumentConstraints:
  - argument: "email"
    pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
```

Use double backslashes (`\\`) for escaping in YAML.

### Path Patterns

Filesystem paths support:
- Absolute paths: `/home/user/workspace`
- Relative paths: `./project`
- Home directory: `~/workspace`
- Wildcards: `/home/*/public`

## Policy Inheritance

Policies are applied in order of specificity:

1. **System-level** (`/etc/mcp/policy.yaml`)
2. **User-level** (`~/.mcp/policy.yaml`)
3. **Project-level** (`./policy.yaml`)

More specific policies override less specific ones.

### Merge Behavior

- **allowNamespaces**: Union of all levels
- **denyNamespaces**: Union of all levels (deny always wins)
- **Server-specific**: Project overrides user overrides system
- **Tool-specific**: Most specific tool pattern wins
- **Capability boundaries**: Intersection (most restrictive wins)

## Examples

### Minimal Policy (Allow Everything)

```yaml
version: "1.0"
global:
  requireVerification: false
  denyUnverified: false
```

### Strict Policy (Zero Trust)

```yaml
version: "1.0"
global:
  allowNamespaces:
    - "io.github.modelcontextprotocol/*"  # Official only
  requireVerification: true
  denyUnverified: true
  requireApprovalFor:
    - filesystem
    - network
    - secrets
    - database
    - system-commands
  maxRiskScore: 20
  blockSeverities:
    - critical
    - high
    - medium
```

### Development Policy (Permissive)

```yaml
version: "1.0"
global:
  requireVerification: false
  maxRiskScore: 80
  blockSeverities:
    - critical
  audit:
    enabled: true
    logLevel: errors-only
```

### Enterprise Policy (Compliance)

```yaml
version: "1.0"
global:
  allowNamespaces:
    - "io.github.mycompany/*"
    - "com.mycompany.*"
  requireVerification: true
  denyUnverified: true
  maxRiskScore: 30
  blockSeverities:
    - critical
    - high
  audit:
    enabled: true
    logLevel: all
    logArguments: true
    redactSecrets: true
    retention:
      days: 365
    export:
      enabled: true
      format: cef
      destination: "syslog://siem.corp.example.com:514"
```

## Best Practices

1. **Start restrictive, relax as needed**
   - Begin with strict policies
   - Monitor audit logs to identify needed permissions
   - Gradually allow specific capabilities

2. **Use server-specific overrides**
   - Don't weaken global policies
   - Create targeted exceptions for trusted servers

3. **Layer defenses**
   - Combine namespace restrictions with capability boundaries
   - Use both allow and deny lists

4. **Monitor and iterate**
   - Enable audit logging
   - Review logs regularly
   - Update policies based on actual usage

5. **Document exceptions**
   - Comment your policy.yaml
   - Explain why specific servers get broader permissions

6. **Test policies**
   - Use `mcp-shield check-policy` to validate before deploying
   - Test in development environment first

7. **Version control**
   - Commit policy.yaml to git
   - Review changes in PRs
   - Use policy.yaml as code

## Runtime Enforcement

MCPShield Runtime Guard uses policy.yaml to:

1. **Before server startup**:
   - Check namespace against allow/deny lists
   - Verify risk score is below threshold
   - Apply capability boundaries

2. **During tool calls**:
   - Check tool is enabled
   - Prompt for approval if required
   - Validate arguments against constraints
   - Apply rate limits

3. **During resource access**:
   - Match URI against resource policies
   - Enforce read-only restrictions
   - Prompt if approval required

4. **Continuous monitoring**:
   - Track API budgets
   - Enforce execution limits
   - Log all activities per audit policy

## See Also

- [mcp.lock specification](./mcp-lock-spec.md)
- [Runtime Guard documentation](./runtime-guard.md)
- [CLI reference](./cli-reference.md)
