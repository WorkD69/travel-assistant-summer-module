'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  normalizePublicOrigin,
  renderRuntimeConfig,
} = require('./generate-runtime-config.cjs');

const SOURCE_ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(SOURCE_ROOT, 'dist');
const EXCLUDED_TOP_LEVEL = new Set(['dist', 'node_modules', 'tests', 'scripts', '.git', '.vercel']);
const RELEASE_ENV_NAME = 'TRAVEL_RELEASE_API_BASE';

function shouldCopy(relativePath, directoryEntry) {
  const topLevel = relativePath.split(path.sep)[0];
  if (EXCLUDED_TOP_LEVEL.has(topLevel)) return false;
  if (directoryEntry.isSymbolicLink()) return false;
  return !relativePath.split(path.sep).some((part) => part === '.git' || part === 'node_modules');
}

function copyDirectory(sourceDirectory, targetDirectory, relativeDirectory = '') {
  fs.mkdirSync(targetDirectory, { recursive: true });
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (!shouldCopy(relativePath, entry)) continue;

    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, relativePath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copySourceTree() {
  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  copyDirectory(SOURCE_ROOT, OUTPUT_ROOT);
}

function main(env = { [RELEASE_ENV_NAME]: process.env[RELEASE_ENV_NAME] }) {
  const origin = normalizePublicOrigin(env[RELEASE_ENV_NAME]);
  copySourceTree();
  const runtimePath = path.join(OUTPUT_ROOT, 'assets', 'js', 'runtime-config.js');
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, renderRuntimeConfig(origin), 'utf8');
  return { outputPath: runtimePath, origin };
}

if (require.main === module) {
  try {
    const result = main();
    process.stdout.write(`Built ${OUTPUT_ROOT} with ${result.origin}\n`);
  } catch (error) {
    fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main, shouldCopy, OUTPUT_ROOT };
