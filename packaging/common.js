const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

function formatScope(scope) {
  return `[${scope}]`;
}

function log(scope, message) {
  console.log(`${formatScope(scope)} ${message}`);
}

function warn(scope, message) {
  console.warn(`${formatScope(scope)} ${message}`);
}

function fail(scope, message) {
  console.error(`${formatScope(scope)} ${message}`);
}

function runCommand(scope, command, description, options = {}) {
  log(scope, `${description}...`);

  const result = execSync(command, {
    cwd: options.cwd || ROOT_DIR,
    stdio: options.stdio || 'inherit',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  log(scope, `${description} completed.`);
  return result;
}

function ensureFileExists(filePath, errorMessage) {
  if (!fs.existsSync(filePath)) {
    throw new Error(errorMessage || `File not found: ${filePath}`);
  }
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getPackageJson() {
  return readJson(path.join(ROOT_DIR, 'package.json'));
}

function walkFiles(dirPath, visitor) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, visitor);
      continue;
    }

    visitor(fullPath, entry);
  }
}

function getDirectorySize(dirPath) {
  let total = 0;

  walkFiles(dirPath, (filePath) => {
    total += fs.statSync(filePath).size;
  });

  return total;
}

module.exports = {
  ROOT_DIR,
  DIST_DIR,
  DOCS_DIR,
  ensureDirectory,
  ensureFileExists,
  fail,
  getDirectorySize,
  getPackageJson,
  log,
  readJson,
  runCommand,
  walkFiles,
  warn,
};
