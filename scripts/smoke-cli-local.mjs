#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function runCommand(cmd, args, options = {}) {
  const { cwd = process.cwd(), capture = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
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
      if ((code ?? 1) !== 0) {
        reject(new Error(`Command failed: ${cmd} ${args.join(' ')}\n${stderr}\n${stdout}`.trim()));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function packWorkspace(workspace) {
  const packResult = await runCommand('npm', ['pack', '--workspace', workspace, '--json'], {
    capture: true,
  });
  const parsed = JSON.parse(packResult.stdout);
  if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0].filename !== 'string') {
    throw new Error(`Unexpected npm pack output for ${workspace}: ${packResult.stdout}`);
  }

  return path.resolve(process.cwd(), parsed[0].filename);
}

async function main() {
  const workspaces = ['@kellyclaude/mcpshield-core', '@kellyclaude/mcpshield-scanner', '@kellyclaude/mcpshield'];
  const tarballs = [];

  for (const workspace of workspaces) {
    tarballs.push({
      workspace,
      file: await packWorkspace(workspace),
    });
  }

  const cliTarball = tarballs.find((entry) => entry.workspace === '@kellyclaude/mcpshield');
  if (!cliTarball) {
    throw new Error('Missing packed @kellyclaude/mcpshield tarball');
  }

  const dependencyTarballs = tarballs
    .filter((entry) => entry.workspace !== '@kellyclaude/mcpshield')
    .map((entry) => entry.file);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-smoke-local-cli-'));
  const cliBin = path.join(tempDir, 'node_modules', '.bin', 'mcp-shield');

  try {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'mcpshield-smoke-local', private: true }, null, 2) + '\n',
      'utf8',
    );

    await runCommand('pnpm', ['add', ...dependencyTarballs], { cwd: tempDir });
    await runCommand('pnpm', ['add', cliTarball.file], { cwd: tempDir });

    await runCommand(cliBin, ['--help'], { cwd: tempDir });
    await runCommand(cliBin, ['init', '--json'], { cwd: tempDir });
    await runCommand(cliBin, ['lock', 'validate', '--json'], { cwd: tempDir });
    await runCommand(cliBin, ['doctor', '--offline', '--json'], { cwd: tempDir });

    console.log(`Local smoke test passed using ${path.basename(cliTarball.file)}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await Promise.all(tarballs.map((tarball) => fs.rm(tarball.file, { force: true })));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
