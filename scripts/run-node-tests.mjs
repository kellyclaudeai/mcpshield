import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function wildcardToRegExp(pattern) {
  const parts = pattern.split('*').map(escapeRegExp);
  return new RegExp(`^${parts.join('.*')}$`);
}

function getBaseDir(pattern) {
  const doubleStarIndex = pattern.indexOf('**');
  if (doubleStarIndex === -1) {
    return path.dirname(pattern);
  }

  const base = pattern.slice(0, doubleStarIndex);
  return base.replace(/[/\\]$/, '') || '.';
}

async function collectFiles(dir, fileNameRegex, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(entryPath, fileNameRegex, out);
        return;
      }

      if (entry.isFile() && fileNameRegex.test(entry.name)) {
        out.push(entryPath);
      }
    }),
  );
}

function printUsage() {
  console.log(
    [
      'Usage: node scripts/run-node-tests.mjs [--import <mod>] [--require <mod>] [--watch] <pattern...>',
      '',
      'Examples:',
      '  node scripts/run-node-tests.mjs --import tsx test/**/*.test.ts',
      '  node scripts/run-node-tests.mjs --require ts-node/register tests/**/*.test.ts',
    ].join('\n'),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const nodeArgs = [];
  const patterns = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      return 0;
    }

    if (arg === '--import' || arg === '--require') {
      const value = argv[i + 1];
      if (!value) {
        console.error(`Missing value for ${arg}`);
        return 2;
      }
      nodeArgs.push(arg, value);
      i += 1;
      continue;
    }

    if (arg === '--watch') {
      nodeArgs.push('--watch');
      continue;
    }

    patterns.push(arg);
  }

  if (patterns.length === 0) {
    printUsage();
    return 2;
  }

  const cwd = process.cwd();
  const matchedFiles = new Set();

  for (const pattern of patterns) {
    const baseDir = getBaseDir(pattern);
    const baseAbs = path.resolve(cwd, baseDir);
    const fileNameRegex = wildcardToRegExp(path.basename(pattern));

    const files = [];
    await collectFiles(baseAbs, fileNameRegex, files);

    for (const filePath of files) {
      matchedFiles.add(path.relative(cwd, filePath));
    }
  }

  const fileList = Array.from(matchedFiles).sort();
  if (fileList.length === 0) {
    console.log(`No test files matched: ${patterns.join(', ')}`);
    return 0;
  }

  const child = spawn(process.execPath, [...nodeArgs, '--test', ...fileList], {
    stdio: 'inherit',
  });

  return await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

