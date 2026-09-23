#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

const {
  ROOT_DIR,
  ensureDirectory,
  log,
  runCommand,
} = require('./common');

const LOCAL_CACHE_DIR = path.join(ROOT_DIR, '.eb-cache-local');
const LOCAL_BINARIES_DIR = path.join(__dirname, 'binaries');
const LOCAL_WIN_CODESIGN_ARCHIVE = path.join(LOCAL_BINARIES_DIR, 'winCodeSign-2.6.0.7z');
const LOCAL_WIN_CODESIGN_DIR = 'winCodeSign-2.6.0';
const BUILD_SCOPE = 'build';
const UPSTREAM_BINARY_BASE = 'https://github.com/electron-userland/electron-builder-binaries/releases/download';

const args = process.argv.slice(2);
const buildTarget = (args[0] || 'current').toLowerCase();
const buildMode = (args[1] || process.env.WIN_CODESIGN_SOURCE || 'remote').toLowerCase();
const validModes = new Set(['remote', 'local']);

if (!validModes.has(buildMode)) {
  console.error(`Unsupported build mode: ${buildMode}`);
  process.exit(1);
}

const BUILDS_BY_PLATFORM = {
  win32: [
    { flag: '--linux', label: 'Linux build', artifact: '.tar.gz', needsWinCodeSign: false },
    { flag: '--win', label: 'Windows build', artifact: '.exe portable', needsWinCodeSign: true },
  ],
  darwin: [
    { flag: '--mac', label: 'macOS build', artifact: '.dmg', needsWinCodeSign: false },
    { flag: '--linux', label: 'Linux build', artifact: '.tar.gz', needsWinCodeSign: false },
    { flag: '--win', label: 'Windows build', artifact: '.exe portable', needsWinCodeSign: true },
  ],
  linux: [
    { flag: '--linux', label: 'Linux build', artifact: '.tar.gz', needsWinCodeSign: false },
    { flag: '--win', label: 'Windows build', artifact: '.exe portable', needsWinCodeSign: true },
  ],
};

function getTargetBuilds(target, currentPlatform) {
  switch (target) {
    case 'win':
    case 'windows':
      return [{ flag: '--win', label: 'Windows build', artifact: '.exe portable', needsWinCodeSign: true }];
    case 'mac':
    case 'macos':
      return [{ flag: '--mac', label: 'macOS build', artifact: '.dmg', needsWinCodeSign: false }];
    case 'linux':
      return [{ flag: '--linux', label: 'Linux build', artifact: '.tar.gz', needsWinCodeSign: false }];
    case 'all':
      return BUILDS_BY_PLATFORM[currentPlatform] || BUILDS_BY_PLATFORM.win32;
    case 'current':
    default:
      if (currentPlatform === 'darwin') {
        return [{ flag: '--mac', label: 'macOS build', artifact: '.dmg', needsWinCodeSign: false }];
      }
      if (currentPlatform === 'linux') {
        return [{ flag: '--linux', label: 'Linux build', artifact: '.tar.gz', needsWinCodeSign: false }];
      }
      return [{ flag: '--win', label: 'Windows build', artifact: '.exe portable', needsWinCodeSign: true }];
  }
}

function createLocalBuilderEnv(baseUrl) {
  return {
    ELECTRON_BUILDER_BINARIES_MIRROR: `${baseUrl}/`,
    ELECTRON_BUILDER_BINARIES_CUSTOM_DIR: LOCAL_WIN_CODESIGN_DIR,
    NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR: `${baseUrl}/`,
    NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR: LOCAL_WIN_CODESIGN_DIR,
    ELECTRON_BUILDER_CACHE: LOCAL_CACHE_DIR,
  };
}

function resolveArchiveFromRequest(requestUrl) {
  const parsedUrl = new URL(requestUrl, 'http://127.0.0.1');
  const fileName = path.basename(parsedUrl.pathname);
  const localPath = path.join(LOCAL_BINARIES_DIR, fileName);

  return { fileName, localPath };
}

function streamLocalFile(filePath, response) {
  response.writeHead(200, {
    'Content-Type': 'application/x-7z-compressed',
    'Content-Length': fs.statSync(filePath).size,
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  });

  fs.createReadStream(filePath).pipe(response);
}

function createLocalBinaryServer() {
  return http.createServer((request, response) => {
    if (!request.url) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }

    const { fileName, localPath } = resolveArchiveFromRequest(request.url);

    if (fs.existsSync(localPath)) {
      streamLocalFile(localPath, response);
      return;
    }

    const artifactName = fileName.replace(/\.7z$/i, '');
    const upstreamUrl = `${UPSTREAM_BINARY_BASE}/${artifactName}/${fileName}`;
    response.writeHead(302, { Location: upstreamUrl });
    response.end();
  });
}

function startLocalBinaryServer() {
  if (!fs.existsSync(LOCAL_WIN_CODESIGN_ARCHIVE)) {
    throw new Error(
      `Local winCodeSign archive not found: ${LOCAL_WIN_CODESIGN_ARCHIVE}\n` +
      'Place winCodeSign-2.6.0.7z in packaging/binaries/ before using local mode.'
    );
  }

  ensureDirectory(LOCAL_CACHE_DIR);

  return new Promise((resolve, reject) => {
    const server = createLocalBinaryServer();

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close(() => {});
        reject(new Error('Timed out while starting local binary mirror.'));
      }
    }, 10000);

    server.listen(0, '127.0.0.1', () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      resolve({
        baseUrl,
        env: createLocalBuilderEnv(baseUrl),
        dispose() {
          server.close(() => {});
        },
      });
    });
  });
}

function showBuildInfo(build) {
  log(BUILD_SCOPE, `${build.label} finished. Output: dist/ (${build.artifact})`);
}

async function executeBuild() {
  const currentPlatform = os.platform();
  const builds = getTargetBuilds(buildTarget, currentPlatform);
  const completed = [];
  let localServer = null;

  log(BUILD_SCOPE, 'Starting oscilloscope simulator packaging...');
  log(BUILD_SCOPE, `Build target: ${buildTarget}`);
  log(BUILD_SCOPE, `winCodeSign source: ${buildMode}`);
  log(BUILD_SCOPE, `Current platform: ${currentPlatform}`);

  if (buildTarget === 'all') {
    log(BUILD_SCOPE, 'Build mode: sequential multi-platform packaging');
  }

  try {
    if (buildMode === 'local' && builds.some((build) => build.needsWinCodeSign)) {
      log(BUILD_SCOPE, 'Starting local winCodeSign mirror...');
      localServer = await startLocalBinaryServer();
      log(BUILD_SCOPE, `Local mirror ready: ${localServer.baseUrl}`);
    }

    for (const build of builds) {
      const extraEnv = build.needsWinCodeSign && localServer ? localServer.env : {};

      try {
        runCommand(BUILD_SCOPE, `electron-builder ${build.flag} --publish=never`, build.label, {
          env: extraEnv,
        });
        completed.push(build);
        showBuildInfo(build);
      } catch (error) {
        console.error(`\n[failed] ${build.label}`);
        if (build.needsWinCodeSign && buildMode === 'remote') {
          console.error('Hint: remote mode depends on downloading winCodeSign from GitHub.');
        }
        if (build.needsWinCodeSign && buildMode === 'local') {
          console.error(`Hint: local mode uses ${LOCAL_WIN_CODESIGN_ARCHIVE}.`);
        }
        if (completed.length > 0) {
          console.error(`Completed before failure: ${completed.map((item) => item.label).join(', ')}`);
        }
        throw error;
      }
    }

    log(BUILD_SCOPE, 'Packaging completed successfully.');
  } finally {
    if (localServer) {
      localServer.dispose();
    }
  }
}

executeBuild().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
