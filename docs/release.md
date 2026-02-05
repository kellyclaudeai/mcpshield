# Release Process

This document describes the release process for MCPShield packages.

## Overview

MCPShield uses automated releases via GitHub Actions. The release workflow supports two publishing modes:

1. **Preferred:** npm trusted publishing (OIDC) with provenance (no long-lived tokens)
2. **Fallback:** `NPM_TOKEN` secret (automation token that does not require OTP)

Both modes publish packages in dependency order (`@mcpshield/core` -> `@mcpshield/scanner` -> `@mcpshield/cli`) via `scripts/publish-workspaces.mjs`.

## One-Time Setup: Configure npm Trusted Publishing

Before the first release, you must configure npm trusted publishing for each package.

### Prerequisites

1. You must have publish access to the following npm packages:
   - `@mcpshield/core`
   - `@mcpshield/scanner`
   - `@mcpshield/cli`

2. You must have admin access to the GitHub repository

### Configuration Steps

For **each package** (@mcpshield/core, @mcpshield/scanner, @mcpshield/cli):

1. **Log in to npm**: Go to [npmjs.com](https://www.npmjs.com/) and sign in

2. **Navigate to package settings**:
   - Go to the package page (e.g., `https://www.npmjs.com/package/@mcpshield/core`)
   - Click "Settings" tab
   - Click "Publishing access" in the left sidebar

3. **Add GitHub Actions as a trusted publisher**:
   - Scroll to "Trusted publishers from GitHub Actions"
   - Click "Add" or "Configure"
   - Enter the following details:
     - **Repository owner**: Your GitHub username or organization name
     - **Repository name**: `mcpshield`
     - **Workflow file**: `.github/workflows/release.yml`
     - **Environment** (optional): Leave blank
   - Click "Save"

4. **Repeat for all three packages**

### Verification

You can verify the configuration by checking the "Publishing access" section of each package's settings page. You should see the GitHub Actions workflow listed as a trusted publisher.

## Creating a Release

Once npm trusted publishing is configured, releases are fully automated:

### 1. Prepare the Release

1. **Update version numbers** in all package.json files:
   ```bash
   # Example: bump to 0.2.0
   cd packages/core && npm version 0.2.0 --no-git-tag-version
   cd ../scanner && npm version 0.2.0 --no-git-tag-version
   cd ../cli && npm version 0.2.0 --no-git-tag-version
   ```

2. **Update CHANGELOG.md**:
   - Move items from `[Unreleased]` to a new version section
   - Add the release date
   - Follow [conventional commits](https://www.conventionalcommits.org/) format

3. **Commit changes**:
   ```bash
   git add .
   git commit -m "chore: bump version to 0.2.0"
   git push origin main
   ```

### 2. Create and Push a Tag

```bash
# Create an annotated tag
git tag -a v0.2.0 -m "Release v0.2.0"

# Push the tag to GitHub
git push origin v0.2.0
```

### 3. Automated Workflow

Once the tag is pushed, GitHub Actions will automatically:

1. ✅ Checkout the code with full git history
2. ✅ Set up Node.js and npm
3. ✅ Install dependencies
4. ✅ Build all packages
5. ✅ Run tests
6. ✅ Generate changelog from conventional commits
7. ✅ Publish all workspace packages to npm (with provenance when enabled)
10. ✅ Create a GitHub Release with generated notes

### 4. Monitor the Release

1. Go to the GitHub Actions tab in the repository
2. Click on the workflow run for your tag
3. Monitor each step for success
4. Check npm for the published packages
5. Verify the GitHub Release was created

## Troubleshooting

### Publish fails with authentication error

- **Cause**: Neither OIDC trusted publishing nor `NPM_TOKEN` is configured
- **Solution (OIDC)**: Re-check the trusted publishing configuration steps above. Ensure the repository owner, name, and workflow file path are exact matches.
- **Solution (token)**: Add `NPM_TOKEN` as a GitHub Actions secret for the repository.

### Workflow fails on tests

- **Cause**: Breaking changes not caught locally
- **Solution**: Run `npm test` locally before creating the tag. Fix any failures and create a new tag.

### Package dependencies out of sync

- **Cause**: Version mismatches between workspace packages
- **Solution**: Ensure all three packages have the same version number and that `@mcpshield/scanner` and `@mcpshield/cli` reference the correct `@mcpshield/core` version.

### Changelog generation is empty

- **Cause**: No conventional commits between tags
- **Solution**: Use conventional commit prefixes (`feat:`, `fix:`, `chore:`, etc.) in commit messages

## Rollback

If a release needs to be rolled back:

1. **Deprecate the npm packages**:
   ```bash
   npm deprecate @mcpshield/core@0.2.0 "This version has been deprecated due to [reason]"
   npm deprecate @mcpshield/scanner@0.2.0 "This version has been deprecated due to [reason]"
   npm deprecate @mcpshield/cli@0.2.0 "This version has been deprecated due to [reason]"
   ```

2. **Delete the GitHub Release** (optional):
   - Go to the Releases page
   - Click "Delete" on the problematic release

3. **Fix the issue** and create a new patch release

## Security

- **Preferred (OIDC)**: No long-lived tokens; publishing uses short-lived OIDC tokens issued by GitHub
- **Token fallback**: Store tokens only in GitHub secrets, never in the repo
- **Provenance**: Published packages can include cryptographic attestation of their source
- **Audit trail**: All releases are tracked via git tags and GitHub Releases

## Best Practices

1. **Use semantic versioning**: Follow [SemVer](https://semver.org/) strictly
2. **Write conventional commits**: Use `feat:`, `fix:`, `chore:`, etc. for automatic changelog generation
3. **Test before tagging**: Always run the full test suite locally before creating a release tag
4. **Keep versions in sync**: All workspace packages should use the same version number
5. **Review the diff**: Check what's changed since the last tag before releasing

## Additional Resources

- [npm trusted publishing documentation](https://docs.npmjs.com/generating-provenance-statements)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Keep a Changelog](https://keepachangelog.com/)
