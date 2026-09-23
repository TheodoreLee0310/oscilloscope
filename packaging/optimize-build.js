#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  DOCS_DIR,
  getDirectorySize,
  log,
  warn,
  walkFiles,
} = require('./common');

const SCOPE = 'optimize-build';
const removableSuffixes = ['.map', '.LICENSE.txt'];

function cleanupFiles() {
  let removedCount = 0;

  if (!fs.existsSync(DOCS_DIR)) {
    warn(SCOPE, 'docs/ directory not found, skipping cleanup.');
    return removedCount;
  }

  walkFiles(DOCS_DIR, (filePath) => {
    if (removableSuffixes.some((suffix) => filePath.endsWith(suffix))) {
      fs.unlinkSync(filePath);
      removedCount += 1;
    }
  });

  log(SCOPE, `Cleanup finished. Removed ${removedCount} generated files.`);
  return removedCount;
}

function compressAssets() {
  log(SCOPE, 'No additional asset compressor configured. Skipping.');
}

function analyzeBundle() {
  if (!fs.existsSync(DOCS_DIR)) {
    warn(SCOPE, 'docs/ directory not found, unable to analyze bundle size.');
    return 0;
  }

  const sizeInBytes = getDirectorySize(DOCS_DIR);
  const sizeInMb = (sizeInBytes / 1024 / 1024).toFixed(2);
  log(SCOPE, `Build directory size: ${sizeInMb} MB`);
  return sizeInBytes;
}

function printSuggestions() {
  log(SCOPE, 'Suggestions:');
  console.log('  - Use gzip or brotli on deployment if your host supports it');
  console.log('  - Keep delaying non-critical internal page modules');
  console.log('  - Periodically remove unused dependencies and archived assets');
}

async function optimize() {
  log(SCOPE, 'Starting build optimization...');
  cleanupFiles();
  compressAssets();
  analyzeBundle();
  log(SCOPE, 'Build optimization completed.');
  printSuggestions();
}

if (require.main === module) {
  optimize().catch((error) => {
    console.error(`[${SCOPE}] ${error.message}`);
    process.exit(1);
  });
}

module.exports = { analyzeBundle, cleanupFiles, compressAssets, optimize };
