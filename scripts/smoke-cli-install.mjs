#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function parseArgs(argv) {
  const parsed = { version: null };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      parsed.version = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!parsed.version) {
    throw new Error('--version is required');
  }

  return parsed;
}

function runCommand(cmd, args, options = {}) {
  const { cwd = process.cwd(), env = process.env } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: 'inherit' });

    child.on('error', reject);
    child.on('exit', (code) => {
      if ((code ?? 1) !== 0) {
        reject(new Error(`Command failed: ${cmd} ${args.join(' ')}`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpshield-smoke-cli-'));
  const packageSpec = `@kellyclaude/mcpshield@${args.version}`;

  try {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'mcpshield-smoke-install', private: true }, null, 2) + '\n',
      'utf8',
    );

    await runCommand('pnpm', ['add', packageSpec], { cwd: tempDir });
    await runCommand(path.join(tempDir, 'node_modules', '.bin', 'mcp-shield'), ['--help'], {
      cwd: tempDir,
    });
    console.log(`Smoke install passed for ${packageSpec}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
