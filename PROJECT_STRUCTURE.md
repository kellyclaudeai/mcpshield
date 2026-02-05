# MCPShield Project Structure

Generated: February 4, 2026  
Status: Phase 2 Complete ✅

## Directory Tree

```
mcpshield/
├── package.json                 # Root workspace config
├── tsconfig.json               # Base TypeScript config
├── .gitignore                  # Git ignore rules
│
├── README.md                   # Project overview
├── PROJECT.md                  # Original project description
├── QUICK_START.md              # Quick start guide
├── TASKS.md                    # Task tracking (updated with Phase 2 progress)
├── SCHEMA_DESIGN_SUMMARY.md    # Phase 1 summary
├── PHASE2_COMPLETE.md          # Phase 2 completion report (NEW!)
├── PROJECT_STRUCTURE.md        # This file (NEW!)
│
├── packages/
│   ├── core/                   # @mcpshield/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── README.md
│   │   ├── src/
│   │   │   ├── types.ts               # Core type definitions
│   │   │   ├── registry-client.ts     # MCP Registry API client
│   │   │   └── index.ts               # Public exports
│   │   ├── test/
│   │   │   └── registry-client.test.ts  # 28 passing tests
│   │   └── dist/                      # Compiled JavaScript (gitignored)
│   │
│   ├── cli/                    # @mcpshield/cli
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── cli.ts                 # CLI entry point
│   │   │   ├── index.ts
│   │   │   └── commands/
│   │   │       └── index.ts           # Command implementations (placeholder)
│   │   ├── test/                      # (empty - tests coming in Phase 3)
│   │   └── dist/                      # Compiled JavaScript (gitignored)
│   │
│   └── scanner/                # @mcpshield/scanner
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── types.ts               # Scanner type definitions
│       │   ├── scanner.ts             # Scanner implementation (placeholder)
│       │   └── index.ts
│       ├── test/                      # (empty - tests coming in Phase 3)
│       └── dist/                      # Compiled JavaScript (gitignored)
│
├── schemas/                    # JSON Schemas (from Phase 1)
│   ├── README.md
│   ├── mcp.lock.schema.json
│   ├── policy.yaml.schema.json
│   └── validation-rules.md
│
├── docs/                       # Documentation (from Phase 1)
│   ├── implementation-guide.md      # Comprehensive implementation reference
│   ├── mcp-lock-spec.md            # Lockfile specification
│   ├── policy-yaml-spec.md         # Policy configuration spec
│   └── mcp-registry-research.md    # Registry API analysis
│
└── examples/                   # Example files (from Phase 1)
    ├── mcp.lock.example.json
    └── policy.yaml
```

## File Counts

**Source Code**:
- TypeScript source files: 19
- TypeScript test files: 1
- Compiled JavaScript files: 115

**Configuration**:
- package.json files: 4 (root + 3 packages)
- tsconfig.json files: 4 (root + 3 packages)
- Other config: 1 (.gitignore)

**Documentation**:
- Markdown files: 14
- JSON schemas: 2

**Total Files**: 160 (excluding node_modules and dist)

## Package Dependencies

### @mcpshield/core
```json
{
  "dependencies": {
    "got": "^14.0.0",      // HTTP client
    "ajv": "^8.12.0",      // JSON schema validation
    "ajv-formats": "^2.1.1" // Additional validators
  }
}
```

### @mcpshield/cli
```json
{
  "dependencies": {
    "@mcpshield/core": "^0.1.0",
    "@mcpshield/scanner": "^0.1.0",
    "commander": "^12.0.0",  // CLI framework
    "chalk": "^5.3.0",       // Terminal colors
    "ora": "^8.0.1",         // Spinners
    "prompts": "^2.4.2"      // Interactive prompts
  }
}
```

### @mcpshield/scanner
```json
{
  "dependencies": {
    "@mcpshield/core": "^0.1.0",
    "fast-levenshtein": "^3.0.0"  // String similarity (typosquat detection)
  }
}
```

## Dependency Graph

```
@mcpshield/cli
    ├── @mcpshield/core
    └── @mcpshield/scanner
            └── @mcpshield/core

(cli depends on both core and scanner; scanner depends on core)
```

## Build Outputs (dist/)

When built, each package generates:
- `*.js` - Compiled JavaScript (ES Modules)
- `*.d.ts` - TypeScript type declarations
- `*.d.ts.map` - Declaration sourcemaps
- `*.js.map` - JavaScript sourcemaps
- `*.tsbuildinfo` - TypeScript incremental build cache

## Key Features

✅ **TypeScript Strict Mode**: All type safety features enabled  
✅ **ESM Modules**: Modern ES module syntax throughout  
✅ **Monorepo**: npm workspaces with cross-package references  
✅ **Test Infrastructure**: Node.js built-in test runner  
✅ **Type Exports**: Full TypeScript declaration files  
✅ **Source Maps**: Debugging support for compiled code  

## Commands

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Test all packages
npm test

# Clean build artifacts
npm run clean

# Lint (ESLint ready but not configured yet)
npm run lint
```

## Entry Points

**For Development**:
```bash
node packages/cli/dist/cli.js [command]
```

**After npm publish** (future):
```bash
npx @mcpshield/cli [command]

# or install globally
npm install -g @mcpshield/cli
mcp-shield [command]
```

## What's Implemented

### ✅ Production-Pilot Ready
- Lockfile management with schema validation and atomic writes
- MCP Registry integration (v0 endpoints)
- Artifact resolution for npm (cache, offline mode, timeouts/redirect limits)
- Scanner with safe extraction and rule taxonomy
- Dependency vulnerability reporting via OSV (Pilot: direct dependencies)
- CLI commands: init/add/verify/scan/lock validate/cache gc/cache purge/doctor
- Deterministic JSON output and SARIF output for GitHub Code Scanning

### ⚠️ Best Effort / Future
- PyPI and Docker are visible in output but never gate (Pilot)
- Hosted backend / reputation / dashboards are future roadmap items

## Integration Points

**With Phase 1 Schemas**:
- Types in `core/src/types.ts` match JSON schemas
- Validation logic references `schemas/` directory
- Implementation follows `docs/implementation-guide.md`

**External APIs**:
- MCP Registry: `https://registry.modelcontextprotocol.io/v0/...`
- npm registry: `https://registry.npmjs.org`
- OSV API: `https://api.osv.dev`
- PyPI JSON API: best effort / future

## Next Phase Preview

Next phases likely include:
1. CI templates and a first-class GitHub Action
2. Policy packs and org-level configuration
3. Optional hosted reporting/alerts (monetized)
2. Digest verification → `core/src/verification/`
3. Scanner implementation → `scanner/src/analyzers/`
4. Lockfile manager → `core/src/lockfile/`
5. CLI command implementations → `cli/src/commands/*.ts`
