# MCPShield — Production Readiness + Monetization Plan (Deterministic)

Date: 2026-02-05  
Owner: Kelly (initial)  
Scope: MCPShield monorepo (`packages/core`, `packages/scanner`, `packages/cli`) + docs site

Goal: convert MCPShield from “MVP complete” into a **pilot-ready production tool** that can be monetized immediately via **paid pilots / support**, and extended later into open-core and/or SaaS.

This is intentionally written so a “non-reasoning” implementation agent can execute it step-by-step with clear acceptance criteria.

---

## A) Frozen decisions (do not revisit until after Pilot v0.2)

These are selected to unblock shipping quickly and reduce ambiguity.

### A1) Monetization track (Pilot)
- ✅ Track: **Open-source CLI + paid support/pilots**
- ✅ Value metric (Pilot): **“repos protected”** (pricing per-repo/month, negotiated)
- ✅ Pro features (NOT required for Pilot): dashboard, policy packs, SBOM, alerts

### A2) Supported environments (Pilot)
- ✅ Node.js: **>= 22** (LTS; Node 20 is near EOL in 2026)
- ✅ OS: macOS + Linux (Windows is “best effort” for Pilot; formal support in GA)
- ✅ CI: GitHub Actions first

### A3) Artifact support (Pilot)
- ✅ Supported for gating: **npm only**
- ⚠️ PyPI/Docker: visible in output, but **never gates** (always `skipped`)

### A4) Non-goals (Pilot)
- ❌ No execution/sandboxing of downloaded artifacts
- ❌ No automatic “fix” / remediation of vulnerable packages
- ❌ No hosted service required

### A5) Default policy behavior (Pilot)
- ✅ Default: **warn-only** (exit 0) unless `--ci` or policy indicates block
- ✅ CI mode: deterministic, non-interactive, exit non-zero when policy fails

---

## B) Required CLI contracts (must be implemented exactly)

### B1) Exit codes (all commands)
Implement the following exit code contract across CLI commands:
- `0`: success (no drift; policy pass; no blocked findings)
- `1`: policy failure OR drift detected OR blocked findings present
- `2`: user/config error (missing lockfile, invalid args, invalid policy/lock schema)
- `3`: internal/unexpected error

Acceptance:
- [x] Running any command with bad input returns exit code `2` (not `1`).
- [x] Running any command with an unexpected exception returns exit code `3`.

### B2) Output modes (all commands)
All commands must support:
- `--json`: machine output to **stdout** (no other stdout)
- `--quiet`: suppress human logs; only errors to stderr
- `--no-color`: disable ANSI
- `--ci`: implies `--quiet --no-color` and **no prompts**

Acceptance:
- [x] `mcp-shield <cmd> --json` prints valid JSON and exits with correct code.
- [x] In `--ci`, prompts never appear; commands fail with clear error if user action required.

### B3) Deterministic JSON schemas (Pilot)
Create stable schemas and adhere to them:
- `schemas/cli/verify-output.schema.json`
- `schemas/cli/scan-output.schema.json`
- `schemas/cli/add-output.schema.json`

Schema requirements:
- `tool`, `toolVersion`, `command`, `generatedAt`
- `summary` object
- `results[]` array with per-namespace items
- `errors[]` array (top-level and per-item)

Acceptance:
- [x] Add unit tests that validate output against schemas using AJV.

#### B3.1) `verify --json` output contract (exact shape)
Rules:
- Keys must be stable and always present (empty arrays are OK).
- `results` must be sorted by `namespace` ascending.
- `artifacts` within a result must be sorted by `type` then `url` ascending.

Example:
```json
{
  "tool": "mcpshield",
  "toolVersion": "0.2.0",
  "command": "verify",
  "generatedAt": "2026-02-05T00:00:00.000Z",
  "summary": {
    "servers": 1,
    "artifacts": 1,
    "ok": 1,
    "drift": 0,
    "errors": 0,
    "skipped": 0
  },
  "results": [
    {
      "namespace": "io.github.example/server",
      "version": "1.2.3",
      "verified": true,
      "artifacts": [
        {
          "type": "npm",
          "url": "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
          "expectedDigest": "sha512-…",
          "actualDigest": "sha512-…",
          "status": "ok",
          "source": "cache",
          "error": null
        }
      ],
      "errors": []
    }
  ],
  "errors": []
}
```

#### B3.2) `scan --json` output contract (exact shape)
Rules:
- `results` sorted by `namespace`.
- `findings` sorted by severity order: `critical`, `high`, `medium`, `low`, `info` then `ruleId` then `message`.

Example:
```json
{
  "tool": "mcpshield",
  "toolVersion": "0.2.0",
  "command": "scan",
  "generatedAt": "2026-02-05T00:00:00.000Z",
  "summary": {
    "servers": 1,
    "artifacts": 1,
    "verdicts": { "clean": 1, "warning": 0, "suspicious": 0, "malicious": 0, "unknown": 0 },
    "policy": { "enforced": true, "blocked": false, "reasons": [] }
  },
  "results": [
    {
      "namespace": "io.github.example/server",
      "version": "1.2.3",
      "artifacts": [
        {
          "type": "npm",
          "digest": "sha512-…",
          "verdict": "clean",
          "riskScore": 0,
          "findings": [],
          "vulnerabilities": { "critical": 0, "high": 0, "medium": 0, "low": 0 }
        }
      ],
      "policy": { "blocked": false, "reasons": [] },
      "errors": []
    }
  ],
  "errors": []
}
```

#### B3.3) `add --json` output contract (exact shape)
Rules:
- In `--ci`, if policy blocks, exit `1` and output must include `policy.reasons[]`.

Example:
```json
{
  "tool": "mcpshield",
  "toolVersion": "0.2.0",
  "command": "add",
  "generatedAt": "2026-02-05T00:00:00.000Z",
  "input": { "namespace": "io.github.example/server", "yes": true, "ci": true },
  "result": {
    "added": false,
    "entryWritten": false,
    "policy": {
      "blocked": true,
      "reasons": [
        { "code": "MAX_RISK_SCORE", "message": "riskScore 99 exceeds maxRiskScore 50" }
      ]
    }
  },
  "errors": []
}
```

---

## C) Pilot “production ready” definition (ship gate)

MCPShield is “Pilot-ready” only when all items below are true:

- [x] `npm ci && npm run build && npm test` pass locally (Node 25.5.0); CI matrix covers Node 22 + 24.
- [x] `mcp-shield init/add/verify/scan` work end-to-end in a clean temp repo (see QA checklist; may require a permissive `maxRiskScore` for high-risk servers).
- [x] `verify` blocks drift deterministically (exit 1), with `--json` output.
- [x] `scan` applies policy thresholds deterministically (exit 1 in CI/policy-block), with `--json` output.
- [x] Lockfile writes are atomic and stable (no nondeterministic diffs).
- [x] Artifact extraction is safe (no path traversal / symlink / hardlink overwrite).
- [x] Dependency vulnerabilities are reported via OSV (at minimum: direct deps).
- [x] Repo has `LICENSE`, `SECURITY.md`, and `SUPPORT.md`.
- [x] Release artifacts are published (npm) or there is a complete, working dry-run release pipeline.

---

## D) Work breakdown (concrete PR series)

Implement in order. Each PR must include tests and must keep CI green.

### PR-001 — Repository/legal baseline
Files to add:
- [x] `LICENSE` (MIT, Copyright (c) 2026 Kelly)
- [x] `SECURITY.md` (vuln reporting instructions + response targets)
- [x] `SUPPORT.md` (paid support contact, community support policy)
- [x] `CONTRIBUTING.md` (how to run, test, submit PRs)
- [x] Fix placeholder links and install instructions:
  - update root `README.md` clone URL + docs links
  - ensure `README.md` documents `npx @mcpshield/cli` as the default install/run path once published

Acceptance:
- [x] `npm test` still passes.
- [ ] GitHub renders the files correctly. (manual verification)

### PR-002 — Lockfile schema + atomic writes
Implement:
- [x] Add JSON Schema: `schemas/mcp.lock.schema.json` matching current `LockfileManager` format (`version`, `generatedAt`, `servers{}`).
- [x] Ensure schemas are packaged with `@mcpshield/core` and loaded from in-package paths (not repo-relative paths).
- [x] Update `LockfileManager.validate()` to validate using AJV against the schema (keep current checks as a fallback only if schema missing).
- [x] Implement atomic writes in `LockfileManager.write()`:
  - write to `${lockfilePath}.tmp.<pid>.<rand>`
  - `fsync` (best effort)
  - rename over target
- [x] Add CLI command: `mcp-shield lock validate [--json] [--ci]`
- [x] Unify lockfile types:
  - In `packages/core/src/types.ts`, either (a) remove the unused `Lockfile/LockedServer` interfaces, or (b) rename/redefine them to match the actual `mcp.lock.json` schema used by `LockfileManager`.

Acceptance:
- [x] Unit test: write interruption simulation does not corrupt lockfile (best-effort; can test by writing temp then rename).
- [x] `mcp-shield lock validate --json` outputs schema validation results.

### PR-003 — Policy schema + enforcement (Pilot)
Implement policy as a strict YAML schema.

1) Add policy schema:
- [x] `schemas/policy.schema.json`
- [x] Update `init` policy template URL to a real local doc: `docs/policy-yaml-spec.md` (create if missing).

2) Implement policy loader:
- [x] New core module: `packages/core/src/policy.ts`
  - `loadPolicy(policyPath: string): Policy`
  - `validatePolicy(policy: unknown): { valid, errors[] }`
  - `evaluateAdd(policy, context) -> { allowed: boolean, reasons[] }`
  - `evaluateScan(policy, scanResult) -> { allowed: boolean, reasons[] }`

3) Enforce policy in CLI:
- [x] `add`:
  - if policy blocks, and `--ci`/`--yes` is set, exit `1` with JSON reasons
  - if policy blocks and interactive, prompt “override?”; if override, write entry with `approvedAt` and `approvedBy` (env var `MCPSHIELD_APPROVER`, else OS username)
- [x] `scan`:
  - return exit `1` if any result violates policy (in `--ci` or `--enforce`)

Policy schema (minimal valid example; see `docs/policy-yaml-spec.md` and `schemas/policy.yaml.schema.json`):
```yaml
version: "1.0"
global:
  denyUnverified: false
  maxRiskScore: 50
  blockSeverities: ["critical"]
  requireApprovalFor: ["filesystem", "network"]
servers: []
```

Acceptance:
- [x] Add tests for each policy field.
- [x] Running `scan` with a deterministic non-zero risk fixture fails in `--ci`.

### PR-004 — CLI contract plumbing (`--json`, `--ci`, exit codes)
Implement:
- [x] Add commander global options in `packages/cli/src/cli.ts` and thread options into commands.
- [x] Create `packages/cli/src/output.ts` with:
  - `writeJson(obj)` → stdout JSON only
  - `logInfo/logWarn/logError` that respect `--quiet` and `--no-color`
- [x] Standardize error handling:
  - user/config errors → exit 2
  - unexpected errors → exit 3
- [x] Update `engines.node`:
  - root `package.json`: `"node": ">=22.0.0"`
  - each workspace package `package.json`: `"node": ">=22.0.0"`

Acceptance:
- [x] Snapshot tests for JSON outputs (stable ordering).
- [x] `--json` produces no ANSI and no extra stdout.

### PR-005 — NPM resolver hardening (network + redirects + timeouts)
Implement in `packages/core/src/artifact-resolver.ts`:
- [x] Switch npm registry fetch + tarball download to `got` (already a dependency in core).
- [x] Enforce:
  - timeout: 15s connect + 60s request (configurable via env)
  - max redirects: 3
  - max artifact size: 50 MiB (configurable via resolver options; enforced on declared size and streamed download size)
- [x] Add `--offline` mode:
  - `verify` and `scan` must refuse network and only use cache
  - error message must include how to disable offline
- [x] Add test dependency and mocks:
  - add `nock` as a devDependency in `packages/core/package.json`
  - add unit tests for `NpmResolver.resolve()` and `.download()` that do not hit the network

Acceptance:
- [x] Add tests that simulate 302 redirect and validate download succeeds.
- [x] Add tests that simulate oversize artifact and validate hard fail.

### PR-006 — Cache: move to OS cache dir + CLI commands
Implement:
- [x] Update `CacheManager` default dir:
  - if `XDG_CACHE_HOME` set → `${XDG_CACHE_HOME}/mcpshield`
  - else if macOS → `~/Library/Caches/mcpshield`
  - else → `~/.cache/mcpshield`
  - allow override via `MCPSHIELD_CACHE_DIR`
- [x] Add CLI: `mcp-shield cache gc [--max-age-days N]` and `mcp-shield cache purge`

Acceptance:
- [x] E2E test: cache persists across runs in a temp home dir fixture.

### PR-007 — Scanner safety + dependency vuln integration (OSV)
This is a **must** for production.

1) Dependency security:
- [x] Add OSV client in core: `packages/core/src/osv.ts`
  - Add dependency: `semver` (for range resolution)
  - Uses OSV API:
    - `POST https://api.osv.dev/v1/querybatch` to get vuln IDs for many deps
    - `GET https://api.osv.dev/v1/vulns/{id}` to fetch full details per unique ID
  - Input: **resolved** direct dependencies from extracted `package.json` (`dependencies` only for Pilot)
    - If dep spec is an exact version (`1.2.3`), use it.
    - Else if dep spec is a semver range (`^1.2.0`, `~1.2.3`, `>=1.0.0 <2`), resolve it by:
      1. Fetching the dependency’s version list from npm registry (packument)
      2. Selecting the **max version satisfying the range** (use `semver` package)
    - Else (git/url/workspace/file): mark as `unresolved` and add a `dependencies` finding (severity `medium`, ruleId `DEP_UNRESOLVED_SPEC`).
  - Output (exact):
    - per scanned package: `vulnerabilities: {critical, high, medium, low}`
    - `vulnerabilityIds: string[]` (sorted)
    - severity mapping algorithm:
      - For each vuln ID, determine severity by:
        1. If any `affected[].ecosystem_specific.severity` exists for ecosystem `npm`, map:
           - `CRITICAL` → critical
           - `HIGH` → high
           - `MODERATE` or `MEDIUM` → medium
           - `LOW` → low
        2. Else default to `medium`
      - Total counts are the sum across unique IDs.
  - Add tests (no live network):
    - use `nock` to stub querybatch + vuln detail endpoints
    - include fixture JSON files under `packages/core/test/fixtures/osv/`

2) Scanner hardening:
- [x] Upgrade `tar` dependency in `packages/scanner/package.json` to a patched version (>= 7.5.3). (As of Feb 2026 there is a known `tar` extraction vulnerability fixed in `tar@7.5.3`.)
- [x] Extract with explicit secure options:
  - `preservePaths: false`
  - `unlink: true`
  - `strict: true`
  - `onwarn`: collect warnings as findings
  - Add an explicit filter that rejects entries with:
    - absolute paths
    - `..` segments
    - linkpath/symlink targets that escape extraction root

Exact extraction algorithm (implement literally):
1. Create temp dir `T`.
2. Write tarball to `T/package.tgz`.
3. Extract to `T/extract` (not directly into `T`) with `tar.x({ cwd: extractDir, file: tarballPath, preservePaths: false, strict: true, unlink: true, onwarn })`.
4. For every entry in the archive:
   - Reject if `entry.path` starts with `/` or contains `\\` on POSIX or contains `..` path segment.
   - If entry is a symlink/hardlink, reject if `entry.linkpath` is absolute or resolves outside `extractDir`.
5. If any rejection occurs: abort scan and emit a **critical** finding with ruleId `EXTRACT_PATH_TRAVERSAL`.

3) Findings taxonomy:
- [x] Create `packages/scanner/src/rules.ts` exporting rule IDs and default severities.
- [x] Update all findings to include `details.ruleId`.

Acceptance:
- [x] Add a regression test that attempts to scan a crafted tarball containing `../evil` and ensure it is rejected and reported as a critical finding.
- [x] Add a test that OSV integration returns at least one vuln for a known vulnerable package fixture (use recorded HTTP via nock or local fixture JSON).

### PR-008 — SARIF output + GitHub Code Scanning integration
Implement:
- [x] Add `--sarif` flag to `scan`:
  - output SARIF v2.1.0 to stdout
  - map each finding to `mcp.lock.json` as the location (startLine 1 is acceptable for Pilot)
  - set unique `run.automationDetails.id` and/or `category` to avoid run collisions per repo
- [x] Add GitHub Action workflow: `.github/workflows/code-scanning.yml`:
  - runs `npm ci`, `npm run build`
  - runs `node packages/cli/dist/cli.js scan --ci --sarif > results.sarif`
  - uploads via `github/codeql-action/upload-sarif@v3`

Acceptance:
- [ ] Workflow produces Code Scanning alerts in GitHub UI (manual verification once).

### PR-009 — Release automation (npm publishing via trusted publishing)
Implement:
- [x] Use npm “trusted publishing” (OIDC) for `@mcpshield/core`, `@mcpshield/scanner`, `@mcpshield/cli`
- [x] Add `.github/workflows/release.yml`:
  - only on tags `v*`
  - `permissions: id-token: write, contents: write`
  - publishes via `scripts/publish-workspaces.mjs` (dependency order + idempotent)
  - supports `NPM_TOKEN` secret fallback (automation token) or OIDC-only trusted publishing
  - generates changelog from conventional commits
- [x] Add publish tooling:
  - `scripts/publish-workspaces.mjs`
  - `scripts/smoke-cli-local.mjs` (packages install + basic commands)
  - `scripts/smoke-cli-install.mjs` (post-publish verification)
- [x] Add `CHANGELOG.md`

Manual steps (document in `docs/release.md`):
- [ ] Configure trusted publisher in npm settings (workflow file path must match exactly).
- [ ] OR set GitHub Actions secret `NPM_TOKEN` to publish using a token (no trusted publishing setup required).

Acceptance:
- [ ] Dry-run tag build completes without secrets.
- [ ] Real publish verified on npm (once configured).

### PR-010 — Monetization assets (Pilot)
Implement:
- [x] `docs/PRICING.md` with Pilot pricing (per-repo/month) + what’s included.
- [x] `docs/ROADMAP.md` with next 90 days (Pro candidates).
- [x] `docs/SECURITY-POSTURE.md` with threat model summary and non-goals.

Acceptance:
- [x] Docs site links to these pages.

### PR-011 — CI hardening (deterministic + multi-version)
Implement:
- [x] Update `.github/workflows/ci-cd.yml`:
  - use `npm ci` (not `npm install`)
  - test matrix for Node 22 and Node 24
  - run `npm run build` and `npm test`
  - add `npm run lint` step (create `lint` scripts if missing)
- [x] Add OS smoke tests (Pilot):
  - Linux required
  - macOS optional (but recommended) as a separate job

Acceptance:
- [ ] CI passes on Node 22 and Node 24. (verify on next GitHub run)
- [x] No workflow step hits the network in unit tests (E2E may, but must be labeled and allowed to fail if flaky).

### PR-012 — Support tooling (`doctor`, debug logs)
Implement:
- [x] Add CLI command: `mcp-shield doctor [--json] [--ci]`
  - prints: tool version, node version, platform, cache dir, registry base URL, lockfile presence, policy presence
  - performs: DNS + HTTPS HEAD to npm registry (skip in `--offline`)
  - redacts secrets (never print env var values)
- [x] Add `--debug` flag to all commands:
  - prints timing + decision reasons to stderr

Acceptance:
- [x] `mcp-shield doctor --json` validates against a schema `schemas/cli/doctor-output.schema.json`.

---

## E) Deterministic QA checklist (run before every release)

Run locally:
- [x] `npm ci`
- [x] `npm run build`
- [x] `npm test`
- [x] `npm run release:smoke:local`
- [x] `node packages/cli/dist/cli.js --help`
- [x] In a temp dir:
  - [x] `mcp-shield init`
  - [x] Update `policy.yaml` maxRiskScore if needed (some real servers will exceed the default 50).
  - [x] `mcp-shield add io.github.Digital-Defiance/mcp-filesystem -y` (or another known registry server)
  - [x] `mcp-shield verify --ci --json`
  - [x] `mcp-shield scan --ci --json`

Run in CI:
- [ ] Node 22 + 24 matrix
- [ ] Linux + macOS smoke tests

---

## F) References (research links)

Keep these links in the repo (they guide implementation details):
- OSV API `/v1/querybatch`: https://google.github.io/osv.dev/post-v1-querybatch/
- OSV API `GET /v1/vulns/{id}`: https://google.github.io/osv.dev/get-v1-vulns/
- GitHub SARIF upload: https://github.com/github/codeql-action/tree/main/upload-sarif
- GitHub Code Scanning SARIF guidance: https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
- npm trusted publishing (OIDC): https://docs.npmjs.com/trusted-publishers
- npm registry signatures: https://docs.npmjs.com/about-registry-signatures
- `tar` extraction safety options (`preservePaths`, etc.): https://www.npmjs.com/package/tar
- Node release schedule (choose supported versions): https://github.com/nodejs/release#release-schedule
- Node SEA (optional future binary distribution): https://nodejs.org/api/single-executable-applications.html
- `tar` advisory reference (ensure patched version): https://security.snyk.io/package/npm/tar
