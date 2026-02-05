#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PUBLISH_ORDER = ['@mcpshield/core', '@mcpshield/scanner', '@mcpshield/cli'];

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    provenance: process.env.GITHUB_ACTIONS === 'true',
    otp: process.env.NPM_OTP ?? null,
    manifestPath: path.join(process.cwd(), '.mcpshield', 'release', 'publish-manifest.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--provenance') {
      parsed.provenance = true;
      continue;
    }
    if (arg === '--no-provenance') {
      parsed.provenance = false;
      continue;
    }
    if (arg === '--manifest') {
      parsed.manifestPath = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (arg === '--otp') {
      parsed.otp = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function runCommand(cmd, args, options = {}) {
  const { capture = false, allowFailure = false, env = process.env } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    let stdout = '';
    let stderr = '';

    if (capture) {
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('exit', (code) => {
      const result = { code: code ?? 1, stdout, stderr };

      if (result.code !== 0 && !allowFailure) {
        reject(
          new Error(
            [
              `Command failed: ${cmd} ${args.join(' ')}`,
              stderr.trim(),
              stdout.trim(),
            ]
              .filter(Boolean)
              .join('\n'),
          ),
        );
        return;
      }

      resolve(result);
    });
  });
}

function distTagForVersion(version) {
  if (version.includes('-next.')) return 'next';
  if (version.includes('-beta.')) return 'beta';
  if (version.includes('-rc.')) return 'rc';
  return 'latest';
}

async function packageVersion(packageName) {
  const result = await runCommand('npm', ['pkg', 'get', 'version', '--workspace', packageName], {
    capture: true,
  });
  const raw = result.stdout.trim();
  const parsed = JSON.parse(raw);
  if (typeof parsed === 'string') {
    return parsed;
  }

  if (parsed && typeof parsed === 'object' && typeof parsed[packageName] === 'string') {
    return parsed[packageName];
  }

  throw new Error(`Could not parse version for ${packageName}: ${raw}`);
}

async function packageIsPublished(packageName, version) {
  const spec = `${packageName}@${version}`;
  const result = await runCommand('npm', ['view', spec, 'version', '--json'], {
    capture: true,
    allowFailure: true,
  });

  if (result.code !== 0) {
    if (result.stderr.includes('E404') || result.stderr.includes('404')) {
      return false;
    }
    throw new Error(`Failed checking published version for ${spec}: ${result.stderr || result.stdout}`);
  }

  const raw = result.stdout.trim();
  if (!raw) {
    return false;
  }

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed.includes(version);
  }

  return parsed === version;
}

async function writeManifest(manifestPath, manifest) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    packages: [],
  };

  for (const packageName of PUBLISH_ORDER) {
    const version = await packageVersion(packageName);
    const distTag = distTagForVersion(version);
    const exists = await packageIsPublished(packageName, version);

    if (exists) {
      console.log(`Skipping ${packageName}@${version} (already published)`);
      manifest.packages.push({
        name: packageName,
        version,
        distTag,
        action: 'skipped_existing',
      });
      continue;
    }

    const publishArgs = ['publish', '--workspace', packageName, '--access', 'public', '--tag', distTag];
    if (args.provenance) {
      publishArgs.push('--provenance');
    }
    if (args.otp) {
      publishArgs.push('--otp', args.otp);
    }
    if (args.dryRun) {
      publishArgs.push('--dry-run');
    }

    console.log(
      `${args.dryRun ? 'Dry-run publishing' : 'Publishing'} ${packageName}@${version} (${distTag})`,
    );
    await runCommand('npm', publishArgs);

    manifest.packages.push({
      name: packageName,
      version,
      distTag,
      action: args.dryRun ? 'dry_run_published' : 'published',
    });
  }

  await writeManifest(args.manifestPath, manifest);
  console.log(`Wrote publish manifest: ${args.manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

