# MCPShield Schemas

This directory contains JSON Schema definitions for MCPShield configuration files.

## Files

### mcp.lock.schema.json

JSON Schema for the `mcp.lock` lockfile format.

**Purpose**: Pin exact versions of MCP servers with cryptographic digests and security metadata.

**Key Features**:
- Artifact integrity verification (SHA-256/SHA-512)
- Publisher identity tracking
- Security scan results
- Approval audit trail

**Documentation**: [../docs/mcp-lock-spec.md](../docs/mcp-lock-spec.md)

### policy.yaml.schema.json

JSON Schema for the `policy.yaml` security policy file.

**Purpose**: Define security policies and access controls for MCP servers.

**Key Features**:
- Namespace allow/deny lists
- Tool-level permissions
- Capability boundaries (filesystem, network, secrets)
- Rate limiting
- Audit configuration

**Documentation**: [../docs/policy-yaml-spec.md](../docs/policy-yaml-spec.md)

## Usage

### Validating mcp.lock

Using Node.js with Ajv:

```javascript
const Ajv = require('ajv');
const schema = require('./mcp.lock.schema.json');
const lockfile = require('../path/to/mcp.lock');

const ajv = new Ajv();
const validate = ajv.compile(schema);
const valid = validate(lockfile);

if (!valid) {
  console.error('Validation errors:', validate.errors);
}
```

Using Python with jsonschema:

```python
import json
from jsonschema import validate, ValidationError

with open('mcp.lock.schema.json') as f:
    schema = json.load(f)

with open('mcp.lock') as f:
    lockfile = json.load(f)

try:
    validate(instance=lockfile, schema=schema)
    print("Valid!")
except ValidationError as e:
    print(f"Validation error: {e.message}")
```

### Validating policy.yaml

Since policy.yaml is YAML format, convert to JSON first:

```javascript
const Ajv = require('ajv');
const yaml = require('js-yaml');
const fs = require('fs');

const schema = require('./policy.yaml.schema.json');
const policyYaml = fs.readFileSync('../path/to/policy.yaml', 'utf8');
const policy = yaml.load(policyYaml);

const ajv = new Ajv();
const validate = ajv.compile(schema);
const valid = validate(policy);

if (!valid) {
  console.error('Validation errors:', validate.errors);
}
```

### IDE Integration

Most modern IDEs support JSON Schema validation out of the box.

**VS Code**: Add schema reference to your config files:

```json
{
  "$schema": "https://mcpshield.dev/schemas/v1/mcp.lock.json"
}
```

Or configure in `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["mcp.lock"],
      "url": "./schemas/mcp.lock.schema.json"
    }
  ],
  "yaml.schemas": {
    "./schemas/policy.yaml.schema.json": "policy.yaml"
  }
}
```

## Schema Versioning

Schemas follow semantic versioning via the `$id` field:

- Current version: `v1`
- Schema URL format: `https://mcpshield.dev/schemas/v{major}/filename.json`

Breaking changes will increment the major version.

## Examples

See [../examples/](../examples/) for complete example files:
- `mcp.lock.example.json` - Lockfile with multiple servers
- `policy.yaml` - Policy configuration with various rules

## Contributing

When modifying schemas:

1. Update the JSON Schema file
2. Update corresponding documentation in `docs/`
3. Update examples to reflect changes
4. Increment version if breaking change
5. Test validation with existing files

## Validation Tools

### Online Validators

- [JSON Schema Validator](https://www.jsonschemavalidator.net/)
- [YAML Lint](http://www.yamllint.com/)

### CLI Tools

```bash
# Install schema validation tool
npm install -g ajv-cli

# Validate mcp.lock
ajv validate -s mcp.lock.schema.json -d ../path/to/mcp.lock

# Validate policy.yaml (convert to JSON first)
yaml2json policy.yaml | ajv validate -s policy.yaml.schema.json -d -
```

## Schema Features

### Common Validation Rules

Both schemas use:
- **Pattern matching** for names, namespaces, digests
- **Enums** for predefined value sets
- **Required fields** enforcement
- **Type checking** (string, number, boolean, object, array)
- **Format validation** (uri, date-time, regex)
- **Min/max constraints** for strings and numbers

### Security Considerations

Schemas enforce security best practices:
- Artifact digests must use SHA-256 or SHA-512
- Version strings cannot be ranges
- Namespaces must follow reverse-DNS format
- File paths are validated for suspicious patterns
- URLs must use HTTPS where appropriate

## License

These schemas are part of the MCPShield project. See [../LICENSE](../LICENSE) for details.
