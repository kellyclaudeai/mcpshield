# MCPShield — Architecture Gap Audit & Next Steps (2026-02-05)

This checklist captures the highest-leverage missing pieces and refactors to fully realize the Phase 3–5 architecture described in `PROJECT.md` and `TASKS.md`.

## 0) Definition of “Done” (for MVP / Phase 3)
- [ ] `mcp-shield add <server>` can: fetch registry metadata → resolve artifact → download → hash → write `mcp.lock`
- [ ] `mcp-shield verify` can: re-fetch / re-download → recompute digest → report drift
- [ ] `mcp-shield scan` can: run baseline local scans (deps + typosquat + suspicious patterns) → emit JSON + Markdown
- [ ] `mcp-shield ci` can: fail CI on lock drift or unapproved servers; produces human-readable diff
- [ ] All above work offline once artifacts are cached (no network required for repeat runs)

## 1) Repo Hygiene / DevEx (1–2 days)
- [ ] Align root test runner with package-level `node --test` + `tsx` (avoid mixed Jest vs `node:test` unless intentional)
- [ ] Split tests into `unit` vs `integration/e2e` with explicit opt-in env vars (e.g. `MCPSHIELD_E2E=1`)
- [ ] Add CI workflow: `lint` → `typecheck` → `build` → `test` (Node 18 + latest LTS)
- [ ] Add release/versioning conventions (changesets or semantic-release) and workspace publish strategy
- [ ] Add baseline project meta: `SECURITY.md`, `CONTRIBUTING.md`, confirmed `LICENSE`

## 2) Lockfile + Artifact Resolution (Phase 3 core)
### 2.1 Lockfile manager
- [ ] Implement `mcp.lock` read/write/update APIs in `@mcpshield/core`
- [ ] Add lockfile normalization rules (stable ordering, canonical formatting)
- [ ] Add schema validation + friendly error messages for malformed lockfiles

### 2.2 Artifact resolvers (start with npm)
- [ ] Implement artifact resolver interface: `resolve(metadata) -> { url, integrity?, digest?, size?, type }`
- [ ] **npm**: resolve tarball URL + integrity from registry metadata (`dist.tarball`, `dist.integrity`)
- [ ] Add cache directory strategy (content-addressed by `sha256`) and cleanup policy
- [ ] Add pluggable resolvers for: PyPI, OCI/Docker, GitHub Releases, “MCPB” (when spec is known)

### 2.3 Digest verification
- [ ] Implement streaming SHA-256/SHA-512 digest computation for downloaded artifacts
- [ ] Verify against:
  - [ ] registry-provided integrity/digest (when present)
  - [ ] `mcp.lock` pinned digest
- [ ] Add drift reporting (old digest, new digest, artifact URL, timestamp)

## 3) Local Scanner (Phase 4)
### 3.1 Scanner pipeline (baseline)
- [ ] Implement `@mcpshield/scanner` core pipeline: unpack → enumerate files → run detectors → score
- [ ] Add dependency graph extraction (for npm: parse `package.json` + lock; run `npm ls --json` in a temp dir)
- [ ] Add typosquat detection using `fast-levenshtein` with allow/deny thresholds
- [ ] Add suspicious pattern detectors (high-signal only): `child_process`, `eval`, `Function`, fs traversal, credential regexes
- [ ] Add risk scoring model (transparent weights) + “explain” output for each finding

### 3.2 Outputs
- [ ] Add output formats: JSON, Markdown, SARIF (for GitHub code scanning)
- [ ] Add `--baseline` support (track new vs existing findings)
- [ ] Add `--fail-on` thresholds (severity, score, category)

## 4) CLI Completion (Phase 4)
- [ ] Finish `mcp-shield init` (scaffold `policy.yaml`, `mcp.lock`, repo hooks)
- [ ] Finish `mcp-shield add` flow end-to-end (artifact + digest + scan + lockfile update)
- [ ] Implement `mcp-shield verify`, `scan`, `ci`, and `policy init`
- [ ] Add non-interactive mode suitable for CI (exit codes, machine-readable output)

## 5) Runtime Guard (Phase 5 — design-first)
- [ ] Define enforcement boundary (proxy/daemon between host ↔ server) and message capture strategy
- [ ] Map policy primitives to MCP JSON-RPC: tool calls, resource reads, prompts, budgets
- [ ] Decide logging format + tamper-evidence approach for runtime audit trail
- [ ] Implement minimal “deny/allow tools/resources” proxy with a golden-path demo server

## 6) Threat Model + Trust Signals
- [ ] Document threat model (supply chain, exfiltration, namespace squatting, dependency confusion)
- [ ] Define “verification ladder” (community → verified → official) and what checks apply at each level
- [ ] Add provenance hooks (SLSA-style attestations) as a future extension point

